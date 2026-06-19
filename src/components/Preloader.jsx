import { useEffect, useState } from 'react'

const LOGO = import.meta.env.BASE_URL + 'logo.png'

// Minimal black preloader: logo + a thin indeterminate green bar. Hides on the
// 'app-ready' event (fired once a page's first images are loaded) or a fallback.
export default function Preloader() {
  const [hide, setHide] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      setHide(true)
      setTimeout(() => setGone(true), 650) // after fade-out
    }
    window.addEventListener('app-ready', finish)
    const fallback = setTimeout(finish, 4000) // safety net
    return () => { window.removeEventListener('app-ready', finish); clearTimeout(fallback) }
  }, [])

  if (gone) return null
  return (
    <div className={`preloader ${hide ? 'preloader--hide' : ''}`}>
      <img className="preloader__logo" src={LOGO} alt="fxckinghellkid10" />
      <span className="preloader__track"><span className="preloader__bar" /></span>
    </div>
  )
}
