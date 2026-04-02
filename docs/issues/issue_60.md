# Epic: Cross-platform packaging (Windows/macOS/Linux) + portable builds

## Objective
Define and implement a maintainable cross-platform packaging strategy (Windows, macOS, Linux), including portable builds where feasible, and replace the default Electron window/app icon with project branding.

## Context / Problem
- We already have a Windows test release epic (0.1.6). This epic is broader: a consistent multi-OS packaging strategy.
- Packaging choices affect update strategy, signing/notarization requirements, and asset pipeline.

## Scope
### Packaging outputs (define targets explicitly)
- Windows:
  - Portable build (folder/zip) + optional installer (if ever needed)
- macOS:
  - .app bundle + dmg/zip distribution (note signing/notarization constraints)
- Linux:
  - AppImage and/or deb/rpm (choose minimal set)

### App identity / icon
- Replace default Electron icon where applicable:
  - Window icon
  - Taskbar/dock icon
  - Installer/package icon (if used)
- Define required asset formats/sizes:
  - Windows: .ico
  - macOS: .icns
  - Linux: .png set / desktop entry icon
- Add these assets to repo in a predictable location.

### Release pipeline
- Document the build commands per OS.
- Define where artifacts are produced and how they are named (include version).
- Decide whether CI is needed or keep manual steps (documented).

## Non-goals
- Auto-update implementation beyond what is already planned (unless it becomes necessary).
- Complex installer customization or store distribution (Microsoft Store, notarization automation) unless explicitly chosen.

## Decisions needed
- Packaging tool choice (keep current toolchain or migrate):
  - Option A: electron-builder
  - Option B: electron-forge
  - Option C: custom scripts + platform-specific packaging
- Minimum viable set of artifact formats per OS.
- Whether “portable” is required on macOS/Linux or only Windows.

## Acceptance criteria
- A documented, repeatable packaging process exists for Windows/macOS/Linux.
- Artifacts are versioned consistently and reproducible.
- App icon is replaced (no default Electron icon in standard window/taskbar contexts).
- README/release docs reflect how to obtain/run each build type.

## Risks / constraints
- macOS signing/notarization can block distribution depending on user environment.
- Linux packaging fragmentation (AppImage vs deb/rpm).
- Icons can be cached by OS; validation steps must be explicit.

## Breakdown (sub-issues)
- [ ] Decide packaging tool + target formats per OS
- [ ] Add icon assets (ico/icns/png set) + wire them into build config
- [ ] Implement Windows portable build naming/versioning rules (if not already covered by #47, keep this generic)
- [ ] Implement macOS packaging path (document constraints)
- [ ] Implement Linux packaging path (choose formats)
- [ ] Update docs: README + release checklist + tree_folders_files if new assets/paths added
- [ ] Smoke test: install/run each artifact type, verify icon, verify version string
