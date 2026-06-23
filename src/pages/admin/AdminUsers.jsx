import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useI18n } from '../../lib/i18n.jsx'

const PERM_KEYS = ['manage_works', 'manage_settings', 'view_messages', 'manage_admins']
const DEFAULT_PERMS = { manage_works: true, manage_settings: false, view_messages: true, manage_admins: false }

async function call(body) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    // surface the function's JSON error message when present
    let msg = error.message
    try { const ctx = await error.context?.json?.(); if (ctx?.error) msg = ctx.error } catch {}
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export default function AdminUsers({ meId }) {
  const { t } = useI18n()
  const [list, setList] = useState([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [perms, setPerms] = useState({ ...DEFAULT_PERMS })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = async () => {
    try { const d = await call({ action: 'list' }); setList(d.admins || []) }
    catch (e) { setErr(e.message) }
  }
  useEffect(() => { load() }, [])

  const create = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      await call({ action: 'create', email, password, perms })
      setEmail(''); setPassword(''); setPerms({ ...DEFAULT_PERMS })
      await load()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const savePerms = async (a) => {
    setErr('')
    try { await call({ action: 'update', id: a.id, perms: a.perms }); await load() }
    catch (e) { setErr(e.message) }
  }
  const removeAdmin = async (a) => {
    if (!confirm(t('admin.confirmDeleteAdmin'))) return
    setErr('')
    try { await call({ action: 'delete', id: a.id }); await load() }
    catch (e) { setErr(e.message) }
  }

  const togglePerm = (id, key) => setList((prev) => prev.map((a) =>
    a.id === id ? { ...a, perms: { ...a.perms, [key]: !a.perms[key] }, _dirty: true } : a))

  return (
    <div>
      <form className="card" onSubmit={create}>
        <h3 style={{ marginTop: 0 }}>{t('admin.users.add')}</h3>
        <div className="row2">
          <div>
            <label className="lbl">{t('admin.users.email')}</label>
            <input className="inp" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="lbl">{t('admin.users.password')}</label>
            <input className="inp" type="text" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('admin.users.passwordHint')} />
          </div>
        </div>
        <label className="lbl mt">{t('admin.users.perms')}</label>
        <div className="perm-grid">
          {PERM_KEYS.map((k) => (
            <label className="check" key={k}>
              <input type="checkbox" checked={perms[k]} onChange={(e) => setPerms((p) => ({ ...p, [k]: e.target.checked }))} />
              <span>{t('admin.perm.' + k)}</span>
            </label>
          ))}
        </div>
        <button className="btn mt" type="submit" disabled={busy}>{busy ? '…' : t('admin.users.create')}</button>
        {err && <div className="form-note err">{err}</div>}
      </form>

      {list.map((a) => (
        <div className="card" key={a.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <span className={`role-badge ${a.role}`}>{t('admin.role.' + a.role)}</span>{' '}
              <strong>{a.email}</strong>{a.id === meId && <span className="hint" style={{ marginLeft: 8 }}>({t('admin.you')})</span>}
            </div>
            {a.role !== 'moderator' && (
              <button className="admin-tab" style={{ color: '#ff6b6b' }} onClick={() => removeAdmin(a)}>{t('admin.delete')}</button>
            )}
          </div>
          {a.role !== 'moderator' && (
            <>
              <div className="perm-grid mt">
                {PERM_KEYS.map((k) => (
                  <label className="check" key={k}>
                    <input type="checkbox" checked={!!a.perms?.[k]} onChange={() => togglePerm(a.id, k)} />
                    <span>{t('admin.perm.' + k)}</span>
                  </label>
                ))}
              </div>
              {a._dirty && <button className="btn mt" onClick={() => savePerms(a)}>{t('admin.save')}</button>}
            </>
          )}
        </div>
      ))}
    </div>
  )
}
