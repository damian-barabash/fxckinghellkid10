import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Footer from '../components/Footer.jsx'
import WorkTile from '../components/WorkTile.jsx'
import Lightbox from '../components/Lightbox.jsx'
import VideoPlayer from '../components/VideoPlayer.jsx'
import { supabase, publicUrl } from '../lib/supabase.js'
import { markReady } from '../lib/ready.js'
import { bySlug } from '../lib/categories.js'
import { useI18n } from '../lib/i18n.jsx'

export default function Category() {
  const { slug } = useParams()
  const { lang, t } = useI18n()
  const cat = bySlug(slug)

  const [works, setWorks] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [box, setBox] = useState(null)     // { images: [url], caption }
  const [video, setVideo] = useState(null) // { src, poster, caption }
  const [social, setSocial] = useState(null)

  const open = (w) => {
    if (w.kind === 'video' && w.video_url) {
      setVideo({ src: publicUrl(w.video_url), poster: publicUrl(w.thumb_url), caption: w.title || '' })
    } else if (w.kind === 'project') {
      // open the real PDF in a new tab (fallback to first image)
      const url = publicUrl(w.pdf_url || w.thumb_url)
      if (url) window.open(url, '_blank', 'noopener')
    } else {
      const imgs = (w.images?.length ? w.images : [w.thumb_url]).map(publicUrl)
      setBox({ images: imgs, caption: w.title || '' })
    }
  }

  useEffect(() => {
    if (!cat) return
    setLoaded(false)
    let active = true
    supabase.from('works').select('*').eq('category', cat.key)
      .order('sort', { ascending: true }).order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!active) return
        setWorks(data || [])
        setLoaded(true)
        markReady((data || []).slice(0, 9).map((x) => publicUrl(x.thumb_url)))
      })
    return () => { active = false }
  }, [slug])

  useEffect(() => {
    supabase.from('site_settings').select('social_links').eq('id', 1).single()
      .then(({ data }) => data && setSocial(data.social_links || {}))
  }, [])

  if (!cat) return <div className="center">404</div>

  return (
    <>
      <main className="page" key={slug + lang}>
        <header className="cat-head">
          <h1 className="fade-up">{cat[lang]}</h1>
          <span className="cat-line fade-up" />
        </header>

        {works.length > 0 ? (
          <div className="grid fade-up">
            {works.map((w) => (
              <WorkTile key={w.id} work={w} onOpen={open} />
            ))}
          </div>
        ) : (
          loaded && <div className="cat-empty fade-up">{t('cat.empty')}</div>
        )}

        <Footer social={social} />
      </main>

      {box && <Lightbox images={box.images} caption={box.caption} onClose={() => setBox(null)} />}
      {video && <VideoPlayer src={video.src} poster={video.poster} caption={video.caption} onClose={() => setVideo(null)} />}
    </>
  )
}
