# Test Layout

This repo currently uses the Node built-in test runner for the stable automated baseline.

## Directories

* `test/unit/electron/` - unit/integration tests for Node-accessible app modules under `electron/**`
* `test/unit/shared/` - unit tests for shared pure logic extracted from renderer-facing code and shared UI contracts
* `test/unit/extensions/` - reserved for future tests that need a separate extension-oriented ownership bucket
* `test/fixtures/` - reserved for reusable fixture files when a test needs stable sample inputs
* `test/helpers/` - reserved for reusable test utilities
* `test/smoke/` - local Electron smoke tests that launch the real app in an isolated profile

## Scripts

* `npm test` - runs the stable baseline suite
* `npm run test:unit` - runs the same unit baseline directly
* `npm run test:smoke` - runs the local-only Electron launch smoke suite

## Ownership

This file owns:

* automated test layout under `test/**`
* test runner commands and entrypoints
* the high-level automated suite shape

This file does not own:

* manual release/regression steps
* policy rules for how tests may shape production code

## Update Rule

Update this file when a change affects:

* test directory structure or ownership
* test commands or runner usage
* the documented shape of the automated suite

Do not update this file for routine test additions inside an already documented bucket unless the documented suite shape changes.

## Current scope

The current automated baseline is intentionally focused on low-friction contract tests under `test/unit/**`.
Today that includes:

* `test/unit/electron/` coverage for Node-accessible main-process modules
* `test/unit/shared/` coverage for shared pure logic and renderer-adjacent contracts that can be exercised without full UI automation

Renderer-heavy end-to-end flows are still mostly manual. The current smoke layer is intentionally minimal and does not try to replace the manual app-level suite.

The smoke suite is intentionally separate from `npm test` and CI for now. It launches the real Electron app in an isolated temporary profile and is meant to prove a minimal startup path without turning the baseline gate flaky.

See also:

* `docs/test_suite.md` - manual release smoke + regression source of truth
  * The manual suite now includes a short "Automated coverage status" section showing which areas have partial automated backing today.
* `tools_local/coding_rules/automated_test_policy.md` - policy for how automated tests should be added or updated without distorting production code
