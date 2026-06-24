import { useEffect, useRef, useState } from 'react'
import { supabase, publicUrl, MEDIA_BUCKET } from '../../lib/supabase.js'
import { CATEGORIES, byKey } from '../../lib/categories.js'
import { toWebp, buildPdf, slugify, videoToWebm, videoPoster, MAX_UPLOAD_BYTES } from '../../lib/media.js'
import { useI18n } from '../../lib/i18n.jsx'
import Masonry from '../../components/Masonry.jsx'

const uploadBlob = async (path, blob, contentType) => {
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, { contentType, upsert: true })
  if (error) throw error
  return path
}

// Re-encode stored webp paths into a fresh PDF (used after editing a project).
async function rebuildPdf(paths) {
  const blobs = []
  for (const p of paths) {
    const res = await fetch(publicUrl(p))
    blobs.push(await res.blob())
  }
  return buildPdf(blobs)
}

export default function AdminWorks() {
  const { t } = useI18n()
  const [works, setWorks] = useState([])
  const [category, setCategory] = useState('cover_arts')
  const [title, setTitle] = useState('')
  const [files, setFiles] = useState([])
  const [gallery, setGallery] = useState(false)
  const [mediaType, setMediaType] = useState('image') // image | video (stage only)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [editing, setEditing] = useState(null)

  const load = async () => {
    const { data } = await supabase.from('works').select('*')
      .order('category').order('sort', { ascending: true }).order('created_at', { ascending: false })
    setWorks(data || [])
  }
  useEffect(() => { load() }, [])

  const cat = byKey(category)
  const isProject = cat?.defaultKind === 'project'
  const isVideo = cat?.media && mediaType === 'video'

  const create = async (e) => {
    e.preventDefault()
    if (!files.length) return
    setBusy(true)
    try {
      const stamp = Date.now().toString(36)
      const base = `works/${category}/${slugify(title)}-${stamp}`
      // place new works at the front of their category
      const minSort = Math.min(0, ...works.filter((w) => w.category === category).map((w) => w.sort)) - 1

      if (isVideo) {
        // Compress in the browser so the upload fits Supabase's 50 MB free-tier
        // cap. ffmpeg.wasm works on desktop; on iOS/iPad it can't load — in that
        // case we fall back to the original file and let the size guard below
        // surface a clear message if it's still too big.
        const file = files[0]
        let blob = file
        let ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] || '.mp4').toLowerCase()
        let contentType = file.type || 'video/mp4'
        try {
          setProgress(t('admin.videoConvert'))
          blob = await videoToWebm(file, { onProgress: (r) => setProgress(`${t('admin.videoConvert')} ${Math.round(r * 100)}%`) })
          ext = '.webm'; contentType = 'video/webm'
        } catch {
          // compression unavailable (e.g. iOS Safari) — keep the original file
          blob = file
        }
        if (blob.size > MAX_UPLOAD_BYTES) throw new Error(t('admin.videoTooBig'))
        setProgress(t('admin.uploading'))
        // poster from the first frame (best-effort — never blocks the upload)
        let posterPath = null
        try {
          const poster = await videoPoster(file)
          if (poster) posterPath = await uploadBlob(`${base}-poster.webp`, poster, 'image/webp')
        } catch { /* no poster — the <video> still renders */ }
        const videoPath = await uploadBlob(`${base}${ext}`, blob, contentType)
        await supabase.from('works').insert({
          category, kind: 'video', title: title.trim() || null,
          thumb_url: posterPath, images: posterPath ? [posterPath] : [], video_url: videoPath, sort: minSort,
        })
      } else if (isProject) {
        const blobs = []; const paths = []; let i = 0
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
          thumb_url: paths[0], images: paths, pdf_url: pdfPath, sort: minSort,
        })
      } else if (gallery) {
        // one cover work, all images, slider
        const paths = []; let i = 0
        for (const file of files) {
          setProgress(`${++i}/${files.length}`)
          const blob = await toWebp(file)
          paths.push(await uploadBlob(`${base}-${i}.webp`, blob, 'image/webp'))
        }
        await supabase.from('works').insert({
          category, kind: 'cover', title: title.trim() || null,
          thumb_url: paths[0], images: paths, sort: minSort,
        })
      } else {
        // one cover work per image
        let i = 0
        for (const file of files) {
          setProgress(`${++i}/${files.length}`)
          const blob = await toWebp(file)
          const path = await uploadBlob(`${base}-${i}.webp`, blob, 'image/webp')
          await supabase.from('works').insert({
            category, kind: 'cover', title: title.trim() || null,
            thumb_url: path, images: [path], sort: minSort - i,
          })
        }
      }

      setTitle(''); setFiles([]); setGallery(false)
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
    const paths = [...(w.images || []), w.pdf_url, w.video_url].filter(Boolean)
    if (paths.length) await supabase.storage.from(MEDIA_BUCKET).remove(paths)
    await supabase.from('works').delete().eq('id', w.id)
    await load()
  }

  // persist a reordered category list as sequential sort values.
  // Rebuild the works array so the category items keep their NEW order (grouped
  // filters preserve array order) — otherwise the child would snap back.
  const persistOrder = async (items) => {
    const ids = new Set(items.map((w) => w.id))
    setWorks((prev) => {
      const others = prev.filter((w) => !ids.has(w.id))
      const reordered = items.map((w, i) => ({ ...w, sort: i }))
      return [...others, ...reordered]
    })
    await Promise.all(items.map((w, i) => supabase.from('works').update({ sort: i }).eq('id', w.id)))
  }

  const grouped = CATEGORIES.map((c) => ({ c, items: works.filter((w) => w.category === c.key) }))

  return (
    <div>
      <form className="card" onSubmit={create}>
        <h3 style={{ marginTop: 0 }}>{t('admin.new')}</h3>
        <label className="lbl">{t('admin.category')}</label>
        <select className="sel" value={category} onChange={(e) => { setCategory(e.target.value); setGallery(false); setMediaType('image') }}>
          {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.en}</option>)}
        </select>

        {cat?.media && (
          <div className="mt">
            <label className="lbl">{t('admin.mediaType')}</label>
            <div className="seg">
              <button type="button" className={mediaType === 'image' ? 'on' : ''} onClick={() => setMediaType('image')}>{t('admin.typePhoto')}</button>
              <button type="button" className={mediaType === 'video' ? 'on' : ''} onClick={() => setMediaType('video')}>{t('admin.typeVideo')}</button>
            </div>
          </div>
        )}

        <label className="lbl mt">{t('admin.title')}</label>
        <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('admin.titleHint')} />

        <label className="lbl mt">{isVideo ? t('admin.typeVideo') : t('admin.files')}</label>
        <input className="inp" type="file" accept={isVideo ? 'video/*' : 'image/*'} multiple={!isVideo}
               onChange={(e) => setFiles([...e.target.files])} />

        {!isProject && !isVideo && cat && (
          <label className="check mt">
            <input type="checkbox" checked={gallery} onChange={(e) => setGallery(e.target.checked)} />
            <span>{t('admin.gallery')}</span>
          </label>
        )}

        <div className="hint">
          {isVideo ? t('admin.videoNote') : isProject ? t('admin.projectNote') : t('admin.coverNote')}
        </div>

        <button className="btn mt" type="submit" disabled={busy || !files.length}>
          {busy ? `${t('admin.creating')} ${progress}` : t('admin.create')}
        </button>
      </form>

      {grouped.map(({ c, items }) => items.length > 0 && (
        <CategoryBlock key={c.key} cat={c} items={items}
                       onEdit={setEditing} onRemove={remove} onReorder={persistOrder} />
      ))}

      {editing && (
        <EditModal work={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load() }} />
      )}
    </div>
  )
}

