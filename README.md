# Fotografía Grado 11 — Panel Admin y portal independiente

Web para administrar el cobro del servicio de fotografía escolar (grados 1101 a 1105):
login de admin, carga de estudiantes vía Excel, edición de datos de pago y generación de
comprobantes de pago en PDF.

El portal nuevo de selección de fotografías vive en [`portal-fotos/`](./portal-fotos/). Es otra aplicación Vite y se desplegará como un sitio aparte, con URL independiente y el mismo proyecto Supabase. Incluye login unificado, acceso real de estudiantes por nombre y teléfono, selección guardada en Supabase y carga de fotos/configuración para editores.

## Stack

- **Frontend:** React + Vite
- **Backend / Auth / DB:** Supabase (PostgreSQL)
- **Deploy frontend:** Netlify
- **PDF:** jsPDF (se genera en el navegador, no requiere backend adicional)

## 1. Supabase existente

Este sitio se conecta al proyecto existente que ya tiene las tablas `estudiantes`, `planes` y `comprobantes`. **No crees otro proyecto ni ejecutes `supabase/schema.sql` en el proyecto actual**: ese archivo describe el esquema histórico del panel administrativo y contiene políticas RLS antiguas.

Las migraciones de fotos `202611060001` a `202611060004` ya se ejecutaron en Supabase. Crearon las tablas de campañas/fotos/selecciones, restringieron las tablas a los dos perfiles editor y añadieron permisos de editor a los buckets privados. No vuelvas a ejecutar `202611060002_secure_editor_access.sql`.

Los buckets privados `student-originals` y `student-previews` deben existir en **Storage**. La campaña inicial usa planes ID 1 y 2; Plan 3 no entra al portal. La campaña no tiene fecha de apertura y su fecha de cierre aparece precargada para el 17 de noviembre de 2026 a las 6:00 p. m. (Colombia). El arte central se carga desde el panel de editor.

Para activar el acceso estudiantil, ejecuta `supabase/migrations/202611060005_student_portal.sql` y despliega `supabase/functions/student-login` con Supabase CLI. La guía paso a paso está en [`portal-fotos/README.md`](./portal-fotos/README.md).

## 2. Configurar el proyecto localmente

Se requiere Node.js 20.19+ o 22.12+. Este proyecto recomienda Node 22 LTS; `.nvmrc` selecciona esa versión para quienes usan nvm.

1. Copia `.env.example` a `.env`.
2. En **Project Settings → API** copia:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public key` → `VITE_SUPABASE_ANON_KEY`
3. Guarda `.env` localmente; no lo subas a GitHub ni compartas la clave `service_role`.

```bash
cp .env.example .env
# pega tus valores de Supabase en .env
npm install
npm run dev
```

La aplicación de esta carpeta sigue siendo el panel administrativo original. El portal independiente se ejecuta desde `portal-fotos/`; ahora contiene un prototipo visual interactivo con datos de muestra. El login real de estudiantes, las fotos privadas y el guardado en Supabase todavía no están conectados.

## 3. Formato del Excel de estudiantes

Sube un archivo por cada grupo (1101, 1102, etc.) seleccionando el grupo en el desplegable antes de subirlo. El archivo debe tener al menos una columna con el nombre del estudiante, por ejemplo:

| nombre              |
|----------------------|
| Juan Pérez Gómez     |
| María Rodríguez Ruiz |

## 4. Sobre el "comprobante de pago" (no factura)

El PDF que genera la app se llama intencionalmente **comprobante de pago**, no factura de venta.
Esto evita los requisitos de facturación electrónica DIAN (que aplican según tu régimen
tributario, no por el simple hecho de tener matrícula mercantil). El comprobante deja
constancia del pago pero no reemplaza una factura electrónica si en algún momento estás
obligado a expedirla. Si tienes dudas sobre tu caso específico, confírmalo con tu contador.

Cada vez que edites un estudiante y des clic en "Generar comprobante", se guarda un nuevo
registro en la tabla `comprobantes` (para llevar el historial de abonos) y se descarga un
PDF nuevo — así puedes generar comprobantes sucesivos a medida que el estudiante completa
el pago.

## 5. Deploy

### Backend/DB
Ya vive en Supabase, no requiere deploy adicional.

### Frontend en Netlify
1. Sube este proyecto a un repositorio de GitHub.
2. En Netlify: **Add new site → Import an existing project** → selecciona el repo.
3. Build command: `npm run build` — Publish directory: `dist`
4. En **Site settings → Environment variables** agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los mismos valores de tu `.env`.
5. Deploy.

## Estructura del proyecto

```
src/
  lib/supabaseClient.js     -> cliente de Supabase
  context/AuthContext.jsx   -> maneja la sesión de login
  components/ProtectedRoute.jsx
  pages/Login.jsx
  pages/PhotoEditor.jsx      -> carga 5 fotos de carpeta y 10 de retablo por estudiante
  components/EditorRoute.jsx -> restringe la ruta a perfiles editor/admin
  pages/Dashboard.jsx       -> carga de Excel, búsqueda, listado
  pages/StudentDetail.jsx   -> edición de datos + generación de comprobante
  utils/excelImport.js      -> parseo del Excel
  utils/pdfGenerator.js     -> generación del PDF del comprobante
supabase/schema.sql         -> script de base de datos
```

## Notas de privacidad

La app maneja datos personales de menores de edad y sus acudientes (Ley 1581 de 2012,
habeas data). Se recomienda tener un aviso de privacidad simple indicando el uso de estos
datos, y limitar el acceso a la app solo al usuario admin (ya cubierto por el login).
