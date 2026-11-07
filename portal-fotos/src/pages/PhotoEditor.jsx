import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import BrandLogo from '../components/BrandLogo'

function extOf(file) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return null
  return ext === 'jpeg' ? 'jpg' : ext
}

function toLocalDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

function photoProgressFromRows(rows = []) {
  const result = {}
  for (const row of rows) {
    const key = row.student_id
    result[key] ||= { folder: 0, retablo: 0 }
    if (row.category === 'folder') result[key].folder += 1
    if (row.category === 'retablo') result[key].retablo += 1
  }
  return result
}

function csvCell(value) {
  const text = String(value ?? '')
  const safeText = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text
  return `"${safeText.replaceAll('"', '""')}"`
}

function photoPosition(selection) {
  if (selection.product === 'folder') return selection.slot === 1 ? 'Cuadro izquierdo' : 'Cuadro derecho'
  if (selection.layout === 1) return 'Centro'
  if (selection.layout === 2) return selection.slot === 1 ? 'Mitad izquierda' : 'Mitad derecha'
  return ['Superior izquierda', 'Superior derecha', 'Inferior izquierda', 'Inferior derecha'][selection.slot - 1] || `Espacio ${selection.slot}`
}

async function previewFile(file) {
  const image = await createImageBitmap(file)
  const scale = Math.min(1, 1400 / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.width * scale)
  canvas.height = Math.round(image.height * scale)
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
  image.close()
  const blob = await new Promise((resolve, reject) => canvas.toBlob((out) => out ? resolve(out) : reject(new Error('No se pudo crear la vista previa.')), 'image/webp', 0.84))
  return { blob, width: canvas.width, height: canvas.height }
}

