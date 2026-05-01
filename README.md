## scriberrTG

Telegram bot (polling) that accepts audio/voice/documents and sends them to Scriberr for transcription.

### Environment variables

- **`TELEGRAM_BOT_TOKEN`**: Telegram bot token
- **`SCRIBERR_API_TOKEN`**: Scriberr API token (API key/bearer)
- **`SCRIBERR_HOST_URL`**: Scriberr host URL (example: `http://scriberr-api:8080`)
- **`SSE_TIMEOUT_MS`** (optional): max wait for server-sent events (default `600000`)
- **`PROFILE_CACHE_TTL_MS`** (optional): cache transcription profiles for this duration (default `600000`)

### Run with Docker Compose

Make sure to set the environment variables for reaching Scriberr and Telegram APIs.

```bash
# Option A: create a local .env (recommended)
cp .env.example .env
# then edit .env
docker compose up --build
```

### Local development

```bash
npm install
cp .env.example .env
# then edit .env
npm run dev
```

