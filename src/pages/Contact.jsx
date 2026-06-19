import { useEffect, useState } from 'react'
import Footer from '../components/Footer.jsx'
import { supabase } from '../lib/supabase.js'
import { markReady } from '../lib/ready.js'
import { useI18n } from '../lib/i18n.jsx'

export default function Contact() {
  const { t } = useI18n()
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', message: '' })
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [social, setSocial] = useState(null)

  useEffect(() => {
    markReady() // no heavy imagery on contact — reveal immediately
    supabase.from('site_settings').select('social_links').eq('id', 1).single()
      .then(({ data }) => data && setSocial(data.social_links || {}))
  }, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setStatus('sending')
    const { error } = await supabase.from('messages').insert({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || null,
      email: form.email.trim(),
      message: form.message.trim(),
    })
    if (error) { setStatus('error'); return }
    setStatus('sent')
    setForm({ first_name: '', last_name: '', email: '', message: '' })
  }

  return (
    <>
      <main className="page">
        <section className="contact">
          <h1>{t('contact.title')}</h1>
          <p className="sub">{t('contact.sub')}</p>

          <form onSubmit={submit}>
            <div className="row2">
              <div className="field">
                <label>{t('contact.firstName')} <span className="req">{t('contact.required')}</span></label>
                <input required value={form.first_name} onChange={set('first_name')} />
              </div>
              <div className="field">
                <label>{t('contact.lastName')}</label>
                <input value={form.last_name} onChange={set('last_name')} />
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
            <button className="btn" type="submit" disabled={status === 'sending'}>
              {status === 'sending' ? t('contact.sending') : t('contact.send')}
            </button>
            {status === 'sent' && <div className="form-note ok">{t('contact.sent')}</div>}
            {status === 'error' && <div className="form-note err">{t('contact.error')}</div>}
          </form>
        </section>
        <Footer social={social} />
      </main>
    </>
  )
}
