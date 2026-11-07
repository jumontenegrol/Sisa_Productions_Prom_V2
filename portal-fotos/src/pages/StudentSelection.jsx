import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import BrandLogo from '../components/BrandLogo'

const layouts = [
  { id: 1, title: 'Un retrato', count: 1, desc: 'Una foto protagonista' },
  { id: 2, title: 'Díptico horizontal', count: 2, desc: 'Dos fotos verticales lado a lado' },
  { id: 3, title: 'Composición', count: 4, desc: 'Cuatro fotos en retablo' },
]

export default function StudentSelection() {
  const { signOut } = useAuth()
  const [summary, setSummary] = useState(null)
  const [photos, setPhotos] = useState([])
  const [centerUrl, setCenterUrl] = useState('')
  const [folderIds, setFolderIds] = useState([])
  const [retabloLayout, setRetabloLayout] = useState(1)
  const [retabloIds, setRetabloIds] = useState([])
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [zoomPhoto, setZoomPhoto] = useState(null)
  const [zoomBusy, setZoomBusy] = useState(false)
  const [downloadingId, setDownloadingId] = useState(null)
  const [clockNow, setClockNow] = useState(Date.now())

  useEffect(() => {
    let active = true
    async function loadPortal() {
      if (!supabase) { setError('No está configurada la conexión con Supabase.'); setLoading(false); return }
      const { data: studentData, error: summaryError } = await supabase.rpc('get_student_portal_summary')
      if (summaryError || !studentData) {
        if (active) {
          setError('No encontramos un acceso fotográfico asociado a esta cuenta. Contacta al editor.')
          setLoading(false)
        }
        return
      }
      if (active) setSummary(studentData)

      const { data: photoRows, error: photoError } = await supabase.from('student_photos')
        .select('id,category,ordinal,preview_path,original_path')
        .eq('campaign_id', studentData.campaign_id)
        .order('ordinal')
      if (photoError) {
        if (active) { setError('No pudimos cargar tus fotos. Contacta al editor.'); setLoading(false) }
        return
      }

      if (photoRows?.length) {
        const { data: signedUrls, error: signedError } = await supabase.storage.from('student-previews')
          .createSignedUrls(photoRows.map((photo) => photo.preview_path), 1800)
        if (signedError && active) setError('No pudimos abrir algunas vistas previas de tus fotos.')
        if (active) setPhotos(photoRows.map((photo, index) => ({ ...photo, url: signedUrls?.[index]?.signedUrl || '' })))
      }

      if (studentData.center_image_path) {
        const { data: signedCenter } = await supabase.storage.from('student-previews').createSignedUrl(studentData.center_image_path, 1800)
        if (active) setCenterUrl(signedCenter?.signedUrl || '')
      }

      const current = studentData.selections || []
      if (active && current.length) {
        const folder = current.filter((item) => item.product === 'folder').sort((a, b) => a.slot - b.slot)
        const retablo = current.filter((item) => item.product === 'retablo').sort((a, b) => a.slot - b.slot)
        setFolderIds(folder.map((item) => item.photo_id))
        if (retablo.length) {
          setRetabloLayout(retablo[0].layout)
          setRetabloIds(retablo.map((item) => item.photo_id))
          setStep(2)
        }
      }
      if (active) setLoading(false)
    }
    loadPortal()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!summary?.closes_at) return undefined
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [summary?.closes_at])

  useEffect(() => {
    if (!zoomPhoto) return undefined
    const closeOnEscape = (event) => { if (event.key === 'Escape') setZoomPhoto(null) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [zoomPhoto])

  const folderPhotos = useMemo(() => photos.filter((photo) => photo.category === 'folder'), [photos])
  const retabloPhotos = useMemo(() => photos.filter((photo) => photo.category === 'retablo'), [photos])
  const availableLayouts = summary?.plan_id === 1 ? layouts.slice(0, 2) : layouts
  const currentLayout = availableLayouts.find((item) => item.id === retabloLayout) || availableLayouts[0]
  const retabloDimensions = retabloLayout === 2
    ? (summary?.plan_id === 1 ? '45 × 30 cm · horizontal' : '70 × 50 cm · horizontal')
    : (summary?.plan_id === 1 ? '30 × 45 cm · vertical' : '50 × 70 cm · vertical')
  const closingDate = summary?.closes_at ? new Date(summary.closes_at) : null
  const openingDate = summary?.opens_at ? new Date(summary.opens_at) : null
  const locked = Boolean((openingDate && clockNow < openingDate.getTime()) || (closingDate && clockNow >= closingDate.getTime()))
  const countdownMs = closingDate ? Math.max(0, closingDate.getTime() - clockNow) : null
  const countdown = countdownMs === null ? null : {
    days: Math.floor(countdownMs / 86400000),
    hours: Math.floor((countdownMs % 86400000) / 3600000),
    minutes: Math.floor((countdownMs % 3600000) / 60000),
    seconds: Math.floor((countdownMs % 60000) / 1000),
  }
  const collectionReady = folderPhotos.length === 5 && retabloPhotos.length === 10
  const canSave = folderIds.length === 2 && retabloIds.length === currentLayout.count && !locked && collectionReady

  function choose(items, setItems, photoId, limit) {
    setNotice(''); setError('')
    setItems((previous) => previous.includes(photoId)
      ? previous.filter((id) => id !== photoId)
      : previous.length < limit ? [...previous, photoId] : previous)
  }

  function changeLayout(layoutId) {
    const next = availableLayouts.find((item) => item.id === layoutId)
    setRetabloLayout(layoutId)
    setRetabloIds((old) => old.slice(0, next.count))
    setNotice(''); setError('')
  }

  async function openPhoto(photo) {
    if (!photo?.original_path) return
    if (locked) {
      setZoomPhoto({ ...photo, zoomUrl: photo.url, zoomIsPreview: true })
      return
    }
    setZoomBusy(true); setError('')
    const { data, error: zoomError } = await supabase.storage.from('student-originals').createSignedUrl(photo.original_path, 300)
    setZoomBusy(false)
    if (zoomError || !data?.signedUrl) { setError('No pudimos ampliar esta foto. Intenta de nuevo.'); return }
    setZoomPhoto({ ...photo, zoomUrl: data.signedUrl, zoomIsPreview: false })
  }

  async function downloadPhoto(photo) {
    if (!photo?.original_path || locked) return
    setDownloadingId(photo.id); setError('')
    const extension = photo.original_path.split('.').pop() || 'jpg'
    const photoNumber = photo.category === 'folder' ? photo.ordinal : photo.ordinal + 5
    const studentCode = `${String(summary.grade || '').replace(/[^a-z0-9]/gi, '')}-${String(summary.student_id).padStart(4, '0')}`
    const filename = `${studentCode}-${String(photoNumber).padStart(2, '0')}.${extension}`
    const { data, error: downloadError } = await supabase.storage.from('student-originals').createSignedUrl(photo.original_path, 60, { download: filename })
    setDownloadingId(null)
    if (downloadError || !data?.signedUrl) { setError('No pudimos preparar la descarga. Verifica que no haya terminado el plazo.'); return }
    window.location.assign(data.signedUrl)
  }

  async function saveSelection() {
    if (!summary || !canSave) return
    setSaving(true); setError(''); setNotice('')
    const { error: saveError } = await supabase.rpc('save_student_photo_selection', {
      p_campaign_id: summary.campaign_id,
      p_folder_photo_ids: folderIds,
      p_retablo_layout: retabloLayout,
      p_retablo_photo_ids: retabloIds,
    })
    setSaving(false)
    if (saveError) { setError(saveError.message); return }
    setNotice('Tu selección quedó guardada. Puedes volver a editarla antes de la fecha límite.')
  }

  if (loading) return <div className="center-msg">Cargando tu colección…</div>
  if (error && !summary) return <main className="student-state-page"><section className="student-state-card"><h1>No pudimos abrir tu portal</h1><p>{error}</p><button className="outline-button" onClick={signOut}>Cerrar sesión</button></section></main>
  if (!summary) return null

  return <div className="portal-shell">
    <header className="portal-header"><Link className="brand student-brand" to="/" aria-label="Sisa Productions"><BrandLogo variant="header" /></Link><div className="header-status"><span className="status-dot" /> Colección privada</div><button className="outline-button" onClick={signOut}>Cerrar sesión</button></header>
    <main className="portal-main student-real-main">
      <section className="welcome-row"><div><p className="overline">{summary.campaign_name || 'PORTAL DE SELECCIÓN'}</p><h1>Hola, {summary.name}</h1><p className="welcome-copy">Elige tus fotos y revisa las vistas previas antes de guardar.</p></div><div className="plan-card"><small>Plan asignado</small><strong>Plan {summary.plan_id}</strong><span>Grupo {summary.grade}</span><small className="plan-auto-note">Tomado de tu registro escolar</small></div></section>
      {countdown && countdownMs > 0 && <section className="countdown-panel" aria-label="Cuenta regresiva para el cierre"><div><strong>Tiempo restante para elegir</strong><span>El plazo cierra el {closingDate.toLocaleString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true })}.</span></div><div className="countdown-clock">{[['días', countdown.days], ['horas', countdown.hours], ['min', countdown.minutes], ['seg', countdown.seconds]].map(([label, value]) => <span key={label}><b>{String(value).padStart(2, '0')}</b><small>{label}</small></span>)}</div></section>}
      {countdownMs !== null && countdownMs <= 0 && <div className="deadline-banner locked-banner">El plazo de selección y descarga terminó. Puedes consultar la selección guardada.</div>}
      {countdownMs !== null && countdownMs > 0 && <div className="download-reminder">Descarga todas tus fotos antes de la fecha límite. Después del cierre, las descargas se desactivan.</div>}
      {openingDate && clockNow < openingDate.getTime() && <div className="deadline-banner">La selección todavía no está abierta.</div>}
      {error && <div className="editor-alert error-alert">{error}</div>}{notice && <div className="saved-message">{notice}</div>}

      <nav className="step-nav" aria-label="Pasos de selección">
        <button className={step === 1 ? 'active' : folderIds.length === 2 ? 'complete' : ''} onClick={() => setStep(1)}><span>01</span><b>Carpeta</b><small>Elige 2 de 5 fotos</small></button><div className="step-connector" />
        <button className={step === 2 ? 'active' : retabloIds.length ? 'complete' : ''} onClick={() => folderIds.length === 2 && setStep(2)}><span>02</span><b>Retablo</b><small>Diseño y fotos</small></button>
      </nav>

      {!collectionReady && <div className="editor-alert error-alert">Tu colección aún no está completa. El editor debe cargar las 5 fotos de carpeta y las 10 fotos de retablo.</div>}
      {step === 1 ? <section className="selection-section">
        <div className="section-heading"><div><p className="overline">PRODUCTO 1 · CARPETA</p><h2>Selecciona 2 fotos</h2><p>Elige dos de tus cinco fotos. La imagen central ya viene incluida.</p></div><span className="counter">{folderIds.length} <small>/ 2 elegidas</small></span></div>
        <div className="folder-workspace">
          <div className="photo-grid five-grid">{folderPhotos.map((photo) => <PhotoChoice key={photo.id} photo={photo} selected={folderIds.includes(photo.id)} disabled={locked || (!folderIds.includes(photo.id) && folderIds.length === 2)} onClick={() => choose(folderIds, setFolderIds, photo.id, 2)} onZoom={() => openPhoto(photo)} onDownload={() => downloadPhoto(photo)} downloading={downloadingId === photo.id} locked={locked} />)}</div>
          <div className="live-preview-card"><div className="preview-card-heading"><div><strong>Así se verá tu carpeta</strong><span>3 cuadros · 20 × 30 cm cada uno</span></div><span className="live-pill">VISTA PREVIA</span></div>
            <div className="folder-preview"><div className="preview-frame">{previewPhoto(folderPhotos, folderIds[0])}</div><div className="preview-frame center-frame">{centerUrl ? <img className="center-photo" src={centerUrl} alt="Imagen central de la carpeta" /> : <span className="center-art"><b>S</b><small>PROMOCIÓN</small></span>}</div><div className="preview-frame">{previewPhoto(folderPhotos, folderIds[1])}</div></div>
            <div className="preview-caption"><span>Vertical · sin recorte manual</span><span>Vista previa real</span></div>
          </div>
        </div>
        <div className="section-footer"><span>{folderIds.length === 2 ? 'Ya elegiste tus dos fotos.' : `Te faltan ${2 - folderIds.length} fotos.`}</span><button className="primary-button" disabled={folderIds.length !== 2} onClick={() => setStep(2)}>Continuar al retablo <span>→</span></button></div>
      </section> : <section className="selection-section">
        <div className="section-heading"><div><p className="overline">PRODUCTO 2 · RETABLO</p><h2>Escoge tu composición</h2><p>Elige un diseño y completa sus espacios con fotos distintas.</p></div><span className="size-chip">{retabloDimensions}</span></div>
        <div className="layout-options">{availableLayouts.map((layout) => <button key={layout.id} disabled={locked} className={`layout-option ${retabloLayout === layout.id ? 'selected' : ''}`} onClick={() => changeLayout(layout.id)}><span className={`layout-icon layout-${layout.id}`}><i /><i /><i /><i /></span><span><b>Opción {layout.id}</b><small>{layout.title} · {layout.desc}</small></span><span className="radio-dot" /></button>)}</div>
        <div className="retablo-workspace"><div className="retablo-photo-pool"><div className="pool-heading"><b>Elige {currentLayout.count} {currentLayout.count === 1 ? 'foto' : 'fotos'}</b><span>{retabloIds.length}/{currentLayout.count}</span></div><div className="photo-grid retablo-pool-grid">{retabloPhotos.map((photo) => <PhotoChoice key={photo.id} photo={photo} selected={retabloIds.includes(photo.id)} disabled={locked || (!retabloIds.includes(photo.id) && retabloIds.length === currentLayout.count)} onClick={() => choose(retabloIds, setRetabloIds, photo.id, currentLayout.count)} onZoom={() => openPhoto(photo)} onDownload={() => downloadPhoto(photo)} downloading={downloadingId === photo.id} locked={locked} />)}</div></div>
          <div className="live-preview-card retablo-preview-card"><div className="preview-card-heading"><div><strong>Vista previa del retablo</strong><span>Opción {retabloLayout} · {retabloDimensions}</span></div><span className="live-pill">VISTA PREVIA</span></div><div className={`retablo-preview layout-preview-${currentLayout.count} ${retabloLayout === 2 ? `layout-plan-${summary.plan_id}` : ''}`}>{Array.from({ length: currentLayout.count }, (_, index) => <div className="retablo-preview-frame" key={index}>{previewPhoto(retabloPhotos, retabloIds[index]) || <span className="empty-frame">Foto {index + 1}</span>}</div>)}</div><div className="preview-caption"><span>Sin repetir fotos de la carpeta</span><span>Vista previa real</span></div></div>
        </div>
        <div className="section-footer"><button className="text-button" onClick={() => setStep(1)}>← Volver a carpeta</button><button className="primary-button" disabled={!canSave || saving} onClick={saveSelection}>{saving ? 'Guardando…' : 'Guardar selección'} <span>✓</span></button></div>
      </section>}
      <footer className="portal-footer"><span>Tu selección y tus fotos son privadas.</span><span>¿Necesitas ayuda? Contacta al editor.</span></footer>
    </main>
    {zoomPhoto && <div className="photo-lightbox" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setZoomPhoto(null) }}><section className="photo-lightbox-card" role="dialog" aria-modal="true" aria-label={`Foto ${zoomPhoto.ordinal} ampliada`}><header><div><b>{zoomPhoto.category === 'folder' ? 'Carpeta' : 'Retablo'} · Foto {String(zoomPhoto.ordinal).padStart(2, '0')}</b><small>{zoomPhoto.zoomIsPreview ? 'Vista ampliada de la vista previa' : 'Vista ampliada de tu foto original'}</small></div><button className="lightbox-close" type="button" onClick={() => setZoomPhoto(null)} aria-label="Cerrar foto ampliada">×</button></header><img src={zoomPhoto.zoomUrl} alt={`Foto ${zoomPhoto.ordinal} ampliada`} /><footer><button className="outline-button" type="button" onClick={() => downloadPhoto(zoomPhoto)} disabled={locked || downloadingId === zoomPhoto.id}>{downloadingId === zoomPhoto.id ? 'Preparando…' : 'Descargar original'}</button></footer></section></div>}
    {zoomBusy && <div className="lightbox-loading" role="status">Abriendo foto…</div>}
  </div>
}

function PhotoChoice({ photo, selected, disabled, onClick, onZoom, onDownload, downloading, locked }) {
  return <div className="photo-choice-wrap"><button type="button" className={`photo-choice ${selected ? 'is-selected' : ''}`} disabled={disabled} onClick={onClick}><img className="real-photo" src={photo.url} alt={`Foto ${photo.ordinal}`} /><span className="photo-choice-caption">Foto {String(photo.ordinal).padStart(2, '0')}</span>{selected && <span className="selected-mark">✓</span>}</button><div className="photo-choice-actions"><button type="button" aria-label={`Ampliar foto ${photo.ordinal}`} title="Ampliar" disabled={!photo.url} onClick={onZoom}>⤢</button><button type="button" aria-label={`Descargar foto ${photo.ordinal}`} title={locked ? 'Descargas cerradas' : 'Descargar original'} disabled={downloading || locked || !photo.original_path} onClick={onDownload}>{downloading ? '…' : '↓'}</button></div></div>
}

function previewPhoto(photos, id) {
  const photo = photos.find((item) => item.id === id)
  return photo?.url ? <img className="selected-preview-photo" src={photo.url} alt={`Foto ${photo.ordinal}`} /> : <span className="empty-frame">Tu foto</span>
}
