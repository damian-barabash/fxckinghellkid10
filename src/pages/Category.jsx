import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import Footer from '../components/Footer.jsx'
import WorkTile from '../components/WorkTile.jsx'
import Lightbox from '../components/Lightbox.jsx'
import ProjectViewer from '../components/ProjectViewer.jsx'
import { supabase, publicUrl } from '../lib/supabase.js'
import { bySlug } from '../lib/categories.js'
import { useI18n } from '../lib/i18n.jsx'
import { useTypewriter } from '../lib/useTypewriter.js'

const EXIT_MS = 480

export default function Category() {
  const { slug } = useParams()
  const { lang, t } = useI18n()
  const cat = bySlug(slug)

  // heading typewriter — retypes whenever the category or language changes
  const { text: heading, typing } = useTypewriter(cat ? cat[lang] : '')

  const [shown, setShown] = useState([])          // works currently rendered
  const [gridState, setGridState] = useState('out') // 'in' | 'out'
  const [enterId, setEnterId] = useState(0)        // remount key for enter anim
  const [lineIn, setLineIn] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const worksRef = useRef([])
  const fetchedSlug = useRef(null)
  const [boxState, setBox] = useState(null)
  const [projState, setProj] = useState(null)

  const open = (w) => {
    if (w.kind === 'cover') setBox({ src: publicUrl(w.thumb_url), caption: w.title || '' })
    else setProj(w)
  }

  // fetch works for the active slug
  useEffect(() => {
    if (!cat) return
    setLoaded(false)
    let active = true
    supabase.from('works').select('*').eq('category', cat.key)
      .order('sort', { ascending: true }).order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!active) return
        worksRef.current = data || []
        fetchedSlug.current = slug
        setLoaded(true)
        // if the enter swap already happened, fill in late-arriving data
        setGridState((g) => {
          if (g === 'in') setShown(data || [])
          return g
        })
      })
    return () => { active = false }
  }, [slug])

  // orchestrate the transition on slug / language change
  useEffect(() => {
    if (!cat) return
    setGridState('out')   // works slide down + fade
    setLineIn(false)      // retract underline
    const to = setTimeout(() => {
      setShown(fetchedSlug.current === slug ? worksRef.current : [])
      setEnterId((x) => x + 1)               // remount grid (starts hidden)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setGridState('in')                   // works rise back in
        setLineIn(true)                      // underline draws left → right
      }))
    }, EXIT_MS)
    return () => clearTimeout(to)
  }, [slug, lang])

  // social links for footer
  const [social, setSocial] = useState(null)
  useEffect(() => {
    supabase.from('site_settings').select('social_links').eq('id', 1).single()
      .then(({ data }) => data && setSocial(data.social_links || {}))
  }, [])

  if (!cat) return <div className="center">404</div>

  const stateClass = gridState === 'out' ? 'out' : 'in'
  const showEmpty = loaded && shown.length === 0 && gridState === 'in'

  return (
    <>
      <main className="page">
        <header className="cat-head">
          <div className="cat-title">
            <h1>
              {heading}
              {typing && <span className="caret" />}
            </h1>
            <span className={`cat-line ${lineIn ? 'in' : ''}`} />
          </div>
        </header>

        {shown.length > 0 ? (
          <div className={`grid cat-grid ${stateClass}`} key={enterId}>
            {shown.map((w) => (
              <WorkTile key={w.id} work={w} onOpen={open} />
            ))}
          </div>
        ) : (
          showEmpty && (
            <div className={`cat-empty cat-grid ${stateClass}`} key={'e' + enterId}>{t('cat.empty')}</div>
          )
        )}

        <Footer social={social} />
      </main>
      {boxState && <Lightbox src={boxState.src} caption={boxState.caption} onClose={() => setBox(null)} />}
      {projState && <ProjectViewer work={projState} onClose={() => setProj(null)} />}
    </>
  )
}
