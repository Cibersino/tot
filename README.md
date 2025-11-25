### toT — Reading Meter ###
**Versión:** 0.0.4 (2025/11/24)  

Aplicación de escritorio (Electron) para contar palabras y caracteres, estimar tiempos de lectura, cronometrar lecturas y gestionar presets de velocidad (WPM).

## Características ##

* Conteo de texto: palabras y caracteres (con/sin espacios).
* Estimación de tiempo de lectura configurable por WPM.
* Cronómetro con cálculo de WPM real; ventana flotante opcional.
* Editor de texto completo con cálculo manual y automático.
* Gestión de presets WPM: nuevo, editar, borrar, restaurar, y reemplazo de presets por defecto.

## Instalación y ejecución ##

git clone <repo>
cd readingtime*app
npm install
npm start

## Requerimientos ##

*  Requiere Node.js 18+ y un sistema compatible con Electron.

## Archivos importantes ##

* `electron/main.js` — lógica principal de la app y manejo de IPC.
* `public/renderer.js` — scripts de la interfaz principal.
* `public/preset_modal.js` — scripts para el modal de presets (Nuevo/Editar).
* `config/user_settings.json` — guarda presets personalizados y configuración de usuario.
* `config/current_text.json` — almacena el texto actual al cerrar la app.
* public/manual.js — scripts del editor de texto completo.
* public/style.css y public/manual.css — estilos para la pantalla principal y editor.
* public/index.html, public/manual.html, public/preset_modal.html — vistas principales y modales.

## Changelog ##

**0.0.3** (2025/11/22)

* Implementación del botón **Editar** con confirmación nativa.
* Consolidación de flujos de presets: Nuevo, Borrar, Restaurar y handlers IPC asociados.
* Funcionalidad estable y retrocompatible de editor y cronómetro.

**0.0.4** (2025/11/24)

* Renovación completa del diseño visual de la pantalla principal, la ventana de texto completo y los modales de presets.
  * Sustitución del layout basado en grilla por uno completamente flexible.
  * Reorganización y estandarización de elementos en todas las secciones.
  * Inclusión del nuevo logotipo.
  * Varias mejoras visuales y de consistencia.
* Incorporación de nuevos botones:
  * Selector de texto:
    * “Pegar cortapapeles nueva línea” (nueva funcionalidad).
	* “Vaciar” (equivalente al de la ventana de texto completo).
  * Resultados:
	* “?” (solo ubicación). Futuro acceso a documentación del método de cálculo y otras informaciones relevantes.
  * Cronómetro:
    * “VF” (solo ubicación). Activará ventana flotante para cronometrar sin la pantalla principal.
  * Ventana de edición de texto completo.
    * “Calcular” (nuevo cálculo manual).
	* Interruptor del cálculo automático (antes siempre activo).
* Limpieza parcial (muy parcial) del código fuente.

**0.0.5** ()

* Selector de idioma primer arranque.

## Autor y Créditos ##

* Librerías / Frameworks: Electron, Node.js.
* Herramientas utilizadas: OpenAI ChatGPT.

Desarrollador: Cibersino

* Agradecimientos: ...

## Licencia ##

MIT — ver [`LICENSE`](LICENSE) para detalles.