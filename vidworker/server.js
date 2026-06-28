// fxckinghellkid10 — video transcode worker (Bun, runs on the Mac Studio).
//
// Pipeline: admin browser uploads the original MP4 straight to R2 via a
// presigned PUT (no Supabase 50 MB cap), then asks this worker to transcode.
// The transcode runs as an async job (POST /transcode returns a jobId; the
// browser polls GET /job/<id>) so a long encode never depends on holding an
// HTTP connection open through Bun/Tailscale Funnel. The worker pulls the
// original from R2, runs ffmpeg -> WebM (VP9/Opus, <=1280) + a WebP poster,
// uploads both back to R2, deletes the original and exposes the public r2.dev
// URLs. The site stores those absolute URLs in `works`.
//
// Exposed publicly via Tailscale Funnel under /vid (the AI gateway keeps /).
// Auth: caller must present a valid Supabase access token.

import { AwsClient } from 'aws4fetch'
import { unlink, stat } from 'node:fs/promises'

const cfg = {
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucket: process.env.R2_BUCKET,
  endpoint: (process.env.R2_ENDPOINT || '').replace(/\/+$/, ''),
  publicBase: (process.env.R2_PUBLIC_BASE || '').replace(/\/+$/, ''),
  supabaseUrl: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
  supabaseAnon: process.env.SUPABASE_ANON_KEY,
  port: Number(process.env.PORT || 9099),
  ffmpeg: process.env.FFMPEG_BIN || `${process.env.HOME}/vidworker/bin/ffmpeg`,
  tmpDir: process.env.TMP_DIR || `${process.env.HOME}/vidworker/tmp`,
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  'https://fxckinghellkid10.com,https://www.fxckinghellkid10.com,https://damian-barabash.github.io,http://localhost:5173,http://localhost:4173')
  .split(',').map((s) => s.trim()).filter(Boolean)

const haveR2 = !!(cfg.accessKeyId && cfg.secretAccessKey && cfg.bucket && cfg.endpoint)
const aws = haveR2
  ? new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, region: 'auto', service: 's3' })
  : null

const objUrl = (key) => `${cfg.endpoint}/${cfg.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`
const publicUrl = (key) => `${cfg.publicBase}/${key}`
const log = (...a) => console.log(new Date().toISOString(), ...a)

// in-memory job table (jobId -> { status, videoUrl, posterUrl, bytes, error, ts })
const jobs = new Map()
function gcJobs() { // drop jobs older than 1h
  const cutoff = Date.now() - 3600_000
  for (const [id, j] of jobs) if (j.ts < cutoff) jobs.delete(id)
}

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '86400',
    'vary': 'origin',
  }
}
function json(data, { status = 200, origin } = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...corsHeaders(origin) } })
}

