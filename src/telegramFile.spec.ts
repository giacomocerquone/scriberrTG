import type { Message } from "node-telegram-bot-api";
import { describe, expect, it } from "vitest";
import { buildTelegramAudioFilename } from "./telegramFile";

describe("buildTelegramAudioFilename", () => {
  it("prefers forward_from username and forward_date for the base name and timestamp", () => {
    const msg = {
      message_id: 42,
      date: 1_600_000_000,
      forward_date: 1_700_000_000,
      forward_from: {
        id: 99,
        is_bot: false,
        first_name: "Bob",
        username: "bob_user",
      },
      chat: { id: 1, type: "private" },
    } as Message;

    const filename = buildTelegramAudioFilename({ msg, defaultExt: ".ogg" });

    expect(filename).toMatch(
      /^scriberrTG - bob_user - \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2} - m42\.ogg$/,
    );
  });
});
