import { useEffect, useState } from 'react'
import { supabase, publicUrl } from '../../lib/supabase.js'
import { forceDownload } from '../../lib/media.js'
import { useI18n } from '../../lib/i18n.jsx'

export default function AdminMessages() {
  const { t } = useI18n()
  const [msgs, setMsgs] = useState([])

  const load = async () => {
    const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: false })
    setMsgs(data || [])
  }
  useEffect(() => { load() }, [])

  const markRead = async (m) => { await supabase.from('messages').update({ is_read: true }).eq('id', m.id); load() }
  const remove = async (m) => {
    if (!confirm(t('admin.confirmDelete'))) return
    await supabase.from('messages').delete().eq('id', m.id)
    load()
  }

  const downloadAll = async (m) => {
    const list = m.photos || []
    for (let i = 0; i < list.length; i++) {
      await forceDownload(publicUrl(list[i]), `${m.first_name || 'photo'}-${i + 1}.webp`)
    }
  }

  if (!msgs.length) return <div className="center">{t('admin.noMsg')}</div>

  return (
    <div>
      {msgs.map((m) => (
        <div className={`msg ${m.is_read ? '' : 'unread'}`} key={m.id}>
          <div className="from">{m.first_name}</div>
          <a className="em" href={`mailto:${m.email}`}>{m.email}</a>
          {m.instagram && (
            <div className="ig">{t('admin.msg.instagram')}: {m.instagram}</div>
          )}
          <div className="body">{m.message}</div>

          {m.photos?.length > 0 && (
            <div className="msg-photos">
              {m.photos.map((p, i) => (
                <div className="msg-photo" key={i}>
                  <a href={publicUrl(p)} target="_blank" rel="noreferrer"><img src={publicUrl(p)} alt="" /></a>
                  <button className="msg-dl" onClick={() => forceDownload(publicUrl(p), `${m.first_name || 'photo'}-${i + 1}.webp`)}>
                    {t('admin.msg.downloadOne')}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="when">{new Date(m.created_at).toLocaleString()}</div>
          <div className="mt" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {m.photos?.length > 1 && <button className="admin-tab" onClick={() => downloadAll(m)}>{t('admin.msg.downloadAll')}</button>}
            {!m.is_read && <button className="admin-tab" onClick={() => markRead(m)}>{t('admin.markRead')}</button>}
            <button className="admin-tab" onClick={() => remove(m)} style={{ color: '#ff6b6b' }}>{t('admin.delete')}</button>
          </div>
        </div>
      ))}
    </div>
  )
}
