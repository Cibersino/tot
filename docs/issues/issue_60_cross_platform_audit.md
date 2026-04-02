# Issue 60 — Cross-platform compatibility audit and implementation notes

## Purpose

This document captures the first-pass audit for Issue 60 so the implementation can proceed from a stable written baseline.

It is intended to answer four questions:

* what already looks cross-platform-safe;
* what is still Windows-shaped or otherwise platform-sensitive;
* what should remain shared vs separated between platform builds;
* what must be tested after producing packaged artifacts.

## Current packaging baseline

The repo already has a working Windows release path:

* `electron-builder` is already the selected packaging tool.
* Windows portable `.zip` packaging already exists.
* Windows release docs already exist.

Current packaging config lives in `package.json`.

Current target matrix:

* Windows: portable `.zip`
* macOS: `.dmg`
* Linux: `AppImage`

## Status update

Completed after this audit:

* packaging-only resources were separated from runtime assets:
  * runtime assets remain under `public/assets`;
  * packaging-only assets now live under `build-resources/`;
* `package.json` now includes:
  * `dist:mac`
  * `dist:linux`
  * macOS `.dmg` target
  * Linux `AppImage` target
* macOS packaging runbook added:
  * `tools_local/packaging_macos_generic.md`
* Linux packaging runbook added:
  * `tools_local/packaging_linux_generic.md`
* platform packaging guides now include the step to collect native `sharp` runtime legal evidence from the real target OS before final release packaging.

Still pending:

* generate/provide `build-resources/logo-cibersino.icns` on a real Mac;
* execute first native macOS packaging run;
* execute first native Linux packaging run;
* collect real macOS/Linux native-runtime legal files for packaged `sharp`;
* validate whether Linux needs explicit window-icon wiring in code.

## What already looks cross-platform-safe

### 1. Shared packaged app contents

`package.json` already defines a mostly shared application payload for all platforms:

* `package.json`
* `electron/**`
* `public/**`
* `i18n/**`
* `LICENSE`
* `PRIVACY.md`

This is the right general shape: same app codebase, platform-specific artifact wrapper.

### 2. Storage path model

Persistence is already rooted under Electron `app.getPath('userData')/config`.

This is a strong cross-platform design choice because it avoids repo-local persistence and allows each OS to resolve its own standard user-data directory.

### 3. Path handling

The codebase uses `path.join(...)`, `path.resolve(...)`, and related Node path APIs extensively.

That is a good baseline for portability and is much better than hardcoded separators.

### 4. Platform abstraction already exists in some areas

Import/extract file-picker defaults already use per-platform adapters:

* Windows adapter
* macOS adapter
* Linux adapter
* fallback adapter

This means the repo already has some architecture for platform-specific behavior instead of scattering ad hoc branches everywhere.

### 5. Main-process lifecycle already accounts for macOS

The app already preserves the standard Electron/macOS behavior of recreating a window on `activate` and not quitting automatically on last-window-close when running on macOS.

## Main findings from the audit

### Finding 1: packaging-only assets and runtime assets required separation

Resolution already applied:

* runtime UI assets stay under `public/**`;
* packaging-only resources now live under `build-resources/`.

Remaining implication:

* keep future packaging-only files out of `public/**` so they do not leak into every platform build.

### Finding 2: macOS packaging is configured but not yet self-contained

Current macOS config expects:

* `build-resources/logo-cibersino.icns`

But the repo does not yet contain the final `.icns`.

Implication:

* macOS packaging is expected to fail until the final `.icns` exists or is generated during the Mac packaging flow.

### Finding 3: legal/runtime native dependency handling is still Windows-only

The current legal/runtime doc flow for `sharp` native runtime files is Windows-specific:

* app doc opening logic only maps `win32` native-runtime notice/license files;
* legal baseline docs explicitly mention the Windows native runtime files;
* no equivalent macOS/Linux native runtime legal artifacts are currently present.

Implication:

* even if macOS/Linux packaging succeeds technically, the release/legal/documentation side is still incomplete;
* this is a real cross-platform release blocker.

### Finding 4: Linux window/app icon behavior is not yet proven

Package-level icon config exists in `package.json`, but the `BrowserWindow(...)` constructors do not currently set an explicit window icon.

Implication:

* package metadata may be enough for some contexts;
* Linux desktop/window-manager behavior still needs native validation;
* a platform-specific window icon helper may be required.

### Finding 5: docs and public support matrix are still Windows-first

README currently documents Windows as the supported end-user build and macOS/Linux as planned.

Implication:

* documentation remains correct for the current repo state;
* it will need updating only after macOS/Linux packaging and native smoke tests are real.

### Finding 6: native dependency behavior still needs native validation

The repo includes `sharp`, and the lockfile already contains multiple platform variants for `@img/sharp-*`.

Implication:

* this is a good sign for eventual cross-platform packaging;
* but only native builds can confirm that the right runtime payload lands in each artifact;
* legal notice coverage must match the actual packaged platform variant.

