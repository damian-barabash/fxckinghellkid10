import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useI18n } from '../../lib/i18n.jsx'

const SOCIAL_KEYS = ['instagram', 'telegram', 'pinterest', 'behance', 'email']

export default function AdminSettings() {
  const { t } = useI18n()
  const [workWith, setWorkWith] = useState('')
  const [social, setSocial] = useState({})
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('site_settings').select('*').eq('id', 1).single().then(({ data }) => {
      if (!data) return
      setWorkWith((data.work_with || []).join('\n'))
      setSocial(data.social_links || {})
    })
  }, [])

  const save = async () => {
    setBusy(true); setSaved(false)
    const list = workWith.split('\n').map((s) => s.trim()).filter(Boolean)
    const { error } = await supabase.from('site_settings').update({
      work_with: list, social_links: social, updated_at: new Date().toISOString(),
    }).eq('id', 1)
    setBusy(false)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
    else alert('Error: ' + error.message)
  }

  return (
    <div>
      <div className="card">
        <label className="lbl">{t('admin.workWith')}</label>
        <textarea className="txta" value={workWith} onChange={(e) => setWorkWith(e.target.value)} />
        <div className="hint">{t('admin.workWithHint')}</div>
      </div>

      <div className="card">
        <label className="lbl">{t('admin.social')}</label>
        {SOCIAL_KEYS.map((k) => (
          <div key={k} className="mt">
            <label className="lbl" style={{ textTransform: 'capitalize' }}>{k}</label>
            <input className="inp" value={social[k] || ''}
                   onChange={(e) => setSocial((s) => ({ ...s, [k]: e.target.value }))} />
          </div>
        ))}
      </div>

      <button className="btn" onClick={save} disabled={busy}>{busy ? '…' : t('admin.save')}</button>
      {saved && <span className="form-note ok" style={{ marginLeft: 16 }}>{t('admin.saved')}</span>}
    </div>
  )
}
