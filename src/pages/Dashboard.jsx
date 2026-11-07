import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { parseExcelFile } from '../utils/excelImport'
import { useAuth } from '../context/AuthContext'

const GRADOS = ['1101', '1102', '1103', '1104', '1105','CLEI','PFC']

export default function Dashboard() {
  const { signOut } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const filtroGrado = searchParams.get('grado') || ''

  const [estudiantes, setEstudiantes] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [gradoExcel, setGradoExcel] = useState('1101')
  const [perfilVisible, setPerfilVisible] = useState(null)

  const setFiltroGrado = (valor) => {
    setSearchParams(valor ? { grado: valor } : {})
  }

  const cargarEstudiantes = async () => {
    let query = supabase
      .from('estudiantes')
      .select('*, comprobantes(enviado_whatsapp, fecha_emision)')
      .order('nombre')
      .order('fecha_emision', { foreignTable: 'comprobantes', ascending: false })

    if (filtroGrado) query = query.eq('grado', filtroGrado)
    if (busqueda.trim()) query = query.ilike('nombre', `%${busqueda.trim()}%`)

    const { data, error } = await query
    if (!error) setEstudiantes(data)
  }

  // Estado del envío por WhatsApp según el comprobante más reciente del estudiante
  const estadoWhatsapp = (est) => {
    const comprobantes = est.comprobantes || []
    if (comprobantes.length === 0) return 'sin_comprobante'
    return comprobantes[0].enviado_whatsapp ? 'enviado' : 'pendiente'
  }

  useEffect(() => {
    cargarEstudiantes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroGrado])

  useEffect(() => {
    const timeout = setTimeout(cargarEstudiantes, 300) // debounce de búsqueda
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda])

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setCargando(true)
    setMensaje('')
    try {
      const filas = await parseExcelFile(file, gradoExcel)

      if (filas.length === 0) {
        setMensaje('No se encontraron estudiantes en el archivo. Verifica que exista una columna "nombre".')
        setCargando(false)
        return
      }

      const registros = filas.map((f) => ({
        nombre: f.nombre,
        grado: f.grado || gradoExcel,
      }))

      const { error } = await supabase.from('estudiantes').insert(registros)

      if (error) {
        setMensaje(`Error al guardar: ${error.message}`)
      } else {
        setMensaje(`Se cargaron ${registros.length} estudiantes del grupo ${gradoExcel}.`)
        cargarEstudiantes()
      }
    } catch (err) {
      setMensaje(`Error leyendo el archivo: ${err.message}`)
    } finally {
      setCargando(false)
      e.target.value = ''
    }
  }

  const fmt = (n) =>
    n ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n) : '-'

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">Sisa Productions</span>
          <h1>Panel Prom — Grado 11</h1>
        </div>
        <div className="header-actions">
          <Link to="/reportes" className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Reportes de caja
          </Link>
          <button className="btn-secondary" onClick={signOut}>Cerrar sesión</button>
        </div>
      </header>

      <section className="upload-section">
        <h2>Cargar lista de estudiantes (Excel)</h2>
        <div className="upload-controls">
          <select value={gradoExcel} onChange={(e) => setGradoExcel(e.target.value)}>
            {GRADOS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} disabled={cargando} />
        </div>
        <p className="hint">
          El archivo debe tener una columna con el nombre del estudiante (ej: "Nombre"). Selecciona el grupo antes de subir el archivo de ese grupo.
        </p>
        {mensaje && <p className="msg">{mensaje}</p>}
      </section>

      <section className="filters-section">
        <input
          type="text"
          placeholder="Buscar estudiante por nombre..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="search-input"
        />
        <select value={filtroGrado} onChange={(e) => setFiltroGrado(e.target.value)}>
          <option value="">Todos los grupos</option>
          {GRADOS.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </section>

      <table className="students-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Grupo</th>
            <th>Plan</th>
            <th>Abonado</th>
            <th>Estado</th>
            <th>WhatsApp</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {estudiantes.map((est) => {
            const whatsapp = estadoWhatsapp(est)
            return (
            <tr key={est.id}>
              <td>{est.nombre}</td>
              <td>{est.grado}</td>
              <td>{est.plan_id ? `Plan ${est.plan_id}` : '-'}</td>
              <td>{fmt(est.monto_abonado)}</td>
              <td>
                <span className={`badge ${est.pago_completo ? 'badge-ok' : 'badge-pending'}`}>
                  {est.pago_completo ? 'Pago completo' : 'Pendiente'}
                </span>
              </td>
              <td>
                {whatsapp === 'enviado' && <span className="badge badge-ok">Enviado</span>}
                {whatsapp === 'pendiente' && <span className="badge badge-pending">Pendiente</span>}
                {whatsapp === 'sin_comprobante' && <span className="badge badge-neutral">Sin comprobante</span>}
              </td>
              <td>
                <div className="row-actions">
                  <button className="btn-icon" onClick={() => setPerfilVisible(est)}>Perfil</button>
                  <Link
                    to={`/estudiante/${est.id}${filtroGrado ? `?volver=${filtroGrado}` : ''}`}
                    className="btn-link"
                  >
                    Editar
                  </Link>
                </div>
              </td>
            </tr>
            )
          })}
          {estudiantes.length === 0 && (
            <tr>
              <td colSpan={7} className="empty-row">No hay estudiantes que coincidan.</td>
            </tr>
          )}
        </tbody>
      </table>

      {perfilVisible && (
        <div className="modal-overlay" onClick={() => setPerfilVisible(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setPerfilVisible(null)}>&times;</button>
            <h2>{perfilVisible.nombre}</h2>
            <p className="modal-grado">Grupo {perfilVisible.grado}</p>

            <div className="modal-field">
              <span>Padre/acudiente</span>
              <p>{perfilVisible.nombre_padre || 'Sin registrar'}</p>
            </div>
            <div className="modal-field">
              <span>Teléfono</span>
              <p>{perfilVisible.telefono || 'Sin registrar'}</p>
            </div>
            <div className="modal-field">
              <span>Correo electrónico</span>
              <p>{perfilVisible.correo || 'Sin registrar'}</p>
            </div>
            <div className="modal-field">
              <span>Estado de pago</span>
              <p>{fmt(perfilVisible.monto_abonado)} de {fmt(perfilVisible.monto_total)}</p>
            </div>

            <div className="modal-actions">
              <Link
                to={`/estudiante/${perfilVisible.id}${filtroGrado ? `?volver=${filtroGrado}` : ''}`}
                className="btn-primary"
                style={{ textDecoration: 'none', display: 'inline-block' }}
              >
                Editar datos
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}