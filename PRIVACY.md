# Política de privacidad — toT

Fecha de vigencia: `2026-01-12`  
Versión app: `0.1.0`

## 1) Resumen
- La app **no recopila telemetría** ni métricas de uso.
- El **texto que ingresas/pegas** se procesa **localmente** y **no se envía a Internet** ni a servidores de los desarrolladores.
- La app guarda **configuración y estado** en el equipo del usuario (almacenamiento local).
- La única conectividad prevista es para **verificar actualizaciones en GitHub** y **abrir** la página de releases en el navegador. La app **no descarga ni instala** actualizaciones automáticamente.

## 2) Datos que la app procesa
### 2.1 Texto del usuario
- La app procesa el texto que ingresas/pegas para realizar conteos y estimaciones.
- Ese contenido **no se transmite** a servicios externos.

### 2.2 Configuración y estado (almacenamiento local)
La app puede guardar localmente, según su configuración y uso:
- Preferencias (por ejemplo, idioma y presets).
- Estado de ventanas y/o sesión (según aplique).
- El texto actual y/o último estado de trabajo (si la app ofrece persistencia del texto).

Estos datos quedan **en tu equipo**.

## 3) Conectividad y terceros
### 3.1 Verificación de actualizaciones (GitHub)
La app puede consultar información pública de releases en GitHub para determinar si existe una versión más reciente, y puede abrir el navegador hacia la página oficial de releases.

- La app **no envía tu texto** durante esta verificación.
- Como en cualquier conexión HTTPS a un tercero, **GitHub puede ver tu IP** y metadatos estándar de la conexión (p. ej., fecha/hora y encabezados de red habituales).

### 3.2 Sin otros servicios externos
La app no integra servicios de analítica, publicidad, seguimiento, ni SDKs de telemetría.

## 4) Permisos
La app no solicita permisos especiales del sistema para enviar datos de uso. El acceso a archivos del sistema, cuando exista, se limita al almacenamiento propio de la app y al funcionamiento normal de un entorno de escritorio.

## 5) Retención y control por el usuario
- Los datos persistidos por la app se almacenan localmente.
- Puedes eliminar esos datos borrando la configuración/estado local de la app (según el sistema operativo) o desinstalando la app y eliminando sus archivos de configuración.

## 6) Cambios a esta política
Si en el futuro se agregan capacidades que impliquen nuevas formas de conectividad o recopilación de datos (por ejemplo, telemetría opcional o reportes de fallos), esta política se actualizará y el cambio se documentará en el changelog del proyecto.

## 7) Contacto
Para dudas, bugs o sugerencias, usar el tracker de Issues del repositorio oficial.
