// Decode a File into an HTMLImageElement.
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

// Convert any image File to a WebP Blob, optionally capped at maxEdge px.
export async function toWebp(file, { maxEdge = 2200, quality = 0.86 } = {}) {
  const img = await loadImage(file)
  let { width, height } = img
  if (maxEdge && Math.max(width, height) > maxEdge) {
    const scale = maxEdge / Math.max(width, height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  // Always paint a solid black backdrop first, so transparent PNGs flatten onto
  // black instead of showing white (in tiles and, after PDF build, in viewers).
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', quality))
  return blob
}

// Build a PDF (one image per page, page sized to the image) from WebP blobs.
// pdf-lib can't embed WebP, so we re-encode each blob to PNG via canvas first.
async function blobToPngBytes(blob) {
  const img = await loadImage(blob)
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')
  // black backdrop so a transparent source never shows white in the PDF viewer
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, img.width, img.height)
  ctx.drawImage(img, 0, 0)
  const pngBlob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
  return new Uint8Array(await pngBlob.arrayBuffer())
}

export async function buildPdf(blobs) {
  const { PDFDocument } = await import('pdf-lib') // keep pdf-lib out of the public bundle
  const pdf = await PDFDocument.create()
  for (const blob of blobs) {
    const pngBytes = await blobToPngBytes(blob)
    const png = await pdf.embedPng(pngBytes)
    const page = pdf.addPage([png.width, png.height])
    page.drawImage(png, { x: 0, y: 0, width: png.width, height: png.height })
  }
  const bytes = await pdf.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

// Random-but-safe storage key segment.
export function slugify(str) {
  return (str || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'untitled'
}

// ---- Video compression (client-side, native MediaRecorder) ----
// Re-encodes the clip by replaying it into a downscaled canvas and recording
// that with MediaRecorder, so the upload fits Supabase's 50 MB free-tier cap.
// Unlike ffmpeg.wasm (which fails to load in Safari — desktop AND iOS), this
// uses only native browser APIs and works in Safari, Chrome and Firefox.
// The target bitrate is derived from the clip duration so the output lands near
// `targetBytes` regardless of length. Recording happens in real time.
export const MAX_UPLOAD_BYTES = 49 * 1024 * 1024 // a hair under Supabase's 50 MB

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  const types = [
    'video/mp4;codecs=h264,aac', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm',
  ]
  return types.find((t) => { try { return MediaRecorder.isTypeSupported(t) } catch { return false } }) || ''
}

// Reject a promise if it doesn't settle in `ms` — so no single step can hang
// the whole upload (the symptom: progress reaches 100% then stalls forever).
function withTimeout(promise, ms, msg) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(msg || 'timeout')), ms)),
  ])
}

