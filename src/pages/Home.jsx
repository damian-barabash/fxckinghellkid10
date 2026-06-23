import { useEffect, useState } from 'react'
import Footer from '../components/Footer.jsx'
import { supabase } from '../lib/supabase.js'
import { markReady } from '../lib/ready.js'
import { useI18n } from '../lib/i18n.jsx'

export default function Home() {
  const { t } = useI18n()
  const [social, setSocial] = useState(null)
  const [workWith, setWorkWith] = useState([])

  useEffect(() => {
    markReady() // home has no heavy imagery — reveal immediately
    supabase.from('site_settings').select('*').eq('id', 1).single().then(({ data }) => {
      if (!data) return
      setSocial(data.social_links || {})
      setWorkWith(data.work_with || [])
    })
  }, [])

  return (
    <main className="page">
      <section className="hero">
        <img className="hero__logo fade-up" src={import.meta.env.BASE_URL + 'logo.png'} alt="fxckinghellkid10" />
      </section>

      <section className="workwith">
        <div className="workwith__label">{t('home.workWith')}</div>
        <div className="workwith__list">
          {workWith.map((name, i) => (
            <span key={i} style={{ '--d': `${i * 0.03}s` }}>{name}</span>
          ))}
        </div>
      </section>

      <Footer social={social} />
    </main>
  )
}
