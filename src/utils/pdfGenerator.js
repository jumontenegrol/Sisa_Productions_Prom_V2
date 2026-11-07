import jsPDF from 'jspdf'
import { LOGO_SISA_BLANCO } from './logoBase64'

/**
 * Genera un PDF de "Comprobante de pago" (NO es una factura de venta / no requiere
 * facturación electrónica DIAN). Ajusta EMISOR_* con tus datos reales.
 */
const EMISOR_NIT = 'NIT / Cédula: 1.077.143.043'
const EMISOR_CONTACTO = 'Tel: 313 214 8443  ·  sebastiansisaproductions@gmail.com'

// Proporción real del logo (ancho / alto) para no deformarlo al escalarlo
const LOGO_RATIO = 465 / 190

// Paleta de marca
const NEGRO = [10, 10, 10]
const DORADO = [201, 185, 122]
const GRIS_TEXTO = [40, 40, 40]
const GRIS_CLARO = [130, 130, 130]

export function generarComprobantePDF({
  numeroComprobante,
  fecha,
  estudiante,
  nombrePadre,
  telefono,
  correo,
  plan,
  montoTotal,
  montoPagado,
  montoAbonadoAcumulado,
  saldoPendiente,
}) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()

  const fmt = (n) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)

  // ---- Franja superior de marca ----
  doc.setFillColor(...NEGRO)
  doc.rect(0, 0, pageWidth, 38, 'F')

  // Logo centrado dentro de la franja negra
  const logoWidth = 55
  const logoHeight = logoWidth / LOGO_RATIO
  doc.addImage(
    LOGO_SISA_BLANCO,
    'PNG',
    (pageWidth - logoWidth) / 2,
    5,
    logoWidth,
    logoHeight
  )

  doc.setTextColor(200, 200, 200)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(`${EMISOR_NIT}   ·   ${EMISOR_CONTACTO}`, pageWidth / 2, 33, { align: 'center' })


  // ---- Línea dorada divisoria ----
  doc.setDrawColor(...DORADO)
  doc.setLineWidth(0.6)
  doc.line(15, 38, pageWidth - 15, 38)

  // ---- Título del documento ----
  doc.setTextColor(...GRIS_TEXTO)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('COMPROBANTE DE PAGO', 15, 50)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...GRIS_CLARO)
  doc.text(`N.° ${numeroComprobante}`, pageWidth - 15, 47, { align: 'right' })
  doc.text(`Fecha: ${fecha}`, pageWidth - 15, 53, { align: 'right' })

  let y = 65

  const seccion = (titulo) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(...DORADO)
    doc.text(titulo.toUpperCase(), 15, y)
    doc.setDrawColor(230, 230, 230)
    doc.setLineWidth(0.3)
    doc.line(15, y + 2, pageWidth - 15, y + 2)
    y += 9
  }

  const campo = (etiqueta, valor) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...GRIS_CLARO)
    doc.text(etiqueta, 15, y)
    doc.setTextColor(...GRIS_TEXTO)
    doc.setFont('helvetica', 'bold')
    doc.text(String(valor || '-'), 70, y)
    y += 7
  }

  seccion('Cliente (padre / acudiente)')
  campo('Nombre', nombrePadre)
  campo('Teléfono', telefono)
  campo('Correo', correo)

  y += 4
  seccion('Estudiante')
  campo('Nombre', estudiante.nombre)
  campo('Grupo', estudiante.grado)
  campo('Plan', plan)

  y += 6

  // ---- Caja de resumen de pago ----
  const boxTop = y
  const boxHeight = 44
  doc.setFillColor(247, 246, 243)
  doc.rect(15, boxTop, pageWidth - 30, boxHeight, 'F')
  doc.setDrawColor(...DORADO)
  doc.setLineWidth(0.4)
  doc.rect(15, boxTop, pageWidth - 30, boxHeight)

  let by = boxTop + 10
  const linea = (etiqueta, valor, destacado = false) => {
    doc.setFont('helvetica', destacado ? 'bold' : 'normal')
    doc.setFontSize(destacado ? 11 : 9.5)
    doc.setTextColor(...GRIS_TEXTO)
    doc.text(etiqueta, 22, by)
    doc.text(fmt(valor), pageWidth - 22, by, { align: 'right' })
    by += destacado ? 10 : 8.5
  }

  linea('Valor total del servicio', montoTotal)
  linea('Valor de este pago', montoPagado)
  linea('Total abonado a la fecha', montoAbonadoAcumulado)
  doc.setDrawColor(220, 220, 220)
  doc.line(22, by - 4, pageWidth - 22, by - 4)
  doc.setTextColor(...DORADO)
  linea('Saldo pendiente', saldoPendiente, true)

  y = boxTop + boxHeight + 16

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...GRIS_CLARO)
  doc.text(
    'Este documento es un comprobante interno de pago y no constituye una factura de venta.',
    pageWidth / 2,
    y,
    { align: 'center' }
  )

  // ---- Pie de página ----
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.setDrawColor(...NEGRO)
  doc.setLineWidth(0.3)
  doc.line(15, pageHeight - 18, pageWidth - 15, pageHeight - 18)
  doc.setFontSize(7.5)
  doc.setTextColor(...GRIS_CLARO)
  doc.text('Sisa Productions — ' + EMISOR_CONTACTO, pageWidth / 2, pageHeight - 12, { align: 'center' })

  doc.save(`comprobante_${estudiante.nombre.replace(/\s+/g, '_')}_${numeroComprobante}.pdf`)
}