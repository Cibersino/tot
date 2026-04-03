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

## Current scope

The first automated slice is intentionally focused on low-friction contract tests for `electron/**`.
Renderer-heavy flows and real Electron smoke automation can be added later without blocking this baseline.
