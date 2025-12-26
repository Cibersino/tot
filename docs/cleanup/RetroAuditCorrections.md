# Retro-Audit Corrections (Phase 5 exports)
Status: READY (PowerShell-safe)
Scope: retro-validate prior “unused export surface” micro-batches (Phase 5 / Batch-02.*)
Non-goal: this document does NOT propose new removals. It validates what was already changed.

---

## 0) Stop conditions (non-negotiable)
Stop immediately if ANY of the following occurs:

1) **Runtime console error** after `npm start` (TypeError, ReferenceError, “is not a function”, etc.), even if the UI opens.
2) **HARD GATE FAIL** for any audited symbol (external references detected in importer files).
3) **Evidence incomplete** (missing required logs listed in §6).

---

## 1) Problem statement (why this exists)

We observed two failure modes in the Phase 5 “unused export” workflow:

1) **False positive risk (static tools):**
   - knip/madge may flag exports as “unused” while they are used via property access, dynamic require, or cross-file contracts.

2) **Runtime break despite “pre-checks”:**
   - Example class: exports that are used by an importer even if naive searches missed the access pattern.

This retro-audit provides a **repeatable, evidence-gated** validation pass for prior export removals:
- Detect external references (importer-scoped, to avoid symbol-collision false positives).
- Confirm export items are absent from `module.exports`.
- Run a smoke regression and extract runtime error signals.

---

## 2) Inputs / Source-of-truth anchors

Primary source of truth for “what was removed” is `DeadCodeLedger.md` (Phase 5 / Batch-02 micro-batches).

This retro-audit operates on:
- `REF = HEAD` (current tree state)
- A candidate list of `{ owner, sym }` for exports that were removed from `module.exports`.

Important:
- **Do NOT add random symbols** as “candidates”.
- Only include symbols that correspond to “export surface removed” actions you want to validate.
- You MAY run a **control-negative** separately (see §2.4) to validate that the gate catches real usage.

---

## 3) Retro-audit procedure (PowerShell)

### 3.1 Create evidence folder (RUN_ID)

```powershell
$RUN_ID = (Get-Date -Format "yyyyMMdd-HHmmss")
$EVID   = "docs\cleanup\_evidence\deadcode\$RUN_ID"
New-Item -ItemType Directory -Force -Path $EVID | Out-Null

$REF = "HEAD"
````

### 3.2 Define candidates (export removals only)

Populate ONLY with exports you actually removed from `module.exports` and want to validate.

```powershell
$CANDIDATES = @(
  @{ owner = "electron/menu_builder.js";  sym = "loadMainTranslations" },
  @{ owner = "electron/presets_main.js";  sym = "loadDefaultPresetsCombined" },
  @{ owner = "electron/updater.js";       sym = "checkForUpdates" },
  @{ owner = "electron/settings.js";      sym = "loadNumberFormatDefaults" },
  @{ owner = "electron/settings.js";      sym = "normalizeSettings" }
)
```

### 3.3 HARD GATE: importer-scoped reference check (prevents symbol-collision false positives)

What this does:

* Finds **importers of the owner module** (CommonJS `require(...)`) within `electron/`.
* Searches ONLY inside those importer files for:

  * identifier refs (`sym`)
  * property access (`.$sym`)
  * bracket access (`['sym']` / `["sym"]`)
* Writes logs for every candidate.
* **Throws** if any external refs exist.

Notes:

* Importer detection is regex-based and **may miss dynamic require/fs-scan patterns**.

  * If you suspect dynamic importers, add an extra manual grep targeted by module name/path.

```powershell
foreach ($c in $CANDIDATES) {
  $owner = $c.owner
  $sym   = $c.sym
  $stem  = [IO.Path]::GetFileNameWithoutExtension($owner)

  # ----------------------------
  # 0) Importers (CommonJS require) within electron/
  # ----------------------------
  $stemEsc = [regex]::Escape($stem)
  $reqPat  = "require\([^)]*${stemEsc}(\.js)?[^)]*\)"
  $req     = git grep -n -E $reqPat $REF -- electron 2>$null

  $importerFiles = @(
    $req | ForEach-Object { ($_ -split ':',4)[1] } | Sort-Object -Unique
  )

  $importerFiles | Out-File -Encoding utf8 "$EVID\retro.$sym.importers.grep.log"

  # If nobody imports the module, there is no plausible external export usage via require().
  # Still: we create ALL expected logs as empty to keep evidence complete.
  if ($importerFiles.Count -eq 0) {
    "" | Out-File -Encoding utf8 "$EVID\retro.$sym.all_importer_refs.grep.log"
    "" | Out-File -Encoding utf8 "$EVID\retro.$sym.external_refs.grep.log"
    "" | Out-File -Encoding utf8 "$EVID\retro.$sym.prop_anyobj.importers.grep.log"
    "" | Out-File -Encoding utf8 "$EVID\retro.$sym.bracket.sq.importers.grep.log"
    "" | Out-File -Encoding utf8 "$EVID\retro.$sym.bracket.dq.importers.grep.log"
    continue
  }

  # ----------------------------
  # 1) Identifier search ONLY inside importer files (avoid repo-wide collisions)
  # ----------------------------
  $all  = git grep -n -- $sym $REF -- $importerFiles 2>$null
  $code = $all | Where-Object { ($_ -notmatch "^${REF}:docs/") -and ($_ -notmatch "\.md:") }
  $code | Out-File -Encoding utf8 "$EVID\retro.$sym.all_importer_refs.grep.log"

  $ownerRe  = "^{0}:{1}:" -f $REF, [regex]::Escape($owner)
  $external = @($code | Where-Object { $_ -notmatch $ownerRe })
  $external | Out-File -Encoding utf8 "$EVID\retro.$sym.external_refs.grep.log"

  # ----------------------------
  # 2) Property + bracket access ONLY inside importer files
  # ----------------------------
  $prop = git grep -n -F -- (".{0}" -f $sym) $REF -- $importerFiles 2>$null
  ($prop | Where-Object { ($_ -notmatch "^${REF}:docs/") -and ($_ -notmatch "\.md:") }) |
    Out-File -Encoding utf8 "$EVID\retro.$sym.prop_anyobj.importers.grep.log"

  $bsqPat = "['{0}']" -f $sym
  $bdqPat = '["{0}"]' -f $sym

  $bsq = git grep -n -F -- $bsqPat $REF -- $importerFiles 2>$null
  $bdq = git grep -n -F -- $bdqPat $REF -- $importerFiles 2>$null

  ($bsq | Where-Object { ($_ -notmatch "^${REF}:docs/") -and ($_ -notmatch "\.md:") }) |
    Out-File -Encoding utf8 "$EVID\retro.$sym.bracket.sq.importers.grep.log"
  ($bdq | Where-Object { ($_ -notmatch "^${REF}:docs/") -and ($_ -notmatch "\.md:") }) |
    Out-File -Encoding utf8 "$EVID\retro.$sym.bracket.dq.importers.grep.log"

  # ----------------------------
  # HARD GATE
  # ----------------------------
  if ($external.Count -gt 0) {
    throw "HARD GATE FAIL: '$sym' is referenced by importer files of '$owner'. This export removal is NOT safe as-is."
  }
}
```

### 3.4 Optional control-negative (recommended once): prove the gate detects real usage

Purpose:

* Validate that the gate catches known-used exports (so we can trust the FAIL signal).

How:

* Run the same logic for a known used export (example: `electron/text_state.js` + `getCurrentText`).

Expectation:

* `retro.getCurrentText.external_refs.grep.log` should be **non-empty**.
* This is GOOD: it proves the gate would have blocked a bad removal.

Important:

* This is a **test of the gate**, NOT a retro-validation target for Phase 5 export removals.

---

## 4) Post-check: export item is absent from `module.exports`

This verifies the owner file no longer exports the symbol (list-style export item).
It does NOT prove runtime safety by itself; it complements §3 and §5.

```powershell
$POST = @(
  @{ owner="electron/menu_builder.js"; sym="loadMainTranslations" },
  @{ owner="electron/presets_main.js"; sym="loadDefaultPresetsCombined" },
  @{ owner="electron/updater.js"; sym="checkForUpdates" },
  @{ owner="electron/settings.js"; sym="loadNumberFormatDefaults" },
  @{ owner="electron/settings.js"; sym="normalizeSettings" }
)

