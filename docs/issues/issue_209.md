# Epic: Reading-test pool external state + startup bundled hash sync

## Objective

Replace the current inline `tags.testUsed` model with a cleaner split:

* pool JSON files store only content metadata;
* reading-test usage state is stored externally in one runtime state file;
* bundled starter files are synchronized at app startup through stored bundled content hashes, not by filename existence.

This issue intentionally treats the feature as greenfield replacement work.

There is no legacy-compatibility or migration requirement for previously written pool files.

## Follow-up context

This issue replaces part of the model defined in:

* `docs/issues/issue_52.md`
* `docs/issues/issue_208.md`

Those issues introduced `tags.testUsed` inline in pool files. This issue removes that decision and replaces it with external pool state.

## Problem

The current model mixes two different concerns in the same JSON file:

* content owned by the file itself:
  * `text`
  * descriptive tags
  * optional `readingTest.questions`
* runtime state owned by the app session model:
  * whether that entry has already been consumed by the reading-speed selector

That design causes two avoidable problems:

1. pool files must be rewritten just to mark them used or unused;
2. bundled starter-file refresh is currently blocked by filename existence rather than real bundled-content change.

If a bundled starter file keeps the same name but changes content between app versions, the current existence-only seeding rule is not enough.

## Decision summary

This issue adopts all of the following decisions:

1. `testUsed` is removed from the pool/snapshot content schema.
2. Pool usage state moves to one dedicated runtime state file.
3. Bundled starter-file freshness is tracked by stored bundled content hashes.
4. Startup seeding/sync happens when the app starts, not when the user opens the reading-speed-test entry flow.
5. Hash comparison is based on bundled content hashes stored in state, not on hashing runtime files.
6. Normal snapshot loading continues accepting optional `readingTest` payloads so pool files remain ordinary snapshot-style JSON files.

## Why `readingTest` can stay while `testUsed` goes

These two pieces of data are not the same kind of thing.

* `readingTest` belongs to the file content:
  * it describes optional questions attached to that text;
  * it should travel with the file;
  * it makes sense inside the JSON file itself.
* `testUsed` does not belong to the file content:
  * it is app runtime state;
  * it depends on local use history;
  * it should not be embedded inside the file content.

So the target snapshot/pool-file model is:

```json
{
  "text": "Full reading text here.",
  "tags": {
    "language": "es",
    "type": "fiction",
    "difficulty": "normal"
  },
  "readingTest": {
    "questions": []
  }
}
```

No `testUsed` field exists anywhere in that file.

To keep pool files loadable through the normal snapshot feature, normal snapshot load must:

* accept this JSON shape,
* ignore `readingTest` during ordinary snapshot load,
* apply only `text` to current-text state.

That is the intended meaning behind:

* `readingTest` remains allowed in snapshot/pool files;
* `testUsed` must not remain in snapshot/pool files.

## External state file

Use one runtime state file for both:

* used/unused status;
* bundled-starter hash tracking.

Recommended path:

* `config/reading_test_pool_state.json`

Recommended shape:

```json
{
  "entries": {
    "/reading_speed_test_pool/axolotl.json": {
      "used": false,
      "managedBundledHash": "sha256:abc123"
    },
    "/reading_speed_test_pool/custom_story.json": {
      "used": true
    }
  }
}
```

Use `snapshotRelPath` keys rooted at the snapshots directory.

Examples:

* `/reading_speed_test_pool/axolotl.json`
* `/reading_speed_test_pool/custom_story.json`

Meaning:

* `used`
  * whether the entry has already been consumed by the reading-speed-test pool flow.
* `managedBundledHash`
  * the last installed bundled content hash for an app-managed starter file;
  * absent for imported or otherwise unmanaged files.

This keeps everything in one file while still keeping the semantics explicit.

There is no need for one file dedicated only to names and another dedicated only to hashes.

## Scope

### In scope

* Remove inline `tags.testUsed` from the pool-file and snapshot-file schema.
* Add one external runtime state file for reading-test pool usage + bundled-hash tracking.
* Move starter-file sync to app startup.
* Replace existence-only starter sync with bundled-hash comparison.
* Prune stale pool-state entries and retired app-managed starter files during startup sync.
* Refactor pool selection/reset/start logic to use external state.
* Refactor import handling so imported files do not carry `testUsed`.
* Refactor snapshot save/load validation accordingly.
* Remove obsolete inline-`testUsed` code and tests.

### Out of scope

* Any migration path for old pool files containing `testUsed`.
* Any compatibility mode that still accepts inline `testUsed`.
* Remote manifests, remote catalogs, or remote sync.
* Reworking the reading-test questions model itself.

