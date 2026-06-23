import { useState } from 'react'
import { publicUrl } from '../lib/supabase.js'

// A single masonry tile. The image keeps its natural aspect ratio (never
// cropped). Each tile fades in once its own image has decoded, so the grid
// settles smoothly instead of reflowing as images pop in. Video works
// (STAGE VISUAL) show a muted, looping autoplay preview with a play badge.
export default function WorkTile({ work, index = 0, onOpen }) {
  const isVideo = work.kind === 'video' && work.video_url
  const isProject = work.kind === 'project'
  const thumb = publicUrl(work.thumb_url)
  const [ready, setReady] = useState(false)

  return (
    <div className={`tile ${ready ? 'is-ready' : ''}`} style={{ '--d': `${Math.min(index, 12) * 0.04}s` }}
         onClick={() => onOpen(work)} role="button" tabIndex={0}
         onKeyDown={(e) => e.key === 'Enter' && onOpen(work)}>
      {isVideo ? (
        <>
          <video src={publicUrl(work.video_url)} poster={thumb || undefined}
                 muted loop autoPlay playsInline preload="metadata"
                 onLoadedData={() => setReady(true)} />
          <span className="tile__play" aria-hidden>▶</span>
        </>
      ) : (
        <img src={thumb} alt={work.title || ''} loading="lazy"
             onLoad={() => setReady(true)} onError={() => setReady(true)} />
      )}
      {isProject && work.pdf_url && <span className="tile__pdf">PDF</span>}
      {work.title && <div className="tile__cap">{work.title}</div>}
    </div>
  )
}
