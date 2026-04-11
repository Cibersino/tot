# Main/Renderer Entrypoint Modularization Policy

**Project:** toT  
**Status:** Draft (v0.1)  
**Scope:** `electron/main.js` and `public/renderer.js`

## 1. Purpose

Define the maintained policy that keeps the two main entrypoints focused on orchestration instead of turning into feature buckets.

This document exists because the repo already relies on the rule informally, but the rule is currently scattered across issue plans, cleanup notes, and changelog entries.

The goal is to make future feature work and cleanup decisions consistent:

1. `electron/main.js` stays readable as the process entrypoint.
2. `public/renderer.js` stays readable as the main UI entrypoint.
3. Feature logic gets a clearer owner.
4. Review decisions are based on behavior and ownership, not only on file length.

Related documents:

* `docs/cleanup/cleanup_file_by_file.md`
* `docs/cleanup/preload_listener_api_standard.md`
* `docs/cleanup/renderer_dialog_notify_policy.md`
* `docs/cleanup/bridge_failure_mode_convention.md`

## 2. Core rule

`electron/main.js` and `public/renderer.js` are maintained as **orchestrators**.

They may wire modules together, coordinate startup, and connect stable surfaces, but they should not become the default home for new feature logic.

When a change introduces feature-specific behavior, prefer extracting it into a dedicated module and keep the entrypoint responsible only for:

1. bootstrapping,
2. dependency wiring,
3. high-level coordination,
4. explicit integration points.

## 3. Ownership baseline

### 3.1 `electron/main.js`

`electron/main.js` is the owner of:

1. app lifecycle wiring,
2. window creation and top-level window coordination,
3. startup sequencing and READY boundary coordination,
4. top-level dependency construction,
5. registration of delegated feature modules,
6. narrow cross-cutting orchestration that genuinely spans multiple modules/windows.

`electron/main.js` is **not** the preferred owner of:

1. feature-specific parsing or validation rules,
2. feature-specific persistence logic,
3. long IPC handler bodies with domain behavior,
4. feature-local state machines,
5. file import/export pipelines,
6. provider-specific integrations,
7. reusable helper utilities that mainly serve one feature.

Default direction:

* keep orchestration in `main.js`,
* move feature behavior to modules such as `electron/*.js` or feature folders,
* expose explicit entrypoints like `registerIpc(...)`, `init(...)`, or well-named helpers,
* avoid import-time side effects as the main integration mechanism.

### 3.2 `public/renderer.js`

`public/renderer.js` is the owner of:

1. main-window bootstrap,
2. DOM and module initialization ordering,
3. event wiring across stable UI modules,
4. high-level UI coordination,
5. startup guards and readiness flow,
6. integration with `window.electronAPI` and stable global renderer modules.

`public/renderer.js` is **not** the preferred owner of:

1. feature-specific transformation logic,
2. repeated formatter/helper code,
3. dialog policy wrappers,
4. import/export workflows,
5. complex modal internals,
6. feature-local state containers that can live in dedicated UI modules,
7. reusable business rules shared by multiple UI actions.

Default direction:

* keep wiring in `renderer.js`,
* move feature logic to `public/js/*` or `public/js/lib/*`,
* consume stable module surfaces instead of reimplementing their internals in the entrypoint.

## 4. Extraction triggers

Line count alone is not the policy, but sustained growth usually signals missing ownership.

A change should be extracted from `electron/main.js` or `public/renderer.js` when one or more of these conditions appear:

1. The new code introduces a feature-specific vocabulary, workflow, or state model.
2. The change adds more than a small orchestration block and starts mixing setup with business rules.
3. The same feature needs multiple handlers, listeners, branches, or helper functions.
4. The code needs dedicated validation, error mapping, or normalization behavior.
5. The logic could be tested or reasoned about more easily outside the entrypoint.
6. The feature is likely to keep growing after the initial merge.
7. The same owner already exists elsewhere in the repo and the entrypoint would duplicate it.

Practical heuristic:

* if the new block reads like a mini-feature instead of like wiring, it probably belongs in a module.

## 5. Preferred extraction shapes

### 5.1 Main-side modules

Prefer modules that expose explicit functions such as:

* `registerIpc(...)`
* `init(...)`
* `createXController(...)`
* `openXWindow(...)`
* `loadXState(...)`

Guidelines:

1. Inject dependencies explicitly when practical.
2. Keep contracts small and named after behavior, not implementation accidents.
3. Avoid hidden coupling through mutable globals unless the module is already the clear owner of that state.
4. Keep `main.js` readable as a table of contents for startup and registration.

### 5.2 Renderer-side modules

Prefer modules that expose stable renderer surfaces such as:

* `window.Notify`
* `window.RendererI18n`
* feature helpers in `public/js/*`
* focused library helpers in `public/js/lib/*`

Guidelines:

1. Keep DOM wiring close to the feature module when it materially belongs there.
2. Keep `renderer.js` focused on bootstrap, integration order, and high-level event composition.
3. Reuse existing module owners instead of adding new local wrappers in `renderer.js`.
4. If a feature needs several related buttons/listeners/modals, give it a dedicated module owner.

## 6. What is allowed to stay inline

The policy does not require extracting every small block.

Keeping code inline in `electron/main.js` or `public/renderer.js` is acceptable when it is clearly one of these:

1. short startup glue,
2. one-time wiring between already-owned modules,
3. narrow window/bootstrap coordination,
4. a genuinely cross-cutting decision that has no better single owner,
5. a small guard or adapter whose only purpose is to connect two existing contracts.

The key question is not "can this physically stay here?" but "should this file own it long-term?"

## 7. Review and implementation checklist

Before merging a change that touches `electron/main.js` or `public/renderer.js`, check:

1. Does the entrypoint still read primarily as orchestration?
2. Is the feature owner obvious from file/module boundaries?
3. Did we add domain logic that would be easier to test or evolve in a dedicated module?
4. Are we duplicating behavior already owned by another module?
5. Did we keep preload/API boundaries explicit instead of reaching across layers?
6. If we kept logic inline, is there a concrete reason beyond convenience?

If the answer to `3` or `4` is yes, extraction is usually the right move.

## 8. Exceptions

Exceptions are allowed, but they should be deliberate and small.

Acceptable reasons include:

1. bootstrap-critical wiring that would become less clear if split,
2. very small glue that has no meaningful reuse or independent behavior,
3. temporary integration code needed during a bounded refactor,
4. existing repo conventions already documented as an explicit exception.

Non-reasons:

1. "the file was already open",
2. "it is faster to append here",
3. "it is only one more handler" when the handler carries real feature behavior,
4. "we might refactor later" without a bounded follow-up.

When an exception is non-obvious, document it in the issue, PR notes, or cleanup plan.

## 9. Maintained outcome

The maintained outcome for this repo is:

1. `electron/main.js` remains a readable process orchestrator.
2. `public/renderer.js` remains a readable UI orchestrator.
3. Feature work defaults to dedicated modules.
4. Modularization is preferred before the entrypoints become hard to review, not after.
