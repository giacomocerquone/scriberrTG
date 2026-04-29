import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import axios from "axios";
import type TelegramBot from "node-telegram-bot-api";

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
