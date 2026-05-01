import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import axios from "axios";
import { format } from "date-fns";
import type TelegramBot from "node-telegram-bot-api";
import type { Message } from "node-telegram-bot-api";
import sanitizeFilename from "sanitize-filename";

type BuildTelegramAudioFilenameOpts = {
  msg: Message;
  defaultExt: string;
};

function safeExt(ext: string | undefined, fallbackExt: string): string {
  const candidate = (ext ?? "").trim();
  if (!candidate) return fallbackExt;
  return candidate.startsWith(".") ? candidate : `.${candidate}`;
}

export function buildTelegramAudioFilename(opts: BuildTelegramAudioFilenameOpts): string {
  const { msg, defaultExt } = opts;

  const sentUnixSec = msg.forward_date ?? msg.date;
  const timestamp = format(new Date(sentUnixSec * 1000), "yyyy-MM-dd HH-mm-ss");
  const prefix = "scriberrTG";
  const suffix = `m${msg.message_id}`;

  const forwardedUsername = msg.forward_from?.username
    ? sanitizeFilename(msg.forward_from.username)
    : null;
  const rawFileName = (msg.audio as Message["audio"] & { file_name?: string })?.file_name;
  const parsed = rawFileName ? path.parse(path.basename(rawFileName)) : null;
  const fromFile = parsed?.name ? sanitizeFilename(parsed.name) : null;

  const base = forwardedUsername ?? fromFile;

  const ext = safeExt(parsed?.ext, defaultExt);
  const name = base
    ? `${prefix} - ${base} - ${timestamp} - ${suffix}`
    : `${prefix} - ${timestamp} - ${suffix}`;

  return `${path.basename(sanitizeFilename(name))}${ext}`;
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
