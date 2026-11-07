import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { generarComprobantePDF } from '../utils/pdfGenerator'

export default function StudentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const grupoOrigen = searchParams.get('volver')
  const linkVolver = grupoOrigen ? `/?grado=${grupoOrigen}` : '/'

  const [estudiante, setEstudiante] = useState(null)
  const [planes, setPlanes] = useState([])
  const [comprobantes, setComprobantes] = useState([])

  const [form, setForm] = useState({
    nombre_padre: '',
    telefono: '',
    correo: '',
    plan_id: '',
    monto_abonado: '',
    pago_completo: false,
  })

  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [errorAbono, setErrorAbono] = useState('')

  const fmt = (n) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)

  const cargarDatos = async () => {
    const [{ data: est }, { data: pls }, { data: comps }] = await Promise.all([
      supabase.from('estudiantes').select('*').eq('id', id).single(),
      supabase.from('planes').select('*').order('id'),
      supabase.from('comprobantes').select('*').eq('estudiante_id', id).order('fecha_emision', { ascending: false }),
    ])

    if (est) {
      setEstudiante(est)
      setForm({
        nombre_padre: est.nombre_padre || '',
        telefono: est.telefono || '',
        correo: est.correo || '',
        plan_id: est.plan_id || '',
        monto_abonado: est.monto_abonado || '',
        pago_completo: est.pago_completo || false,
      })
    }
    if (pls) setPlanes(pls)
    if (comps) setComprobantes(comps)
  }

  useEffect(() => {
    cargarDatos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const planSeleccionado = planes.find((p) => p.id === Number(form.plan_id))
  const montoTotal = planSeleccionado ? Number(planSeleccionado.monto) : 0
  const minimoRequerido = montoTotal * 0.5

  const handleChange = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }))
    setErrorAbono('')
  }

  const validarAbono = () => {
    const abonado = Number(form.monto_abonado || 0)
    if (form.pago_completo) return true
    if (montoTotal > 0 && abonado < minimoRequerido) {
      setErrorAbono(
        `El abono debe ser de mínimo el 50% del total (${new Intl.NumberFormat('es-CO', {
          style: 'currency', currency: 'COP', maximumFractionDigits: 0
        }).format(minimoRequerido)}), o marca "Pago completo".`
      )
      return false
    }
    return true
  }

  const guardarCambios = async () => {
    if (!validarAbono()) return

    setGuardando(true)
    setMensaje('')

    const abonadoFinal = form.pago_completo ? montoTotal : Number(form.monto_abonado || 0)

    const { error } = await supabase
      .from('estudiantes')
      .update({
        nombre_padre: form.nombre_padre,
        telefono: form.telefono,
        correo: form.correo,
        plan_id: form.plan_id || null,
        monto_total: montoTotal,
        monto_abonado: abonadoFinal,
        pago_completo: form.pago_completo,
      })
      .eq('id', id)

    setGuardando(false)

    if (error) {
      setMensaje(`Error al guardar: ${error.message}`)
    } else {
      setMensaje('Datos guardados correctamente.')
      cargarDatos()
    }
  }

  const generarComprobante = async () => {
    if (!validarAbono()) return
    if (!planSeleccionado) {
      setMensaje('Selecciona un plan antes de generar el comprobante.')
      return
    }

    const abonadoFinal = form.pago_completo ? montoTotal : Number(form.monto_abonado || 0)

    // El "último acumulado" se toma del comprobante más reciente (no del campo
    // monto_abonado del estudiante), para que el incremento sea correcto sin
    // importar cuántas veces se haya dado "Guardar cambios" antes de emitir.
    const ultimoAcumulado = comprobantes.length > 0 ? Number(comprobantes[0].monto_abonado_acumulado) : 0
    const incremento = abonadoFinal - ultimoAcumulado

    if (incremento < 0) {
      setMensaje(
        `El monto abonado (${fmt(abonadoFinal)}) es menor al ya registrado en el último comprobante (${fmt(ultimoAcumulado)}). Revisa el valor antes de generar uno nuevo.`
      )
      return
    }

    if (incremento === 0) {
      setMensaje(
        'No hay un abono nuevo respecto al último comprobante emitido, así que no se generó uno duplicado. Si necesitas el PDF de nuevo, usa "Volver a descargar" en el historial.'
      )
      return
    }

    // Guarda primero los cambios pendientes
    await guardarCambios()

    const numeroComprobante = `${estudiante.grado}-${id}-${Date.now().toString().slice(-6)}`

    const { error } = await supabase.from('comprobantes').insert({
      estudiante_id: id,
      monto_pagado: incremento,
      monto_abonado_acumulado: abonadoFinal,
      numero_comprobante: numeroComprobante,
    })

    if (error) {
      setMensaje(`Error al registrar comprobante: ${error.message}`)
      return
    }

    generarComprobantePDF({
      numeroComprobante,
      fecha: new Date().toLocaleDateString('es-CO'),
      estudiante,
      nombrePadre: form.nombre_padre,
      telefono: form.telefono,
      correo: form.correo,
      plan: planSeleccionado.nombre,
      montoTotal,
      montoPagado: incremento,
      montoAbonadoAcumulado: abonadoFinal,
      saldoPendiente: Math.max(montoTotal - abonadoFinal, 0),
    })

    cargarDatos()
  }

  const redescargarComprobante = (c) => {
    if (!planSeleccionado) {
      setMensaje('Selecciona el plan del estudiante para poder regenerar el PDF.')
      return
    }
    generarComprobantePDF({
      numeroComprobante: c.numero_comprobante,
      fecha: new Date(c.fecha_emision).toLocaleDateString('es-CO'),
      estudiante,
      nombrePadre: form.nombre_padre,
      telefono: form.telefono,
      correo: form.correo,
      plan: planSeleccionado.nombre,
      montoTotal,
      montoPagado: c.monto_pagado,
      montoAbonadoAcumulado: c.monto_abonado_acumulado,
      saldoPendiente: Math.max(montoTotal - c.monto_abonado_acumulado, 0),
    })
  }

  const marcarEnviadoWhatsapp = async (comprobanteId) => {
    const { error } = await supabase
      .from('comprobantes')
      .update({
        enviado_whatsapp: true,
        fecha_envio_whatsapp: new Date().toISOString(),
      })
      .eq('id', comprobanteId)

    if (error) {
      setMensaje(`Error al marcar el envío: ${error.message}`)
      return
    }
    cargarDatos()
  }

  if (!estudiante) return <div className="center-msg">Cargando...</div>

  return (
    <div className="student-detail">
      <Link to={linkVolver} className="back-link">&larr; Volver al panel</Link>
      <h1>{estudiante.nombre}</h1>
      <p className="subtitle">Grupo {estudiante.grado}</p>

      <div className="form-grid">
        <label>
          Nombre del padre/acudiente
          <input
            value={form.nombre_padre}
            onChange={(e) => handleChange('nombre_padre', e.target.value)}
          />
        </label>

        <label>
          Teléfono
          <input
            value={form.telefono}
            onChange={(e) => handleChange('telefono', e.target.value)}
          />
        </label>

        <label>
          Correo electrónico
          <input
            type="email"
            value={form.correo}
            onChange={(e) => handleChange('correo', e.target.value)}
          />
        </label>

        <label>
          Plan
          <select value={form.plan_id} onChange={(e) => handleChange('plan_id', e.target.value)}>
            <option value="">Selecciona un plan</option>
            {planes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} — {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(p.monto)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Monto abonado
          <input
            type="number"
            value={form.monto_abonado}
            onChange={(e) => handleChange('monto_abonado', e.target.value)}
            disabled={form.pago_completo}
          />
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.pago_completo}
            onChange={(e) => handleChange('pago_completo', e.target.checked)}
          />
          Pago completo (100%)
        </label>
      </div>

      {errorAbono && <p className="error-msg">{errorAbono}</p>}
      {mensaje && <p className="msg">{mensaje}</p>}

      <div className="actions">
        <button className="btn-secondary" onClick={guardarCambios} disabled={guardando}>
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <button className="btn-primary" onClick={generarComprobante} disabled={guardando}>
          Generar comprobante de pago (PDF)
        </button>
      </div>

      {comprobantes.length > 0 && (
        <section className="history-section">
          <h2>Historial de comprobantes</h2>
          <ul>
            {comprobantes.map((c) => (
              <li key={c.id} className="history-item">
                <span>
                  #{c.numero_comprobante} — {new Date(c.fecha_emision).toLocaleDateString('es-CO')} —{' '}
                  {fmt(c.monto_pagado)} <span className="hint">(abonado a la fecha: {fmt(c.monto_abonado_acumulado)})</span>
                </span>
                <div className="row-actions">
                  <button className="btn-icon" onClick={() => redescargarComprobante(c)}>
                    Volver a descargar
                  </button>
                  {c.enviado_whatsapp ? (
                    <span className="badge badge-ok">
                      Enviado {c.fecha_envio_whatsapp ? `el ${new Date(c.fecha_envio_whatsapp).toLocaleDateString('es-CO')}` : ''}
                    </span>
                  ) : (
                    <button className="btn-icon" onClick={() => marcarEnviadoWhatsapp(c.id)}>
                      Confirmar envío por WhatsApp
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}