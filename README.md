# Clipster

Turn long videos into short vertical clips with animated captions.

## Features
- Email/password accounts (scrypt hashes, httpOnly session cookies); each user sees only their own projects and clips
- Upload a video, or import from an https link (direct MP4s, YouTube and other sites via yt-dlp)
- Transcription with Whisper (`OPENAI_API_KEY`) and clip selection with Claude (`ANTHROPIC_API_KEY`); without keys a deterministic fallback runs
- 9:16 center-crop at 1080x1920 with word-by-word animated captions (ASS/libass)
- Browser playback and MP4 download

## Requirements
- Node.js 22+, PostgreSQL 14+
- `ffmpeg`/`ffprobe` built with libass
- `pip install "yt-dlp[default]"` (the `[default]` extra includes the YouTube challenge solver)

## Run
```bash
cp .env.example .env.local   # set DATABASE_URL and optional API keys
npm install
npm run dev
```
Tables are created on first request. Video jobs run inside the web process; move `processProject` to a queue worker for production.

## Deploy

**Full app (Render):** [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/dankstorm96-stack/clipster)

`render.yaml` creates the web service (built from the `Dockerfile`, which installs ffmpeg and yt-dlp) and a Postgres database. On the free plan, rendered clips are stored on the instance's disk and are lost when it restarts or redeploys; free Postgres databases expire after 30 days. Add a persistent disk or object storage for real use.

**Landing page (GitHub Pages):** the static page in `docs/` is served by GitHub Pages once it is enabled in **Settings → Pages → Branch: `main`, folder: `/docs`**. It is a preview only; the clip tools need the full app.
