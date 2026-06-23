import { useI18n } from '../lib/i18n.jsx'

const ORDER = ['instagram', 'telegram', 'pinterest', 'behance', 'email']

// Minimal line icons (currentColor) for each social network.
const ICONS = {
  instagram: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  telegram: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <path d="M21.5 4.3 2.9 11.4c-1 .4-1 1.2.1 1.5l4.6 1.4 1.8 5.6c.2.6.5.7 1 .3l2.6-2.3 4.7 3.5c.6.4 1.1.2 1.3-.6l3-14c.2-1-.4-1.5-1-1.2z" />
      <path d="m8 13.5 9-5.7-6.3 6.6" />
    </svg>
  ),
  pinterest: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 20c-.4-1.3-.2-2.6.1-3.8l1.3-5.3c-.3-.6-.4-1.4-.2-2.1.5-1.9 3-1.6 3 .6 0 1.4-.9 2.5-.9 3.8 0 2.3 3.2 1.9 4.1-1.2.8-2.7-.6-5.4-3.9-5.4-2.7 0-4.6 1.9-4.6 4.2 0 .9.3 1.6.7 2.1" />
    </svg>
  ),
  behance: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 7h4.2c1.7 0 2.7.8 2.7 2.2 0 1-.6 1.7-1.5 2 1.1.2 1.9 1 1.9 2.3 0 1.6-1.2 2.5-3 2.5H2.5z" />
      <path d="M3.6 11.4h3.1M14.5 8.2h4.6" />
      <path d="M21 13.4c0-2-1.3-3.5-3.2-3.5s-3.3 1.5-3.3 3.6 1.4 3.6 3.4 3.6c1.6 0 2.7-.8 3.1-2M14.7 13.4h6.3" />
    </svg>
  ),
  email: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  ),
}

export default function Footer({ social }) {
  const { t } = useI18n()
  if (!social) return null
  return (
    <footer className="footer">
      <div className="footer__social">
        {ORDER.map((k) => {
          const val = social[k]
          if (!val) return null
          const href = k === 'email' ? `mailto:${val}` : val
          return (
            <a key={k} className="soc" href={href}
               target={k === 'email' ? undefined : '_blank'} rel="noreferrer"
               aria-label={t('social.' + k)}>
              <span className="soc__icon">{ICONS[k]}</span>
              <span className="soc__label">{t('social.' + k)}</span>
            </a>
          )
        })}
      </div>
      <div className="footer__copy">© {new Date().getFullYear()} FXCKINGHELLKID10</div>
    </footer>
  )
}
