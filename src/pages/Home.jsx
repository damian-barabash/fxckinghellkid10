import { useEffect, useState } from 'react'
import Footer from '../components/Footer.jsx'
import { supabase } from '../lib/supabase.js'
import { markReady } from '../lib/ready.js'
import { useI18n } from '../lib/i18n.jsx'

export default function Home() {
  const { t } = useI18n()
  const [social, setSocial] = useState(null)
  const [workWith, setWorkWith] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    markReady() // home has no heavy imagery — reveal immediately
    supabase.from('site_settings').select('*').eq('id', 1).single().then(({ data }) => {
      if (data) {
        setSocial(data.social_links || {})
        setWorkWith(data.work_with || [])
      }
      setLoaded(true)
    })
  }, [])

  return (
    <main className="page">
      {/* WORK WITH fades in only once the data has arrived */}
      {loaded && workWith.length > 0 && (
        <section className="workwith fade-up">
          <div className="workwith__label">{t('home.workWith')}</div>
          <div className="workwith__list">
            {workWith.map((name, i) => (
              <span key={i} className="fade-up" style={{ '--d': `${0.1 + i * 0.025}s` }}>{name}</span>
            ))}
          </div>
        </section>
      )}

      <Footer social={social} />
    </main>
  )
}
