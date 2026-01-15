* [Español](#es)
* [English](#en)

---

<a id="es"></a>

# toT — Reading Meter

Estimador de tiempo de lectura.

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

Reading time estimator.

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
