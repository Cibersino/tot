# Issue Proposal: set up automated test foundation for the app

## Objective

Establish a maintainable automated test baseline for the Electron app so regressions can be caught earlier and the existing manual release checks can be reduced to a smaller, higher-signal smoke pass.

This issue should create the **foundation** for automated testing, not attempt to automate the entire app in one pass.

## Current state

The repo already has a substantial manual regression source of truth in:

* `docs/test_suite.md`

That manual suite covers the main app flows well, but the repo still lacks an automated harness:

* `package.json` still defines `npm test` as a placeholder failure command;
* there is no established unit/integration/e2e test layout;
* there is no CI gate for automated app regression;
* many regressions can only be caught by running the manual suite.

At the same time, the codebase already contains several modules that are good first candidates for automation:

* pure or near-pure main-process helpers exported from `electron/**`;
* shared import/extract contract logic under `electron/import_extract_platform/**`;
* renderer-side logic whose behavior is stable but may need light extraction from `window` bootstrapping wrappers.

## Why this issue is worth opening

This work has leverage across the whole repo:

* repeated refactors in main/renderer logic have become expensive to validate manually;
* the manual suite is strong enough to guide what should be automated first;
* several critical contracts already exist in isolated modules, so the first wave of tests does not require full UI automation;
* once the baseline exists, future issues can add coverage incrementally instead of re-deciding tooling every time.

This issue should therefore focus on building the testing runway, then using it on a small but meaningful regression slice.

## Scope

### In scope

* Choose and wire a primary automated test baseline for this repo.
* Replace the placeholder `npm test` command with a real automated test entrypoint.
* Define a clear test folder/layout and naming convention.
* Add first-wave automated tests for low-friction, high-value modules.
* Add a minimal app-level smoke layer for critical flows if the chosen tooling supports it cleanly.
* Document how automated tests relate to the existing manual suite in `docs/test_suite.md`.
* Add CI execution for the automated subset that is stable enough to gate changes.

### Explicitly out of scope

* Full automation of the complete manual suite in one issue.
* Broad OCR provider/network-dependent end-to-end coverage in the first pass.
* Cross-platform matrix expansion beyond the first practical target environment.
* Snapshot-heavy or pixel-perfect UI testing.
* Large renderer rewrites whose only purpose is testability polish.

## Recommended approach

### 1. Start with the lowest-friction foundation

Prefer a baseline that fits the repo as it exists today:

* CommonJS project
* no transpilation/test-build pipeline
* Electron app with both main and renderer surfaces

A pragmatic first split is:

* unit/integration tests for Node-accessible modules;
* a small Electron app smoke layer for real launch-level validation.

The exact tools can still be finalized during implementation, but they should be chosen for **low setup cost**, **clear fit with CommonJS**, and **good Windows/Electron ergonomics**.

### 2. Automate contracts before UI breadth

The first tests should target stable contracts whose failures would indicate real regressions, for example:

* settings normalization and defaults
* supported-format contract for import/extract
* route-selection / prepare-time decision helpers
* storage/path validation helpers
* provider-failure classification helpers

This gives value quickly without depending on brittle UI selectors.

### 3. Add only a minimal real-app smoke layer

After the baseline unit/integration layer is in place, add a small Electron smoke suite that answers questions like:

* does the app launch;
* does the main window become ready;
* do one or two critical renderer interactions still work.

That smoke layer should stay intentionally small in this issue.

### 4. Keep manual and automated coverage aligned

The automated suite should explicitly reference the relevant sections or IDs from `docs/test_suite.md` so coverage can expand from a known source instead of drifting into a separate undocumented test map.

## Concrete implementation plan

### Recommended first-pass stack

Use the smallest stack that matches the repo as it exists today:

* **Unit/integration:** Node built-in test runner (`node --test`) + `node:assert/strict`
* **Smoke/e2e:** defer initially, or add Playwright-for-Electron only after the unit baseline is stable

Why this is the right first pass:

* no existing test harness needs to be migrated;
* the repo is already CommonJS, so `node --test` fits without transpilation;
* several first-wave targets do not need DOM or Electron window automation;
* this avoids adding a large test framework before the repo has even wired `npm test`.

This issue should therefore treat **Node test runner as required** and **Electron UI automation as phase 2 / optional within the same issue**.

### Recommended repo layout

Add a small, explicit structure:

* `test/unit/electron/`
* `test/unit/shared/` only if shared helpers appear later
* `test/fixtures/` for sample JSON/text/temp inputs used by tests
* `test/helpers/` for reusable test utilities if needed
* `test/smoke/` only if a first Electron smoke layer is added

The key point is to separate:

* low-friction Node-accessible contract tests;
* later real-app launch tests.

### Recommended script layout

Replace the placeholder test command with something like:

* `test`: run the stable baseline only
* `test:unit`: run `node --test test/unit/**/*.test.js`
* `test:smoke`: reserved for later Electron smoke coverage

