import { publicUrl } from '../lib/supabase.js'

// A single grid tile. Cover works open a fullscreen lightbox; project works
// open the in-site project viewer (PDF pages on a #323232 backdrop).
// The parent decides what to do via onOpen(work).
export default function WorkTile({ work, onOpen }) {
  const thumb = publicUrl(work.thumb_url)
  const isCover = work.kind === 'cover'

  return (
    <div className="tile" onClick={() => onOpen(work)} role="button" tabIndex={0}
         onKeyDown={(e) => e.key === 'Enter' && onOpen(work)}>
      <img src={thumb} alt={work.title || ''} loading="lazy" />
      {!isCover && work.pdf_url && <span className="tile__pdf">PDF</span>}
      {work.title && <div className="tile__cap">{work.title}</div>}
    </div>
  )
}
