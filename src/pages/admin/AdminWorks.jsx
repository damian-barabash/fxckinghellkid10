import { useEffect, useState } from 'react'
import { supabase, publicUrl, MEDIA_BUCKET } from '../../lib/supabase.js'
import { CATEGORIES, byKey } from '../../lib/categories.js'
import { toWebp, buildPdf, slugify } from '../../lib/media.js'
import { useI18n } from '../../lib/i18n.jsx'

export default function AdminWorks() {
  const { t } = useI18n()
  const [works, setWorks] = useState([])
  const [category, setCategory] = useState('cover_arts')
  const [title, setTitle] = useState('')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')

  const load = async () => {
    const { data } = await supabase.from('works').select('*')
      .order('category').order('created_at', { ascending: false })
    setWorks(data || [])
  }
  useEffect(() => { load() }, [])

  const cat = byKey(category)
  const isCover = cat?.kind === 'cover'

  const uploadBlob = async (path, blob, contentType) => {
    const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, {
      contentType, upsert: true,
    })
    if (error) throw error
    return path
  }

  const create = async (e) => {
    e.preventDefault()
    if (!files.length) return
    setBusy(true)
    try {
      const stamp = Date.now().toString(36)
      const base = `works/${category}/${slugify(title)}-${stamp}`

      if (isCover) {
        // one work per image
        let i = 0
        for (const file of files) {
          setProgress(`${++i}/${files.length}`)
          const blob = await toWebp(file)
          const path = await uploadBlob(`${base}-${i}.webp`, blob, 'image/webp')
          await supabase.from('works').insert({
            category, kind: 'cover', title: title.trim() || null,
            thumb_url: path, images: [path],
          })
        }
      } else {
        // a project: convert all, build a PDF, one work row
        const blobs = []
        const paths = []
        let i = 0
        for (const file of files) {
          setProgress(`${++i}/${files.length}`)
          const blob = await toWebp(file)
          blobs.push(blob)
          paths.push(await uploadBlob(`${base}/img-${i}.webp`, blob, 'image/webp'))
        }
        setProgress('PDF…')
        const pdf = await buildPdf(blobs)
        const pdfPath = await uploadBlob(`${base}/project.pdf`, pdf, 'application/pdf')
        await supabase.from('works').insert({
          category, kind: 'project', title: title.trim() || null,
          thumb_url: paths[0], images: paths, pdf_url: pdfPath,
        })
      }

      setTitle(''); setFiles([])
      e.target.reset?.()
      await load()
    } catch (err) {
      alert('Error: ' + (err.message || err))
    } finally {
      setBusy(false); setProgress('')
    }
  }

  const remove = async (w) => {
    if (!confirm(t('admin.confirmDelete'))) return
    // remove storage objects (best effort)
    const paths = [...(w.images || []), w.pdf_url].filter(Boolean)
    if (paths.length) await supabase.storage.from(MEDIA_BUCKET).remove(paths)
    await supabase.from('works').delete().eq('id', w.id)
    await load()
  }

  const grouped = CATEGORIES.map((c) => ({ c, items: works.filter((w) => w.category === c.key) }))

  return (
    <div>
      <form className="card" onSubmit={create}>
        <h3 style={{ marginTop: 0 }}>{t('admin.new')}</h3>
        <label className="lbl">{t('admin.category')}</label>
        <select className="sel" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.en}</option>)}
        </select>

        <label className="lbl mt">{t('admin.title')}</label>
        <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)}
               placeholder={t('admin.titleHint')} />

        <label className="lbl mt">{t('admin.files')}</label>
        <input className="inp" type="file" accept="image/*" multiple
               onChange={(e) => setFiles([...e.target.files])} />
        <div className="hint">{isCover ? t('admin.coverNote') : t('admin.projectNote')}</div>

        <button className="btn mt" type="submit" disabled={busy || !files.length}>
          {busy ? `${t('admin.creating')} ${progress}` : t('admin.create')}
        </button>
      </form>

      {grouped.map(({ c, items }) => items.length > 0 && (
        <div className="card" key={c.key}>
          <h3 style={{ marginTop: 0 }}>{c.en} <span style={{ color: 'var(--muted)', fontSize: 13 }}>({items.length})</span></h3>
          <div className="adm-grid">
            {items.map((w) => (
              <div className="adm-tile" key={w.id}>
                <img src={publicUrl(w.thumb_url)} alt="" />
                <button className="adm-del" onClick={() => remove(w)}>✕</button>
                <div className="meta">
                  {w.title || <em style={{ opacity: 0.5 }}>— no title —</em>}
                  {w.pdf_url && <span style={{ color: 'var(--green)' }}> · PDF</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
