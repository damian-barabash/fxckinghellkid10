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
export async function compressVideo(file, { maxWidth = 1280, targetBytes = 40 * 1024 * 1024, onProgress } = {}) {
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
  let audioCtx

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

    // route the clip's audio into the recorded stream (silent on speakers —
    // creating a MediaElementSource reroutes the element away from output)
    let hasAudioGraph = false
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (AC) {
        audioCtx = new AC()
        const src = audioCtx.createMediaElementSource(video)
        const dest = audioCtx.createMediaStreamDestination()
        src.connect(dest)
        dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr))
        hasAudioGraph = true
      }
    } catch { /* no audio track / unsupported — video only */ }

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

    // Start playback. With the audio graph attached the element can stay
    // unmuted (output is rerouted, so speakers stay silent) — but an unmuted
    // autoplay may be blocked, so fall back to muted playback (video-only)
    // instead of throwing the whole job away.
    if (audioCtx?.state === 'suspended') await audioCtx.resume().catch(() => {})
    try {
      if (hasAudioGraph) video.muted = false
      await withTimeout(video.play(), 10_000, 'play timeout')
    } catch {
      video.muted = true
      await withTimeout(video.play(), 10_000, 'play timeout').catch(() => {
        throw new Error('cannot play video for compression')
      })
    }

    rec.start(1000)
    let poster = null
    const draw = () => {
      ctx.drawImage(video, 0, 0, w, h)
      // grab a poster from the first painted frame (same canvas, no extra decode)
      if (!poster && video.currentTime > 0) {
        try { canvas.toBlob((b) => { if (b && !poster) poster = b }, 'image/webp', 0.82) } catch { /* ignore */ }
      }
      if (onProgress && dur) onProgress(Math.min(0.99, video.currentTime / dur))
      if (!video.ended && !video.paused) raf = requestAnimationFrame(draw)
    }
    draw()

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
    audioCtx?.close?.().catch(() => {})

    const outType = (mimeType ? mimeType.split(';')[0] : '') || chunks[0]?.type || 'video/webm'
    const blob = new Blob(chunks, { type: outType })
    if (!blob.size) throw new Error('empty recording')
    return { blob, poster, ext: outType.includes('mp4') ? '.mp4' : '.webm', contentType: outType }
  } finally {
    cancelAnimationFrame(raf)
    try { video.pause() } catch { /* ignore */ }
    audioCtx?.close?.().catch(() => {})
    URL.revokeObjectURL(url)
    video.remove()
  }
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
