* [Español](#es)
* [English](#en)

---

<a id="es"></a>

# toT — de Texto a Tiempo

**toT** es una app de escritorio que convierte texto en tiempo estimado de lectura y te ayuda a planificar cargas de lectura realistas. Combina extracción de texto desde archivos de texto e imagen, presets de WPM configurables, conteo preciso, snapshots de texto, un editor de texto, un editor de tareas, cronómetro y test de velocidad de lectura para que puedas medir, organizar y completar lecturas con menos margen de adivinación.

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

* Extraer texto desde archivos `txt`, `md`, `html`, `htm`, `docx`, `epub`, `rtf`, `odt`, `pdf` e imágenes (`png`, `jpg`, `jpeg`, `jp2`, `webp`, `bmp`, `tif`, `tiff`), con selección de páginas en PDFs, OCR para imágenes y PDFs escaneados, planificación por lotes para múltiples archivos y división automática del PDF completo cuando OCR necesita partir un PDF pesado.
* Introducir texto pegándolo desde el portapapeles y/o manualmente.
* Editor de Texto con búsqueda y reemplazo.
* Estimación de tiempo de lectura con WPM configurable (palabras por minuto).
* Conteo de palabras y caracteres (con y sin espacios).
* Segmentación de palabras en “modo preciso” usando `Intl.Segmenter`.
* Presets de WPM: crear, editar, eliminar y restaurar valores por defecto.
* Test de velocidad de lectura guiado: usar texto actual o textos del pool, medir WPM, mostrar preguntas opcionales de comprensión y crear presets personalizados.
* Cronómetro con cálculo de WPM real; ventana flotante opcional.
* Snapshots de texto: guardar y cargar textos actuales.
* Editor de Tareas: organizador de planes de lectura.
* Interfaz multidioma con más de 25 idiomas activos.

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
4. Abrir la carpeta extraída `toT-<version>`.
5. Leer `INSTALL.txt`.
6. Abrir `toT-app` y ejecutar `toT.exe`.

`INSTALL.txt` incluido en el artefacto explica el primer inicio y el aviso de SmartScreen.

### macOS Apple Silicon

1. Si ya tienes una versión anterior de toT en **Aplicaciones**, cierra la app y elimina esa copia anterior.
2. Descargar el último **`.dmg` para macOS arm64** desde [GitHub Releases](https://github.com/Cibersino/tot/releases).
3. Abrir el archivo descargado.
4. Leer `INSTALL.txt` en la ventana del DMG.
5. Arrastrar `toT` a la carpeta **Aplicaciones**.
6. Abrir `toT` desde **Aplicaciones**.

`INSTALL.txt` incluido en el DMG explica el primer inicio y el aviso de cuarentena de macOS.

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

* **Extracción de texto**: extraer texto desde archivo (incluye OCR cuando aplica, planificación por lotes para varios archivos y división automática del PDF completo cuando OCR necesita partir un PDF pesado).
* **Portapapeles**: reemplazar o agregar texto desde el portapapeles.
* **Editor de Texto**: abrir el Editor de Texto.
* **Snapshots de texto**: guardar o cargar un snapshot de texto.
* **Tareas**: crear una nueva tarea o cargar una tarea.
* `Test de velocidad de lectura`: iniciar un test guiado desde un texto del pool o desde el texto actual.
* **Presets de WPM**: crear, editar, eliminar o restaurar presets de WPM.
* **Cronómetro Flotante**: activar o desactivar el Cronómetro Flotante.
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

## Reportes de errores / solicitudes de funcionalidad

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

**toT** is a desktop app that turns text into estimated reading time and helps you plan realistic reading workloads. It combines text extraction from text and image files, configurable WPM presets, precise counting, text snapshots, a text editor, a task editor, a stopwatch, and a reading speed test so you can measure, organize, and complete readings with less guesswork.

![Animated basic guide](public/assets/instrucciones/guia-basica.gif)

*Are you hesitant to start certain readings because you don't know how much work it will really take?*
*Do you find it hard to finish readings and end up abandoning them halfway?*
*Do you want to overcome your difficulties and develop your reading skills using scientific measurement and organization tools?*
*Does your browser accumulate a lot of tabs and bookmarks with news and articles of interest that you don't know if you will be able to read?*
*Do you have to teach a class this semester and need to give your students a realistic bibliography?*
*Do you need to prepare a text by tomorrow for a one-hour presentation?*
*Do you need to script a short audiovisual piece with precise timing?*
*Is the pile of books on your bedside table growing mercilessly?*
*Do you want to do experimental studies related to reading time?*

## Features

* Extract text from `txt`, `md`, `html`, `htm`, `docx`, `epub`, `rtf`, `odt`, `pdf`, and image files (`png`, `jpg`, `jpeg`, `jp2`, `webp`, `bmp`, `tif`, `tiff`), with PDF page selection, OCR for images and scanned PDFs, batch planning for multiple files, and automatic full-PDF split when OCR needs a heavy PDF to be divided first.
* Enter text by pasting it from the clipboard and/or typing it manually.
* Provide a Text Editor with find and replace.
* Estimate reading time with configurable WPM (words per minute).
* Count words and characters, with or without spaces.
* Segment words in Precise mode using `Intl.Segmenter`.
* Manage WPM presets: create, edit, delete, and restore defaults.
* Run a guided reading speed test: use the current text or texts from the pool, measure WPM, show optional comprehension questions, and create custom presets.
* Use a stopwatch with real WPM calculation and an optional floating window.
* Save and load current texts as text snapshots.
* Organize reading plans in the Task Editor.
* Use a multi-language UI with 25+ active languages.

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
4. Open the extracted `toT-<version>` folder.
5. Read `INSTALL.txt`.
6. Open `toT-app` and run `toT.exe`.

The `INSTALL.txt` file included in the artifact explains first-run steps and the SmartScreen warning.

### macOS Apple Silicon

1. If you already have an older version of toT in **Applications**, close the app and delete that previous copy.
2. Download the latest **macOS arm64 `.dmg`** from [GitHub Releases](https://github.com/Cibersino/tot/releases).
3. Open the downloaded file.
4. Read `INSTALL.txt` in the DMG window.
5. Drag `toT` to **Applications**.
6. Open `toT` from **Applications**.

The `INSTALL.txt` file included in the DMG explains first-run steps and the macOS quarantine warning.

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

Usage instructions are included in the app menu (“How to use”).

Quick actions in the main window:

* **Text extraction**: extract text from a file (includes OCR when needed, batch planning for multiple files, and automatic full-PDF split when OCR needs a heavy PDF to be divided first).
* **Clipboard**: replace or append text from the clipboard.
* **Text Editor**: open Text Editor.
* **Text snapshots**: save or load a text snapshot.
* **Tasks**: create a new task or load a task.
* `Reading speed test`: start a guided test from text in the pool or from the current text.
* **WPM presets**: create, edit, delete, or restore WPM presets.
* **Floating Stopwatch**: enable or disable the Floating Stopwatch.
* `Precise mode`: enable or disable Precise mode for counting words and characters.

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