// ---- one category with reorderable tiles (drag + arrow buttons) ----
function CategoryBlock({ cat, items, onEdit, onRemove, onReorder }) {
  const { t } = useI18n()
  const [order, setOrder] = useState(items)
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  useEffect(() => { setOrder(items) }, [items])

  const apply = (next) => { setOrder(next); onReorder(next) }

  const drop = (to) => {
    const from = dragIdx
    setDragIdx(null); setOverIdx(null)
    if (from == null || from === to) return
    const next = [...order]
    const [m] = next.splice(from, 1)
    next.splice(to, 0, m)
    apply(next)
  }

  // reliable fallback: move a tile one step earlier/later
  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    apply(next)
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{cat.en} <span style={{ color: 'var(--muted)', fontSize: 13 }}>({order.length})</span></h3>
      <div className="hint" style={{ marginBottom: 12 }}>{t('admin.reorderHint')}</div>
      <Masonry className="adm-masonry" items={order} render={(w, i) => (
        <div className={`adm-tile ${dragIdx === i ? 'dragging' : ''} ${overIdx === i ? 'over' : ''}`} key={w.id} draggable
             onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)) } catch {} }}
             onDragEnter={() => setOverIdx(i)}
             onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
             onDrop={(e) => { e.preventDefault(); drop(i) }}
             onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}>
          {w.thumb_url
            ? <img src={publicUrl(w.thumb_url)} alt="" draggable={false} />
            : <video src={publicUrl(w.video_url)} muted playsInline preload="metadata" draggable={false} />}
          {w.kind === 'video' && <span className="adm-badge">▶</span>}
          {w.kind === 'project' && w.pdf_url && <span className="adm-badge">PDF</span>}
          <div className="adm-actions">
            <button className="adm-edit" onClick={() => onEdit(w)}>{t('admin.edit')}</button>
            <button className="adm-del" onClick={() => onRemove(w)}>✕</button>
          </div>
          <div className="adm-move">
            <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="move left">‹</button>
            <span className="adm-pos">{i + 1}</span>
            <button onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label="move right">›</button>
          </div>
          <div className="meta">
            {w.title || <em style={{ opacity: 0.5 }}>— no title —</em>}
            {(w.images?.length > 1) && <span style={{ color: 'var(--muted)' }}> · {w.images.length}</span>}
          </div>
        </div>
      )} />
    </div>
  )
}

