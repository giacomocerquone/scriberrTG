## scriberrTG

Telegram bot (polling) that accepts audio/voice/documents and sends them to Scriberr for transcription.

### Environment variables

- **`TELEGRAM_BOT_TOKEN`**: Telegram bot token
- **`SCRIBERR_API_TOKEN`**: Scriberr API token (API key/bearer)
- **`SCRIBERR_HOST_URL`**: Scriberr host URL (example: `http://scriberr-api:8080`)
- **`POLL_INTERVAL_MS`** (optional): status polling interval (default `2500`)
- **`POLL_TIMEOUT_MS`** (optional): max wait for transcription (default `600000`)

### Run with Docker Compose

This compose file attaches to the external Docker network **`scriberr_default`** so you can reference Scriberr by container name.

```bash
export TELEGRAM_BOT_TOKEN="..."
export SCRIBERR_API_TOKEN="..."
export SCRIBERR_HOST_URL="http://scriberr-api:8080"

docker compose up --build
```

### Local development

```bash
npm install
TELEGRAM_BOT_TOKEN="..." SCRIBERR_API_TOKEN="..." SCRIBERR_HOST_URL="http://scriberr-api:8080" npm run dev
```

