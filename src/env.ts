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

export const TELEGRAM_BOT_TOKEN = required("TELEGRAM_BOT_TOKEN");
export const SCRIBERR_API_TOKEN = required("SCRIBERR_API_TOKEN");
export const SCRIBERR_HOST_URL = required("SCRIBERR_HOST_URL");

export const POLL_INTERVAL_MS = Number(optional("POLL_INTERVAL_MS", "2500"));
export const POLL_TIMEOUT_MS = Number(optional("POLL_TIMEOUT_MS", String(10 * 60 * 1000)));

