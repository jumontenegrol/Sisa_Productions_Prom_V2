# Portal de selección de fotos

## Alcance entendido

- Reutilizar la base existente de estudiantes, planes y datos de contacto.
- Editor inicia sesión por separado y carga/gestiona las fotos de cada estudiante.
- Cada estudiante tiene 15 fotos: 5 disponibles para la carpeta y 10 para el retablo.
- Carpeta: elegir 2 fotos distintas de las 5; el diseño muestra esas dos y una imagen central predeterminada.
- Retablo: elegir un diseño y sus fotos de entre las 10: diseño 1 usa 1 foto, diseño 2 usa 2; diseño 3 usa 4 y solo está disponible en Plan 2.
- Una foto no puede repetirse entre productos. Las selecciones se pueden editar hasta una fecha límite.
- Previsualizar productos en contexto y proporción real, sin permitir recorte o movimiento.

Medidas confirmadas: cada cuadro de la primera elección (carpeta) es de 20×30 cm vertical; el retablo del Plan 1 es 30×45 cm vertical y el del Plan 2 es 50×70 cm vertical. El documento describe selección de 2 fotos para la carpeta, por lo que eso sustituye el borrador inicial de 5.

## Esquema existente revisado (CSV + capturas, 2026-11-06)

El proyecto actual ya contiene `public.estudiantes` (`id integer`, `nombre`, `grado`, `nombre_padre`, `telefono`, `correo`, `plan_id integer`, datos de pago y timestamps), `public.planes` (`id integer`, `nombre`, `monto`) y `public.comprobantes`. Los planes visibles son ID 1 = Plan 1, ID 2 = Plan 2 y existe ID 3 = Plan 3. Solo los estudiantes con `plan_id` 1 o 2 pueden acceder al portal; Plan 3 queda excluido. No duplicar estas tablas ni importar otra vez a otro proyecto.

La migración usa `integer` para enlazar `estudiantes.id` y `planes.id`, coherente con el CSV revisado. La consulta de políticas confirma que actualmente los roles `public` tienen políticas `ALL` sobre `estudiantes` y `comprobantes` cuando están autenticados: esto da acceso a todas las filas a cualquier usuario autenticado. No reutilizar ese patrón para estudiantes. Para el portal, restringir las operaciones a la identidad/estudiante correspondiente y al editor; los estudiantes con Plan 3 deben ser rechazados en servidor y por RLS/RPC, no solo ocultados en la interfaz.

## Estructura preparada

- `supabase/migrations/`: cambios versionados para aplicar en Supabase después de revisar el esquema real.
- `docs/`: decisiones, instrucciones y notas operativas.
- `storage-guides/`: convenciones para buckets, rutas, tamaños y carga.

## Pasos en Supabase

1. Trabaja en el proyecto existente: ya confirmamos que `estudiantes.id` y `plan_id` son `integer`. No recrees tablas ni vuelvas a insertar estudiantes/planes. El portal solo admite `plan_id` 1 y 2; excluir `plan_id` 3.
2. Toma un backup antes de cualquier migración. Las políticas actuales permiten a cualquier usuario autenticado todas las operaciones en todas las filas de estudiantes y comprobantes; reemplázalas o evita dar acceso directo desde el portal de estudiantes antes de publicar.
3. Los IDs admitidos son 1 (Plan 1) y 2 (Plan 2); establece el cierre de selección.
4. Revisa `supabase/migrations/202611060001_photo_selection.sql`; su tipo `student_id integer` coincide con el esquema inspeccionado. No ejecutar hasta revisar RLS y definir políticas/RPC para roles.
5. En Storage crea los buckets privados `student-originals` y `student-previews`. No hagas públicas las fotos de menores.
6. Mantén las claves `service_role` solo en servidor/funciones seguras; jamás en el frontend ni en Git. El frontend usa únicamente la publishable/anon key con RLS.
7. Crea al editor como usuario de Supabase Auth y asígnale el rol en `editor_profiles`. No uses una contraseña compartida ni la cuenta del estudiante para tareas administrativas. El editor inicia sesión desde la web; no necesita acceso al dashboard de Supabase.
8. Carga primero datos de prueba de pocos estudiantes; verifica permisos con una sesión de estudiante y una sesión de editor antes de importar todas las fotos.