Initial policy:

* `npm test` should point to the deterministic unit/integration subset;
* smoke automation should not block the baseline until it is stable enough.

### Recommended CI target for the first pass

The repo currently has **no `.github/workflows/` directory**, so this issue should create CI from scratch.

For the first pass, use a minimal GitHub Actions workflow that:

* runs on Windows
* checks out the repo
* runs `npm ci`
* runs `npm test`

Windows is the pragmatic starting point because:

* Windows is the currently supported desktop target;
* it matches the most realistic contributor/release path for the app today;
* it avoids pretending cross-platform automated confidence already exists when it does not.

### Recommended first test files

These should be the first concrete files added:

* `test/unit/electron/import_extract_supported_formats.test.js`
* `test/unit/electron/ocr_google_drive_activation_state.test.js`
* `test/unit/electron/ocr_google_drive_provider_failure.test.js`
* `test/unit/electron/ocr_google_drive_provider_failure_classification.test.js`
* `test/unit/electron/import_extract_prepared_store.test.js`
* `test/unit/electron/settings.test.js`

These are the best first targets because they already expose stable `module.exports` surfaces and most of their behavior is contract-oriented rather than UI-oriented.

### What each first test file should cover

#### `import_extract_supported_formats.test.js`

Assert:

* extension normalization with and without leading dot;
* native parser lookup for supported/unsupported extensions;
* OCR MIME lookup for supported/unsupported extensions;
* supported-extension lists stay aligned with the contract.

#### `ocr_google_drive_activation_state.test.js`

Assert:

* missing credentials returns `credentials_missing`;
* credentials present but token missing returns `ocr_activation_required`;
* both present returns `available: true`.

This is a clean first example of state-classification testing with almost no setup burden.

#### `ocr_google_drive_provider_failure.test.js`

Assert:

* provider payload parsing from object and JSON-string inputs;
* `errors[].reason` extraction;
* `google.rpc.ErrorInfo` extraction;
* `provider_api_disabled` normalization;
* bounded conflict behavior when provider reason sources disagree.

#### `ocr_google_drive_provider_failure_classification.test.js`

Assert:

* quota/rate-limit classification by HTTP `429`;
* quota/rate-limit classification by known provider reason codes;
* auth classification by HTTP `401` and auth-related reasons;
* connectivity classification for network error code / `5xx`;
* retryability helper behavior.

#### `import_extract_prepared_store.test.js`

Assert:

* created records receive `prepareId` and TTL fields;
* `peekPreparedRecord` returns active records;
* `consumePreparedRecord` marks records as used;
* reused IDs return `reused`;
* very short TTL expiry path behaves correctly;
* `shortPrepareId` truncates safely.

This module is stateful in-memory, so tests should keep each case self-contained and avoid hidden cross-test coupling.

#### `settings.test.js`

Start with the exported pure-ish surface instead of full IPC coverage.

Assert:

* `normalizeLangTag`, `normalizeLangBase`, `getLangBase`, and `deriveLangKey`;
* `init` + `getSettings` + `saveSettings` with injected fake `loadJson` / `saveJson`;
* invalid or partial settings normalize to safe defaults;
* language-keyed buckets are preserved or materialized correctly;
* `set-mode-conteo`-style normalization can be validated indirectly through saved settings where practical.

The first pass should avoid heavy Electron IPC mocking and focus on the normalization contract the module already owns.

### Renderer plan for phase 1.5

Do **not** start by testing `public/js/count.js` and `public/js/format.js` through a fake `window`.

Instead, if coverage is still wanted in this issue:

* extract the pure logic into importable helper modules under a shared renderer-safe path;
* leave the current renderer wrappers responsible only for wiring to `window`.

That keeps the tests focused on counting/formatting behavior instead of bootstrapping noise.

Suggested follow-up files if that extraction is accepted:

* `public/js/lib/count_core.js`
* `public/js/lib/format_core.js`
* `test/unit/shared/count_core.test.js`
* `test/unit/shared/format_core.test.js`

### Smoke automation plan

Only after the unit baseline is passing should this issue consider a minimal smoke layer.

If added in this issue, keep it to:

* app launches;
* main window is visible;
* one simple text-entry / result-calculation path works.

Do not include OCR, updater, external-linking, or multi-window breadth in the first smoke slice.

## Proposed first-wave targets

### Strong first candidates

* `electron/settings.js`
* `electron/import_extract_platform/import_extract_supported_formats.js`
* `electron/import_extract_platform/import_extract_prepare_execute_core.js`
* `electron/import_extract_platform/import_extract_prepared_store.js`
* `electron/import_extract_platform/ocr_google_drive_activation_state.js`
* `electron/import_extract_platform/ocr_google_drive_provider_failure.js`
* `electron/import_extract_platform/ocr_google_drive_provider_failure_classification.js`

