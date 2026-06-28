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

// ---- Video upload via the Cloudflare R2 + Mac Studio transcode worker ----
// The browser uploads the original clip straight to R2 (presigned PUT, so no
// Supabase 50 MB cap), then asks the worker to transcode it to WebM on the Mac
// Studio with real ffmpeg. Returns the public r2.dev URLs of the WebM and its
// poster. See src/lib/supabase.js (VIDEO_WORKER_URL) and ~/vidworker on the Mac.
//
// Stages reported via onStage: 'presign' → 'upload' (onProgress 0..1 for the
// raw upload) → 'transcode' (server-side, no progress, can take a minute).
// Throws on any failure — the caller surfaces the message.
export async function uploadVideoToR2(file, { workerUrl, accessToken, onProgress, onStage } = {}) {
  if (!workerUrl) throw new Error('video worker not configured')
  if (!accessToken) throw new Error('not signed in')
  const auth = { authorization: `Bearer ${accessToken}` }
  const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || 'mp4').toLowerCase()

  // 1) ask the worker for a presigned PUT URL on R2
  onStage?.('presign')
  const pres = await fetch(`${workerUrl}/presign`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ ext, contentType: file.type || 'video/mp4' }),
  })
  if (!pres.ok) throw new Error(await errText(pres, 'presign'))
  const { uploadUrl, key } = await pres.json()

  // 2) upload the original straight to R2 (XHR for progress events)
  onStage?.('upload')
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('content-type', file.type || 'video/mp4')
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total) }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload failed (${xhr.status})`)))
    xhr.onerror = () => reject(new Error('upload network error'))
    xhr.ontimeout = () => reject(new Error('upload timed out'))
    xhr.timeout = 30 * 60 * 1000
    xhr.send(file)
  })

  // 3) trigger the server-side transcode → WebM + poster, returned as R2 URLs
  onStage?.('transcode')
  const tr = await fetch(`${workerUrl}/transcode`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ key }),
  })
  if (!tr.ok) throw new Error(await errText(tr, 'transcode'))
  const out = await tr.json()
  if (!out.videoUrl) throw new Error('transcode returned no video')
  return { videoUrl: out.videoUrl, posterUrl: out.posterUrl || '' }
}

async function errText(res, where) {
  try { const j = await res.json(); if (j?.error) return `${where}: ${j.error}` } catch { /* ignore */ }
  return `${where} failed (${res.status})`
}

// Best-effort delete of R2-hosted objects (public r2.dev URLs) via the worker.
export async function deleteFromR2(urls, { workerUrl, accessToken } = {}) {
  const list = (urls || []).filter((u) => typeof u === 'string' && u.startsWith('http'))
  if (!list.length || !workerUrl || !accessToken) return
  try {
    await fetch(`${workerUrl}/delete`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ urls: list }),
    })
  } catch { /* best-effort cleanup */ }
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