## Shared vs platform-specific policy

This is the recommended resource policy going forward.

### Shared across all builds

Keep shared:

* application code under `electron/**`
* runtime UI/assets actually used by the app under `public/**`
* translations under `i18n/**`
* shared legal/privacy docs
* one canonical branded source image suitable for generating platform icons

### Platform-specific build resources

Separate or generate per platform:

* Windows package icon: `.ico`
* macOS package icon: `.icns`
* Linux package icon/input as required by packaging target
* native-runtime license/notice files for the actual packaged platform
* any packaging-only metadata files

### Generated and not tracked when possible

Prefer not to track:

* temporary macOS `.iconset` folders
* placeholder packaging files
* temporary packaging outputs

## Recommended compatibility fixes before native packaging runs

### Fix group 1: asset/resource separation

Status: repo-side separation already applied.

Rule to preserve:

* keep true runtime assets in `public/assets`;
* keep packaging-only assets out of the shared runtime asset tree.

### Fix group 2: macOS icon flow

Pick one of these policies and stick to it:

* track the final `.icns` in the repo; or
* generate the `.icns` on the Mac from a single tracked PNG source during packaging.

Avoid tracking intermediate `.iconset` folders unless there is a strong reason.

### Fix group 3: native-runtime legal coverage

Add the platform-specific legal/runtime coverage for packaged `sharp` native runtime dependencies.

At minimum:

* define macOS native-runtime license/notice files if required by the packaged output;
* define Linux native-runtime license/notice files if required by the packaged output;
* update app doc opening logic to resolve platform-specific runtime docs;
* update legal baseline docs to stop being Windows-only in this section.

Important practical constraint:

* on a Windows machine, local `node_modules` only exposes the Windows native `@img/sharp-*` runtime package;
* macOS/Linux runtime legal files should be captured from native installs/builds on those platforms, not guessed.

### Fix group 4: validate or patch platform icon behavior

After first native packaging runs:

* verify app icon behavior on Windows, macOS, and Linux;
* if Linux window icons are wrong, add a small platform-specific helper in `BrowserWindow` creation.

### Fix group 5: Linux packaging runbook

Status: completed.

## Proposed implementation order

1. Clean asset/resource separation.
2. Finalize the macOS icon strategy.
3. Add Linux packaging runbook.
4. Add platform-specific native-runtime legal coverage.
5. Run first unsigned macOS packaging attempt on a real Mac.
6. Run first Linux `AppImage` packaging attempt on Linux.
7. Collect failures.
8. Apply targeted runtime/platform fixes.
9. Re-run native packaging.
10. Update README and release docs only after native validation passes.

## Post-build test matrix

This is the minimum matrix to execute after packaging.

### Common tests for all packaged artifacts

* App launches successfully.
* App closes cleanly.
* App version matches `package.json`.
* Main branding/icon is correct in the packaged app.
* Local persistence under `app.getPath('userData')/config` works.
* Help/privacy/license documents open correctly from the packaged app.
* Text import/load/save flows work.
* Snapshot flows work.
* Task editor flows work.
* Packaged paths do not break bundled docs/assets.
* OCR-related flows fail gracefully when not configured.

### Windows-specific tests

* Portable `.zip` extracts and runs correctly.
* Existing Windows release path remains unchanged.
* Existing Windows native-runtime legal docs still open correctly.

### macOS-specific tests

* `.dmg` mounts correctly.
* `.app` can be copied out of the mounted volume and opened.
* First-launch unsigned friction is recorded.
* Dock/app icon is correct.
* Standard macOS activate/reopen behavior works.

### Linux-specific tests

* `AppImage` launches correctly.
* Window/app icon is correct in the desktop environment/window manager.
* `safeStorage` backend behavior is recorded for OCR token storage.
* Native file-opening flows behave correctly.

## Practical conclusions

### Conclusion 1

The repo is not starting from zero. It already has a reasonable cross-platform architecture baseline.

### Conclusion 2

Packaging config alone is not enough to claim compatibility.

The remaining work is mainly:

* native validation;
* legal/runtime artifact coverage per platform;
* cleaner separation of runtime assets vs packaging resources;
* platform-specific UX fixes if native tests expose them.

### Conclusion 3

The next implementation step should not be “just run a Mac build”.

The next implementation step should be:

* clean resource separation;
* define the icon/resource policy;
* prepare legal/runtime platform coverage;
* then run native builds.

## Suggested follow-up tasks

* Generate or provide `build-resources/logo-cibersino.icns` on a real Mac.
* Capture native `sharp` runtime legal evidence on macOS and Linux.
* Extend app/runtime legal doc coverage beyond Windows native `sharp` runtime.
* Validate whether Linux needs explicit window icon wiring.
* Execute native packaging/tests on macOS and Linux.
* Update README and release docs after native validation passes.
