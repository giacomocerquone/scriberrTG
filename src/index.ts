import fs from "node:fs";
import TelegramBot, { type Message } from "node-telegram-bot-api";
import PQueue from "p-queue";

import {
  PROFILE_CACHE_TTL_MS,
  SCRIBERR_API_TOKEN,
  SCRIBERR_HOST_URL,
  TELEGRAM_BOT_TOKEN,
} from "./env";
import { ScriberrClient, type TranscriptionProfile } from "./scriberrClient";
import { buildTelegramAudioFilename, downloadTelegramFile } from "./telegramFile";

const scriberr = new ScriberrClient({
  hostUrl: SCRIBERR_HOST_URL,
  apiToken: SCRIBERR_API_TOKEN,
});

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

const queue = new PQueue({ concurrency: 1 });

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

async function processAudio(msg: Message, fileId: string, defaultExt: string): Promise<void> {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;

  const filename = buildTelegramAudioFilename({ msg, defaultExt });

  const waiting = await bot.sendMessage(chatId, "Queued…", {
    reply_to_message_id: messageId,
  });

  const position = queue.pending + queue.size + 1;
  queue.add(async () => {
    let tmpPath: string | undefined;
    try {
      await bot.editMessageText(`Queued (position ${position}). Preparing…`, {
        chat_id: chatId,
        message_id: waiting.message_id,
      });

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

      await scriberr.waitForTranscriptSse({ id, timeoutMs: 10 * 60 * 1000 });

      const transcriptResult = await scriberr.getTranscript(id);

      const messageText = `
Duration: ${msg.voice?.duration ?? msg.audio?.duration}s
  
Transcript: ${transcriptResult.transcript.text}
  `;
      await bot.editMessageText(messageText, {
        chat_id: chatId,
        message_id: waiting.message_id,
      });
    } catch (e: unknown) {
      const maybeAxios = e as { response?: { data?: unknown }; message?: string } | null;
      const msgText =
        maybeAxios?.response?.data != null
          ? `Error: ${JSON.stringify(maybeAxios.response.data)}`
          : `Error: ${maybeAxios?.message ?? String(e)}`;
      await bot.editMessageText(msgText, {
        chat_id: chatId,
        message_id: waiting.message_id,
      });
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
}

bot.on("voice", (msg: Message) => {
  console.log(msg);
  const fileId = msg.voice?.file_id;
  if (!fileId) return;
  void processAudio(msg, fileId, ".ogg");
});

bot.on("audio", (msg: Message) => {
  console.log(msg);
  const fileId = msg.audio?.file_id;
  if (!fileId) return;
  void processAudio(msg, fileId, ".mp3");
});

bot.on("polling_error", (err: unknown) => {
  // eslint-disable-next-line no-console
  const msg = (err as { message?: string } | null)?.message ?? err;
  console.error("polling_error", msg);
});

// eslint-disable-next-line no-console
console.log("scriberrTG bot started (polling)");
