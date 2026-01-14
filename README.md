# toT — Reading Meter

Desktop (Electron) app to count words/characters and estimate reading time.

## Features

- Word and character counting (with/without spaces).
- “Precise mode” word segmentation using `Intl.Segmenter` (when available).
- Reading-time estimation with configurable WPM (words per minute).
- WPM presets: create/edit/delete + restore defaults (persisted between sessions).
- Stopwatch with real WPM calculation; optional floating window.
- Multi-language UI. (ES/EN for the moment).

---

## Requirements

### End users
- **Windows (portable build)**: Windows 10/11 (64-bit).
- **Planned**: macOS and Linux (not officially supported yet).

### Developers (run from source)
- Node.js 18+ (recommended: current LTS)
- npm (bundled with Node.js)

---

## Installation / How to run

1) Go to [GitHub Releases](https://github.com/Cibersino/tot-readingmeter/releases) and download the latest **Windows portable `.zip`**.
2) Extract the `.zip` to any folder.
3) Run the `.exe` inside the extracted folder.

Notes:
- This is a **portable build** (no installer).
- User settings/state are stored locally on your machine.

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
