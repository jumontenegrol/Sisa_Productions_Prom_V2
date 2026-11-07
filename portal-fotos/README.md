# Portal independiente de selección de fotos

Esta carpeta es un sitio Vite separado del panel administrativo. Se desplegará como otro sitio de Netlify, pero utilizará el mismo proyecto de Supabase para estudiantes, planes, fotos y selecciones.

## Vista de estudiante

La ruta principal (`/`) es un formulario único. Si se ingresa con correo, el portal verifica el rol de editor; si se ingresa con nombre, envía nombre y teléfono a la función segura de estudiante. El prototipo del flujo visual está en `/vista-demo`; usa datos e imágenes de muestra y no guarda en Supabase.

El formulario único autentica al editor con sus cuentas de Supabase Auth y el rol de `editor_profiles`; `/editor/fotos` busca automáticamente los estudiantes de Plan 1 y Plan 2, filtra por curso o nombre y permite cargar sus grupos de 5 y 10 fotos a los buckets privados. El editor no asigna planes. La carga real requiere las variables de `.env`, la migración `202611060005_student_portal.sql` y el despliegue de la función segura `student-login`.

Plan 1 muestra retablos 30×45 cm y opciones de 1 o 2 fotos; Plan 2 muestra 50×70 cm y opciones de 1, 2 o 4 fotos. No hay selección de 5 fotos: son 2 para la carpeta y el retablo usa 1/2/4 según diseño.

## Ejecutar el portal localmente

Requiere Node 22.12+ (el archivo `.nvmrc` selecciona Node 22 si usas nvm):

```bash
npm install
npm run dev
```

Para el login y la conexión real, copia `.env.example` a `.env` y agrega el Project URL y la publishable/anon key. Reinicia Vite después de crear/modificar `.env`. No uses la clave `service_role` en el frontend. Los estudiantes entran con nombre y teléfono registrado; el plan se toma de `estudiantes.plan_id` y el guardado se valida en una función SQL transaccional.

## Activar el acceso estudiantil en Supabase

1. Ejecuta `supabase/migrations/202611060005_student_portal.sql` en el SQL Editor del proyecto Supabase.
2. Instala/inicia sesión con Supabase CLI. Desde la raíz del repositorio, enlaza el proyecto con `supabase link --project-ref TU_PROJECT_REF`.
3. Desde esa misma raíz, despliega la función con `supabase functions deploy student-login`.
4. En el `.env` del frontend configura solo `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

Luego inicia sesión en el panel como editor. En la parte superior de `/editor/fotos`, la campaña queda sin fecha de apertura y el cierre aparece precargado al 17 de noviembre de 2026 a las 6:00 p. m. (Colombia); pulsa «Guardar configuración» para persistirlo. Allí también puedes cargar la imagen central que aparecerá en la carpeta.

La clave `SUPABASE_SERVICE_ROLE_KEY` la proporciona Supabase a la Edge Function en el servidor; nunca se copia al navegador ni a Netlify.

`assets/logo.png` es la fuente del logo del encabezado y el formulario. `assets/favicon.png` controla por separado el icono de la pestaña. Vite copia ambos archivos a `public/assets/` y genera un SVG autocontenido al iniciar o compilar, para que el favicon no dependa de cargar una imagen externa. Reemplaza el PNG que quieras cambiar conservando su nombre y reinicia Vite.
