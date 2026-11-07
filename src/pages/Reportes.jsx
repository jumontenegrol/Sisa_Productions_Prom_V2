import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const fmt = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)

// Convierte una fecha a la clave YYYY-MM-DD usando la hora LOCAL del navegador
// (evita que un pago de las 7pm quede contado en el día siguiente por UTC)
const claveDia = (fechaISO) => {
  const d = new Date(fechaISO)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function Reportes() {
  const [comprobantes, setComprobantes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [diaSeleccionado, setDiaSeleccionado] = useState(claveDia(new Date().toISOString()))

  useEffect(() => {
    const cargar = async () => {
      setCargando(true)
      // Trae comprobantes con el nombre y grupo del estudiante asociado
      const { data, error } = await supabase
        .from('comprobantes')
        .select('id, monto_pagado, fecha_emision, numero_comprobante, estudiante_id, estudiantes(nombre, grado)')
        .order('fecha_emision', { ascending: false })

      if (!error && data) setComprobantes(data)
      setCargando(false)
    }
    cargar()
  }, [])

  // Agrupa todos los comprobantes por día
  const porDia = useMemo(() => {
    const grupos = {}
    for (const c of comprobantes) {
      const clave = claveDia(c.fecha_emision)
      if (!grupos[clave]) grupos[clave] = []
      grupos[clave].push(c)
    }
    return grupos
  }, [comprobantes])

  const diasOrdenados = useMemo(
    () => Object.keys(porDia).sort((a, b) => b.localeCompare(a)),
    [porDia]
  )

  const totalGeneral = comprobantes.reduce((acc, c) => acc + Number(c.monto_pagado), 0)
  const pagosDelDia = porDia[diaSeleccionado] || []
  const totalDelDia = pagosDelDia.reduce((acc, c) => acc + Number(c.monto_pagado), 0)

  const formatearEtiquetaDia = (clave) => {
    const [y, m, d] = clave.split('-')
    const fecha = new Date(Number(y), Number(m) - 1, Number(d))
    return fecha.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  if (cargando) return <div className="center-msg">Cargando...</div>

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">Sisa Productions</span>
          <h1>Reportes de caja</h1>
        </div>
        <Link to="/" className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-block' }}>
          Volver al panel
        </Link>
      </header>

      <section className="filters-section" style={{ gap: '1.5rem' }}>
        <div className="modal-field" style={{ margin: 0 }}>
          <span>Total recaudado (histórico)</span>
          <p style={{ fontSize: '1.4rem', color: 'var(--gold)', fontFamily: 'var(--font-display)' }}>
            {fmt(totalGeneral)}
          </p>
        </div>
        <div className="modal-field" style={{ margin: 0 }}>
          <span>Comprobantes emitidos</span>
          <p style={{ fontSize: '1.4rem' }}>{comprobantes.length}</p>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1.2rem', marginTop: '1.2rem' }}>
        <section className="upload-section" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <h2 style={{ fontSize: '1rem' }}>Días con movimiento</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0.8rem 0 0' }}>
            {diasOrdenados.map((dia) => {
              const totalEseDia = porDia[dia].reduce((acc, c) => acc + Number(c.monto_pagado), 0)
              const esHoy = dia === claveDia(new Date().toISOString())
              return (
                <li key={dia} style={{ marginBottom: '0.4rem' }}>
                  <button
                    onClick={() => setDiaSeleccionado(dia)}
                    className="btn-icon"
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      borderColor: dia === diaSeleccionado ? 'var(--gold)' : undefined,
                      color: dia === diaSeleccionado ? 'var(--gold)' : undefined,
                    }}
                  >
                    {dia}{esHoy ? ' (hoy)' : ''} — {fmt(totalEseDia)}
                  </button>
                </li>
              )
            })}
            {diasOrdenados.length === 0 && <p className="hint">Aún no hay comprobantes registrados.</p>}
          </ul>
        </section>

        <section className="upload-section">
          <h2 style={{ textTransform: 'capitalize' }}>{formatearEtiquetaDia(diaSeleccionado)}</h2>
          <p className="hint">{pagosDelDia.length} pago(s) este día</p>

          <table className="students-table" style={{ marginTop: '1rem' }}>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Estudiante</th>
                <th>Grupo</th>
                <th>Comprobante</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {pagosDelDia.map((c) => (
                <tr key={c.id}>
                  <td>{new Date(c.fecha_emision).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{c.estudiantes?.nombre || '—'}</td>
                  <td>{c.estudiantes?.grado || '—'}</td>
                  <td>{c.numero_comprobante}</td>
                  <td>{fmt(c.monto_pagado)}</td>
                </tr>
              ))}
              {pagosDelDia.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-row">No hay pagos registrados este día.</td>
                </tr>
              )}
            </tbody>
            {pagosDelDia.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ fontWeight: 700, textAlign: 'right' }}>Total del día</td>
                  <td style={{ fontWeight: 700, color: 'var(--gold)' }}>{fmt(totalDelDia)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </section>
      </div>
    </div>
  )
}
