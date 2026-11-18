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
