# toT — Reading Meter

Desktop app (Electron) to count words/characters and estimate reading time.

**Version:** see [`VERSION`](VERSION) and [GitHub Releases](https://github.com/Cibersino/tot-readingmeter/releases).
**Roadmap:** GitHub Project: [toT Roadmap](https://github.com/users/Cibersino/projects/2)

---

## Features

- Supports multi-language UI (ES/EN).
- Text counting: words and characters (with/without spaces). Precise mode uses `Intl.Segmenter` (when available) with language-aware segmentation.
- Reading time estimation (configurable WPM — words per minute).
- WPM presets: create, edit, delete, restore defaults (persisted between sessions).
- Stopwatch with real WPM calculation; optional floating window.

---

## How to use

Usage instructions are included in the app menu (Guide / Instructions / FAQ).

---

## Download / Run (end users)

Download builds from GitHub Releases (when available): [GitHub Releases](https://github.com/Cibersino/tot-readingmeter/releases).

Planned release work is tracked in the roadmap project.

---

## Run from source (development)

Requirements:
- Node.js 18+ (recommended: current LTS)
- A system compatible with Electron

Steps:
```bash
git clone https://github.com/Cibersino/tot-readingmeter.git
cd tot-readingmeter
npm install
npm start
```

---

## Documentation

- Release process: [`docs/release_checklist.md`](docs/release_checklist.md)
- Changelog (short): [`CHANGELOG.md`](CHANGELOG.md)
- Changelog (detailed): [`docs/changelog_detailed.md`](docs/changelog_detailed.md)
- Repo structure / important files: [`docs/tree_folders_files.md`](docs/tree_folders_files.md)

---

## Bug reports / Feature requests

- Use GitHub Issues (labels: `area:*`, `S0–S3`, `status:*`).
- Track prioritization and milestones in the GitHub Project: [toT Roadmap](https://github.com/users/Cibersino/projects/2)

---

## License

MIT — see [`LICENSE`](LICENSE).

## Author

[Cibersino](https://github.com/Cibersino)

---