// ---- edit a work: title + images (add/remove/reorder/cover) ----
function EditModal({ work, onClose, onSaved }) {
  const { t } = useI18n()
  const [title, setTitle] = useState(work.title || '')
  const [imgs, setImgs] = useState(work.images || [])
  const [newFiles, setNewFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const drag = useRef(null)
  const isVideo = work.kind === 'video'

  const move = (i) => {
    const from = drag.current; drag.current = null
    if (from == null || from === i) return
    const next = [...imgs]; const [m] = next.splice(from, 1); next.splice(i, 0, m); setImgs(next)
  }
  const removeImg = (i) => setImgs((p) => p.filter((_, idx) => idx !== i))
  const setCover = (i) => setImgs((p) => { const n = [...p]; const [m] = n.splice(i, 1); return [m, ...n] })

  const save = async () => {
    setBusy(true)
    try {
      const stamp = Date.now().toString(36)
      const base = `works/${work.category}/${slugify(title) || 'edit'}-${stamp}`
      let images = [...imgs]
      // upload appended files
      if (!isVideo && newFiles.length) {
        let i = 0
        for (const file of newFiles) {
          setProgress(`${++i}/${newFiles.length}`)
          const blob = await toWebp(file)
          images.push(await uploadBlob(`${base}-add-${i}.webp`, blob, 'image/webp'))
        }
      }
      const patch = { title: title.trim() || null }
      if (!isVideo) {
        patch.images = images
        patch.thumb_url = images[0] || work.thumb_url
        if (work.kind === 'project') {
          setProgress('PDF…')
          const pdf = await rebuildPdf(images)
          patch.pdf_url = await uploadBlob(`${base}/project.pdf`, pdf, 'application/pdf')
        }
      }
      const { error } = await supabase.from('works').update(patch).eq('id', work.id)
      if (error) throw error
      await onSaved()
    } catch (err) {
      alert('Error: ' + (err.message || err))
    } finally {
      setBusy(false); setProgress('')
    }
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{t('admin.editTitle')}</h3>
        <label className="lbl">{t('admin.title')}</label>
        <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} />

        {!isVideo && (
          <>
            <label className="lbl mt">{t('admin.files')}</label>
            <div className="edit-grid">
              {imgs.map((p, i) => (
                <div className="edit-thumb" key={p + i} draggable
                     onDragStart={() => { drag.current = i }}
                     onDragOver={(e) => e.preventDefault()}
                     onDrop={() => move(i)}>
                  <img src={publicUrl(p)} alt="" />
                  {i === 0 && <span className="edit-cover">{t('admin.cover')}</span>}
                  <div className="edit-thumb__row">
                    {i !== 0 && <button onClick={() => setCover(i)} title={t('admin.setCover')}>★</button>}
                    <button onClick={() => removeImg(i)} title={t('admin.delete')}>✕</button>
                  </div>
                </div>
              ))}
            </div>
            <label className="ph-add mt" style={{ display: 'inline-flex' }}>
              {t('admin.addImages')}
              <input type="file" accept="image/*" multiple hidden onChange={(e) => setNewFiles([...e.target.files])} />
            </label>
            {newFiles.length > 0 && <span className="hint" style={{ marginLeft: 10 }}>+{newFiles.length}</span>}
          </>
        )}

        <div className="mt" style={{ display: 'flex', gap: 10 }}>
          <button className="btn" onClick={save} disabled={busy}>{busy ? `${t('admin.creating')} ${progress}` : t('admin.save')}</button>
          <button className="admin-tab" onClick={onClose} disabled={busy}>{t('admin.cancel')}</button>
        </div>
      </div>
    </div>
  )
}
