import { useEffect, useRef, useState } from 'react'

// Fullscreen image viewer. Accepts an array of image URLs and acts as a slider
// when there is more than one. Title sits on a solid black plate at the bottom.
export default function Lightbox({ images, start = 0, caption, onClose }) {
  const list = (images || []).filter(Boolean)
  const [i, setI] = useState(start)
  const touch = useRef(null)
  const many = list.length > 1

  const go = (d) => setI((p) => (p + d + list.length) % list.length)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (many && e.key === 'ArrowRight') go(1)
      else if (many && e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, list.length])

  if (!list.length) return null

  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lightbox__close" aria-label="close" onClick={onClose}>×</button>

      {many && (
        <button className="lightbox__nav prev" aria-label="previous"
                onClick={(e) => { e.stopPropagation(); go(-1) }}>‹</button>
      )}

      <img
        key={i}
        src={list[i]}
        alt={caption || ''}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { touch.current = e.touches[0].clientX }}
        onTouchEnd={(e) => {
          if (touch.current == null || !many) return
          const dx = e.changedTouches[0].clientX - touch.current
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
          touch.current = null
        }}
      />

      {many && (
        <button className="lightbox__nav next" aria-label="next"
                onClick={(e) => { e.stopPropagation(); go(1) }}>›</button>
      )}

      <div className="lightbox__bar" onClick={(e) => e.stopPropagation()}>
        {caption && <span className="lightbox__cap">{caption}</span>}
        {many && <span className="lightbox__count">{i + 1} / {list.length}</span>}
      </div>
    </div>
  )
}
