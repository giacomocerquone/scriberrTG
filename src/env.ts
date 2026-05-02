import dotenv from "dotenv";

// Load local `.env` for non-container development.
// In Docker/Compose, env vars are typically injected, and `.env` may not exist in the image.
if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v == null || v === "" ? fallback : v;
}

/** Comma-separated Telegram user IDs. If empty/unset, all users are allowed. */
function parseTelegramAllowedUserIds(raw: string | undefined): Set<number> | null {
  if (raw == null || raw.trim() === "") return null;
  const ids = new Set<number>();
  for (const part of raw.split(",")) {
    const s = part.trim();
    if (s === "") continue;
    const n = Number(s);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(
        `TELEGRAM_ALLOWED_USER_IDS: invalid entry ${JSON.stringify(part)} (expect positive integers)`,
      );
    }
    ids.add(n);
  }
  return ids.size === 0 ? null : ids;
}

export const TELEGRAM_BOT_TOKEN = required("TELEGRAM_BOT_TOKEN");
export const SCRIBERR_API_TOKEN = required("SCRIBERR_API_TOKEN");
export const SCRIBERR_HOST_URL = required("SCRIBERR_HOST_URL");
export const SSE_TIMEOUT_MS = Number(optional("SSE_TIMEOUT_MS", String(10 * 60 * 1000)));
export const PROFILE_CACHE_TTL_MS = Number(optional("PROFILE_CACHE_TTL_MS", String(5 * 60 * 1000)));
export const TELEGRAM_ALLOWED_USER_IDS = parseTelegramAllowedUserIds(
  process.env.TELEGRAM_ALLOWED_USER_IDS,
);
