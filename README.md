* [Español](#es)
* [English](#en)

---

<a id="es"></a>

# toT — Reading Meter

¿No te atreves a empezar ciertas lecturas debido a no saber cuánto trabajo realmente te tomará?
¿Te cuesta terminar las lecturas y las abandonas en la mitad?
¿Quieres superar tus dificultades y desarrollar tu capacidad de lectura apoyándote en herramientas de medición y organización científicas?
¿Tu navegador acumula un montón de pestañas y marcadores con noticias y artículos de interés, que no sabes si vas a poder leer?
¿Tienes que dar una clase este semestre y debes entregar a tus estudiantes una bibliografía realista?
¿Debes preparar para mañana un escrito para exponer ante un auditorio durante una hora?
¿Necesitas hacer un guión para una cápsula audiovisual con un tiempo preciso?
¿La ruma de libros en tu velador crece sin compasión?
¿Quieres hacer estudios experimentales relacionados con el tiempo de lectura?

*Esta app es para ti.*

**toT** estima tiempo de lectura a partir de un texto y una velocidad configurada en WPM (palabras por minuto). La app también cuenta con presets de velocidad personalizables y puede medir tu velocidad real con un cronómetro.

Esta app está pensada para:
* Estimar rápidamente el tiempo de lectura de cualquier texto que introduzcas o compongas.
* Medir y ajustar tu velocidad real en distintos escenarios.
* *Configurar presets de WPM personalizados de acuerdo el tipo de lector, la modalidad de lectura, la complejidad de los textos, el idioma o cualquier parámetro que se desee.

## Funcionalidades

* El texto se puede introducir pegándolo desde el portapapeles y/o manualmente.
* Estimación de tiempo de lectura con WPM (palabras por minuto) configurable.
* Conteo de palabras y caracteres (con/sin espacios).
* Segmentación “precisa” de palabras usando `Intl.Segmenter`.
* Presets de WPM: crear/editar/eliminar + restaurar valores por defecto.
* Cronómetro con cálculo de WPM real + ventana flotante.
* Interfaz multi-idioma.

---

## Requisitos

### Usuarios finales
* **Windows (build portable)**: Windows 10/11 (64-bit).
* **Planificado**: macOS y Linux (aún no soportado oficialmente).

### Desarrolladores (ejecutar desde el código fuente)
* Node.js 18+ (recomendado: LTS actual)
* npm (incluido con Node.js)

---

## Instalación / Cómo ejecutar

1. Ir a [GitHub Releases](https://github.com/Cibersino/tot-readingmeter/releases) y descargar el último **`.zip` portable para Windows**.
2. Extraer el `.zip` en cualquier carpeta.
3. Ejecutar el `.exe` dentro de la carpeta extraída.

Notas:
* Este es un **build portable** (sin instalador).
* El estado/configuración del usuario se almacena localmente en tu máquina.

---

## Uso

Las instrucciones de uso están incluidas en el menú de la app (“¿Cómo usar la app?”).

---

<!-- ## Capturas de pantalla

TODO

---
-->
## Ejecutar desde el código fuente (desarrollo)

```bash
git clone https://github.com/Cibersino/tot-readingmeter.git
cd tot-readingmeter
npm install
npm start
```

### Notas para desarrolladores (DevTools, logs y menú Development)

**DevTools es por ventana.** Los logs del renderer se ven en la consola de DevTools de *cada* ventana (principal, editor, presets, etc.).
DevTools solo decide si *muestra* mensajes (Verbose/Info/etc.). El logger de la app además filtra por nivel, así que para ver `debug`/`info`
debes subir el nivel del logger.

En la consola de DevTools (de la ventana que estás mirando):
- Ver nivel actual:
  - `Log.getLevel()`
- Activar `info`:
  - `Log.setLevel('info')`
- Activar `debug`:
  - `Log.setLevel('debug')`
- Volver al modo normal (default = `warn`):
  - `Log.setLevel('warn')`

Importante: si quieres ver logs de inicio (arranque), cambia el nivel y luego reinicia/recarga la app/ventana.

**Menú “Development” (opcional).** En modo desarrollo está oculto por defecto. Para habilitarlo, define `SHOW_DEV_MENU=1`:

- Windows (PowerShell):
  - `$env:SHOW_DEV_MENU = '1' ; npm start`
- Windows (cmd.exe):
  - `set SHOW_DEV_MENU=1 && npm start`
- Linux/macOS (bash/zsh):
  - `SHOW_DEV_MENU=1 npm start`

Esto es solo para desarrollo: en builds empaquetados no se muestra el menú “Development” y los atajos dev (DevTools/Reload) no están activos.

---

## Documentación

* Checklist del proceso de release: [`docs/release_checklist.md`](docs/release_checklist.md)
* Changelog (corto): [`CHANGELOG.md`](CHANGELOG.md)
* Changelog (detallado): [`docs/changelog_detailed.md`](docs/changelog_detailed.md)
* Estructura del repo / archivos clave: [`docs/tree_folders_files.md`](docs/tree_folders_files.md)
* Política de privacidad (offline): [`PRIVACY.md`](PRIVACY.md)

---

## Reportes de bugs / solicitudes de funcionalidad

* Usar GitHub Issues.
* Planificación y priorización: [toT Roadmap](https://github.com/users/Cibersino/projects/2)

---

## Licencia

MIT — ver [`LICENSE`](LICENSE).

## Autor

[Cibersino](https://github.com/Cibersino)

---

<a id="en"></a>

# toT — Reading Meter

Are you hesitant to start certain readings because you don't know how much work it will really take?
Do you find it hard to finish reading and abandon them in the middle?
Do you want to overcome your difficulties and develop your reading skills using scientific measurement and organization tools?
Does your browser accumulate a lot of tabs and bookmarks with news and articles of interest that you don't know if you will be able to read?
Do you have to teach a class this semester and must provide your students with a realistic bibliography?
Do you have to prepare a paper for tomorrow to present to an audience for one hour?
Do you need to script an audiovisual capsule with precise timing?
Is the pile of books on your bedside table growing mercilessly?
Do you want to do experimental studies related to reading time?

*This app is for you.*

**toT** estimates reading time from a text and a speed set in WPM (words per minute). The app also has customizable speed presets and can measure your real speed with a stopwatch.

This app is designed for:
* Quickly estimate the reading time of any text you enter or compose.
* Measure and adjust your real speed in different scenarios.
* Configure customized WPM presets according to the type of reader, reading mode, text complexity, language or any desired parameter.

## Features

* Text can be entered by pasting it from the clipboard and/or manually.
* Reading-time estimation with configurable WPM (words per minute).
* Word and character counting (with/without spaces).
* “Precise mode” word segmentation using `Intl.Segmenter`.
* WPM presets: create/edit/delete + restore defaults.
* Stopwatch with real WPM calculation; optional floating window.
* Multi-language UI.

---

## Requirements

### End users

* **Windows (portable build)**: Windows 10/11 (64-bit).
* **Planned**: macOS and Linux (not officially supported yet).

### Developers (run from source)

* Node.js 18+ (recommended: current LTS)
* npm (bundled with Node.js)

---

## Installation / How to run

1. Go to [GitHub Releases](https://github.com/Cibersino/tot-readingmeter/releases) and download the latest **Windows portable `.zip`**.
2. Extract the `.zip` to any folder.
3. Run the `.exe` inside the extracted folder.

Notes:

* This is a **portable build** (no installer).
* User settings/state are stored locally on your machine.

---

## Usage

Usage instructions are included in the app menu (“How to use?”).

---

<!-- ## Screenshots

TODO

---
-->
## Run from source (development)

```bash
git clone https://github.com/Cibersino/tot-readingmeter.git
cd tot-readingmeter
npm install
npm start
```

### Developer notes (DevTools, logs, and the Development menu)

**DevTools is per-window.** Renderer logs live in the DevTools Console of *each* window (main, editor, presets, etc.).
DevTools only decides whether messages are *shown* (Verbose/Info/etc.). The app logger also filters by level, so to see `debug`/`info`
you must raise the logger level.

In the DevTools Console (of the window you are inspecting):
- Check current level:
  - `Log.getLevel()`
- Enable `info`:
  - `Log.setLevel('info')`
- Enable `debug`:
  - `Log.setLevel('debug')`
- Back to normal (default = `warn`):
  - `Log.setLevel('warn')`

Important: if you want to see early startup logs, change the level and then restart/reload the app/window.

**“Development” menu (optional).** In development, the **Development** menu is hidden by default. To enable it, set `SHOW_DEV_MENU=1`:

- Windows (PowerShell):
  - `$env:SHOW_DEV_MENU = '1' ; npm start`
- Windows (cmd.exe):
  - `set SHOW_DEV_MENU=1 && npm start`
- Linux/macOS (bash/zsh):
  - `SHOW_DEV_MENU=1 npm start`

This is development-only: in packaged builds the “Development” menu is hidden and the dev shortcuts (DevTools/Reload) are inactive.

---

## Documentation

* Release process checklist: [`docs/release_checklist.md`](docs/release_checklist.md)
* Changelog (short): [`CHANGELOG.md`](CHANGELOG.md)
* Changelog (detailed): [`docs/changelog_detailed.md`](docs/changelog_detailed.md)
* Repo structure / key files: [`docs/tree_folders_files.md`](docs/tree_folders_files.md)
* Privacy policy (offline): [`PRIVACY.md`](PRIVACY.md)

---

## Bug reports / feature requests

* Use GitHub Issues.
* Planning and prioritization: [toT Roadmap](https://github.com/users/Cibersino/projects/2)

---

## License

MIT — see [`LICENSE`](LICENSE).

## Author

[Cibersino](https://github.com/Cibersino)