## Content model after this issue

### Pool files

Pool files remain snapshot-style JSON files with:

* required `text`;
* optional descriptive `tags.language`;
* optional descriptive `tags.type`;
* optional descriptive `tags.difficulty`;
* optional `readingTest.questions`.

Pool files do not carry:

* `tags.testUsed`

### Snapshot saves

Normal snapshot save must no longer inject any `testUsed` field.

### Snapshot loads

Normal snapshot load must continue accepting snapshot-style reading-test files so the snapshot feature and pool files remain compatible.

That means:

* `readingTest` remains accepted in the file schema;
* `readingTest` is ignored during ordinary snapshot load;
* only `text` is applied to current-text state;
* `testUsed` is not part of the schema anymore.

## Pool entry model in memory

The pool helper should stop pretending usage state is a tag.

Recommended serialized/in-memory shape:

```json
{
  "snapshotRelPath": "/reading_speed_test_pool/axolotl.json",
  "fileName": "axolotl.json",
  "tags": {
    "language": "es",
    "type": "fiction",
    "difficulty": "normal"
  },
  "used": false,
  "hasValidQuestions": true
}
```

Important:

* `tags` keep descriptive file metadata only;
* `used` becomes top-level derived state merged from `reading_test_pool_state.json`.

## Startup bundled sync model

### When it runs

Run the bundled starter sync during app startup, before the reading-speed-test entry flow becomes available.

### What it compares

Do not compare:

* runtime filename existence only;
* raw runtime-file hashes.

Do compare:

* current bundled content hash;
* stored `managedBundledHash` for that same relative path.

### Key rule

The update decision is based on:

* `current bundled content hash` vs `stored bundled content hash`

It is not based on:

* runtime file bytes
* runtime formatting
* runtime mtime
* filename existence alone

### Recommended startup algorithm

For each bundled starter file under `electron/reading_test_pool/`:

1. Compute its `snapshotRelPath` inside the runtime snapshots tree.
2. Compute its bundled content hash from a canonical JSON serialization of the parsed bundled file.
3. Read the runtime state entry for that `snapshotRelPath`.
4. Resolve the runtime destination path.
5. Apply these rules:

* if the runtime file does not exist:
  * copy the bundled file into the runtime pool;
  * set `managedBundledHash` to the bundled content hash;
  * set `used` to `false`.
* else if the state entry has `managedBundledHash` and it differs from the current bundled content hash:
  * overwrite the runtime file with the new bundled file;
  * update `managedBundledHash`;
  * reset `used` to `false`, because the content changed.
* else if the state entry has `managedBundledHash` and it matches the current bundled content hash:
  * do nothing.
* else if the runtime file exists and there is no `managedBundledHash`:
  * treat that path as unmanaged and do not overwrite it.

This allows the state file to decide whether a path is still app-managed starter content.
The state file is authoritative for bundled-management ownership.

### Why reset `used` on bundled content hash change

If the bundled starter content changed, the user has not consumed that new content yet.

So when bundled content changes and the runtime file is refreshed, its external usage state should become:

* `used = false`

That ensures the updated text is actually available to the reading-speed pool.

### Prune semantics during startup sync

Startup sync should also reconcile stale state and retired managed starter files.

Rules:

* if a state entry points to a pool file that no longer exists on disk:
  * delete that state entry;
  * do not delete anything else.
* if a state entry has `managedBundledHash` but that `snapshotRelPath` is no longer present in the current bundled starter set:
  * delete the runtime pool file;
  * delete the state entry.
* if a runtime pool file exists and does not have `managedBundledHash`:
  * treat it as unmanaged;
  * never auto-delete it during startup prune.

So:

* stale state for deleted imported/custom files is cleaned up;
* retired app-managed starter files are removed;
* unmanaged imported/custom files are preserved.

## Import and write semantics

Imported files must not bring `testUsed` into the pool content model.

Import behavior for written destination files:

* reject imported JSON that contains `testUsed`;
* write only content fields;
* set `used = false` in external state for the written path;
* clear `managedBundledHash` for the written path, because imported files are not app-managed starter files.

This keeps imported files outside the startup-managed bundled-sync path.

## Pool start / selection / reset semantics

### Selection

Eligibility must use external state, not file tags.

A file is eligible only when:

* `entry.used === false`
* the active language/type/difficulty filters match as usual

### Start

When a pool-based reading-speed test starts successfully:

* mark the selected entry `used = true` in `reading_test_pool_state.json`
* do not rewrite the pool JSON file

