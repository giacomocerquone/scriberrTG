import fs from "node:fs";
import TelegramBot, { type Message } from "node-telegram-bot-api";

import {
  POLL_INTERVAL_MS,
  POLL_TIMEOUT_MS,
  PROFILE_CACHE_TTL_MS,
  SCRIBERR_API_TOKEN,
  SCRIBERR_HOST_URL,
  TELEGRAM_BOT_TOKEN,
} from "./env";
import { ScriberrClient, type TranscriptionProfile } from "./scriberrClient";
import {
  detectTelegramFileId,
  downloadTelegramFile,
  incomingFilenameOrFileId,
  looksLikeAudioDocument,
} from "./telegramFile";

const scriberr = new ScriberrClient({
  hostUrl: SCRIBERR_HOST_URL,
  apiToken: SCRIBERR_API_TOKEN,
});

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

type DefaultProfileCache = {
  expiresAt: number;
  profile: TranscriptionProfile;
};

let defaultProfileCache: DefaultProfileCache | null = null;
let defaultProfileInFlight: Promise<TranscriptionProfile> | null = null;

async function getDefaultProfileCached(): Promise<TranscriptionProfile> {
  const now = Date.now();
  if (defaultProfileCache && defaultProfileCache.expiresAt > now) {
    return defaultProfileCache.profile;
  }

  if (defaultProfileInFlight) return await defaultProfileInFlight;

  defaultProfileInFlight = (async () => {
    const profiles = await scriberr.listProfiles();
    const def = profiles.find((p) => p.is_default) ?? profiles[0];
    if (!def) throw new Error("No transcription profiles found in Scriberr");
    defaultProfileCache = { profile: def, expiresAt: now + PROFILE_CACHE_TTL_MS };
    return def;
  })();

  try {
    return await defaultProfileInFlight;
  } finally {
    defaultProfileInFlight = null;
  }
}

function chunkText(text: string, maxLen = 3800): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + maxLen));
    i += maxLen;
  }
  return chunks;
}

async function safeSendMessage(
  chatId: number | string,
  text: string,
  replyToMessageId?: number,
): Promise<void> {
  let reply = replyToMessageId;
  for (const part of chunkText(text)) {
    // Telegram hard-limit is 4096; keep some buffer for formatting.
    // eslint-disable-next-line no-await-in-loop
    await bot.sendMessage(chatId, part, reply ? { reply_to_message_id: reply } : undefined);
    reply = undefined;
  }
}

async function editOrSendLongText(opts: {
  chatId: number | string;
  messageId: number;
  text: string;
}): Promise<void> {
  const parts = chunkText(opts.text, 3800);
  const first = parts.shift() ?? "";
  await bot.editMessageText(first, { chat_id: opts.chatId, message_id: opts.messageId });

  for (const part of parts) {
    // eslint-disable-next-line no-await-in-loop
    await bot.sendMessage(opts.chatId, part);
  }
}

function isAnyAudioLikeMessage(msg: Message): boolean {
  if (msg.voice || msg.audio) return true;
  if (looksLikeAudioDocument(msg)) return true;
  return false;
}

bot.on("message", async (msg: Message) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;

  if (!isAnyAudioLikeMessage(msg)) return;

  const fileId = detectTelegramFileId(msg);
  if (!fileId) return;

  const filename = incomingFilenameOrFileId(msg, fileId);
  let tmpPath: string | undefined;
  let waitingMessageId: number | undefined;

  try {
    const waiting = await bot.sendMessage(chatId, "Received. Uploading to Scriberr and transcribing…", {
      reply_to_message_id: messageId,
    });
    waitingMessageId = waiting.message_id;

    tmpPath = await downloadTelegramFile(bot, fileId, filename);

    const profile = await getDefaultProfileCached();
    const params = profile.parameters ?? {};
    const { id } = await scriberr.submitTranscriptionJob({
      filePath: tmpPath,
      filename,
      title: filename,
      model: params.model,
      language: params.language,
      device: params.device,
      compute_type: params.compute_type,
    });
    await bot.editMessageText(`Transcription started (id: ${id}). Waiting for result…`, {
      chat_id: chatId,
      message_id: waiting.message_id,
    });

    const result = await scriberr.waitForTranscript({
      id,
      pollIntervalMs: POLL_INTERVAL_MS,
      pollTimeoutMs: POLL_TIMEOUT_MS,
    });

    await editOrSendLongText({
      chatId,
      messageId: waitingMessageId,
      text: result.transcript,
    });
  } catch (e: unknown) {
    const maybeAxios = e as { response?: { data?: unknown }; message?: string } | null;
    const msgText =
      maybeAxios?.response?.data != null
        ? `Error: ${JSON.stringify(maybeAxios.response.data)}`
        : `Error: ${maybeAxios?.message ?? String(e)}`;
    if (waitingMessageId) {
      await editOrSendLongText({ chatId, messageId: waitingMessageId, text: msgText });
    } else {
      await safeSendMessage(chatId, msgText, messageId);
    }
  } finally {
    if (tmpPath) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // ignore
      }
    }
  }
});

bot.on("polling_error", (err: unknown) => {
  // eslint-disable-next-line no-console
  const msg = (err as { message?: string } | null)?.message ?? err;
  console.error("polling_error", msg);
});

// eslint-disable-next-line no-console
console.log("scriberrTG bot started (polling)");