// Verify the caller is a logged-in Supabase user (only the admin can log in).
async function requireUser(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  try {
    const r = await fetch(`${cfg.supabaseUrl}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: cfg.supabaseAnon } })
    if (!r.ok) return null
    const u = await r.json()
    return u?.id ? u : null
  } catch { return null }
}

// One-time: allow the site origins to PUT directly to the bucket (presigned).
// Needs bucket-admin perms; an Object-R/W token can't do it (set CORS in the
// dashboard then). Logged either way; non-fatal.
async function ensureCors() {
  if (!haveR2) return
  const rules = ALLOWED_ORIGINS.map((o) => `<AllowedOrigin>${o}</AllowedOrigin>`).join('')
  const xml = `<?xml version="1.0" encoding="UTF-8"?><CORSConfiguration><CORSRule>${rules}<AllowedMethod>PUT</AllowedMethod><AllowedMethod>GET</AllowedMethod><AllowedMethod>HEAD</AllowedMethod><AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader><MaxAgeSeconds>3600</MaxAgeSeconds></CORSRule></CORSConfiguration>`
  try {
    const res = await aws.fetch(`${cfg.endpoint}/${cfg.bucket}?cors`, { method: 'PUT', body: xml, headers: { 'content-type': 'application/xml' } })
    log('[cors] PUT bucket cors ->', res.status, res.status === 403 ? '(set CORS in dashboard)' : '')
  } catch (e) { log('[cors] failed', e?.message || e) }
}

function sh(bin, args) {
  return new Promise(async (resolve) => {
    const proc = Bun.spawn([bin, ...args], { stdout: 'pipe', stderr: 'pipe' })
    const err = await new Response(proc.stderr).text()
    const code = await proc.exited
    resolve({ code, err })
  })
}

async function runTranscode(jobId, key) {
  const id = crypto.randomUUID()
  const inPath = `${cfg.tmpDir}/${id}.src`
  const outPath = `${cfg.tmpDir}/${id}.webm`
  const posterPath = `${cfg.tmpDir}/${id}.webp`
  try {
    log(`[job ${jobId}] get ${key}`)
    const ac = new AbortController()
    const to = setTimeout(() => ac.abort(), 10 * 60 * 1000)
    const got = await aws.fetch(objUrl(key), { signal: ac.signal })
    if (!got.ok) throw new Error(`r2 get ${got.status}`)
    // NB: Bun.write(path, Response) stalls on large streamed bodies in this Bun
    // build — buffer to an ArrayBuffer first (150 MB is fine on this box).
    await Bun.write(inPath, await got.arrayBuffer())
    clearTimeout(to)
    log(`[job ${jobId}] downloaded ${(await stat(inPath)).size} bytes -> ffmpeg`)

    const enc = await sh(cfg.ffmpeg, [
      '-y', '-i', inPath,
      '-vf', "scale='min(1280,iw)':-2",
      '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '33',
      '-row-mt', '1', '-cpu-used', '4', '-deadline', 'good',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'libopus', '-b:a', '96k', '-ac', '2',
      outPath,
    ])
    if (enc.code !== 0) { log(`[job ${jobId}] ffmpeg fail`, enc.err.slice(-1500)); throw new Error('transcode failed') }
    const outBytes = (await stat(outPath)).size
    log(`[job ${jobId}] webm ${outBytes} bytes -> poster`)

    let poster = await sh(cfg.ffmpeg, ['-y', '-ss', '0.5', '-i', inPath, '-frames:v', '1', '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libwebp', '-quality', '82', posterPath])
    if (poster.code !== 0) poster = await sh(cfg.ffmpeg, ['-y', '-i', inPath, '-frames:v', '1', '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libwebp', '-quality', '82', posterPath])
    const hasPoster = poster.code === 0 && (await Bun.file(posterPath).exists())

    const videoKey = `videos/${id}.webm`
    const posterKey = `posters/${id}.webp`
    log(`[job ${jobId}] upload ${videoKey}`)
    const upV = await aws.fetch(objUrl(videoKey), { method: 'PUT', body: await Bun.file(outPath).arrayBuffer(), headers: { 'content-type': 'video/webm' } })
    if (!upV.ok) throw new Error(`r2 put webm ${upV.status}`)
    let posterUrl = ''
    if (hasPoster) {
      const upP = await aws.fetch(objUrl(posterKey), { method: 'PUT', body: await Bun.file(posterPath).arrayBuffer(), headers: { 'content-type': 'image/webp' } })
      if (upP.ok) posterUrl = publicUrl(posterKey)
    }
    aws.fetch(objUrl(key), { method: 'DELETE' }).catch(() => {}) // drop original

    jobs.set(jobId, { status: 'done', videoUrl: publicUrl(videoKey), posterUrl, bytes: outBytes, ts: Date.now() })
    log(`[job ${jobId}] DONE ${(outBytes / 1048576).toFixed(1)} MB`)
  } catch (e) {
    log(`[job ${jobId}] ERROR`, e?.message || e)
    jobs.set(jobId, { status: 'error', error: String(e?.message || e), ts: Date.now() })
  } finally {
    for (const p of [inPath, outPath, posterPath]) await unlink(p).catch(() => {})
  }
}

Bun.serve({
  port: cfg.port,
  idleTimeout: 60,
  async fetch(req) {
    const url = new URL(req.url)
    const origin = req.headers.get('origin') || ''
    const path = url.pathname.replace(/^\/vid(?=\/|$)/, '') || '/'

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })

    if (path === '/health' || path === '/') return json({ ok: true, ffmpeg: true, r2: haveR2, bucket: cfg.bucket, jobs: jobs.size }, { origin })

    if (path === '/presign' && req.method === 'POST') {
      if (!haveR2) return json({ error: 'r2 not configured' }, { status: 503, origin })
      if (!(await requireUser(req))) return json({ error: 'unauthorized' }, { status: 401, origin })
      let body = {}; try { body = await req.json() } catch {}
      const ext = (String(body.ext || 'mp4').replace(/[^a-z0-9]/gi, '') || 'mp4').toLowerCase()
      const key = `originals/${crypto.randomUUID()}.${ext}`
      const signed = await aws.sign(objUrl(key), { method: 'PUT', aws: { signQuery: true } })
      return json({ uploadUrl: signed.url, key }, { origin })
    }

    if (path === '/transcode' && req.method === 'POST') {
      if (!haveR2) return json({ error: 'r2 not configured' }, { status: 503, origin })
      if (!(await requireUser(req))) return json({ error: 'unauthorized' }, { status: 401, origin })
      let body = {}; try { body = await req.json() } catch {}
      if (!body.key || !/^originals\//.test(body.key)) return json({ error: 'bad key' }, { status: 400, origin })
      gcJobs()
      const jobId = crypto.randomUUID()
      jobs.set(jobId, { status: 'processing', ts: Date.now() })
      runTranscode(jobId, body.key) // fire-and-forget; polled via /job/<id>
      return json({ jobId }, { origin })
    }

    if (path.startsWith('/job/') && req.method === 'GET') {
      if (!(await requireUser(req))) return json({ error: 'unauthorized' }, { status: 401, origin })
      const job = jobs.get(path.slice(5))
      if (!job) return json({ status: 'unknown' }, { status: 404, origin })
      return json(job, { origin })
    }

    if (path === '/delete' && req.method === 'POST') {
      if (!haveR2) return json({ error: 'r2 not configured' }, { status: 503, origin })
      if (!(await requireUser(req))) return json({ error: 'unauthorized' }, { status: 401, origin })
      let body = {}; try { body = await req.json() } catch {}
      const urls = Array.isArray(body.urls) ? body.urls : []
      let deleted = 0
      for (const u of urls) {
        if (typeof u !== 'string' || !u.startsWith(cfg.publicBase + '/')) continue
        try { const r = await aws.fetch(objUrl(u.slice(cfg.publicBase.length + 1)), { method: 'DELETE' }); if (r.ok) deleted++ } catch {}
      }
      return json({ deleted }, { origin })
    }

    return json({ error: 'not found' }, { status: 404, origin })
  },
})

await Bun.$`mkdir -p ${cfg.tmpDir}`.quiet().catch(() => {})
ensureCors()
log(`[vidworker] listening on :${cfg.port}  r2=${haveR2}  ffmpeg=${cfg.ffmpeg}`)
