// One-off: generate a small "<name>.thumb.webp" sibling for every stored image,
// so the public masonry grids load ~40 KB tiles instead of the 1–2 MB originals
// (the originals stay for the lightbox / PDFs). The grid `<img>` requests the
// thumb variant by convention; see src/lib/supabase.js thumbUrl().
//
//   node scripts/thumbs.mjs            # process everything (skips existing)
//   node scripts/thumbs.mjs --force    # re-encode even if a thumb already exists
//   node scripts/thumbs.mjs --dry      # report only, no uploads
//
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ifznjgkfzaoiungnyoqd.supabase.co'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlmem5qZ2tmemFvaXVuZ255b3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjIwNzAsImV4cCI6MjA5NzQzODA3MH0.9YiXEMF-py3IKSfaaG8I1kzzH2FgZ29IoXGwDGnO3lY'
const ADMIN_EMAIL = 'fxckinghellkid10@gmail.com'
const ADMIN_PASS = 'Qazxplmn_1234'
const BUCKET = 'media'
const DRY = process.argv.includes('--dry')
const FORCE = process.argv.includes('--force')
const MAX_W = 640
const QUALITY = 72

const supabase = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } })
const publicUrl = (p) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${p}`
const thumbPath = (p) => p.replace(/\.(webp|jpe?g|png)$/i, '.thumb.webp')
const isStorage = (p) => p && !/^https?:\/\//.test(p) && !/\.thumb\.webp$/i.test(p)

async function exists(path) {
  const res = await fetch(publicUrl(path), { method: 'HEAD' })
  return res.ok
}
async function download(path) {
  const res = await fetch(publicUrl(path))
  if (!res.ok) throw new Error(`download ${path} → ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}
async function upload(path, buf) {
  if (DRY) return
  const { error } = await supabase.storage.from(BUCKET).upload(path, buf, { contentType: 'image/webp', upsert: true })
  if (error) throw error
}

const makeThumb = (buf) =>
  sharp(buf)
    .resize({ width: MAX_W, withoutEnlargement: true })
    .flatten({ background: '#000000' }) // keep tiles black like the rest of the site
    .webp({ quality: QUALITY })
    .toBuffer()

async function main() {
  const { error: authErr } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASS })
  if (authErr) throw new Error('admin sign-in failed: ' + authErr.message)

  const { data: works, error } = await supabase.from('works').select('*').order('category')
  if (error) throw error

  // every storage image that could end up as a grid tile (thumb_url or any
  // gallery member that admin might later promote to cover)
  const paths = new Set()
  for (const w of works) {
    for (const p of [w.thumb_url, ...(w.images || [])]) if (isStorage(p)) paths.add(p)
  }
  const list = [...paths]
  console.log(`${works.length} works → ${list.length} source images${DRY ? ' (dry run)' : ''}`)

  let made = 0, skipped = 0, failed = 0, bytes = 0
  for (const p of list) {
    const tp = thumbPath(p)
    try {
      if (!FORCE && (await exists(tp))) { skipped++; continue }
      const src = await download(p)
      const thumb = await makeThumb(src)
      await upload(tp, thumb)
      made++; bytes += thumb.length
      if (made % 10 === 0) console.log(`  …${made} thumbs`)
    } catch (e) {
      failed++
      console.warn(`  ! ${p}: ${e.message}`)
    }
  }
  console.log(`done: ${made} made, ${skipped} skipped, ${failed} failed` +
    (made ? `, ~${(bytes / made / 1024).toFixed(0)} KB avg thumb` : ''))
}

main().catch((e) => { console.error(e); process.exit(1) })
