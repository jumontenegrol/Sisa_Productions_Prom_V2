# Portal independiente de selección de fotos

Esta carpeta es un sitio Vite separado del panel administrativo. Se desplegará como otro sitio de Netlify, pero utilizará el mismo proyecto de Supabase para estudiantes, planes, fotos y selecciones.

## Vista de estudiante

La ruta principal (`/`) es un formulario único. Si se ingresa con correo, el portal verifica el rol de editor; si se ingresa con nombre, envía nombre y teléfono a la función segura de estudiante. El prototipo del flujo visual está en `/vista-demo`; usa datos e imágenes de muestra y no guarda en Supabase.

El formulario único autentica al editor con sus cuentas de Supabase Auth y el rol de `editor_profiles`; `/editor/fotos` busca automáticamente los estudiantes de Plan 1 y Plan 2, filtra por curso o nombre y permite cargar sus grupos de 5 y 10 fotos a los buckets privados. El editor no asigna planes. La carga real requiere las variables de `.env` y que las migraciones indicadas en el README raíz estén aplicadas. El login estudiantil necesita que se despliegue la función de servidor `student-login`.

Plan 1 muestra retablos 30×45 cm y opciones de 1 o 2 fotos; Plan 2 muestra 50×70 cm y opciones de 1, 2 o 4 fotos. No hay selección de 5 fotos: son 2 para la carpeta y el retablo usa 1/2/4 según diseño.

## Ejecutar el portal localmente

Requiere Node 22.12+ (el archivo `.nvmrc` selecciona Node 22 si usas nvm):

```bash
npm install
npm run dev
```

Para el login de editor y la carga real, copia `.env.example` a `.env` y agrega el Project URL y la publishable/anon key. Reinicia Vite después de crear/modificar `.env`. No uses la clave `service_role` en el frontend. La autenticación estudiantil y el guardado real de selecciones se implementarán después de crear el acceso individual seguro y sus validaciones de servidor.

`assets/logo.png` es la fuente del logo para el encabezado, el formulario y el favicon de la pestaña. El Vite config la copia automáticamente a `public/assets/logo.png`; el CSS recorta el margen transparente del PNG proporcionado. Conserva el nombre y reinicia Vite cuando reemplaces el archivo.
