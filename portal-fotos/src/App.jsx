import { useMemo, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import EditorRoute from './components/EditorRoute'
import UnifiedLogin from './pages/UnifiedLogin'
import PhotoEditor from './pages/PhotoEditor'
import BrandLogo from './components/BrandLogo'

const folderPhotos = Array.from({ length: 5 }, (_, index) => index + 1)
const retabloPhotos = Array.from({ length: 10 }, (_, index) => index + 1)
const layouts = [
  { id: 1, title: 'Un retrato', count: 1, desc: 'Una foto protagonista' },
  { id: 2, title: 'Díptico', count: 2, desc: 'Dos fotos en composición' },
  { id: 3, title: 'Composición', count: 4, desc: 'Cuatro fotos en retablo' },
]

function PhotoTile({ number, selected, disabled, onClick }) {
  return <button className={`photo-choice ${selected ? 'is-selected' : ''}`} disabled={disabled} onClick={onClick}>
    <span className={`photo-art art-${(number % 5) + 1}`}><i /></span>
    <span className="photo-choice-caption">Foto {String(number).padStart(2, '0')}</span>
    {selected && <span className="selected-mark">✓</span>}
  </button>
}

function MockupStudentPortal() {
  const plan = 2
  const [step, setStep] = useState(1)
  const [folderChosen, setFolderChosen] = useState([])
  const [retabloLayout, setRetabloLayout] = useState(1)
  const [retabloChosen, setRetabloChosen] = useState([])
  const [saved, setSaved] = useState(false)
  const allowedLayouts = plan === 1 ? layouts.slice(0, 2) : layouts
  const selectedLayout = allowedLayouts.find((layout) => layout.id === retabloLayout) || allowedLayouts[0]
  const retabloSize = plan === 1 ? '30 × 45 cm' : '50 × 70 cm'

  const toggle = (items, setItems, number, max) => {
    setSaved(false)
    setItems((current) => current.includes(number)
      ? current.filter((item) => item !== number)
      : current.length < max ? [...current, number] : current)
  }

  const canContinue = folderChosen.length === 2
  const canSave = folderChosen.length === 2 && retabloChosen.length === selectedLayout.count
  const retabloPreviewSlots = useMemo(() => Array.from({ length: selectedLayout.count }, (_, i) => retabloChosen[i]), [selectedLayout.count, retabloChosen])

  return <div className="portal-shell">
    <header className="portal-header">
      <a className="brand" href="#inicio"><BrandLogo variant="header" /></a>
      <div className="header-status"><span className="status-dot" /> Vista de diseño · datos de muestra</div>
      <Link className="editor-entry-link" to="/editor/login">Acceso editor</Link>
      <button className="avatar-button" aria-label="Perfil del estudiante">JP</button>
    </header>

    <main className="portal-main" id="inicio">
      <section className="welcome-row">
        <div><p className="overline">PORTAL DE SELECCIÓN · PROMOCIÓN</p><h1>Hola, Juan</h1><p className="welcome-copy">Elige tus fotos con calma. Podrás revisar y cambiar tu selección hasta la fecha límite.</p></div>
        <div className="plan-card"><small>Plan asignado</small><strong>Plan {plan}</strong><span>Grupo 1101</span><small className="plan-auto-note">Se determina al iniciar sesión</small></div>
      </section>

      <nav className="step-nav" aria-label="Pasos de selección">
        <button className={step === 1 ? 'active' : folderChosen.length === 2 ? 'complete' : ''} onClick={() => setStep(1)}><span>01</span><b>Carpeta</b><small>Elige 2 de 5 fotos</small></button>
        <div className="step-connector" />
        <button className={step === 2 ? 'active' : canContinue && retabloChosen.length ? 'complete' : ''} onClick={() => canContinue && setStep(2)}><span>02</span><b>Retablo</b><small>Elige diseño y fotos</small></button>
        <div className="step-connector" />
        <div className="step-final"><span>03</span><b>Confirmar</b><small>Revisa antes de guardar</small></div>
      </nav>

      {step === 1 ? <section className="selection-section">
        <div className="section-heading"><div><p className="overline">PRODUCTO 1 · CARPETA</p><h2>Selecciona 2 fotos</h2><p>Elige dos de tus cinco fotos. La del centro ya viene incluida.</p></div><span className="counter">{folderChosen.length} <small>/ 2 elegidas</small></span></div>
        <div className="folder-workspace">
          <div className="photo-grid five-grid">{folderPhotos.map((number) => <PhotoTile key={number} number={number} selected={folderChosen.includes(number)} disabled={!folderChosen.includes(number) && folderChosen.length === 2} onClick={() => toggle(folderChosen, setFolderChosen, number, 2)} />)}</div>
          <div className="live-preview-card"><div className="preview-card-heading"><div><strong>Así se verá tu carpeta</strong><span>3 cuadros · 20 × 30 cm cada uno</span></div><span className="live-pill">VISTA PREVIA</span></div>
            <div className="folder-preview">
              <div className="preview-frame">{folderChosen[0] ? <span className={`photo-art art-${(folderChosen[0] % 5) + 1}`}><i /></span> : <span className="empty-frame">Tu foto</span>}</div>
              <div className="preview-frame center-frame"><span className="center-art"><b>S</b><small>PROM 2026</small></span></div>
              <div className="preview-frame">{folderChosen[1] ? <span className={`photo-art art-${(folderChosen[1] % 5) + 1}`}><i /></span> : <span className="empty-frame">Tu foto</span>}</div>
            </div>
            <div className="preview-caption"><span>Vertical · sin recorte manual</span><span>Vista referencial</span></div>
          </div>
        </div>
        <div className="section-footer"><span>{canContinue ? '¡Listo! Ya elegiste tus dos fotos.' : `Te falta${folderChosen.length === 1 ? ' una' : 'n dos'} foto${folderChosen.length === 1 ? '' : 's'}.`}</span><button className="primary-button" disabled={!canContinue} onClick={() => setStep(2)}>Continuar al retablo <span>→</span></button></div>
      </section> : <section className="selection-section">
        <div className="section-heading"><div><p className="overline">PRODUCTO 2 · RETABLO</p><h2>Escoge tu composición</h2><p>Elige un diseño y completa los espacios con fotos distintas.</p></div><span className="size-chip">{retabloSize} · vertical</span></div>
        <div className="layout-options">{allowedLayouts.map((layout) => <button key={layout.id} className={`layout-option ${retabloLayout === layout.id ? 'selected' : ''}`} onClick={() => { setRetabloLayout(layout.id); setRetabloChosen([]); setSaved(false) }}><span className={`layout-icon layout-${layout.id}`}><i /><i /><i /><i /></span><span><b>Opción {layout.id}</b><small>{layout.title} · {layout.desc}</small></span><span className="radio-dot" /></button>)}</div>
        <div className="retablo-workspace"><div className="retablo-photo-pool"><div className="pool-heading"><b>Elige {selectedLayout.count} {selectedLayout.count === 1 ? 'foto' : 'fotos'}</b><span>{retabloChosen.length}/{selectedLayout.count}</span></div><div className="photo-grid retablo-pool-grid">{retabloPhotos.map((number) => <PhotoTile key={number} number={number + 5} selected={retabloChosen.includes(number)} disabled={!retabloChosen.includes(number) && retabloChosen.length === selectedLayout.count} onClick={() => toggle(retabloChosen, setRetabloChosen, number, selectedLayout.count)} />)}</div></div>
          <div className="live-preview-card retablo-preview-card"><div className="preview-card-heading"><div><strong>Vista previa del retablo</strong><span>Opción {selectedLayout.id} · {retabloSize}</span></div><span className="live-pill">VISTA PREVIA</span></div><div className={`retablo-preview layout-preview-${selectedLayout.count}`}>{retabloPreviewSlots.map((number, index) => <div className="retablo-preview-frame" key={index}>{number ? <span className={`photo-art art-${((number + 5) % 5) + 1}`}><i /></span> : <span className="empty-frame">Foto {index + 1}</span>}</div>)}</div><div className="preview-caption"><span>Sin repetir fotos de la carpeta</span><span>Vista referencial</span></div></div>
        </div>
        <div className="section-footer"><button className="text-button" onClick={() => setStep(1)}>← Volver a carpeta</button><button className="primary-button" disabled={!canSave} onClick={() => setSaved(true)}>Guardar selección <span>✓</span></button></div>
        {saved && <div className="saved-message">Selección guardada en esta demostración. En el portal real podrás editarla hasta la fecha límite.</div>}
      </section>}
      <footer className="portal-footer"><span>Tu selección se guarda de forma privada.</span><span>¿Necesitas ayuda? Contacta al editor de fotografía.</span></footer>
    </main>
  </div>
}

export default function App() {
  return <AuthProvider><BrowserRouter><Routes>
    <Route path="/" element={<UnifiedLogin />} />
    <Route path="/editor/login" element={<Navigate to="/" replace />} />
    <Route path="/estudiante/login" element={<Navigate to="/" replace />} />
    <Route path="/seleccion" element={<StudentAccessPending />} />
    <Route path="/vista-demo" element={<MockupStudentPortal />} />
    <Route path="/editor/fotos" element={<EditorRoute><PhotoEditor /></EditorRoute>} />
  </Routes></BrowserRouter></AuthProvider>
}

function StudentAccessPending() {
  return <main className="login-choices-page"><section className="login-choices-card"><span className="portal-mark">S</span><p className="overline">ACCESO ESTUDIANTES</p><h1>Estamos preparando tus fotos</h1><p className="choice-intro">La selección real se habilitará cuando terminemos de conectar tus credenciales y tu colección privada.</p><Link className="choice-card" to="/vista-demo"><span><b>Ver cómo funcionará</b><small>Abrir demostración visual</small></span><span className="choice-arrow">→</span></Link><Link className="demo-link" to="/">Volver al inicio</Link></section></main>
}

