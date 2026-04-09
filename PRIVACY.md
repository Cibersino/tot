# Política de privacidad — toT

Fecha de vigencia: `2026-04-04`  
Versión app: `1.0.0`

## 1. Resumen

- La app **no recopila telemetría** ni métricas de uso.
- El **texto que ingresas/pegas** se procesa **localmente** y **no se envía a Internet** ni a servidores de los desarrolladores.
- La app guarda **configuración y estado** en el equipo del usuario (almacenamiento local).
- La única conectividad prevista no dependiente de acciones del usuario es la **verificación de actualizaciones en GitHub**. La app **no descarga ni instala** actualizaciones automáticamente.
- El resto de las operaciones de conectividad solo ocurre por acciones explícitas del usuario (por ejemplo, al abrir enlaces externos desde la app al activar/usar OCR conectado con Google).

## 2. Datos que la app procesa

### 2.1 Texto del usuario
- La app procesa el texto que ingresas/pegas para realizar conteos y estimaciones.
- Ese contenido **no se transmite** a servicios externos.

### 2.2 Configuración y estado (almacenamiento local)
La app puede guardar localmente, según su configuración y uso:
- Preferencias (por ejemplo, idioma).
- Estado de ventanas y/o sesión (según aplique).
- El texto actual y/o último estado de trabajo (si la app ofrece persistencia del texto).
- La selección y personalización de presets de WPM.
- Snapshots de texto guardados por el usuario.
- Estado local del test de velocidad de lectura (por ejemplo, pool local de textos del test, archivo local externo de estado de uso y payloads opcionales de preguntas en los archivos del pool).
- Datos de tareas guardadas por el usuario (listas, biblioteca, rutas de archivos locales y hosts/URLs permitidos para abrir enlaces).

Todos estos datos quedan solo **en tu equipo**.

### 2.3 Test de velocidad de lectura
- El test de velocidad de lectura procesa localmente el texto usado en la sesión para calcular WPM y, cuando corresponde, mostrar preguntas opcionales de comprensión.
- Si el test se inicia desde el texto actual, ese texto se reutiliza localmente y no se envía a servicios externos.
- Si el test se inicia desde el pool local de textos del test, la app puede marcar localmente ese texto como usado en su archivo externo de estado de uso para evitar repeticiones entre tests hasta que el usuario restablezca el pool.
- Ni los resultados del test, ni las respuestas a preguntas de comprensión, ni el WPM medido se envían a Internet.

## 3. Conectividad y terceros

### 3.1 Verificación de actualizaciones (GitHub)
La app puede consultar información pública de releases en GitHub para determinar si existe una versión más reciente, y puede abrir el navegador hacia la página oficial de releases.

- La app **no envía tu texto** durante esta verificación.
- Como en cualquier conexión HTTPS a un tercero, **GitHub puede ver tu IP** y metadatos estándar de la conexión (p. ej., fecha/hora y encabezados de red habituales).

### 3.2 Apertura de enlaces externos por acción del usuario

La app puede abrir enlaces externos cuando el usuario lo solicita explícitamente (por ejemplo, desde enlaces informativos o desde el módulo de tareas).

- En el módulo de tareas, solo se permiten enlaces HTTPS y puede requerirse confirmación.
- En todos los casos, la navegación ocurre en el navegador externo del sistema.

### 3.3 OCR conectado con Google

Si el usuario decide activar o usar OCR para extraer texto de archivos, la app puede conectarse con servicios de Google para procesar estos archivos seleccionados por el propio usuario con fines de OCR.

- La activación abre el navegador externo del sistema para realizar autorización/sign-in de Google.
- Solo los archivos que el usuario elige explícitamente para OCR se envían a Google para esa operación.
- Como parte de una operación OCR, ni los archivos, ni el texto extraído, ni la información específica de esa operación se envían a terceros distintos de Google. Los desarrolladores no reciben esos datos ni quedan notificados de esas operaciones.
- Tras exportar el texto extraído, la app intenta borrar de inmediato el documento temporal creado en Google para esa conversión OCR. Si esa limpieza remota falla, la app lo trata como advertencia explícita.
- Las credenciales OAuth de Google gestionadas por la app para OCR y los tokens locales de esa integración se almacenan localmente en la instancia de la app.
- Si el usuario elige `Menú > Preferencias > Desconectar Google OCR`, la app intenta revocar el token guardado de Google y, si eso resulta exitoso, elimina el archivo de token local de OCR. Las credenciales OAuth de Google locales gestionadas por la app pueden mantenerse para que OCR pueda reconectarse más adelante.
- Como control externo adicional, el usuario también puede revocar el acceso de la app desde los controles de seguridad/permisos de su Cuenta de Google.

### 3.4 Sin otros servicios externos

La app no integra servicios de analítica, publicidad, seguimiento, ni SDKs de telemetría.

## 4. Permisos
La app no solicita permisos especiales del sistema para enviar datos de uso. El acceso a archivos del sistema, cuando exista, se limita al almacenamiento propio de la app y al funcionamiento normal de un entorno de escritorio.

## 5. Retención y control por el usuario

- Los datos persistidos por la app se almacenan localmente.
- Si solo quieres desconectar Google OCR, usa `Menú > Preferencias > Desconectar Google OCR`.
- Puedes eliminar esos datos borrando la configuración/estado local de la app (según el sistema operativo) o desinstalando la app y eliminando sus archivos de configuración.

## 6. Cambios a esta política

Si en el futuro se agregan capacidades que impliquen nuevas formas de conectividad o recopilación de datos (por ejemplo, telemetría opcional o reportes de fallos), esta política se actualizará y el cambio se documentará en el changelog del proyecto.

## 7. Contacto

Para dudas, bugs o sugerencias, usar el tracker de Issues del repositorio oficial.
