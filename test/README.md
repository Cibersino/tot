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

## Document role

This document owns the automated test layout:

* directory purpose under `test/**`
* runner entrypoints and local commands
* the current automated suite shape at a high level

It is not the source of truth for manual regression steps or for policy rules about how production code may be changed to support tests.

## When to update this doc

Update this file in the same change when a testing change alters any of the following:

* test directory structure or ownership
* test entrypoints, commands, or runner usage
* the high-level scope of the automated baseline described here

Routine additions of new test cases inside an existing documented bucket do not require edits here unless they change the documented suite shape.

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
