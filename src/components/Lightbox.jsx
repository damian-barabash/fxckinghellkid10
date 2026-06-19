import { useEffect } from 'react'

export default function Lightbox({ src, caption, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  if (!src) return null
  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lightbox__close" aria-label="close" onClick={onClose}>×</button>
      <img src={src} alt={caption || ''} onClick={(e) => e.stopPropagation()} />
      {caption && <div className="lightbox__cap">{caption}</div>}
    </div>
  )
}
