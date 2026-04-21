# Política de privacidad — toT

Fecha de vigencia: `2026-04-21`  
Versión app: `1.2.0`

## 1. Resumen

toT es una app principalmente local.

- La app **no recopila telemetría** ni métricas de uso.
- El **texto que ingresas, pegas, editas o procesas** se trabaja **localmente** y **no se envía a Internet** ni a servidores del desarrollador.
- La app guarda **configuración y estado** en el equipo del usuario.
- La **única conectividad prevista no dependiente de acciones del usuario** es la **verificación de actualizaciones en GitHub**. La app **no descarga ni instala actualizaciones automáticamente**.
- Toda otra conectividad ocurre solo por **acciones explícitas del usuario**, por ejemplo al abrir enlaces externos o al activar/usar OCR conectado con Google.

## 2. Datos que la app procesa

### 2.1 Texto del usuario

La app procesa el texto que ingresas, pegas o importas para realizar conteos, estimaciones, edición, organización y otras funciones locales.

Ese contenido **no se transmite** a servicios externos, salvo que el propio usuario elija una ruta conectada específica, como Google OCR, para un archivo seleccionado por él mismo.

### 2.2 Configuración y estado local

La app puede guardar localmente, según su uso y configuración:

- preferencias de usuario, por ejemplo idioma;
- estado de ventanas y sesión;
- texto actual y estado de trabajo;
- presets de WPM y su personalización;
- snapshots guardados por el usuario;
- estado local del test de velocidad de lectura, incluido el pool local de textos, el archivo externo de estado de uso y payloads opcionales de preguntas;
- datos del editor de tareas, incluidas listas, biblioteca, rutas locales y hosts/URLs permitidos;
- estado local de la integración Google OCR.

Todo eso permanece **en tu equipo**.

### 2.3 Test de velocidad de lectura

El test de velocidad de lectura funciona localmente.

- Si el test se inicia desde el texto actual, ese texto se reutiliza localmente.
- Si se inicia desde el pool local, la app puede marcar localmente ese texto como usado para evitar repeticiones hasta que el usuario restablezca el pool.
- Ni el texto del test, ni el WPM medido, ni las respuestas de comprensión se envían a Internet.

## 3. Conectividad y terceros

### 3.1 Verificación de actualizaciones (GitHub)

La app puede consultar información pública de releases en GitHub para determinar si existe una versión más reciente y, si el usuario lo decide, abrir en el navegador externo la página oficial de descarga.

- La app **no envía tu texto** durante esta verificación.
- GitHub puede ver la IP y metadatos estándar de la conexión HTTPS.
- La app **no descarga** ni **instala** actualizaciones por sí sola.

### 3.2 Apertura de enlaces externos por acción del usuario

La app puede abrir enlaces externos solo cuando el usuario lo solicita explícitamente.

- En el editor de tareas, los enlaces remotos se limitan a HTTPS y pueden requerir confirmación.
- En todos los casos, la navegación ocurre en el navegador externo del sistema.

### 3.3 OCR conectado con Google

Si el usuario decide activar o usar OCR para extraer texto de archivos, la app puede conectarse con servicios de Google para procesar **solo** los archivos que el propio usuario selecciona para esa operación.

- La autorización se realiza en el **navegador externo del sistema**, no dentro de un navegador embebido en la app.
- La app usa un **Google Cloud project** y un **OAuth client** gestionados por el owner de la app y distribuidos con ella.
- El alcance solicitado para esta función es **`drive.file`**.
- Solo los archivos que el usuario elige explícitamente para OCR se envían a Google para esa operación.
- Como parte de esa operación, Google puede recibir el archivo seleccionado, los datos de autorización necesarios, el documento temporal convertido durante el flujo OCR y el texto exportado de vuelta a la app.
- Los desarrolladores **no reciben** esos archivos, ni el texto extraído, ni notificaciones de esas operaciones.
- Tras exportar el texto extraído, la app intenta borrar de inmediato el documento temporal creado en Google para esa conversión OCR. Si la limpieza remota falla, la app lo trata como una advertencia explícita.
- Las **credenciales OAuth** gestionadas por la app para OCR y los **tokens locales** de esa integración se almacenan localmente en la instancia de la app.
- El estado local del token OCR se protege usando **Electron safeStorage** y los mecanismos de cifrado o protección disponibles en el sistema operativo de la plataforma.
- Si el usuario elige `Menú > Preferencias > Desconectar Google OCR`, la app intenta revocar el token guardado de Google y, si eso tiene éxito, elimina el archivo de token local de OCR. Las credenciales OAuth locales gestionadas por la app pueden mantenerse para permitir una reconexión posterior.
- Como control externo adicional, el usuario también puede revocar el acceso de la app desde los controles de permisos o seguridad de su Cuenta de Google.

### 3.4 Sin otros servicios externos
La app no integra servicios de analítica, publicidad, seguimiento ni SDKs de telemetría.

## 4. Permisos
La app no solicita permisos especiales del sistema para enviar datos de uso. El acceso a archivos del sistema, cuando existe, se limita al funcionamiento normal de una app de escritorio y al almacenamiento propio de la app.

## 5. Retención y control por el usuario

- Los datos persistidos por la app se almacenan localmente.
- Si solo quieres desconectar Google OCR, usa `Menú > Preferencias > Desconectar Google OCR`.
- Puedes eliminar los datos locales borrando la configuración o el estado de la app en tu sistema, o desinstalando la app y eliminando sus archivos de configuración.
- Si contactas al desarrollador por correo o mediante GitHub Issues, el desarrollador recibe solo la información que decidas incluir.
- Los mensajes de soporte y cualquier archivo o texto enviado voluntariamente al desarrollador pueden conservarse solo durante el tiempo razonablemente necesario para responder, investigar problemas o cumplir obligaciones legales.
- Puedes solicitar la eliminación de datos de soporte controlados por el desarrollador escribiendo a `cibersino@gmail.com`.

## 6. Cambios a esta política
Si en el futuro la app incorpora nuevas formas de conectividad o tratamiento de datos, esta política se actualizará y el cambio se reflejará en la documentación del proyecto.

## 7. Contacto
Para dudas, bugs o sugerencias, usar GitHub Issues del repositorio oficial o escribir a `cibersino@gmail.com`.
