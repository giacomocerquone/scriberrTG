<h1 align="center">
  scriberrTG
  <br>
  <img src="assets/logo.png" alt="scriberrTG">
</h1>
<p align="center">
  <a href="#scriberrtg">Overview</a> •
  <a href="#environment-variables">Environment</a> •
  <a href="#installation">Installation</a> •
  <a href="#docker-compose-development">Docker</a> •
  <a href="#local-development">Local development</a> •
  <a href="#releasing">Releasing</a>
</p>

---

Telegram bot that accepts audio/voice/documents and sends them to [Scriberr](https://github.com/rishikanthc/scriberr) for transcription and sends the transcription back to the user.

### Environment variables

- **`TELEGRAM_BOT_TOKEN`**: Telegram bot token
- **`SCRIBERR_API_TOKEN`**: Scriberr API token (API key/bearer)
- **`SCRIBERR_HOST_URL`**: Scriberr host URL (example: `http://scriberr-api:8080`)
#### Optional:
- **`SSE_TIMEOUT_MS`** (optional): max wait for server-sent events (default `600000`)
- **`PROFILE_CACHE_TTL_MS`** (optional): cache transcription profiles for this duration (default `600000`)
- **`TELEGRAM_ALLOWED_USER_IDS`** (optional): comma-separated Telegram user IDs; if set, only those users can use the bot. If unset or empty, anyone can use it. Useful for a public bot token that should only serve you.

## Installation

You can either run the project locally if node is available or use the published image with Docker Compose.

**From a GitHub release:** On each [release](https://github.com/giacomocerquone/scriberrTG/releases), open the **Assets** section (the downloadable files below the release description) and download the compose YAML you need—typically `docker-compose.standalone.yml` for the bot image alone, or `docker-compose.scriberr.yml` for a fuller Scriberr-oriented example. Edit the file, then run Compose in the same directory as the download.

**From the repository:** The same files are in the [docker folder](https://github.com/giacomocerquone/scriberrTG/tree/main/docker). You need a Scriberr instance running; those examples show how to wire ScriberrTG and Scriberr together.

```bash
# File in the current directory (e.g. downloaded from release Assets)
docker compose -f docker-compose.standalone.yml up -d

# Clone of the repo at its root
docker compose -f docker/docker-compose.standalone.yml up -d
```

## Requirements

- A Scriberr instance running (and its API token)
- A Telegram bot token (can be obtained from [@BotFather](https://t.me/BotFather))
- A basic profile in Scriberr with "Automatic Transcription on Upload" set to true (The latter will be addressed in a future version of the bot where the job will be started by the bot itself.)

![Scriberr transcription settings](assets/scriberr-screenshot1.png)

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

### Releasing

Run `npm run release` to bump the version, commit, tag, and `git push --follow-tags`.
Then run `npm run release:github` to create the GitHub release with auto-generated notes (requires the [GitHub CLI](https://cli.github.com/) and the new tag on GitHub).

### TODO

- [ ] provide a web interface to configure the bot (especially the profile to use which is now fetched and cached on startup with a pre-defined ttl which is a bit weird) and see the logs
- [ ] add a stats functionality (once a year) to show some useful info