// Background warm-up of every category's grid thumbnails.
//
// First-load complaint: the first time you opened a tab on mobile the photos
// crawled in, but every tab after that was instant (browser cache). To make the
// *first* visit to each tab feel pre-loaded too, once the app is idle we fetch
// the whole works list a single time and quietly pull every small ".thumb.webp"
// into the browser cache at low priority. By the time a tab is tapped its images
// are already cached. Thumbs are tiny (~40 KB), so warming all six categories is
// only ~2 MB total — cheap, and it never blocks the visible page.

import { supabase, thumbUrl } from './supabase.js'

let started = false

function idle(cb) {
  if (typeof window === 'undefined') return
  if ('requestIdleCallback' in window) window.requestIdleCallback(cb, { timeout: 3000 })
  else setTimeout(cb, 1200)
}

// Load a list of URLs a few at a time so we never saturate the connection and
// starve whatever the user is actually looking at.
async function warm(urls, concurrency = 4) {
  let i = 0
  const next = () =>
    new Promise((res) => {
      const u = urls[i++]
      if (!u) return res()
      const img = new Image()
      img.fetchPriority = 'low'
      img.decoding = 'async'
      img.onload = img.onerror = () => res()
      img.src = u
    })
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < urls.length) await next()
  })
  await Promise.all(workers)
}

export function prefetchAllThumbs() {
  if (started) return
  started = true
  idle(async () => {
    try {
      const { data } = await supabase
        .from('works')
        .select('thumb_url, sort, created_at')
        .order('sort', { ascending: true })
        .order('created_at', { ascending: false })
      const urls = (data || []).map((w) => thumbUrl(w.thumb_url)).filter(Boolean)
      await warm([...new Set(urls)])
    } catch {
      /* best-effort cache warming — never surface errors */
    }
  })
}
