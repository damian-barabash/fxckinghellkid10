import { useState } from 'react'
import { publicUrl, thumbUrl } from '../lib/supabase.js'

// A single masonry tile. The image keeps its natural aspect ratio (never
// cropped). Each tile fades in once its own image has decoded, so the grid
// settles smoothly instead of reflowing as images pop in. Video works
// (STAGE VISUAL) show a muted, looping autoplay preview with a play badge.
//
// The grid renders the lightweight ".thumb.webp" variant (~40 KB) rather than
// the full 1–2 MB image — that's the bulk of the first-load speedup on mobile.
// If a thumb is missing (e.g. an old work not yet reprocessed) the <img> errors
// and we swap to the full image so the tile never stays blank.
export default function WorkTile({ work, index = 0, onOpen }) {
  const isVideo = work.kind === 'video' && work.video_url
  const isProject = work.kind === 'project'
  const full = publicUrl(work.thumb_url)
  const [src, setSrc] = useState(thumbUrl(work.thumb_url) || full)
  const [ready, setReady] = useState(false)

  const onImgError = () => {
    if (src !== full && full) setSrc(full) // thumb missing → fall back to full
    else setReady(true)
  }

  return (
    <div className={`tile ${ready ? 'is-ready' : ''}`} style={{ '--d': `${Math.min(index, 12) * 0.04}s` }}
         onClick={() => onOpen(work)} role="button" tabIndex={0}
         onKeyDown={(e) => e.key === 'Enter' && onOpen(work)}>
      {isVideo ? (
        <video src={publicUrl(work.video_url)} poster={full || undefined}
               muted loop autoPlay playsInline preload="metadata"
               onLoadedData={() => setReady(true)} />
      ) : (
        <img src={src} alt={work.title || ''} loading="lazy" decoding="async"
             onLoad={() => setReady(true)} onError={onImgError} />
      )}
      {isProject && work.pdf_url && <span className="tile__pdf">PDF</span>}
      {work.title && <div className="tile__cap">{work.title}</div>}
    </div>
  )
}
