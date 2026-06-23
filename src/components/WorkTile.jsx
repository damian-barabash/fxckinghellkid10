import { publicUrl } from '../lib/supabase.js'

// A single masonry tile. The image keeps its natural aspect ratio (never
// cropped). Video works (STAGE VISUAL) show a muted, looping autoplay preview
// with a play badge. The parent decides what opening does via onOpen(work).
export default function WorkTile({ work, onOpen }) {
  const isVideo = work.kind === 'video' && work.video_url
  const isProject = work.kind === 'project'
  const thumb = publicUrl(work.thumb_url)

  return (
    <div className="tile" onClick={() => onOpen(work)} role="button" tabIndex={0}
         onKeyDown={(e) => e.key === 'Enter' && onOpen(work)}>
      {isVideo ? (
        <>
          <video src={publicUrl(work.video_url)} poster={thumb || undefined}
                 muted loop autoPlay playsInline preload="metadata" />
          <span className="tile__play" aria-hidden>▶</span>
        </>
      ) : (
        <img src={thumb} alt={work.title || ''} loading="lazy" />
      )}
      {isProject && work.pdf_url && <span className="tile__pdf">PDF</span>}
      {work.title && <div className="tile__cap">{work.title}</div>}
    </div>
  )
}
