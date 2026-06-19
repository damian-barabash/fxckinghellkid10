// Seed script: convert local assets → webp, generate per-project PDFs,
// upload to Supabase Storage, and insert rows into `works`.
//
//   node scripts/seed.mjs          # seeds only if works table is empty
//   node scripts/seed.mjs --force  # wipes works + storage/works, then re-seeds
//
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, basename } from 'node:path'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ifznjgkfzaoiungnyoqd.supabase.co'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlmem5qZ2tmemFvaXVuZ255b3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjIwNzAsImV4cCI6MjA5NzQzODA3MH0.9YiXEMF-py3IKSfaaG8I1kzzH2FgZ29IoXGwDGnO3lY'
const ADMIN_EMAIL = 'fxckinghellkid10@gmail.com'
const ADMIN_PASS = 'Qazxplmn_1234'
const BUCKET = 'media'
const FORCE = process.argv.includes('--force')

const ROOT = new URL('..', import.meta.url).pathname
const WORK_DIR = join(ROOT, 'assets', 'work')
const IMG_RE = /\.(jpe?g|png|webp|gif|tiff?)$/i

const supabase = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } })

const slug = (s) =>
  (s || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'untitled'

async function listImages(dir) {
  let entries = []
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return [] }
  return entries
    .filter((e) => e.isFile() && IMG_RE.test(e.name) && !e.name.startsWith('.'))
    .map((e) => join(dir, e.name))
    .sort()
}
async function listDirs(dir) {
  let entries = []
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return [] }
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
}

async function toWebp(path) {
  return sharp(path).rotate().resize(2200, 2200, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 86 }).toBuffer()
}
async function toJpegMeta(path) {
  const img = sharp(path).rotate().resize(2200, 2200, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 })
  const buf = await img.toBuffer()
  const meta = await sharp(buf).metadata()
  return { buf, w: meta.width, h: meta.height }
}

async function buildPdf(paths) {
  const pdf = await PDFDocument.create()
  for (const p of paths) {
    const { buf, w, h } = await toJpegMeta(p)
    const jpg = await pdf.embedJpg(buf)
    const page = pdf.addPage([w, h])
    page.drawImage(jpg, { x: 0, y: 0, width: w, height: h })
  }
  return Buffer.from(await pdf.save())
}

async function upload(path, buf, contentType) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, buf, { contentType, upsert: true })
  if (error) throw new Error(`upload ${path}: ${error.message}`)
  return path
}

async function clearAll() {
  console.log('--force: wiping works + storage/works …')
  await supabase.from('works').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  // recursively remove storage under works/
  async function rm(prefix) {
    const { data } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 })
    if (!data) return
    const files = data.filter((d) => d.id).map((d) => `${prefix}/${d.name}`)
    const folders = data.filter((d) => !d.id).map((d) => `${prefix}/${d.name}`)
    if (files.length) await supabase.storage.from(BUCKET).remove(files)
    for (const f of folders) await rm(f)
  }
  await rm('works')
}

async function main() {
  const { error: authErr } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASS })
  if (authErr) throw new Error('auth failed: ' + authErr.message)
  console.log('signed in as admin ✓')

  const { count } = await supabase.from('works').select('id', { count: 'exact', head: true })
  if (count > 0 && !FORCE) {
    console.log(`works already has ${count} rows — pass --force to re-seed. Aborting.`)
    return
  }
  if (FORCE) await clearAll()

  const rows = []
  const stamp = Date.now().toString(36)

  // ---------- COVER ARTS: each image is its own cover tile ----------
  const coverDir = join(WORK_DIR, 'COVER ARTS')
  for (const folder of await listDirs(coverDir)) {
    const imgs = await listImages(join(coverDir, folder))
    const isNoName = folder.toUpperCase().includes('NO_NAME')
    const title = isNoName ? null : folder
    let i = 0
    for (const img of imgs) {
      i++
      const buf = await toWebp(img)
      const path = await upload(`works/cover_arts/${slug(folder)}-${stamp}-${i}.webp`, buf, 'image/webp')
      rows.push({ category: 'cover_arts', kind: 'cover', title, thumb_url: path, images: [path] })
      process.stdout.write(`  cover: ${folder} #${i}\r`)
    }
  }
  console.log('\nCOVER ARTS done')

  // ---------- TITLE CARDS + CLOTHING DESIGN: folder = project + PDF ----------
  for (const [catKey, catDir] of [['title_cards', 'TITLE CARDS'], ['clothing_design', 'CLOTHING DESIGN']]) {
    const base = join(WORK_DIR, catDir)
    for (const folder of await listDirs(base)) {
      const imgs = await listImages(join(base, folder))
      if (!imgs.length) continue
      const sl = slug(folder)
      const paths = []
      let i = 0
      for (const img of imgs) {
        i++
        const buf = await toWebp(img)
        paths.push(await upload(`works/${catKey}/${sl}-${stamp}/img-${i}.webp`, buf, 'image/webp'))
      }
      const pdf = await buildPdf(imgs)
      const pdfPath = await upload(`works/${catKey}/${sl}-${stamp}/project.pdf`, pdf, 'application/pdf')
      rows.push({ category: catKey, kind: 'project', title: folder, thumb_url: paths[0], images: paths, pdf_url: pdfPath })
      console.log(`  project: ${catDir} / ${folder} (${imgs.length} imgs)`)
    }
  }

  // ---------- CREATIVE DIRECTION: loose files, each its own tile (lightbox) ----------
  const cdDir = join(WORK_DIR, 'CREATIVE DIRECTION')
  const cdImgs = await listImages(cdDir)
  let ci = 0
  for (const img of cdImgs) {
    ci++
    const buf = await toWebp(img)
    const path = await upload(`works/creative_direction/cd-${stamp}-${ci}.webp`, buf, 'image/webp')
    rows.push({ category: 'creative_direction', kind: 'cover', title: null, thumb_url: path, images: [path] })
  }
  console.log(`CREATIVE DIRECTION done (${ci} tiles)`)

  // ---------- insert ----------
  const CHUNK = 100
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('works').insert(rows.slice(i, i + CHUNK))
    if (error) throw new Error('insert: ' + error.message)
  }
  console.log(`\n✓ seeded ${rows.length} works`)
}

main().catch((e) => { console.error('\nSEED FAILED:', e.message); process.exit(1) })
