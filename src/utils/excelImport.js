import * as XLSX from 'xlsx'

/**
 * Lee un archivo Excel y devuelve un arreglo de estudiantes.
 * Espera columnas (insensible a mayúsculas/orden):
 *   nombre, grado
 * El grado también puede venir implícito si subes un excel por grupo:
 * en ese caso pasa `gradoFijo` y lo aplicamos a todas las filas.
 */
export function parseExcelFile(file, gradoFijo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })

        const estudiantes = rows
          .map((row) => {
            // Busca la columna de nombre sin importar mayúsculas/tildes exactas
            const keys = Object.keys(row)
            const nombreKey = keys.find((k) => k.toLowerCase().trim().includes('nombre'))
            const gradoKey = keys.find((k) => k.toLowerCase().trim().includes('grado') || k.toLowerCase().trim().includes('curso'))

            const nombre = nombreKey ? String(row[nombreKey]).trim() : ''
            const grado = gradoFijo || (gradoKey ? String(row[gradoKey]).trim() : '')

            return { nombre, grado }
          })
          .filter((e) => e.nombre.length > 0)

        resolve(estudiantes)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = (err) => reject(err)
    reader.readAsArrayBuffer(file)
  })
}
