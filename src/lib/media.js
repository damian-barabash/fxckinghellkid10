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
  canvas.getContext('2d').drawImage(img, 0, 0)
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

// ---- Video compression (client-side, ffmpeg.wasm) ----
// Re-encodes to a small WebM (VP9 + Opus) so the upload fits Supabase's 50 MB
// free-tier cap. The 25 MB core loads from a CDN on first use only (never in
// the public bundle). ffmpeg.wasm runs in desktop browsers; on iOS/iPad Safari
// it fails to load — callers must catch and fall back to the original file.
export const MAX_UPLOAD_BYTES = 49 * 1024 * 1024 // a hair under Supabase's 50 MB

let _ffmpeg = null
async function getFfmpeg() {
  if (_ffmpeg) return _ffmpeg
  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { toBlobURL } = await import('@ffmpeg/util')
  const ff = new FFmpeg()
  const base = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd'
  await ff.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  })
  _ffmpeg = ff
  return ff
}

// Compress a video File to a WebM Blob, scaled to <= maxWidth px wide.
// onProgress receives a 0..1 ratio. Throws if ffmpeg can't load (iOS).
export async function videoToWebm(file, { onProgress, maxWidth = 1080, crf = 36 } = {}) {
  const { fetchFile } = await import('@ffmpeg/util')
  const ff = await getFfmpeg()
  if (onProgress) ff.on('progress', ({ progress }) => onProgress(Math.min(1, Math.max(0, progress || 0))))
  const inName = 'in' + (file.name.match(/\.[a-z0-9]+$/i)?.[0] || '.mp4')
  await ff.writeFile(inName, await fetchFile(file))
  await ff.exec([
    '-i', inName,
    '-vf', `scale='min(${maxWidth}\\,iw)':-2`,
    '-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4',
    '-c:a', 'libopus', '-b:a', '96k',
    'out.webm',
  ])
  const data = await ff.readFile('out.webm')
  await ff.deleteFile(inName).catch(() => {})
  await ff.deleteFile('out.webm').catch(() => {})
  return new Blob([data.buffer], { type: 'video/webm' })
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
    const finish = (blob) => { if (done) return; done = true; URL.revokeObjectURL(url); resolve(blob) }
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
