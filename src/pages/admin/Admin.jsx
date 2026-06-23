import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { markReady } from '../../lib/ready.js'
import { useI18n } from '../../lib/i18n.jsx'
import AdminWorks from './AdminWorks.jsx'
import AdminSettings from './AdminSettings.jsx'
import AdminMessages from './AdminMessages.jsx'
import AdminUsers from './AdminUsers.jsx'

export default function Admin() {
  const { t } = useI18n()
  const [session, setSession] = useState(undefined) // undefined = loading
  const [me, setMe] = useState(null)                // admins row
  const [tab, setTab] = useState(null)

  useEffect(() => {
    markReady()
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setMe(null); return }
    supabase.from('admins').select('*').eq('id', session.user.id).single()
      .then(({ data }) => setMe(data || { role: 'admin', perms: {} }))
  }, [session])

  const can = (p) => me && (me.role === 'moderator' || me.perms?.[p])

  // available tabs in fixed order, filtered by permission
  const tabs = useMemo(() => {
    if (!me) return []
    return [
      can('manage_works') && { key: 'works', label: t('admin.tab.works') },
      can('manage_settings') && { key: 'settings', label: t('admin.tab.settings') },
      can('view_messages') && { key: 'messages', label: t('admin.tab.messages') },
      can('manage_admins') && { key: 'users', label: t('admin.tab.users') },
    ].filter(Boolean)
  }, [me])

  useEffect(() => {
    if (tabs.length && (!tab || !tabs.find((x) => x.key === tab))) setTab(tabs[0].key)
  }, [tabs])

  if (session === undefined) return <div className="center">…</div>
  if (!session) return <Login />
  if (!me) return <div className="center">…</div>

  return (
    <div className="admin">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
        <h2>fxckinghellkid10 — admin</h2>
        <button className="admin-tab" onClick={() => supabase.auth.signOut()}>{t('admin.signout')}</button>
      </div>
      <div className="admin-tabs">
        {tabs.map((x) => (
          <button key={x.key} className={`admin-tab ${tab === x.key ? 'active' : ''}`} onClick={() => setTab(x.key)}>{x.label}</button>
        ))}
      </div>
      {tabs.length === 0 && <div className="center">{t('admin.noPerm')}</div>}
      {tab === 'works' && can('manage_works') && <AdminWorks />}
      {tab === 'settings' && can('manage_settings') && <AdminSettings />}
      {tab === 'messages' && can('view_messages') && <AdminMessages />}
      {tab === 'users' && can('manage_admins') && <AdminUsers meId={session.user.id} />}
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
