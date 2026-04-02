# Epic: 1.0.0 cross-platform packaging (Windows/macOS/Linux)

## Objective

Launch version `1.0.0` with one distributable artifact per supported desktop OS, using a documented and repeatable packaging process:

* Windows: portable `.zip`
* macOS: `.dmg`
* Linux: `AppImage`

## Current state

Windows packaging is already in place:

* packaging tool already chosen: `electron-builder`;
* Windows portable packaging already implemented;
* Windows artifact naming/versioning already implemented;
* Windows packaging has already been used successfully in real releases;
* release evidence already exists under `docs/releases/<version>/`;
* a Windows packaging runbook already exists in `tools_local/packaging_windows_generic.md`.

macOS and Linux packaging are still pending.

Additional work already completed in this issue:

* first-pass cross-platform compatibility audit documented in `docs/issues/issue_60_cross_platform_audit.md`;
* packaging resource separation started:
  * runtime assets remain under `public/assets`;
  * packaging-only resources now live under `build-resources/`;
* `package.json` already includes:
  * `dist:mac`
  * `dist:linux`
  * macOS `.dmg` target
  * Linux `AppImage` target
* packaging runbooks now exist for:
  * Windows
  * macOS
  * Linux

Current remaining blockers before claiming cross-platform packaging ready:

* native packaging still has not been executed on a real Mac;
* native packaging still has not been executed on a real Linux environment;
* macOS still needs the final/generated `build-resources/logo-cibersino.icns`;
* platform-specific native-runtime legal coverage for packaged `sharp` still needs to be collected from native installs/builds.

## Scope

### In scope

* Audit current cross-platform compatibility before further packaging work.
* Decide what stays shared across all builds and what must be platform-specific.
* Define and implement compatibility fixes required for macOS/Linux packaging.
* Keep the existing Windows portable `.zip` release path as the baseline.
* Implement macOS packaging with `.dmg` as the target artifact.
* Implement Linux packaging with `AppImage` as the target artifact.
* Add the missing platform-specific branding/icon assets required for packaging.
* Document a repeatable manual packaging process for each OS.
* Smoke-test each packaged artifact on its native OS.
* Update public/release documentation to reflect the actual support matrix for `1.0.0`.

### Out of scope

* New installer families beyond the chosen target artifacts.
* Linux `deb` / `rpm`.
* Microsoft Store / Mac App Store / Snap / Flatpak / distro repositories.
* Auto-update implementation beyond what already exists or is already planned elsewhere.
* CI/CD automation unless it becomes necessary later.
* macOS signing/notarization automation in this first packaging pass.

## Packaging matrix for 1.0.0

* Windows: portable `.zip`
* macOS: `.dmg`
* Linux: `AppImage`

## Important macOS note

For macOS, the first milestone is **packaging validation on a real Mac**, initially with an **unsigned** build if needed.

Separate questions:

* **Can we produce and run a working macOS packaged artifact?**
* **Do we also need signing/notarization before 1.0.0?**

Initial goal:

* the app can be built on macOS;
* the packaged app can launch and run;
* the artifact format is viable for release.

Only after that should we decide whether macOS signing/notarization is mandatory for `1.0.0`.

## Decisions already made

* Packaging tool: `electron-builder`
* Windows artifact: portable `.zip`
* macOS artifact: `.dmg`
* Linux artifact: `AppImage`

## Pending implementation work

### Pre-packaging audit / design

Completed:

* compatibility audit written in `docs/issues/issue_60_cross_platform_audit.md`;
* shared vs platform-specific resource policy defined;
* post-build test list drafted;
* packaging-only resources separated from runtime assets at the repo-structure level.

Pending:

* implement the remaining compatibility fixes exposed by native packaging runs;
* complete platform-specific native-runtime legal coverage from native environments.

### Windows

Current Windows work:

* preserving the current packaging path;
* making sure `1.0.0` release docs stay aligned with the real process;
* re-running the release packaging flow for the final `1.0.0` release.

### macOS

Completed:

* macOS packaging target added to `package.json`;
* macOS packaging runbook added.

Pending:

* generate/provide `build-resources/logo-cibersino.icns` on a real Mac;
* review runtime/platform assumptions that may break on macOS during native validation;
* Build the first unsigned macOS artifact on a real Mac.
* Smoke-test the packaged build on macOS.
* Record friction observed from an unsigned macOS build.
* Decide whether signing/notarization is required before `1.0.0`.

### Linux

Completed:

* Linux packaging target added to `package.json`;
* Linux packaging runbook added;
* canonical Linux packaging icon/input defined under `build-resources/`.

Pending:

* review runtime/platform assumptions that may break on Linux during native validation;
* Build the first Linux `AppImage`.
* Smoke-test the packaged build on Linux.

## Acceptance criteria

* A compatibility audit exists before final cross-platform packaging work proceeds.
* Shared vs platform-specific build resources are defined explicitly.
* Required compatibility fixes are implemented before final native packaging runs.
* A platform-specific post-build test list exists for Windows, macOS, and Linux.
* Windows `.zip`, macOS `.dmg`, and Linux `AppImage` can each be produced from documented steps.
* Each packaged artifact launches successfully on its native OS.
* Each packaged artifact reports the correct app version.
* Branding/icon is correct in packaged app contexts that matter for each OS.
* README and release documentation reflect the actual supported artifacts and constraints.
* If macOS signing/notarization is deferred, the remaining user friction is documented explicitly.

## Risks / constraints

* macOS packaging requires access to a real Mac for build and validation.
* macOS unsigned builds may trigger Gatekeeper friction on first launch.
* Linux packaging still requires native validation; config alone is not enough.
* platform-specific native-runtime legal files for packaged `sharp` still need native evidence from macOS/Linux installs.
* Cross-platform packaging can fail even if config is correct, due to runtime assumptions in code or native deps.
* Cross-platform support is not complete until native smoke tests pass for each target OS.
* Platform-specific icon caching can complicate validation and must be checked carefully.

## Breakdown

- [x] Audit current cross-platform compatibility (code, assets, packaging assumptions)
- [x] Decide what remains shared vs platform-specific between builds
- [ ] List and implement required compatibility fixes before native packaging runs
- [x] Define the post-build test matrix for Windows, macOS, and Linux
- [x] Confirm Windows packaging baseline and existing release documentation
- [ ] Add macOS packaging config and assets
- [x] Add `tools_local/packaging_macos_generic.md`
- [ ] Generate/provide `build-resources/logo-cibersino.icns`
- [ ] Produce first unsigned macOS artifact on a real Mac
- [ ] Smoke-test macOS packaged build
- [x] Add Linux packaging config and base assets
- [x] Add `tools_local/packaging_linux_generic.md`
- [ ] Produce first Linux `AppImage`
- [ ] Smoke-test Linux packaged build
- [ ] Capture macOS/Linux native-runtime legal evidence for packaged `sharp`
- [ ] Decide whether macOS signing/notarization is required for `1.0.0`
- [ ] Update README + release docs for the final `1.0.0` support matrix
- [ ] Run release packaging for `1.0.0` on all in-scope platforms
