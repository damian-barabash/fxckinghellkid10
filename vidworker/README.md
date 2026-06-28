# vidworker — video transcode worker (runs on the Mac Studio)

Turns admin video uploads into web-ready WebM, off the client and off Supabase
(whose free tier caps uploads at 50 MB). Lives on the always-on Mac Studio
`barabash-ai`, exposed publicly via Tailscale Funnel under `/vid`.

## Flow

1. Admin browser → `POST /vid/presign` → presigned R2 PUT URL.
2. Browser uploads the **original** straight to Cloudflare R2 (no size cap).
3. Browser → `POST /vid/transcode {key}` → returns `{ jobId }` immediately.
4. Worker (async job): pull original from R2 → `ffmpeg` → **WebM (VP9/Opus, ≤1280)**
   + WebP poster → upload both to R2 → delete original.
5. Browser polls `GET /vid/job/<id>` until `done` → gets public `pub-*.r2.dev` URLs.
6. Frontend stores those absolute URLs in `works.video_url` / `thumb_url`.

Auth: every endpoint (except `/health`) requires a valid Supabase access token
(verified against `/auth/v1/user`). Only the admin can log in.

## Endpoints

- `GET  /vid/health`            → status, `r2`, `jobs`
- `POST /vid/presign`           → `{ uploadUrl, key }`
- `POST /vid/transcode {key}`   → `{ jobId }`
- `GET  /vid/job/<id>`          → `{ status: processing|done|error, videoUrl, posterUrl, bytes }`
- `POST /vid/delete {urls[]}`   → best-effort delete of `pub-*.r2.dev` objects

## Install on the Mac (one-time)

```sh
mkdir -p ~/vidworker/bin ~/vidworker/tmp ~/vidworker/logs
# ffmpeg (arm64 static — has libvpx/VP9, libopus, libwebp)
curl -L -o /tmp/ff.zip https://www.osxexperts.net/ffmpeg81arm.zip
unzip -o /tmp/ff.zip -d ~/vidworker/bin && chmod +x ~/vidworker/bin/ffmpeg
cp server.js ~/vidworker/server.js
cd ~/vidworker && bun add aws4fetch
cp .env.example ~/vidworker/.env   # then fill R2 keys + SUPABASE_ANON_KEY, chmod 600
```

launchd: `~/Library/LaunchAgents/com.fhk10.vidworker.plist` (RunAtLoad + KeepAlive,
`BUN_ENV_FILE=~/vidworker/.env`, runs `bun run ~/vidworker/server.js`).
Restart: `launchctl kickstart -k gui/$(id -u)/com.fhk10.vidworker`.

Tailscale Funnel path (keeps the AI gateway on `/`):
```sh
TS=/Applications/Tailscale.app/Contents/MacOS/Tailscale
$TS funnel --bg --https=443 --set-path /vid http://127.0.0.1:9099
```

## R2 bucket CORS (one-time, dashboard)

An Object-R/W token can't set CORS via API. In the R2 dashboard:
bucket → **Settings → CORS Policy** → allow the site origins with methods
`GET, PUT, HEAD` and headers `*` (needed for the browser's presigned PUT).