## Acceso del estudiante

No recomiendo que el teléfono registrado sea la contraseña: es información conocida/compartida, difícil de cambiar y puede quedar expuesta. Mejor usa códigos de acceso aleatorios individuales (o enlaces de un solo uso), con vencimiento, límite de intentos y recuperación por el editor. Si se insiste en usuario+clave, generar claves temporales aleatorias y pedir cambio en primer acceso. Nunca almacenar contraseñas en una tabla propia; Auth debe validar credenciales.

## Fotos y capacidad

15 × 1.5 MB × 200 estudiantes ≈ 4.5 GB de originales, antes de miniaturas, versiones y respaldos. Genera miniaturas WebP/AVIF para la galería y sirve versiones reducidas para la vista previa; conserva originales privados. La capacidad incluida y el costo de almacenamiento/egress cambian según el plan vigente: verificar en el panel de Supabase antes de contratar y proyectar descargas. Subir las fotos una sola vez y usar URLs firmadas de corta duración reduce exposición y tráfico innecesario.

Para un pico de 250 personas: usar CDN para frontend, paginar la carga inicial, miniaturas, consultas indexadas, no descargar 15 originales por usuario al abrir la pantalla, y guardar la selección de forma atómica en una función/RPC con validaciones. Probar carga y concurrencia antes de la fecha de apertura. Supabase Pro ayuda con cuotas/recursos, pero no garantiza por sí solo que la aplicación no se caiga; límites, configuración, consultas y egreso también importan.

## Flujo de trabajo

- Supabase: esquema y migraciones, Auth, Storage privado, RLS, secretos de funciones y copias de seguridad.
- Código (Codex/VS Code): portal, login, permisos de rutas, editor de catálogo, cuadrícula de selección, previsualizaciones responsivas, guardado, fecha límite y registro de cambios.
- Verificación antes de publicar: políticas RLS con roles separados, pruebas de concurrencia, accesibilidad móvil, recuperación de acceso, respaldo y ensayo de carga.

Estimación inicial orientativa (no cotización): MVP sólido con una persona desarrolladora, 2–4 semanas; proyecto listo para operación con importador, editor, accesos individuales, previsualizaciones, seguridad, pruebas y despliegue, 4–8 semanas. El costo depende de alcance, tarifas locales, tratamiento de las fotos, soporte y si incluye operación/carga masiva. A modo de rango de planeación en Colombia, COP $6–15 millones para MVP y COP $15–35+ millones para versión de producción bien terminada y probada. Hosting, almacenamiento/egress y soporte continuo se cotizan aparte.

## Control de acceso antes del portal

La siguiente migración, `supabase/migrations/202611060002_secure_editor_access.sql`, reemplaza las políticas globales de `estudiantes` y `comprobantes` por políticas que requieren un perfil `editor` o `admin`. Ejecutarla solo después de confirmar que `editor_profiles` contiene las cuentas autorizadas; usuarios autenticados que no estén en esa tabla perderán el acceso a esas tablas. La migración contempla el nombre singular o plural de comprobantes. Las nuevas tablas de fotos siguen sin políticas de cliente; su acceso se agregará de forma específica cuando se implemente el flujo de carga y la identidad de estudiante.

La migración `supabase/migrations/202611060003_editor_photo_access.sql` concede CRUD de las tablas nuevas y de los objetos de los dos buckets privados únicamente a perfiles editor/admin. No la ejecutes hasta que la migración `202611060002_secure_editor_access.sql` haya terminado correctamente.

La migración `supabase/migrations/202611060004_initial_photo_campaign.sql` crea/reutiliza la campaña `Selección fotográfica - Promoción 2026` y guarda los IDs 1/2 y medidas confirmadas. Las fechas de apertura/cierre y la imagen central quedan pendientes; definir la fecha límite antes de abrir el acceso estudiantil.
