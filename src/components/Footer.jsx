import { useI18n } from '../lib/i18n.jsx'

const ORDER = ['instagram', 'telegram', 'pinterest', 'behance', 'email']

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
            <a key={k} href={href} target={k === 'email' ? undefined : '_blank'} rel="noreferrer">
              {t('social.' + k)}
            </a>
          )
        })}
      </div>
      <div className="footer__copy">© {new Date().getFullYear()} FXCKINGHELLKID10</div>
    </footer>
  )
}
