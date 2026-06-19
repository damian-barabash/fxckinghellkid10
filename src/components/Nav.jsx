import { useState, useEffect } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { CATEGORIES } from '../lib/categories.js'
import { useI18n } from '../lib/i18n.jsx'

const LOGO = import.meta.env.BASE_URL + 'logo.png'

export default function Nav() {
  const { lang, toggle, t } = useI18n()
  const [open, setOpen] = useState(false)
  const loc = useLocation()

  useEffect(() => { setOpen(false) }, [loc.pathname])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      <header className="nav">
        <Link to="/" className="nav__logo" aria-label="home">
          <img src={LOGO} alt="fxckinghellkid10" />
        </Link>

        <nav className="nav__links">
          {CATEGORIES.map((c) => (
            <NavLink key={c.key} to={`/c/${c.slug}`} className="nav__link">{c[lang]}</NavLink>
          ))}
          <NavLink to="/contact" className="nav__link">{t('nav.contact')}</NavLink>
          <button className="nav__lang" onClick={toggle}>{lang === 'en' ? 'RU' : 'EN'}</button>
        </nav>

        <button
          className={`nav__burger ${open ? 'open' : ''}`}
          onClick={() => setOpen((o) => !o)}
          aria-label="menu"
        >
          <span /><span /><span />
        </button>
      </header>

      <div className={`drawer ${open ? 'open' : ''}`}>
        {CATEGORIES.map((c) => (
          <Link key={c.key} to={`/c/${c.slug}`}>{c[lang]}</Link>
        ))}
        <Link to="/contact">{t('nav.contact')}</Link>
        <button className="nav__lang" style={{ marginTop: 24, alignSelf: 'flex-start' }} onClick={toggle}>
          {lang === 'en' ? 'РУССКИЙ' : 'ENGLISH'}
        </button>
      </div>
    </>
  )
}
