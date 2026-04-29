import axios from "axios";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type TelegramBot from "node-telegram-bot-api";
import type { Message } from "node-telegram-bot-api";

export function incomingFilenameOrFileId(
  message: Message,
  fileId: string,
): string {
  const doc = message.document as { file_name?: string } | undefined;
  if (doc?.file_name) return doc.file_name;

  const audio = message.audio as { file_name?: string } | undefined;
  if (audio?.file_name) return audio.file_name;

  return fileId;
}

export function detectTelegramFileId(message: Message): string | null {
  return (
    message.voice?.file_id ||
    message.audio?.file_id ||
    message.document?.file_id ||
    null
  );
}

export function looksLikeAudioDocument(message: Message): boolean {
  const doc = message.document;
  if (!doc) return false;
  if (typeof doc.mime_type === "string" && doc.mime_type.startsWith("audio/"))
    return true;
  const name = doc.file_name?.toLowerCase() ?? "";
  return [
    ".mp3",
    ".wav",
    ".m4a",
    ".aac",
    ".ogg",
    ".opus",
    ".flac",
    ".webm",
  ].some((ext) => name.endsWith(ext));
}

export async function downloadTelegramFile(
  bot: TelegramBot,
  fileId: string,
  suggestedFilename: string,
): Promise<string> {
  const link = await bot.getFileLink(fileId);
  const id = crypto.randomBytes(12).toString("hex");
  const safeName = path.basename(suggestedFilename || `file-${id}`);
  const outPath = path.join(os.tmpdir(), `${id}-${safeName}`);

  const res = await axios.get(link, {
    responseType: "stream",
    timeout: 60_000,
  });
  await new Promise<void>((resolve, reject) => {
    const ws = fs.createWriteStream(outPath);
    res.data.pipe(ws);
    res.data.on("error", reject);
    ws.on("finish", resolve);
    ws.on("error", reject);
  });

  return outPath;
}