### Reset

Pool reset must no longer rewrite pool files.

Reset should:

* clear `used` flags in `reading_test_pool_state.json`
* leave all pool JSON content files untouched

## Snapshot and validator changes

### Shared tag catalog

Remove `testUsed` from the shared snapshot tag catalog.

After this issue, the tag catalog is only for descriptive tags:

* `language`
* `type`
* `difficulty`

### Snapshot save

Snapshot save must:

* stop forcing `testUsed: false`
* persist only descriptive tags when provided

### Snapshot load

Snapshot load must:

* reject `testUsed` as part of the file schema
* continue accepting `readingTest`
* keep ordinary snapshot-load behavior:
  * load only `text` into current text

## Main code areas expected to change

* `electron/main.js`
  * call the pool startup sync during app startup
* `electron/reading_test_pool.js`
  * own the external-state load/save
  * own bundled content hash sync
  * merge content files + external state into in-memory entries
* `electron/reading_test_session.js`
  * mark pool entries used in external state
  * stop rewriting content files
* `electron/reading_test_pool_import.js`
  * reject `testUsed`
  * clear bundled-content-hash tracking for imported writes
* `electron/current_text_snapshots_main.js`
  * remove `testUsed` from save/load schema rules
* `public/js/lib/snapshot_tag_catalog.js`
  * remove `testUsed`
* `public/js/lib/reading_test_filters_core.js`
  * read `entry.used`, not `entry.tags.testUsed`
* bundled starter files under `electron/reading_test_pool/`
  * remove inline `testUsed`

## Acceptance criteria

* Pool JSON files no longer contain `tags.testUsed`.
* Snapshot save no longer writes any `testUsed`.
* Snapshot load no longer accepts `testUsed`.
* Snapshot load continues accepting optional `readingTest` payloads and ignores them during ordinary snapshot load.
* One runtime state file tracks both:
  * pool usage state,
  * bundled starter hashes.
* Reading-speed pool selection uses external state rather than inline tag state.
* Starting a pool test marks the selected entry as used without rewriting the content file.
* Reset clears external usage state without rewriting the content files.
* Bundled starter-file sync runs on app startup.
* Bundled starter-file refresh is driven by stored bundled content hashes, not filename existence.
* When bundled starter content changes, the runtime file is refreshed and its `used` state becomes `false`.
* Startup prune removes stale state entries for missing pool files.
* Startup prune removes retired app-managed starter files and their state entries.
* Startup prune does not auto-delete unmanaged imported/custom files.
* Imported files are not silently pulled back under bundled-hash management.
* Imported files containing `testUsed` are rejected as invalid.
* No dead inline-`testUsed` code remains after implementation.

## Risks / constraints

* This issue deliberately changes the content schema; any in-progress test files using `testUsed` must be rewritten for the new model.
* Startup sync must remain contained in a dedicated helper and not bloat `electron/main.js`.
* The external state file becomes authoritative for usage state and bundled-hash tracking; writes must stay robust and simple.

## Implementation plan

1. Add the new runtime state file support.
   * Create helpers to read/write `config/reading_test_pool_state.json`.
   * Use one per-entry object that can store both `used` and optional `managedBundledHash`.

2. Remove `testUsed` from the content schema.
   * Update the shared tag catalog.
   * Update snapshot validation.
   * Update snapshot save.
   * Remove inline `testUsed` from bundled starter JSON files.

3. Refactor the pool helper.
   * Load content files without inline usage state.
   * Load external pool state.
   * Expose merged in-memory entries with top-level `used`.

4. Implement startup bundled content hash sync.
   * Compute bundled content hashes from canonical JSON serialization.
   * Compare them to stored `managedBundledHash`.
   * Copy/overwrite only according to the new startup rules.
   * Prune stale state entries and retired managed starter files.

5. Refactor reading-test session behavior.
   * Mark selected entries used in external state.
   * Stop rewriting pool JSON files during start/reset.

6. Refactor import behavior.
   * Reject imported JSON that contains `testUsed`.
   * Reset `used` for newly written imported files.
   * Clear `managedBundledHash` for imported writes.

7. Update pool-filter logic and renderer contracts.
   * Consume `entry.used` instead of `entry.tags.testUsed`.
   * Keep the rest of the filter semantics unchanged.

8. Update tests and docs.
   * Rewrite manual/regression expectations that currently mention inline `tags.testUsed`.
   * Remove dead docs and code paths that describe the old inline-usage model.

## Codex policy

After implementation, any deviation from or irresolution of the plan above must be explained explicitly.
