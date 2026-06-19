import { useEffect } from 'react'
import { publicUrl } from '../lib/supabase.js'

// In-site viewer for project works: shows every page of the work on a
// #323232 backdrop, with a link to download the generated PDF.
export default function ProjectViewer({ work, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  if (!work) return null
  const images = work.images?.length ? work.images : [work.thumb_url]

  return (
    <div className="pviewer">
      <div className="pviewer__bar">
        <div className="pviewer__title">{work.title || ''}</div>
        <div className="pviewer__actions">
          {work.pdf_url && (
            <a className="pviewer__dl" href={publicUrl(work.pdf_url)} target="_blank" rel="noreferrer">PDF ↓</a>
          )}
          <button className="pviewer__close" aria-label="close" onClick={onClose}>×</button>
        </div>
      </div>
      <div className="pviewer__scroll">
        {images.map((p, i) => (
          <img key={i} src={publicUrl(p)} alt={work.title ? `${work.title} ${i + 1}` : ''} loading="lazy" />
        ))}
      </div>
    </div>
  )
}
