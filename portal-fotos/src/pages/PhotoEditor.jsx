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
  const [campaign, setCampaign] = useState(null)
  const [student, setStudent] = useState(null)
  const [search, setSearch] = useState('')
  const [course, setCourse] = useState('')
  const [photos, setPhotos] = useState([])
  const [folderFiles, setFolderFiles] = useState([])
  const [retabloFiles, setRetabloFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      if (!supabase) { setError('Configura las variables de Supabase en portal-fotos/.env.'); setLoading(false); return }
      const [campaignResult, studentResult] = await Promise.all([
        supabase.from('photo_campaigns').select('id,name,opens_at,closes_at').order('created_at', { ascending: false }).limit(1),
        supabase.from('estudiantes').select('id,nombre,grado,plan_id').in('plan_id', [1, 2]).order('nombre'),
      ])
      if (campaignResult.error || studentResult.error) setError(campaignResult.error?.message || studentResult.error?.message)
      setCampaign(campaignResult.data?.[0] || null)
      setStudents(studentResult.data || [])
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
        .select('id,category,ordinal,original_path,preview_path,width_px,height_px')
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
      const { data } = await supabase.from('student_photos').select('id,category,ordinal,original_path,preview_path,width_px,height_px').eq('student_id', student.id).eq('campaign_id', campaign.id).order('ordinal')
      if (data?.length) {
        const { data: signed } = await supabase.storage.from('student-previews').createSignedUrls(data.map((item) => item.preview_path), 1800)
        setPhotos(data.map((item, index) => ({ ...item, signedUrl: signed?.[index]?.signedUrl || '' })))
      }
    } catch (saveError) {
      setError(`Carga incompleta: ${saveError.message}. Puedes volver a guardar; los archivos se actualizan por posición.`)
    } finally { setSaving(false) }
  }

  if (loading) return <div className="center-msg">Cargando…</div>
  return <main className="editor-page">
    <header className="editor-topbar"><div className="editor-heading-brand"><BrandLogo variant="header" /><div><p className="overline">PORTAL INDEPENDIENTE</p><h1>Editor de fotografías</h1><p>Los planes se leen automáticamente desde la ficha existente del estudiante.</p></div></div><div className="top-actions"><Link to="/" className="outline-button">Inicio</Link><button className="outline-button" onClick={signOut}>Salir</button></div></header>
    {error && <div className="editor-alert error-alert">{error}</div>}{notice && <div className="editor-alert success-alert">{notice}</div>}
    <div className="editor-layout"><aside className="editor-roster"><label>Filtrar por curso<select value={course} onChange={(event) => setCourse(event.target.value)}><option value="">Todos los cursos</option>{courses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Buscar por nombre<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre del estudiante" /></label><p className="roster-count">{filtered.length} estudiantes</p><div className="roster-list">{filtered.map((item) => <button key={item.id} className={`roster-item ${student?.id === item.id ? 'selected' : ''}`} onClick={() => selectStudent(item)}><b>{item.nombre}</b><span>{item.grado} · Plan {item.plan_id}</span></button>)}{!filtered.length && <p>No hay estudiantes con Plan 1 o Plan 2 en este curso.</p>}</div></aside>
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
