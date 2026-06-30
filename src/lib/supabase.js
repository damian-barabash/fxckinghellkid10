import { createClient } from '@supabase/supabase-js'

// Public project credentials. The anon key is safe to ship in the client;
// access is guarded by Row Level Security on the database.
export const SUPABASE_URL = 'https://ifznjgkfzaoiungnyoqd.supabase.co'
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlmem5qZ2tmemFvaXVuZ255b3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjIwNzAsImV4cCI6MjA5NzQzODA3MH0.9YiXEMF-py3IKSfaaG8I1kzzH2FgZ29IoXGwDGnO3lY'

export const MEDIA_BUCKET = 'media'

// Video transcode worker (runs on the Mac Studio, exposed via Tailscale Funnel).
// Videos upload straight to Cloudflare R2 and are transcoded to WebM there,
// bypassing Supabase Storage's 50 MB free-tier cap. See src/lib/media.js.
export const VIDEO_WORKER_URL = 'https://barabash-ai.tailcd3444.ts.net/vid'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'fhk10-auth',
  },
})

export function publicUrl(path) {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl
}

// Small grid-tile variant of a stored image. The full images are 1–2 MB each
// (used in the lightbox / PDF), which made the masonry grids painfully slow to
// load over mobile the first time. A ~640px ".thumb.webp" sibling is generated
// next to every uploaded image (see media.js toWebpPair + scripts/thumbs.mjs),
// shrinking each tile to ~30–60 KB. Absolute URLs (R2 video posters) are already
// small and pass through unchanged; if a thumb is somehow missing the tile falls
// back to the full image (WorkTile onError).
export function thumbUrl(path) {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  if (/\.thumb\.webp$/i.test(path)) return publicUrl(path)
  return publicUrl(path.replace(/\.(webp|jpe?g|png)$/i, '.thumb.webp'))
}