// Compress a video File entirely in the browser (native MediaRecorder — works
// in Safari/Chrome/Firefox, unlike ffmpeg.wasm which won't load in WebKit) so
// the upload fits Supabase's 50 MB free-tier cap. The downscaled clip is
// recorded in real time off a canvas; a poster frame is grabbed from that same
// canvas (no separate decode pass that could hang). Every async step is
// timeout-guarded. Resolves { blob, poster, ext, contentType }; throws on
// failure so the caller can fall back to the original file.
//
// `audioCtx` MUST be a RUNNING AudioContext created inside a user gesture (see
// AdminWorks). This is the crux of the historical "video won't upload" bug:
// attaching a <video> to a *suspended* AudioContext slaves the element's clock
// to that context, so it never advances, the encode never finishes and the job
// times out. With a context already resumed under the click gesture the element
// plays normally and audio is captured silently (output is rerouted off the
// speakers). Audio is strictly best-effort — if anything about it fails we
// record video-only rather than failing the whole upload.
export async function compressVideo(file, { maxWidth = 1280, targetBytes = 40 * 1024 * 1024, onProgress, audioCtx } = {}) {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error('MediaRecorder unsupported')
  }
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.src = url
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.preload = 'auto'
  video.muted = true
  // Safari fires media events far more reliably for an attached element.
  video.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none'
  document.body.appendChild(video)
  let raf = 0
  let useRVFC = typeof video.requestVideoFrameCallback === 'function'

  try {
    await withTimeout(new Promise((res, rej) => {
      video.onloadedmetadata = res
      video.onerror = () => rej(new Error('video load failed'))
    }), 30_000, 'video metadata timeout')

    let w = video.videoWidth, h = video.videoHeight
    if (!w || !h) throw new Error('no video dimensions')
    if (Math.max(w, h) > maxWidth) {
      const s = maxWidth / Math.max(w, h)
      w = Math.round((w * s) / 2) * 2
      h = Math.round((h * s) / 2) * 2
    }

    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    const stream = canvas.captureStream(30)

    // Route the clip's audio into the recorded stream. Only do this with a
    // RUNNING context — a suspended one would stall the element (the old bug).
    // Output is rerouted into the graph, so the speakers stay silent.
    let hasAudioGraph = false
    if (audioCtx && audioCtx.state === 'running') {
      try {
        const src = audioCtx.createMediaElementSource(video)
        const dest = audioCtx.createMediaStreamDestination()
        src.connect(dest)
        dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr))
        hasAudioGraph = true
      } catch { /* no audio track / already wired — record video only */ }
    }

    const dur = video.duration && isFinite(video.duration) ? video.duration : 60
    const audioBps = 96_000
    let videoBps = Math.floor((targetBytes * 8) / dur) - (hasAudioGraph ? audioBps : 0)
    videoBps = Math.max(500_000, Math.min(videoBps, 4_000_000))

    const mimeType = pickMime()
    const rec = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: videoBps,
      audioBitsPerSecond: audioBps,
    })
    const chunks = []
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data) }
    const stopped = new Promise((res) => { rec.onstop = res })

    // With the audio graph attached the element output is rerouted, so it can
    // stay unmuted without making sound. Without a graph keep it muted so the
    // browser always allows programmatic playback (muted autoplay is never
    // blocked). Either way, fall back to muted playback before giving up.
    if (hasAudioGraph) video.muted = false
    try {
      await withTimeout(video.play(), 10_000, 'play timeout')
    } catch {
      video.muted = true
      await withTimeout(video.play(), 10_000, 'play timeout').catch(() => {
        throw new Error('cannot play video for compression')
      })
    }

    rec.start(1000)
    let poster = null
    const paint = () => {
      ctx.drawImage(video, 0, 0, w, h)
      // grab a poster from the first painted frame (same canvas, no extra decode)
      if (!poster && video.currentTime > 0) {
        try { canvas.toBlob((b) => { if (b && !poster) poster = b }, 'image/webp', 0.82) } catch { /* ignore */ }
      }
      if (onProgress && dur) onProgress(Math.min(0.99, video.currentTime / dur))
    }
    // Drive painting off decoded frames when available (precise, resilient to
    // background-tab rAF throttling); fall back to requestAnimationFrame.
    const tick = () => {
      paint()
      if (video.ended || video.paused) return
      if (useRVFC) video.requestVideoFrameCallback(tick)
      else raf = requestAnimationFrame(tick)
    }
    if (useRVFC) video.requestVideoFrameCallback(tick)
    else { raf = requestAnimationFrame(tick) }

    // Wait for playback to finish — Safari does not always fire `ended` for a
    // programmatic element, so also poll currentTime. Hard cap so a stuck clip
    // can't hang forever (real-time encode ≈ clip length).
    await withTimeout(new Promise((res) => {
      let settled = false
      const finish = () => { if (settled) return; settled = true; clearInterval(poll); res() }
      video.onended = finish
      const poll = setInterval(() => {
        const d = video.duration
        if (video.ended || (d && isFinite(d) && video.currentTime >= d - 0.3)) finish()
      }, 250)
    }), dur * 1000 * 1.6 + 15_000, 'compression timeout')

    cancelAnimationFrame(raf)
    if (onProgress) onProgress(1)
    rec.stop()
    await Promise.race([stopped, new Promise((r) => setTimeout(r, 5000))])

    const outType = (mimeType ? mimeType.split(';')[0] : '') || chunks[0]?.type || 'video/webm'
    const blob = new Blob(chunks, { type: outType })
    if (!blob.size) throw new Error('empty recording')
    return { blob, poster, ext: outType.includes('mp4') ? '.mp4' : '.webm', contentType: outType }
  } finally {
    cancelAnimationFrame(raf)
    try { video.pause() } catch { /* ignore */ }
    URL.revokeObjectURL(url)
    video.remove()
  }
}

// True if the browser can actually decode this clip in a <video> element.
// Some codecs (Motion-JPEG, sometimes HEVC) won't decode in Chrome/Firefox —
// MediaRecorder can't touch those, so we route them to ffmpeg.wasm instead.
export function canDecodeVideo(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.muted = true; v.playsInline = true; v.preload = 'metadata'; v.src = url
    let done = false
    const fin = (ok) => { if (done) return; done = true; clearTimeout(g); URL.revokeObjectURL(url); resolve(ok) }
    const g = setTimeout(() => fin(false), 12_000)
    v.onloadedmetadata = () => fin(!!(v.videoWidth && v.videoHeight))
    v.onerror = () => fin(false)
  })
}

// ---- ffmpeg.wasm fallback (handles codecs the browser can't decode) ----
// Single-thread core from a CDN — no COOP/COEP headers needed. Loads in
// Chrome/Firefox desktop (not Safari/iOS, where the native MediaRecorder path
// already covers every codec Safari can decode).
let _ffmpeg
async function getFfmpeg() {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { toBlobURL } = await import('@ffmpeg/util')
  if (!_ffmpeg) {
    const ff = new FFmpeg()
    const base = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd'
    await ff.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    _ffmpeg = ff
  }
  return _ffmpeg
}

