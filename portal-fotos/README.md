# Portal independiente de selección de fotos

Esta carpeta es un sitio Vite separado del panel administrativo. Se desplegará como otro sitio de Netlify, pero utilizará el mismo proyecto de Supabase para estudiantes, planes, fotos y selecciones.

## Vista de estudiante

La ruta principal (`/`) es un formulario único. Si se ingresa con correo, el portal verifica el rol de editor; si se ingresa con nombre, envía nombre y teléfono a la función segura de estudiante. El prototipo del flujo visual está en `/vista-demo`; usa datos e imágenes de muestra y no guarda en Supabase.

El formulario único autentica al editor con sus cuentas de Supabase Auth y el rol de `editor_profiles`; `/editor/fotos` busca automáticamente los estudiantes de Plan 1 y Plan 2, filtra por curso o nombre y permite cargar una colección compartida de 10 a 20 fotos en los buckets privados. El editor no asigna planes. La carga real requiere las variables de `.env`, las migraciones del portal y el despliegue de la función segura `student-login`.

El estudiante elige 2 fotos para la carpeta y 1, 2 o 4 para el retablo según el plan y diseño. Ambas elecciones usan la misma colección; una foto puede repetirse entre productos, pero no dentro del mismo producto. Puede girar fotos en la vista previa; esa orientación solo se conserva para reconstruir su vista y no se incluye en el informe del editor.

## Ejecutar el portal localmente

Requiere Node 22.12+ (el archivo `.nvmrc` selecciona Node 22 si usas nvm):

```bash
npm install
npm run dev
```

Para el login y la conexión real, copia `.env.example` a `.env` y agrega el Project URL y la publishable/anon key. Reinicia Vite después de crear/modificar `.env`. No uses la clave `service_role` en el frontend. Los estudiantes entran con nombre y teléfono registrado; el plan se toma de `estudiantes.plan_id` y el guardado se valida en una función SQL transaccional.

## Activar el acceso estudiantil en Supabase

1. Ejecuta las migraciones `202611060005_student_portal.sql`, `202611070001_student_original_downloads.sql` y `202611130001_unified_photo_collection.sql` en el SQL Editor del proyecto Supabase, en ese orden. Si las dos primeras ya se ejecutaron, ejecuta solo la última.
2. Instala/inicia sesión con Supabase CLI. Desde la raíz del repositorio, enlaza el proyecto con `supabase link --project-ref TU_PROJECT_REF`.
3. Desde esa misma raíz, despliega la función con `supabase functions deploy student-login`.
4. En el `.env` del frontend configura solo `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

Luego inicia sesión en el panel como editor. En la parte superior de `/editor/fotos`, la campaña queda sin fecha de apertura y el cierre aparece precargado al 17 de noviembre de 2026 a las 6:00 p. m. (Colombia); pulsa «Guardar configuración» para persistirlo. Allí también puedes cargar la imagen central que aparecerá en la carpeta. Cada estudiante puede ampliar sus fotos y descargar los originales antes del cierre; el acceso se limita con RLS a su propia colección.

El editor puede descargar un CSV con una fila por cada foto elegida: estudiante, curso, plan, producto, diseño, posición y ruta original. El nombre sugerido combina curso, el ID estable de `estudiantes` y el número de la foto dentro de la colección; por ejemplo `1101-0009-06.jpg`. El esquema actual no tiene un código de estudiante secuencial dentro de cada curso, así que no inventamos uno.

La clave `SUPABASE_SERVICE_ROLE_KEY` la proporciona Supabase a la Edge Function en el servidor; nunca se copia al navegador ni a Netlify.

`assets/logo.png` es la fuente del logo del encabezado y el formulario. `assets/favicon.png` controla por separado el icono de la pestaña. Vite copia ambos archivos a `public/assets/` y genera un SVG autocontenido al iniciar o compilar, para que el favicon no dependa de cargar una imagen externa. Reemplaza el PNG que quieras cambiar conservando su nombre y reinicia Vite.
