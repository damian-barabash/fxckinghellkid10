import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useI18n } from '../../lib/i18n.jsx'
import AdminWorks from './AdminWorks.jsx'
import AdminSettings from './AdminSettings.jsx'
import AdminMessages from './AdminMessages.jsx'

export default function Admin() {
  const { t } = useI18n()
  const [session, setSession] = useState(undefined) // undefined = loading
  const [tab, setTab] = useState('works')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="center">…</div>
  if (!session) return <Login />

  return (
    <div className="admin">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
        <h2>fxckinghellkid10 — admin</h2>
        <button className="admin-tab" onClick={() => supabase.auth.signOut()}>{t('admin.signout')}</button>
      </div>
      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'works' ? 'active' : ''}`} onClick={() => setTab('works')}>{t('admin.tab.works')}</button>
        <button className={`admin-tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>{t('admin.tab.settings')}</button>
        <button className={`admin-tab ${tab === 'messages' ? 'active' : ''}`} onClick={() => setTab('messages')}>{t('admin.tab.messages')}</button>
      </div>
      {tab === 'works' && <AdminWorks />}
      {tab === 'settings' && <AdminSettings />}
      {tab === 'messages' && <AdminMessages />}
    </div>
  )
}

function Login() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setErr(t('admin.badCreds'))
  }

  return (
    <div className="login-wrap">
      <h2>{t('admin.login')}</h2>
      <form onSubmit={submit}>
        <label className="lbl">{t('admin.email')}</label>
        <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        <label className="lbl mt">{t('admin.password')}</label>
        <input className="inp" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn mt" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? '…' : t('admin.signin')}
        </button>
        {err && <div className="form-note err">{err}</div>}
      </form>
    </div>
  )
}