// Transcode any video to an H.264/AAC mp4 sized to fit the upload cap.
// Resolves { blob, poster:null, ext, contentType }; throws if ffmpeg can't load.
export async function transcodeWithFfmpeg(file, { maxWidth = 1280, crf = 30, onProgress } = {}) {
  const { fetchFile } = await import('@ffmpeg/util')
  const ff = await getFfmpeg()
  const onP = onProgress ? ({ progress }) => onProgress(Math.max(0, Math.min(0.99, progress || 0))) : null
  if (onP) ff.on('progress', onP)
  const inName = 'in.' + ((file.name.match(/\.([a-z0-9]+)$/i)?.[1] || 'mov').toLowerCase())
  const outName = 'out.mp4'
  try {
    await ff.writeFile(inName, await fetchFile(file))
    await ff.exec([
      '-i', inName,
      '-vf', `scale=min(${maxWidth}\\,iw):-2`,        // downscale only, keep even dims
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-c:a', 'aac', '-b:a', '96k',
      outName,
    ])
    const data = await ff.readFile(outName)
    if (onProgress) onProgress(1)
    const blob = new Blob([data.buffer || data], { type: 'video/mp4' })
    if (!blob.size) throw new Error('empty ffmpeg output')
    return { blob, poster: null, ext: '.mp4', contentType: 'video/mp4' }
  } finally {
    if (onP) ff.off?.('progress', onP)
    ff.deleteFile(inName).catch(() => {})
    ff.deleteFile(outName).catch(() => {})
  }
}

// One call that turns any uploaded video into an under-the-cap blob + poster,
// picking the right engine per browser/codec. Throws Error with `.code`:
//   'too-big'     — compressed but still over the 50 MB free-tier cap
//   'unsupported' — no engine could process this file in this browser
export async function prepareVideo(file, { onProgress, onStage, audioCtx } = {}) {
  let result = null

  // 1) Browser can decode it → record off a canvas (fast, every browser).
  // We only accept MP4/H.264, which decodes in every target browser, so try the
  // MediaRecorder path directly (skipping the extra canDecodeVideo probe keeps
  // the click gesture fresh for autoplay).
  {
    try {
      onStage?.('compress')
      result = await compressVideo(file, { onProgress, audioCtx })
      if (result.blob.size > MAX_UPLOAD_BYTES) {
        const r2 = await compressVideo(file, { maxWidth: 854, targetBytes: 28 * 1024 * 1024, onProgress, audioCtx })
        if (r2.blob.size < result.blob.size) result = r2
      }
    } catch (e) { console.warn('MediaRecorder path failed:', e); result = null }
  }

  // 2) Exotic codec (e.g. Motion-JPEG in Chrome/Firefox) or recorder overshot
  //    → transcode with ffmpeg.wasm (its own decoders).
  if (!result || result.blob.size > MAX_UPLOAD_BYTES) {
    try {
      onStage?.('transcode')
      let r = await transcodeWithFfmpeg(file, { onProgress })
      if (r.blob.size > MAX_UPLOAD_BYTES) {
        const r2 = await transcodeWithFfmpeg(file, { maxWidth: 854, crf: 33, onProgress })
        if (r2.blob.size < r.blob.size) r = r2
      }
      if (!result || r.blob.size < result.blob.size) result = r
    } catch (e) { console.warn('ffmpeg path failed:', e) }
  }

  if (!result) { const err = new Error('video-unsupported'); err.code = 'unsupported'; throw err }
  if (result.blob.size > MAX_UPLOAD_BYTES) { const err = new Error('video-too-big'); err.code = 'too-big'; throw err }

  // poster: compressVideo grabs one off its canvas; ffmpeg output gets one from
  // the (now decodable) H.264 result. Best-effort — never blocks the upload.
  if (!result.poster) { try { result.poster = await videoPoster(result.blob) } catch { /* no poster */ } }
  return result
}

// Make a poster (WebP) from the first frame of a video File. Best-effort:
// hardened for iOS/iPad Safari (inline + muted, nudge play before seeking).
export async function videoPoster(file, { maxEdge = 1280, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.setAttribute('playsinline', '')
    v.preload = 'auto'
    v.src = url
    let done = false
    const finish = (blob) => { if (done) return; done = true; clearTimeout(guard); URL.revokeObjectURL(url); resolve(blob) }
    // never hang the upload waiting on a poster — give up after 8s
    const guard = setTimeout(() => finish(null), 8000)
    const grab = () => {
      let { videoWidth: w, videoHeight: h } = v
      if (!w || !h) return finish(null)
      if (maxEdge && Math.max(w, h) > maxEdge) { const s = maxEdge / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s) }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(v, 0, 0, w, h)
      canvas.toBlob((b) => finish(b), 'image/webp', quality)
    }
    v.onloadeddata = () => { try { v.currentTime = Math.min(0.1, (v.duration || 1) / 2) } catch { grab() } }
    v.onseeked = grab
    v.onerror = () => { if (done) return; done = true; URL.revokeObjectURL(url); reject(new Error('poster failed')) }
    // iOS sometimes needs a play() nudge for the frame to be decodable
    v.play?.().catch(() => {})
  })
}

// Fetch a (possibly cross-origin) URL and trigger a browser download.
export async function forceDownload(url, filename) {
  const res = await fetch(url)
  const blob = await res.blob()
  const a = document.createElement('a')
  const obj = URL.createObjectURL(blob)
  a.href = obj
  a.download = filename || 'download'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(obj), 1000)
}
