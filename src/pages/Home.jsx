import { useEffect, useState } from 'react'
import Footer from '../components/Footer.jsx'
import WorkTile from '../components/WorkTile.jsx'
import Lightbox from '../components/Lightbox.jsx'
import ProjectViewer from '../components/ProjectViewer.jsx'
import { supabase, publicUrl } from '../lib/supabase.js'
import { markReady } from '../lib/ready.js'
import { useI18n } from '../lib/i18n.jsx'

// Fisher–Yates shuffle so the home grid is reordered on every load.
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function Home() {
  const { t } = useI18n()
  const [works, setWorks] = useState([])
  const [social, setSocial] = useState(null)
  const [workWith, setWorkWith] = useState([])
  const [box, setBox] = useState(null)
  const [proj, setProj] = useState(null)
  const [loaded, setLoaded] = useState(false)

  const open = (w) => {
    if (w.kind === 'cover') setBox({ src: publicUrl(w.thumb_url), caption: w.title || '' })
    else setProj(w)
  }

  useEffect(() => {
    ;(async () => {
      const [{ data: w }, { data: s }] = await Promise.all([
        supabase.from('works').select('*'),
        supabase.from('site_settings').select('*').eq('id', 1).single(),
      ])
      const shuffled = shuffle(w || [])
      setWorks(shuffled)
      if (s) {
        setSocial(s.social_links || {})
        setWorkWith(s.work_with || [])
      }
      setLoaded(true)
      // wait for the first screenful of thumbnails before hiding the preloader
      markReady(shuffled.slice(0, 9).map((x) => publicUrl(x.thumb_url)))
    })()
  }, [])

  return (
    <>
      <main className="page">
        <section className="hero">
          <img className="hero__logo" src={import.meta.env.BASE_URL + 'logo.png'} alt="fxckinghellkid10" />
          <div className="sub">{t('home.selected')}</div>
        </section>

        <div className="grid">
          {works.map((w) => (
            <WorkTile key={w.id} work={w} onOpen={open} />
          ))}
        </div>
        {loaded && works.length === 0 && <div className="center">{t('cat.empty')}</div>}

        {workWith.length > 0 && (
          <section className="workwith">
            <div className="workwith__label">{t('home.workWith')}</div>
            <div className="workwith__list">
              {workWith.map((name, i) => (
                <span key={i}>{name}</span>
              ))}
            </div>
          </section>
        )}

        <Footer social={social} />
      </main>
      {box && <Lightbox src={box.src} caption={box.caption} onClose={() => setBox(null)} />}
      {proj && <ProjectViewer work={proj} onClose={() => setProj(null)} />}
    </>
  )
}