foreach ($c in $POST) {
  $owner = $c.owner
  $sym   = $c.sym

  # 1) Export list item (line inside module.exports)
  git grep -n -E "^\s*${sym}\s*,?\s*$" -- $owner |
    Out-File -Encoding utf8 "$EVID\retro.$sym.post.export_item.grep.log"

  # 2) Anchors for debugging (kept intentionally)
  git grep -n -- "module\.exports" -- $owner |
    Out-File -Encoding utf8 "$EVID\retro.$sym.post.module_exports_anchor.grep.log"
  git grep -n -- $sym -- $owner |
    Out-File -Encoding utf8 "$EVID\retro.$sym.post.owner_mentions.grep.log"
}
```

---

## 5) Regression smoke + error extraction

```powershell
npm start 2>&1 | Tee-Object "$EVID\retro.regression.smoke.log"

Select-String -Path "$EVID\retro.regression.smoke.log" -Pattern `
  "TypeError","ReferenceError","Unhandled","ERR_","Error " |
  Out-File -Encoding utf8 "$EVID\retro.regression.errors.extract.log"
```

Interpretation:

* `retro.regression.errors.extract.log` empty is a **good sign**, not full proof of correctness.
* If you see “X is not a function”, treat it as a **hard contract failure**: you removed/changed an API that is used.

Optional (recommended): do a minimal manual cross-feature check (30–60 seconds):

* Open editor (must not fail to load initial text).
* Toggle language ES/EN.
* Toggle counting mode.
* Trigger updater menu action (if present).
  If any console error appears → STOP.

---

## 6) Output artifacts (what should exist in the evidence folder)

For each audited symbol:

* `retro.<sym>.importers.grep.log`
* `retro.<sym>.all_importer_refs.grep.log`
* `retro.<sym>.external_refs.grep.log`
* `retro.<sym>.prop_anyobj.importers.grep.log`
* `retro.<sym>.bracket.sq.importers.grep.log`
* `retro.<sym>.bracket.dq.importers.grep.log`
* `retro.<sym>.post.export_item.grep.log`

Run-level:

* `retro.regression.smoke.log`
* `retro.regression.errors.extract.log`

---

## 7) Closure: how to record results

When gate + post-check + smoke pass:

* Append to `DeadCodeLedger.md` a short “retro-audit PASS” note for the validated micro-batches, referencing this RUN_ID folder.

When gate fails:

* STOP.
* You must either:

  * Restore the export surface, OR
  * Update all importers to stop using it, then re-run this retro-audit.
