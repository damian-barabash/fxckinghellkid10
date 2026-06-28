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
