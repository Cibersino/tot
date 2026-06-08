* [Español](#es)
* [English](#en)

---

<a id="es"></a>

# toT — de Texto a Tiempo

**toT** es una app de escritorio que convierte texto en tiempo estimado de lectura y te ayuda a planificar cargas de lectura realistas. Combina extracción de texto desde documentos e imágenes, presets de WPM configurables, conteo preciso, snapshots de texto, organizador de tareas, cronómetro con ventana flotante y tests de velocidad de lectura. Te permite medir, organizar y terminar lecturas con menos incertidumbre.

![Guía básica animada](public/assets/instrucciones/guia-basica.gif)

*¿No te atreves a empezar ciertas lecturas debido a no saber cuánto trabajo realmente te tomará?*
*¿Te cuesta terminar las lecturas y las abandonas en la mitad?*
*¿Quieres superar tus dificultades y desarrollar tu capacidad de lectura apoyándote en herramientas de medición y organización científicas?*
*¿Tu navegador acumula un montón de pestañas y marcadores con noticias y artículos de interés, que no sabes si vas a poder leer?*
*¿Tienes que dar una clase este semestre y debes entregar a tus estudiantes una bibliografía realista?*
*¿Debes preparar para mañana un escrito para exponer ante un auditorio durante una hora?*
*¿Necesitas hacer un guión para una cápsula audiovisual con un tiempo preciso?*
*¿La ruma de libros en tu velador crece sin compasión?*
*¿Quieres hacer estudios experimentales relacionados con el tiempo de lectura?*

## Funcionalidades

* Importar texto directamente desde `txt`, `md`, `html`, `htm`, `docx` y `pdf` con texto seleccionable; extraer texto mediante la ruta respaldada por Google desde `rtf` y `odt`; aplicar OCR a imágenes (`png`, `jpg`, `jpeg`, `webp`, `bmp`, `tif`, `tiff`) y PDF escaneados o aplanados; además de planificar extracción por lotes para múltiples archivos en cola y división automática del PDF completo cuando OCR requiere partir un PDF pesado.
* El texto se puede introducir pegándolo desde el portapapeles y/o manualmente.
* Editor de texto con búsqueda y reemplazo.
* Estimación de tiempo de lectura con WPM (palabras por minuto) configurable.
* Conteo de palabras y caracteres (con/sin espacios).
* Segmentación “precisa” de palabras usando `Intl.Segmenter`.
* Presets de WPM: crear/editar/eliminar + restaurar valores por defecto.
* Cronómetro con cálculo de WPM real + ventana flotante.
* Snapshots de texto: guardar/cargar los textos actuales.
* Test de velocidad de lectura: flujo guiado con texto aleatorio desde pool o con el texto actual, medición de WPM, preguntas opcionales de comprensión y creación asistida de presets.
* Editor de tareas: organizador de planes de lectura.
* Interfaz multi-idioma con más de 25 idiomas activos.

---

## Requisitos

### Usuarios finales

* **Windows (build portable)**: Windows 10/11 (64-bit).
* **macOS (DMG arm64)**: Macs con Apple Silicon.
* **Planificado**: Linux.

### Desarrolladores (ejecutar desde el código fuente)

* Node.js 18+ (recomendado: LTS actual)
* npm (incluido con Node.js)

---

## Instalación / Cómo ejecutar

### Windows

1. Si ya tienes una versión anterior de toT, cierra la app y elimina la carpeta extraída anterior.
2. Ir a [GitHub Releases](https://github.com/Cibersino/tot/releases) y descargar el último **`.zip` portable para Windows**.
3. Extraer el `.zip` en cualquier carpeta.
4. Ejecutar el `.exe` dentro de la carpeta extraída.

* En Windows, al ejecutar toT por primera vez, Microsoft Defender SmartScreen puede mostrar el aviso “Windows protegió su PC” porque la app es un build portable descargado fuera de Microsoft Store y puede no tener reputación suficiente para Windows. No hagas clic en **No ejecutar**. Para abrir la app, haz clic en **Más información** y luego en **Ejecutar de todas formas**.

### macOS Apple Silicon

1. Si ya tienes una versión anterior de toT en **Aplicaciones**, cierra la app y elimina esa copia anterior.
2. Descargar el último **`.dmg` para macOS arm64** desde [GitHub Releases](https://github.com/Cibersino/tot/releases).
3. Abrir el archivo descargado.
4. Arrastrar `toT` a la carpeta **Aplicaciones**.
5. Abrir `toT` desde **Aplicaciones**.

Si macOS muestra el mensaje **“toT está dañado y no puede abrirse”**, eso puede deberse a la cuarentena de seguridad aplicada a apps descargadas de Internet, no necesariamente a que la app esté dañada. **No muevas la app al basurero**. Haz esto:

1. Abre **Terminal**. Puedes encontrarla con `⌘ + Espacio` y escribiendo `Terminal`.
2. Copia y pega este comando:

```bash
xattr -dr com.apple.quarantine /Applications/toT.app
```

3. Presiona **Enter**.
4. Abre nuevamente `toT` desde **Aplicaciones**.

### Notas:

* El build de Windows es portable, sin instalador.
* El build de macOS se distribuye como DMG.
* El estado/configuración se almacena localmente en `app.getPath('userData')/config` (sin dependencia de servicios en la nube).
* El OCR con Google usa el alcance `drive.file`. Los usuarios requieren una cuenta de Google para usarlo.

---

## Extensión Chrome

toT también tiene una extensión para Chrome:

* [toT — Tiempo de lectura en Chrome Web Store](https://chromewebstore.google.com/detail/aaadjdlieimolidjdkbimjcdojologld)

La extensión estima el tiempo de lectura del texto que seleccionas en páginas web. Es una herramienta ligera para el navegador: no reemplaza la app de escritorio, no extrae artículos completos y no sincroniza datos con la app.

---

## Uso

Las instrucciones de uso están incluidas en el menú de la app (“¿Cómo usar la app?”).

Accesos rápidos visibles en la ventana principal:

* `📥`: extraer texto desde archivo (incluye flujo OCR cuando aplica, planificación por lotes para varios archivos y división automática de PDFs pesados para OCR).
* `📋↺` / `📋+`: reemplazar o agregar texto desde portapapeles.
* `⌨`: abrir Editor de Texto.
* `💾` / `📂`: guardar/cargar snapshot del texto actual.
* `📝` / `🗃️`: nueva tarea o cargar tarea.
* `Test de velocidad de lectura`: iniciar un test guiado desde un texto del pool o desde el texto actual.
* `＋` / `✎` / `🗑` / `⟲`: crear, editar, eliminar o restaurar presets de WPM.
* `▣`: activar o desactivar el Cronómetro Flotante.
* `Modo preciso`: activar o desactivar el modo preciso de conteo de palabras y caracteres.

---

## Sitio web y contacto

* Sitio: [https://totapp.org/es/](https://totapp.org/es/)
* Extensión Chrome: [toT — Tiempo de lectura en Chrome Web Store](https://chromewebstore.google.com/detail/aaadjdlieimolidjdkbimjcdojologld)
* Contacto: [GitHub Issues](https://github.com/Cibersino/tot/issues) o [cibersino@gmail.com](mailto:cibersino@gmail.com)

---

## Ejecutar desde el código fuente (desarrollo)

```bash
git clone https://github.com/Cibersino/tot.git
cd tot
npm install
npm start
```

## Generar build portable (Windows x64)

```bash
npm run dist:win
```

El artefacto se genera en `build-output/`.

### Notas para desarrolladores (DevTools, logs y menú Development)

**DevTools es por ventana.** Los logs del renderer se ven en la consola de DevTools de *cada* ventana (principal, presets, etc.).
DevTools solo decide si *muestra* mensajes (Verbose/Info/etc.). El logger de la app además filtra por nivel, así que para ver `debug`/`info`
debes subir el nivel del logger.

En la consola de DevTools (de la ventana que estás mirando):

* Ver nivel actual:

  * `Log.getLevel()`
* Activar `info`:

  * `Log.setLevel('info')`
* Activar `debug`:

  * `Log.setLevel('debug')`
* Volver al modo normal (default = `warn`):

  * `Log.setLevel('warn')`

Importante: si quieres ver logs de inicio (arranque), cambia el nivel y luego reinicia/recarga la app/ventana.

**Menú “Development” (opcional).** En modo desarrollo está oculto por defecto. Para habilitarlo, define `SHOW_DEV_MENU=1`:

* Windows (PowerShell):

  * `$env:SHOW_DEV_MENU = '1' ; npm start`
* Windows (cmd.exe):

  * `set SHOW_DEV_MENU=1 && npm start`
* Linux/macOS (bash/zsh):

  * `SHOW_DEV_MENU=1 npm start`

Esto es solo para desarrollo: en builds empaquetados no se muestra el menú “Development” y los atajos dev (DevTools/Reload) no están activos.

---

## Documentación

* Política de privacidad (offline): [`PRIVACY.md`](PRIVACY.md)
* Changelog (corto): [`CHANGELOG.md`](CHANGELOG.md)
* Changelog (detallado): [`docs/changelog_detailed.md`](docs/changelog_detailed.md)
* Suite de pruebas manuales: [`docs/test_suite.md`](docs/test_suite.md)
* Checklist del proceso de release: [`docs/releases/release_checklist.md`](docs/releases/release_checklist.md)
* Estructura del repo / archivos clave: [`docs/tree_folders_files.md`](docs/tree_folders_files.md)

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

# toT — from Text to Time

**toT** is a desktop app that turns text into estimated reading time and helps you plan realistic reading workloads. It combines text extraction from documents and images, configurable WPM presets, precise counting, text snapshots, a task organizer, a stopwatch with floating window, and reading speed tests. It allows you to measure, organize, and complete readings with less guesswork.

![Animated basic guide](public/assets/instrucciones/guia-basica.gif)

*Are you hesitant to start certain readings because you don't know how much work it will really take?*
*Do you find it hard to finish reading and abandon them in the middle?*
*Do you want to overcome your difficulties and develop your reading skills using scientific measurement and organization tools?*
*Does your browser accumulate a lot of tabs and bookmarks with news and articles of interest that you don't know if you will be able to read?*
*Do you have to teach a class this semester and must provide your students with a realistic bibliography?*
*Do you have to prepare a paper for tomorrow to present to an audience for one hour?*
*Do you need to script an audiovisual capsule with precise timing?*
*Is the pile of books on your bedside table growing mercilessly?*
*Do you want to do experimental studies related to reading time?*

## Features

* Import text directly from `txt`, `md`, `html`, `htm`, `docx`, and `pdf` with selectable text; extract text through the Google-backed path from `rtf` and `odt`; run OCR on images (`png`, `jpg`, `jpeg`, `webp`, `bmp`, `tif`, `tiff`) and scanned or flattened PDFs; and plan batch extraction for multiple queued files plus automatic full-PDF split when OCR needs a heavy PDF to be divided first.
* Text can be entered by pasting it from the clipboard and/or manually.
* Text editor with find and replace.
* Reading-time estimation with configurable WPM (words per minute).
* Word and character counting (with/without spaces).
* “Precise mode” word segmentation using `Intl.Segmenter`.
* WPM presets: create/edit/delete + restore defaults.
* Stopwatch with real WPM calculation; optional floating window.
* Text snapshots: save/load current texts.
* Reading speed test: guided flow with random pool text or the current text, WPM measurement, optional comprehension questions, and assisted preset creation.
* Task editor: reading plan organizer.
* Multi-language UI with 25+ active languages.

---

## Requirements

### End users

* **Windows (portable build)**: Windows 10/11 (64-bit).
* **macOS (arm64 DMG)**: Apple Silicon Macs.
* **Planned**: Linux.

### Developers (run from source)

* Node.js 18+ (recommended: current LTS)
* npm (bundled with Node.js)

---

## Installation / How to run

### Windows

1. If you already have an older version of toT, close the app and delete the previously extracted folder.
2. Go to [GitHub Releases](https://github.com/Cibersino/tot/releases) and download the latest **Windows portable `.zip`**.
3. Extract the `.zip` to any folder.
4. Run the `.exe` inside the extracted folder.

* On Windows, when running toT for the first time, Microsoft Defender SmartScreen may show the “Windows protected your PC” warning because the app is a portable build downloaded outside the Microsoft Store and may not yet have enough reputation for Windows. Do not click **Don’t run**. To open the app, click **More info**, then **Run anyway**.

### macOS Apple Silicon

1. If you already have an older version of toT in **Applications**, close the app and delete that previous copy.
2. Download the latest **macOS arm64 `.dmg`** from [GitHub Releases](https://github.com/Cibersino/tot/releases).
3. Open the downloaded file.
4. Drag `toT` to **Applications**.
5. Open `toT` from **Applications**.

If macOS shows **“toT is damaged and can’t be opened”**, this may be caused by the security quarantine applied to apps downloaded from the Internet, not necessarily by the app being damaged. **Do not move the app to the Trash**. Do this:

1. Open **Terminal**. You can find it with `⌘ + Space` and typing `Terminal`.
2. Copy and paste this command:

```bash
xattr -dr com.apple.quarantine /Applications/toT.app
```

3. Press **Enter**.
4. Open `toT` again from **Applications**.

### Notes:

* The Windows build is portable, with no installer.
* The macOS build is distributed as a DMG.
* User settings/state are stored locally in `app.getPath('userData')/config` (no cloud service dependency).
* Google-based OCR uses the `drive.file` scope. Users need a Google account to use it.

---

## Chrome extension

toT also has a Chrome extension:

* [toT — Reading time on the Chrome Web Store](https://chromewebstore.google.com/detail/aaadjdlieimolidjdkbimjcdojologld)

The extension estimates the reading time of text you select on web pages. It is a lightweight browser tool: it does not replace the desktop app, does not extract full articles, and does not sync data with the app.

---

## Usage

Usage instructions are included in the app menu (“How to use?”).

Quick actions in the main window:

* `📥`: extract text from file (includes OCR when needed, batch planning for multiple files, and automatic heavy-PDF split for OCR).
* `📋↺` / `📋+`: replace or append clipboard text.
* `⌨`: open Text Editor.
* `💾` / `📂`: save/load current-text snapshot.
* `📝` / `🗃️`: new task or load task.
* `Reading speed test`: start a guided test from pool text or from the current text.
* `＋` / `✎` / `🗑` / `⟲`: create, edit, delete, or restore WPM presets.
* `▣`: enable or disable the Floating Stopwatch.
* `Precise mode`: enable or disable the precise mode for counting words and characters.

---

## Website and contact

* Website: [https://totapp.org/en/](https://totapp.org/en/)
* Chrome extension: [toT — Reading time on the Chrome Web Store](https://chromewebstore.google.com/detail/aaadjdlieimolidjdkbimjcdojologld)
* Contact: [GitHub Issues](https://github.com/Cibersino/tot/issues) or [cibersino@gmail.com](mailto:cibersino@gmail.com)

---

## Run from source (development)

```bash
git clone https://github.com/Cibersino/tot.git
cd tot
npm install
npm start
```

## Build portable package (Windows x64)

```bash
npm run dist:win
```

The artifact is generated in `build-output/`.

### Developer notes (DevTools, logs, and the Development menu)

**DevTools is per-window.** Renderer logs live in the DevTools Console of *each* window (main, presets, etc.).
DevTools only decides whether messages are *shown* (Verbose/Info/etc.). The app logger also filters by level, so to see `debug`/`info`
you must raise the logger level.

In the DevTools Console (of the window you are inspecting):

* Check current level:

  * `Log.getLevel()`
* Enable `info`:

  * `Log.setLevel('info')`
* Enable `debug`:

  * `Log.setLevel('debug')`
* Back to normal (default = `warn`):

  * `Log.setLevel('warn')`

Important: if you want to see early startup logs, change the level and then restart/reload the app/window.

**“Development” menu (optional).** In development, the **Development** menu is hidden by default. To enable it, set `SHOW_DEV_MENU=1`:

* Windows (PowerShell):

  * `$env:SHOW_DEV_MENU = '1' ; npm start`
* Windows (cmd.exe):

  * `set SHOW_DEV_MENU=1 && npm start`
* Linux/macOS (bash/zsh):

  * `SHOW_DEV_MENU=1 npm start`

This is development-only: in packaged builds the “Development” menu is hidden and the dev shortcuts (DevTools/Reload) are inactive.

---

## Documentation

* Privacy policy (offline): [`PRIVACY.md`](PRIVACY.md)
* Changelog (short): [`CHANGELOG.md`](CHANGELOG.md)
* Changelog (detailed): [`docs/changelog_detailed.md`](docs/changelog_detailed.md)
* Manual test suite: [`docs/test_suite.md`](docs/test_suite.md)
* Release process checklist: [`docs/releases/release_checklist.md`](docs/releases/release_checklist.md)
* Repo structure / key files: [`docs/tree_folders_files.md`](docs/tree_folders_files.md)

---

## Bug reports / feature requests

* Use GitHub Issues.
* Planning and prioritization: [toT Roadmap](https://github.com/users/Cibersino/projects/2)

---

## License

MIT — see [`LICENSE`](LICENSE).

## Author

[Cibersino](https://github.com/Cibersino)
