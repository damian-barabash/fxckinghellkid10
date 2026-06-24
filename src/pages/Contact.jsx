import { useEffect, useState } from 'react'
import Footer from '../components/Footer.jsx'
import { supabase, MEDIA_BUCKET } from '../lib/supabase.js'
import { markReady } from '../lib/ready.js'
import { toWebp, slugify } from '../lib/media.js'
import { useI18n } from '../lib/i18n.jsx'

const MAX_PHOTOS = 3

export default function Contact() {
  const { t } = useI18n()
  const [form, setForm] = useState({ first_name: '', instagram: '', email: '', message: '' })
  const [photos, setPhotos] = useState([]) // File[]
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [social, setSocial] = useState(null)

  useEffect(() => {
    markReady()
    supabase.from('site_settings').select('social_links').eq('id', 1).single()
      .then(({ data }) => data && setSocial(data.social_links || {}))
  }, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const addPhotos = (e) => {
    const incoming = [...e.target.files]
    setPhotos((p) => [...p, ...incoming].slice(0, MAX_PHOTOS))
    e.target.value = ''
  }
  const removePhoto = (i) => setPhotos((p) => p.filter((_, idx) => idx !== i))

  const submit = async (e) => {
    e.preventDefault()
    setStatus('sending')
    try {
      const paths = []
      if (photos.length) {
        const stamp = Date.now().toString(36)
        const base = `messages/${stamp}-${slugify(form.first_name) || 'msg'}`
        let i = 0
        for (const file of photos) {
          i++
          const blob = await toWebp(file, { maxEdge: 1800 })
          const path = `${base}-${i}.webp`
          const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, { contentType: 'image/webp', upsert: true })
          if (error) throw error
          paths.push(path)
        }
      }
      const { error } = await supabase.from('messages').insert({
        first_name: form.first_name.trim(),
        instagram: form.instagram.trim() || null,
        email: form.email.trim(),
        message: form.message.trim(),
        photos: paths,
      })
      if (error) throw error
      setStatus('sent')
      setForm({ first_name: '', instagram: '', email: '', message: '' })
      setPhotos([])
    } catch (err) {
      setStatus('error')
    }
  }

  return (
    <main className="page">
      <header className="cat-head">
        <h1 className="fade-up">{t('contact.title')}</h1>
        <span className="cat-line fade-up" />
      </header>
      <section className="contact">
        <p className="sub fade-up">{t('contact.sub')}</p>

        <form onSubmit={submit} className="fade-up">
          <div className="row2">
            <div className="field">
              <label>{t('contact.firstName')} <span className="req">{t('contact.required')}</span></label>
              <input required value={form.first_name} onChange={set('first_name')} />
            </div>
            <div className="field">
              <label>{t('contact.instagram')}</label>
              <input value={form.instagram} onChange={set('instagram')} placeholder="@username" />
            </div>
          </div>
          <div className="field">
            <label>{t('contact.email')} <span className="req">{t('contact.required')}</span></label>
            <input type="email" required value={form.email} onChange={set('email')} />
          </div>
          <div className="field">
            <label>{t('contact.message')} <span className="req">{t('contact.required')}</span></label>
            <textarea required value={form.message} onChange={set('message')} />
          </div>

          <div className="field">
            <label>{t('contact.photos')} <span className="req">{t('contact.photosHint')}</span></label>
            <div className="ph-row">
              {photos.map((f, i) => (
                <div className="ph-thumb" key={i}>
                  <img src={URL.createObjectURL(f)} alt="" />
                  <button type="button" className="ph-del" onClick={() => removePhoto(i)} aria-label="remove">×</button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <label className="ph-add">
                  +
                  <input type="file" accept="image/*" multiple hidden onChange={addPhotos} />
                </label>
              )}
            </div>
          </div>

          <button className="btn" type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? t('contact.sending') : t('contact.send')}
          </button>
          {status === 'sent' && <div className="form-note ok">{t('contact.sent')}</div>}
          {status === 'error' && <div className="form-note err">{t('contact.error')}</div>}
        </form>
      </section>
      <Footer social={social} />
    </main>
  )
}
