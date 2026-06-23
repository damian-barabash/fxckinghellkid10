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

// ---- Video → WebM (client-side, ffmpeg.wasm) ----
// The 25 MB core is loaded from a CDN on first use only, so it never bloats the
// public bundle. The single-thread core needs no COOP/COEP headers (works on
// GitHub Pages). Transcoding is slow (minutes per clip) — show progress.
let _ffmpeg = null
async function getFfmpeg(onLog) {
  if (_ffmpeg) return _ffmpeg
  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { toBlobURL } = await import('@ffmpeg/util')
  const ff = new FFmpeg()
  if (onLog) ff.on('log', ({ message }) => onLog(message))
  const base = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd'
  await ff.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  })
  _ffmpeg = ff
  return ff
}

// Convert a video File to a WebM Blob (VP9 + Opus), scaled to <=1280px wide.
// onProgress receives a 0..1 ratio.
export async function videoToWebm(file, { onProgress } = {}) {
  const { fetchFile } = await import('@ffmpeg/util')
  const ff = await getFfmpeg()
  if (onProgress) ff.on('progress', ({ progress }) => onProgress(Math.min(1, Math.max(0, progress || 0))))
  const inName = 'in' + (file.name.match(/\.[a-z0-9]+$/i)?.[0] || '.mp4')
  await ff.writeFile(inName, await fetchFile(file))
  await ff.exec([
    '-i', inName,
    '-vf', 'scale=min(1280\\,iw):-2',
    '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4',
    '-c:a', 'libopus', '-b:a', '96k',
    'out.webm',
  ])
  const data = await ff.readFile('out.webm')
  await ff.deleteFile(inName).catch(() => {})
  await ff.deleteFile('out.webm').catch(() => {})
  return new Blob([data.buffer], { type: 'video/webm' })
}

// Make a poster (WebP) from the first frame of a video File.
export async function videoPoster(file, { maxEdge = 1280, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.muted = true
    v.src = url
    v.onloadeddata = () => { v.currentTime = Math.min(0.1, (v.duration || 1) / 2) }
    v.onseeked = () => {
      let { videoWidth: w, videoHeight: h } = v
      if (maxEdge && Math.max(w, h) > maxEdge) { const s = maxEdge / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s) }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(v, 0, 0, w, h)
      canvas.toBlob((b) => { URL.revokeObjectURL(url); resolve(b) }, 'image/webp', quality)
    }
    v.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
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
