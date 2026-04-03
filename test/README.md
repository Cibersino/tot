# Test Layout

This repo currently uses the Node built-in test runner for the stable automated baseline.

## Directories

* `test/unit/electron/` - unit/integration tests for Node-accessible app modules under `electron/**`
* `test/unit/shared/` - reserved for future pure shared helpers extracted from renderer code
* `test/fixtures/` - reserved for reusable fixture files when a test needs stable sample inputs
* `test/helpers/` - reserved for reusable test utilities
* `test/smoke/` - reserved for future Electron smoke tests

## Scripts

* `npm test` - runs the stable baseline suite
* `npm run test:unit` - runs the same unit baseline directly
* `npm run test:smoke` - runs the local-only Electron launch smoke suite

## Current scope

The first automated slice is intentionally focused on low-friction contract tests for `electron/**`.
Renderer-heavy flows and real Electron smoke automation can be added later without blocking this baseline.

The smoke suite is intentionally separate from `npm test` and CI for now. It launches the real Electron app in an isolated temporary profile and is meant to prove a minimal startup path without turning the baseline gate flaky.

See also:

* `docs/test_suite.md` - manual release smoke + regression source of truth
  * The manual suite now includes a short "Automated coverage status" section showing which areas have partial automated backing today.