export default function PhotoEditor() {
  const { signOut } = useAuth()
  const [students, setStudents] = useState([])
  const [photoProgress, setPhotoProgress] = useState({})
  const [campaign, setCampaign] = useState(null)
  const [student, setStudent] = useState(null)
  const [search, setSearch] = useState('')
  const [course, setCourse] = useState('')
  const [photos, setPhotos] = useState([])
  const [folderFiles, setFolderFiles] = useState([])
  const [retabloFiles, setRetabloFiles] = useState([])
  const [closesAt, setClosesAt] = useState('')
  const [centerFile, setCenterFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      if (!supabase) { setError('Configura las variables de Supabase en portal-fotos/.env.'); setLoading(false); return }
      const [campaignResult, studentResult] = await Promise.all([
        supabase.from('photo_campaigns').select('id,name,opens_at,closes_at,center_image_path').order('created_at', { ascending: false }).limit(1),
        supabase.from('estudiantes').select('id,nombre,grado,plan_id').in('plan_id', [1, 2]).order('nombre'),
      ])
      if (campaignResult.error || studentResult.error) setError(campaignResult.error?.message || studentResult.error?.message)
      setCampaign(campaignResult.data?.[0] || null)
      setClosesAt(toLocalDateTime(campaignResult.data?.[0]?.closes_at || '2026-11-17T23:00:00.000Z'))
      setStudents(studentResult.data || [])
      if (campaignResult.data?.[0]) {
        const { data: photoRows, error: photoRowsError } = await supabase.from('student_photos')
          .select('student_id,category,ordinal')
          .eq('campaign_id', campaignResult.data[0].id)
        if (photoRowsError) setError(photoRowsError.message)
        setPhotoProgress(photoProgressFromRows(photoRows || []))
      }
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    let active = true
    async function loadPhotos() {
      setPhotos([])
      if (!student || !campaign) return
      const { data, error: queryError } = await supabase.from('student_photos')
        .select('id,student_id,category,ordinal,original_path,preview_path,width_px,height_px')
        .eq('student_id', student.id).eq('campaign_id', campaign.id).order('ordinal')
      if (queryError) { if (active) setError(queryError.message); return }
      if (!data?.length) return
      const { data: signed, error: signedError } = await supabase.storage.from('student-previews').createSignedUrls(data.map((item) => item.preview_path), 1800)
      if (active) {
        if (signedError) setError(signedError.message)
        setPhotos(data.map((item, index) => ({ ...item, signedUrl: signed?.[index]?.signedUrl || '' })))
      }
    }
    loadPhotos()
    return () => { active = false }
  }, [student, campaign])

  const filtered = useMemo(() => {
    const value = search.trim().toLocaleLowerCase('es')
    return students.filter((item) => (!course || item.grado === course) && (!value || item.nombre.toLocaleLowerCase('es').includes(value)))
  }, [students, search, course])
  const courses = useMemo(() => [...new Set(students.map((item) => item.grado).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })), [students])

  function selectStudent(item) {
    setStudent(item); setFolderFiles([]); setRetabloFiles([]); setNotice(''); setError('')
  }

  function byFilename(files) {
    return [...files].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' }))
  }

  async function saveCampaignSettings() {
    if (!campaign) return
    const closeDate = closesAt ? new Date(closesAt) : null
    if (!closeDate || Number.isNaN(closeDate.getTime())) {
      setError('Define una fecha y hora de cierre para la selección.')
      return
    }
    setSaving(true); setError(''); setNotice('')
    try {
      let centerPath = campaign.center_image_path
      if (centerFile) {
        if (!centerFile.type.startsWith('image/') || centerFile.size > 10 * 1024 * 1024) throw new Error('El arte debe ser una imagen de máximo 10 MB.')
        const preview = await previewFile(centerFile)
        centerPath = `${campaign.id}/defaults/center.webp`
        const { error: uploadError } = await supabase.storage.from('student-previews').upload(centerPath, preview.blob, { upsert: true, contentType: 'image/webp' })
        if (uploadError) throw uploadError
      }
      const { data, error: updateError } = await supabase.from('photo_campaigns').update({
        opens_at: null,
        closes_at: closeDate?.toISOString() || null,
        center_image_path: centerPath || null,
      }).eq('id', campaign.id).select('id,name,opens_at,closes_at,center_image_path').single()
      if (updateError) throw updateError
      setCampaign(data); setCenterFile(null)
      setNotice('Se guardaron las fechas y el arte central de la campaña.')
    } catch (saveError) {
      setError(`No se pudo guardar la configuración: ${saveError.message}`)
    } finally { setSaving(false) }
  }

  async function exportSelectionReport() {
    if (!campaign) return
    setReporting(true); setError(''); setNotice('')
    try {
      const [selectionResult, photoResult] = await Promise.all([
        supabase.from('photo_selections').select('student_id,product,layout,slot,photo_id').eq('campaign_id', campaign.id),
        supabase.from('student_photos').select('id,student_id,category,ordinal,original_path').eq('campaign_id', campaign.id),
      ])
      if (selectionResult.error) throw selectionResult.error
      if (photoResult.error) throw photoResult.error
      if (!selectionResult.data?.length) {
        setNotice('Aún no hay selecciones guardadas para exportar.')
        return
      }
      const studentById = new Map(students.map((item) => [item.id, item]))
      const photoById = new Map((photoResult.data || []).map((item) => [item.id, item]))
      const rows = selectionResult.data.map((selection) => {
        const person = studentById.get(selection.student_id)
        const photo = photoById.get(selection.photo_id)
        if (!person || !photo) return null
        const globalNumber = photo.category === 'folder' ? photo.ordinal : photo.ordinal + 5
        const studentCode = `${String(person.grado || 'SINCURSO').replace(/[^a-z0-9]/gi, '')}-${String(person.id).padStart(4, '0')}`
        const extension = photo.original_path?.split('.').pop()?.toLowerCase() || 'jpg'
        const dimensions = selection.product === 'folder'
          ? '20 x 30 cm vertical'
          : selection.layout === 2
            ? (person.plan_id === 1 ? '45 x 30 cm horizontal' : '70 x 50 cm horizontal')
            : (person.plan_id === 1 ? '30 x 45 cm vertical' : '50 x 70 cm vertical')
        const layoutName = selection.product === 'folder' ? 'Carpeta' : `Retablo opción ${selection.layout}`
        const fileName = `${studentCode}-${String(globalNumber).padStart(2, '0')}.${extension}`
        return [person.grado, person.id, person.nombre, person.plan_id, layoutName, dimensions, selection.slot, photoPosition(selection), `Foto ${String(globalNumber).padStart(2, '0')}`, fileName, photo.original_path]
      }).filter(Boolean).sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es', { numeric: true }) || String(a[2]).localeCompare(String(b[2]), 'es') || String(a[4]).localeCompare(String(b[4]), 'es') || a[6] - b[6])
      const header = ['Curso', 'ID estudiante', 'Estudiante', 'Plan', 'Producto / diseño', 'Tamaño', 'Posición', 'Ubicación', 'Foto', 'Nombre de archivo sugerido', 'Ruta del original en Storage']
      const csv = '\uFEFF' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `selecciones-fotograficas-${new Date().toISOString().slice(0, 10)}.csv`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice(`Se exportaron ${rows.length} posiciones de foto en el informe CSV.`)
    } catch (reportError) {
      setError(`No se pudo generar el informe: ${reportError.message}`)
    } finally { setReporting(false) }
  }

  async function uploadGroup(category, files, count) {
    const ordered = byFilename(files)
    for (let i = 0; i < ordered.length; i += 1) {
      const file = ordered[i]
      const ext = extOf(file)
      if (!ext || !file.type.startsWith('image/')) throw new Error(`${file.name}: usa JPG, PNG o WebP.`)
      if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name}: el máximo es 10 MB.`)
      const ordinal = i + 1
      const stem = `${campaign.id}/${student.id}/${category}/${String(ordinal).padStart(2, '0')}`
      const originalPath = `${stem}.${ext}`
      const previewPath = `${stem}.webp`
      const prior = photos.find((photo) => photo.category === category && photo.ordinal === ordinal)
      const preview = await previewFile(file)
      const [{ error: originalError }, { error: previewError }] = await Promise.all([
        supabase.storage.from('student-originals').upload(originalPath, file, { upsert: true, contentType: file.type }),
        supabase.storage.from('student-previews').upload(previewPath, preview.blob, { upsert: true, contentType: 'image/webp' }),
      ])
      if (originalError) throw originalError
      if (previewError) throw previewError
      const { error: rowError } = await supabase.from('student_photos').upsert({
        student_id: student.id, campaign_id: campaign.id, category, ordinal,
        original_path: originalPath, preview_path: previewPath,
        width_px: preview.width, height_px: preview.height,
      }, { onConflict: 'student_id,campaign_id,category,ordinal' })
      if (rowError) throw rowError
      if (prior?.original_path && prior.original_path !== originalPath) await supabase.storage.from('student-originals').remove([prior.original_path])
    }
    if (ordered.length !== count) throw new Error(`Debes seleccionar exactamente ${count} fotos.`)
  }

  async function save() {
    if (folderFiles.length !== 5 || retabloFiles.length !== 10) { setError('Selecciona exactamente 5 fotos de carpeta y 10 fotos de retablo.'); return }
    setSaving(true); setError(''); setNotice('')
    try {
      await uploadGroup('folder', folderFiles, 5)
      await uploadGroup('retablo', retabloFiles, 10)
      setNotice(`Se guardaron las 15 fotos de ${student.nombre}. El plan ${student.plan_id} se tomó automáticamente de la base de datos.`)
      setFolderFiles([]); setRetabloFiles([])
      const { data } = await supabase.from('student_photos').select('id,student_id,category,ordinal,original_path,preview_path,width_px,height_px').eq('student_id', student.id).eq('campaign_id', campaign.id).order('ordinal')
      if (data?.length) {
        const { data: signed } = await supabase.storage.from('student-previews').createSignedUrls(data.map((item) => item.preview_path), 1800)
        setPhotos(data.map((item, index) => ({ ...item, signedUrl: signed?.[index]?.signedUrl || '' })))
        setPhotoProgress((current) => ({ ...current, [student.id]: photoProgressFromRows(data)[student.id] || { folder: 0, retablo: 0 } }))
      }
    } catch (saveError) {
      setError(`Carga incompleta: ${saveError.message}. Puedes volver a guardar; los archivos se actualizan por posición.`)
    } finally { setSaving(false) }
  }

  if (loading) return <div className="center-msg">Cargando…</div>
  return <main className="editor-page">
    <header className="editor-topbar"><div className="editor-heading-brand"><BrandLogo variant="header" /><div><p className="overline">PORTAL INDEPENDIENTE</p><h1>Editor de fotografías</h1><p>Los planes se leen automáticamente desde la ficha existente del estudiante.</p></div></div><div className="top-actions"><button className="outline-button" disabled={!campaign || reporting} onClick={exportSelectionReport}>{reporting ? 'Generando informe…' : 'Descargar informe CSV'}</button><Link to="/" className="outline-button">Inicio</Link><button className="outline-button" onClick={signOut}>Salir</button></div></header>
    {error && <div className="editor-alert error-alert">{error}</div>}{notice && <div className="editor-alert success-alert">{notice}</div>}
    {campaign && <section className="campaign-settings"><div><p className="overline">CAMPAÑA ACTIVA</p><h2>Cierre y arte central</h2><p>La selección está abierta desde ahora y cierra el martes 17 de noviembre a las 6:00 p. m. (hora Colombia). El plan se toma automáticamente de la ficha del estudiante.</p></div><div className="campaign-settings-fields"><label>Fecha y hora de cierre<input type="datetime-local" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} /></label><label>Imagen central de la carpeta<input type="file" accept="image/*" onChange={(event) => setCenterFile(event.target.files?.[0] || null)} /><small>{centerFile?.name || (campaign.center_image_path ? 'Ya hay una imagen central cargada.' : 'Opcional; puedes agregarla cuando tengas el arte.')}</small></label><button className="gold-button" disabled={saving} onClick={saveCampaignSettings}>{saving ? 'Guardando…' : 'Guardar configuración'}</button></div></section>}
    <div className="editor-layout"><aside className="editor-roster"><label>Filtrar por curso<select value={course} onChange={(event) => setCourse(event.target.value)}><option value="">Todos los cursos</option>{courses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Buscar por nombre<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre del estudiante" /></label><p className="roster-count">{filtered.length} estudiantes</p><div className="roster-list">{filtered.map((item) => { const progress = photoProgress[item.id] || { folder: 0, retablo: 0 }; const complete = progress.folder === 5 && progress.retablo === 10; return <button key={item.id} className={`roster-item ${student?.id === item.id ? 'selected' : ''}`} onClick={() => selectStudent(item)}><b>{item.nombre}</b><span>{item.grado} · Plan {item.plan_id}</span><small className={`roster-photo-status ${complete ? 'complete' : ''}`}>{complete ? '✓ Fotos listas' : `${progress.folder + progress.retablo}/15 fotos`}</small></button> })}{!filtered.length && <p>No hay estudiantes con Plan 1 o Plan 2 en este curso.</p>}</div></aside>
      <section className="editor-workspace">{!student ? <div className="editor-empty"><h2>Selecciona un estudiante</h2><p>Plan 3 se excluye automáticamente. No necesitas asignar planes al cargar fotos.</p></div> : <>
        <div className="selected-student"><div><span>{student.grado} · Plan {student.plan_id}</span><h2>{student.nombre}</h2></div><div className="measure-list"><span>Carpeta · 20 × 30 cm vertical</span><span>Retablo · {student.plan_id === 1 ? '30 × 45' : '50 × 70'} cm vertical</span></div></div>
        {!campaign && <div className="editor-alert error-alert">No hay campaña configurada.</div>}
        <PhotoGroup title="Fotos para carpeta" category="folder" count={5} files={folderFiles} setFiles={setFolderFiles} current={photos} />
        <PhotoGroup title="Fotos para retablo" category="retablo" count={10} files={retabloFiles} setFiles={setRetabloFiles} current={photos} />
        <div className="editor-save-row"><p>Los archivos se ordenan por nombre. Nombra cada serie como 01, 02, 03…</p><button className="gold-button" disabled={!campaign || saving || folderFiles.length !== 5 || retabloFiles.length !== 10} onClick={save}>{saving ? 'Subiendo fotos…' : 'Guardar 15 fotos'}</button></div>
      </>}</section>
    </div>
  </main>
}

function PhotoGroup({ title, category, count, files, setFiles, current }) {
  const existing = current.filter((item) => item.category === category)
  return <section className="upload-group"><div className="upload-group-heading"><div><h3>{title}</h3><p>Sube exactamente {count} imágenes. JPG, PNG o WebP; máximo 10 MB cada una.</p></div><strong>{existing.length}/{count} guardadas</strong></div><div className={`editor-thumbnails ${count === 10 ? 'ten-thumbs' : ''}`}>{Array.from({ length: count }, (_, index) => { const photo = existing.find((item) => item.ordinal === index + 1); return <div className="editor-thumb" key={index}>{photo?.signedUrl ? <img src={photo.signedUrl} alt={`${title} ${index + 1}`} /> : <span>{String(index + 1).padStart(2, '0')}</span>}<small>{category === 'folder' ? 'Carpeta' : 'Retablo'} {index + 1}</small></div> })}</div><label className="select-files">Seleccionar {count} fotos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} />{files.length > 0 && <small>{files.length} seleccionadas: {files.map((file) => file.name).sort((a,b) => a.localeCompare(b, 'es', {numeric:true})).join(', ')}</small>}</label></section>
}
