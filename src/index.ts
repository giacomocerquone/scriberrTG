import fs from "node:fs";
import TelegramBot, { type Message } from "node-telegram-bot-api";

import {
  POLL_INTERVAL_MS,
  POLL_TIMEOUT_MS,
  SCRIBERR_API_TOKEN,
  SCRIBERR_HOST_URL,
  TELEGRAM_BOT_TOKEN,
} from "./env";
import { ScriberrClient } from "./scriberrClient";
import {
  detectTelegramFileId,
  downloadTelegramFile,
  incomingFilenameOrFileId,
  looksLikeAudioDocument,
} from "./telegramFile";

const scriberr = new ScriberrClient({ hostUrl: SCRIBERR_HOST_URL, apiToken: SCRIBERR_API_TOKEN });
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

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

  try {
    await bot.sendMessage(chatId, "Received. Uploading to Scriberr and transcribing…", {
      reply_to_message_id: messageId,
    });

    tmpPath = await downloadTelegramFile(bot, fileId, filename);

    const { id } = await scriberr.submitQuickTranscription({ filePath: tmpPath, filename });
    await bot.sendMessage(chatId, `Transcription started (id: ${id}). Waiting for result…`);

    const result = await scriberr.waitForTranscript({
      id,
      pollIntervalMs: POLL_INTERVAL_MS,
      pollTimeoutMs: POLL_TIMEOUT_MS,
    });

    await safeSendMessage(chatId, `Transcript (id: ${id}):\n\n${result.transcript}`);
  } catch (e: unknown) {
    const maybeAxios = e as { response?: { data?: unknown }; message?: string } | null;
    const msgText =
      maybeAxios?.response?.data != null
        ? `Error: ${JSON.stringify(maybeAxios.response.data)}`
        : `Error: ${maybeAxios?.message ?? String(e)}`;
    await safeSendMessage(chatId, msgText, messageId);
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
