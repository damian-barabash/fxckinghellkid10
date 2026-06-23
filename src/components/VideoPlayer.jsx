import { useEffect, useRef } from 'react'

// Fullscreen video player opened from a STAGE VISUAL tile. Autoplays with sound
// (allowed — it opens from a click) and shows the title on a black bar.
export default function VideoPlayer({ src, poster, caption, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    const v = ref.current
    if (v) { v.muted = false; v.play?.().catch(() => { v.muted = true; v.play?.().catch(() => {}) }) }
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  if (!src) return null
  return (
    <div className="vplayer" onClick={onClose}>
      <button className="lightbox__close" aria-label="close" onClick={onClose}>×</button>
      <video
        ref={ref}
        src={src}
        poster={poster || undefined}
        controls
        autoPlay
        playsInline
        loop
        onClick={(e) => e.stopPropagation()}
      />
      {caption && (
        <div className="lightbox__bar" onClick={(e) => e.stopPropagation()}>
          <span className="lightbox__cap">{caption}</span>
        </div>
      )}
    </div>
  )
}