These modules already expose `module.exports` surfaces and represent real behavior contracts.

### Renderer candidates after light extraction

* `public/js/count.js`
* `public/js/format.js`

These are valuable because they cover counting and time-formatting correctness, but they currently live inside renderer bootstrapping wrappers and may need a small extraction step so their core logic can be imported directly without a DOM/window harness.

## Design requirements

### 1. The baseline must be easy to run locally

Running the first automated suite should be straightforward from a clean checkout.

Avoid a setup that requires excessive custom scaffolding before contributors can run:

* `npm test`
* targeted test command(s) for local iteration

### 2. Tests must reflect stable contracts, not incidental implementation details

Prefer tests that assert:

* normalized outputs
* route availability
* structured error classification
* persistence normalization behavior

Avoid tests that lock in internal implementation trivia unless that trivia is part of the actual contract.

### 3. The first app-level automation should stay narrow

If an Electron smoke suite is added in this issue, it should stay limited to a few high-value flows rather than trying to reproduce the entire manual matrix.

Examples of acceptable first-pass smoke assertions:

* app launches without crash;
* main window renders core sections;
* basic text entry / calculation path works;
* one safe menu or modal path still opens.

### 4. Network-heavy and provider-heavy flows should be isolated

OCR activation, updater behavior, and other network/provider paths are important, but they should not dominate the first automation issue unless they can be tested reliably with clear stubbing boundaries.

### 5. CI should only gate what is stable

The CI layer introduced by this issue should run the subset of automated tests that are deterministic enough to be useful.

Do not make the repo harder to merge by gating on flaky first-pass UI automation.

## Acceptance criteria

* `package.json` exposes a real `npm test` command.
* A test directory structure and naming convention exist in the repo.
* At least one automated unit/integration suite exists for exported app modules under `electron/**`.
* The first automated suite covers at least one real contract from the import/extract platform layer.
* If renderer utility logic remains important but non-importable, this issue includes the minimal extraction required to test it cleanly.
* If app-level smoke automation is added, it launches the Electron app and validates a minimal critical path only.
* The relationship between automated coverage and `docs/test_suite.md` is documented.
* CI runs the stable automated subset.

## Risks / constraints

* Some renderer logic is currently coupled to `window` bootstrapping and may require careful extraction to avoid behavior drift.
* Electron app automation can become flaky quickly if the scope is too broad too early.
* OCR/updater/network paths may require stubbing or explicit deferral to follow-up issues.
* Test tooling choice has long-term maintenance cost, so the first decision should favor repo fit over trendiness.
* Over-scoping this issue into “full automation” would likely delay useful coverage on modules that are already testable now.

## Recommended implementation order

1. Choose the baseline test stack and wire `npm test`.
2. Define the repo test layout and conventions.
3. Add first-wave tests for exported low-friction `electron/**` modules.
4. Add import/extract contract regression coverage.
5. Extract minimal renderer pure logic only where coverage payoff is high.
6. Add a very small Electron smoke suite if it can remain stable.
7. Wire the stable subset into CI.
8. Update docs to show how automated and manual coverage coexist.

## Breakdown

- [x] Choose the baseline automated test stack for this repo
- [x] Replace the placeholder `npm test` command in `package.json`
- [x] Add a documented test directory/layout convention
- [x] Add first-wave tests for `electron/settings.js`
- [x] Add first-wave tests for `electron/import_extract_platform/import_extract_supported_formats.js`
- [x] Add first-wave tests for selected import/extract decision helpers
- [x] Add first-wave tests for at least one provider-failure classification module
- [ ] Decide whether `public/js/count.js` should be extracted into a directly testable pure helper module in this issue
- [ ] Decide whether `public/js/format.js` should be extracted into a directly testable pure helper module in this issue
- [ ] Add a minimal Electron smoke suite only if it remains stable and narrow
- [x] Add CI execution for the stable automated subset
- [ ] Document how automated coverage maps back to `docs/test_suite.md`

## Progress update

Current implementation completed in the repo:

* `package.json` now runs the Node built-in test runner via `npm test`.
* A first repo test layout exists under `test/`.
* A first Windows GitHub Actions workflow exists under `.github/workflows/test.yml`.
* The current automated baseline covers:
  * `electron/settings.js`
  * `electron/import_extract_platform/import_extract_supported_formats.js`
  * `electron/import_extract_platform/import_extract_prepare_execute_core.js` (decision-helper slice)
  * `electron/import_extract_platform/ocr_google_drive_activation_state.js`
  * `electron/import_extract_platform/ocr_google_drive_provider_failure.js`
  * `electron/import_extract_platform/ocr_google_drive_provider_failure_classification.js`
  * `electron/import_extract_platform/import_extract_prepared_store.js`

Still pending in this issue:

* any renderer pure-logic extraction (`count.js`, `format.js`);
* any real Electron smoke automation;
* explicit docs linkage back to `docs/test_suite.md`.
