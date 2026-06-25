// One-off: flatten every stored work image onto a solid BLACK background and
// rebuild project PDFs on black, so transparent PNGs never show white (the
// "white background" the client saw in the PDF viewer). Idempotent — flattening
// an already-opaque image on black is a no-op.
//
//   node scripts/blacken.mjs            # process everything
//   node scripts/blacken.mjs --dry      # report only, no uploads
//
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ifznjgkfzaoiungnyoqd.supabase.co'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlmem5qZ2tmemFvaXVuZ255b3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjIwNzAsImV4cCI6MjA5NzQzODA3MH0.9YiXEMF-py3IKSfaaG8I1kzzH2FgZ29IoXGwDGnO3lY'
const ADMIN_EMAIL = 'fxckinghellkid10@gmail.com'
const ADMIN_PASS = 'Qazxplmn_1234'
const BUCKET = 'media'
const DRY = process.argv.includes('--dry')

const supabase = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } })
const publicUrl = (p) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${p}`

const flattenWebp = (buf) =>
  sharp(buf).flatten({ background: '#000000' }).webp({ quality: 86 }).toBuffer()
const flattenJpeg = async (buf) => {
  const img = sharp(buf).flatten({ background: '#000000' }).jpeg({ quality: 88 })
  const out = await img.toBuffer()
  const meta = await sharp(out).metadata()
  return { buf: out, w: meta.width, h: meta.height }
}

async function download(path) {
  const res = await fetch(publicUrl(path))
  if (!res.ok) throw new Error(`download ${path} → ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}
async function upload(path, buf, contentType) {
  if (DRY) return
  const { error } = await supabase.storage.from(BUCKET).upload(path, buf, { contentType, upsert: true })
  if (error) throw error
}

async function buildPdf(jpegs) {
  const pdf = await PDFDocument.create()
  for (const { buf, w, h } of jpegs) {
    const jpg = await pdf.embedJpg(buf)
    const page = pdf.addPage([w, h])
    page.drawImage(jpg, { x: 0, y: 0, width: w, height: h })
  }
  return Buffer.from(await pdf.save())
}

async function main() {
  const { error: authErr } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASS })
  if (authErr) throw new Error('admin sign-in failed: ' + authErr.message)

  const { data: works, error } = await supabase.from('works').select('*').order('category')
  if (error) throw error
  console.log(`${works.length} works${DRY ? ' (dry run)' : ''}`)

  let imgCount = 0, pdfCount = 0
  for (const w of works) {
    const paths = Array.from(new Set([...(w.images || []), w.thumb_url].filter(Boolean)))
      .filter((p) => /\.webp$/i.test(p)) // skip pdf/video; posters are already opaque but harmless

    // 1) flatten each stored webp onto black (in place)
    for (const p of paths) {
      try {
        const buf = await download(p)
        const out = await flattenWebp(buf)
        await upload(p, out, 'image/webp')
        imgCount++
      } catch (e) { console.warn('  skip img', p, e.message) }
    }

    // 2) rebuild the PDF on black for project works
    if (w.kind === 'project' && w.pdf_url && (w.images || []).length) {
      try {
        const jpegs = []
        for (const p of w.images) jpegs.push(await flattenJpeg(await download(p)))
        const pdf = await buildPdf(jpegs)
        await upload(w.pdf_url, pdf, 'application/pdf')
        pdfCount++
      } catch (e) { console.warn('  skip pdf', w.pdf_url, e.message) }
    }
    console.log(`· ${w.category} / ${w.title || '—'} (${paths.length} img${w.kind === 'project' ? ' +pdf' : ''})`)
  }
  console.log(`done: ${imgCount} images flattened, ${pdfCount} PDFs rebuilt${DRY ? ' (dry)' : ''}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
