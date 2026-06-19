import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useI18n } from '../../lib/i18n.jsx'

export default function AdminMessages() {
  const { t } = useI18n()
  const [msgs, setMsgs] = useState([])

  const load = async () => {
    const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: false })
    setMsgs(data || [])
  }
  useEffect(() => { load() }, [])

  const markRead = async (m) => {
    await supabase.from('messages').update({ is_read: true }).eq('id', m.id)
    load()
  }
  const remove = async (m) => {
    if (!confirm(t('admin.confirmDelete'))) return
    await supabase.from('messages').delete().eq('id', m.id)
    load()
  }

  if (!msgs.length) return <div className="center">{t('admin.noMsg')}</div>

  return (
    <div>
      {msgs.map((m) => (
        <div className={`msg ${m.is_read ? '' : 'unread'}`} key={m.id}>
          <div className="from">{m.first_name} {m.last_name || ''}</div>
          <a className="em" href={`mailto:${m.email}`}>{m.email}</a>
          <div className="body">{m.message}</div>
          <div className="when">{new Date(m.created_at).toLocaleString()}</div>
          <div className="mt" style={{ display: 'flex', gap: 8 }}>
            {!m.is_read && <button className="admin-tab" onClick={() => markRead(m)}>{t('admin.markRead')}</button>}
            <button className="admin-tab" onClick={() => remove(m)} style={{ color: '#ff6b6b' }}>{t('admin.delete')}</button>
          </div>
        </div>
      ))}
    </div>
  )
}
