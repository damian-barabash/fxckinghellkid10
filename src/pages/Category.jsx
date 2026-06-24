import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Footer from '../components/Footer.jsx'
import WorkTile from '../components/WorkTile.jsx'
import Masonry from '../components/Masonry.jsx'
import Lightbox from '../components/Lightbox.jsx'
import VideoPlayer from '../components/VideoPlayer.jsx'
import { supabase, publicUrl } from '../lib/supabase.js'
import { markReady, preloadImages } from '../lib/ready.js'
import { bySlug } from '../lib/categories.js'
import { useI18n } from '../lib/i18n.jsx'

// varied placeholder heights so the skeleton looks like a real masonry grid
const SKEL = [320, 240, 400, 280, 360, 220, 300, 380, 260]

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
      const url = publicUrl(w.pdf_url || w.thumb_url)
      if (url) window.open(url, '_blank', 'noopener')
    } else {
      const imgs = (w.images?.length ? w.images : [w.thumb_url]).map(publicUrl)
      setBox({ images: imgs, caption: w.title || '' })
    }
  }

  // fetch + preload thumbnails before revealing the grid — old works are cleared
  // immediately and a skeleton shows until the new images are decoded, so there
  // is no "stale works / half-loaded reflow" jump.
  useEffect(() => {
    if (!cat) return
    let active = true
    setLoaded(false)
    setWorks([])
    ;(async () => {
      const { data } = await supabase.from('works').select('*').eq('category', cat.key)
        .order('sort', { ascending: true }).order('created_at', { ascending: false })
      if (!active) return
      const list = data || []
      const thumbs = list.map((x) => publicUrl(x.thumb_url))
      markReady(thumbs.slice(0, 9))          // initial preloader (first load only)
      await preloadImages(thumbs.slice(0, 12)) // warm the cache so heights are known
      if (!active) return
      setWorks(list)
      setLoaded(true)
    })()
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

        {!loaded ? (
          <Masonry items={SKEL} render={(h, i) => (
            <div className="skel fade-up" style={{ height: h, '--d': `${i * 0.03}s` }} key={i} />
          )} />
        ) : works.length > 0 ? (
          <Masonry items={works} render={(w, i) => (
            <WorkTile key={w.id} work={w} index={i} onOpen={open} />
          )} />
        ) : (
          <div className="cat-empty fade-up">{t('cat.empty')}</div>
        )}

        <Footer social={social} />
      </main>

      {box && <Lightbox images={box.images} caption={box.caption} onClose={() => setBox(null)} />}
      {video && <VideoPlayer src={video.src} poster={video.poster} caption={video.caption} onClose={() => setVideo(null)} />}
    </>
  )
}
