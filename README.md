## scriberrTG

Telegram bot that accepts audio/voice/documents and sends them to [Scriberr](https://github.com/rishikanthc/scriberr) for transcription and sends the transcription back to the user.

### Environment variables

- **`TELEGRAM_BOT_TOKEN`**: Telegram bot token
- **`SCRIBERR_API_TOKEN`**: Scriberr API token (API key/bearer)
- **`SCRIBERR_HOST_URL`**: Scriberr host URL (example: `http://scriberr-api:8080`)
#### Optional:
- **`SSE_TIMEOUT_MS`** (optional): max wait for server-sent events (default `600000`)
- **`PROFILE_CACHE_TTL_MS`** (optional): cache transcription profiles for this duration (default `600000`)

## Installation

You can either run the project locally if node is available or use the released image through docker compose.
For the latter, at each tagged release you can find a docker-compose.yml file you can copy and edit to your needs.<br/>
Of course, you also need to have a Scriberr instance running. See the [docker folder](https://github.com/giacomocerquone/scriberrTG/tree/main/docker) for examples to help set up both ScriberrTG and Scriberr.

Then it's just a matter of running:

```bash
docker compose up -f docker-compose.yml -d
```

### Docker Compose development

Make sure to edit the docker-compose.dev.yml file to use the correct Scriberr's network name and container name.
Example: `http://scriberr:8080` — run `docker network inspect scriberr_network` to see names.

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

