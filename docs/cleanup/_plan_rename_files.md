# Focused File Renaming Plan (Semantics-First, Repo-Wide Atomic Changes)
Version: 1.0  
Scope: **File names only** (no IPC IDs, no persisted JSON keys, no internal symbols yet)  
Platform: Electron repository (Windows + VS Code + Codex available)  
Owner constraints:
- This is **not** a mass rename. We rename **only selected confusing file names**.
- Each chosen rename is applied **simultaneously across the entire repo** (atomic; no partial rollout).
- **No temporary aliases** (do not keep compatibility shims or duplicate entrypoints).
- Breaking compatibility is acceptable; failures must be visible and fixed, not hidden.

---

## 0) Core Renaming Rules (The Only Criteria)
A file rename is justified only if it improves **at least one** of these, without harming the others:

1) **Purpose clarity**  
   The file name should not mislead about what the file actually does.

2) **Non-collision**  
   The file name should not be easily confused with other files (especially nearby ones) by role, wording, or implied responsibility.

3) **Lexicon consistency**  
   The file name should not introduce a new term for a concept that already has an established term in the repo (avoid synonyms for the same thing).

**Important:** This plan does **not** require choosing a stylistic naming convention (kebab/snake/camel). Only semantic clarity matters.

---

## 1) Deliverables (What We Produce and Maintain)
We maintain two living artifacts during the work:

### 1.1 File Rename Candidate Ledger (FRCL)
A short table with one row per candidate file:

- `CandidateID` (e.g., FR-001)
- `OldPath`
- `ObservedRole` (1 line; based on reading the file)
- `WhyConfusing` (mapped explicitly to Rule 1/2/3)
- `RelatedFiles` (paths of potentially colliding/similar modules)
- `LexiconTermsUsed` (domain words used/avoided)
- `ProposedNewPath`
- `RiskLevel` (Low/Med/High)
- `DynamicPathRisk` (Yes/No; if paths are constructed dynamically)
- `Status` (Proposed / Approved / Renamed / Blocked)

### 1.2 Minimal Repo Lexicon (MRL)
A tiny glossary of canonical domain terms in file naming:

- `Concept` (e.g., “Stopwatch feature”)
- `CanonicalTerm` (e.g., “stopwatch”)
- `ForbiddenSynonyms` (e.g., “crono”, “timer” if they refer to the same concept)
- `Notes` (only if needed)

The MRL is used solely to enforce Rule 3 and prevent reintroducing confusion.

---

## 2) Phase A — Inventory (Evidence, Not Guessing)
Goal: obtain the **source-of-truth list of tracked files** and identify a small set of confusing names.

### 2.1 Get tracked files list
From repo root:

- `git ls-files`

(Optionally filter to code-relevant extensions; do not omit config/build files.)

### 2.2 Generate an initial short candidate set (focal)
We select **5–15 candidates** max, using these signals:
- ambiguous names: `utils`, `helpers`, `common`, `misc`, `stuff`, `temp`, `new`, `old`, `final`, `backup`
- versioned duplicates: `*2*`, `*v3*`, `*_copy*`
- misleading names: file name implies one role but file contents indicate another
- likely collisions: multiple `state.js` / `config.js` / `settings.js` with unclear boundaries
- inconsistent lexicon: different words used for the same concept across files

**Stop condition:** if the candidate list exceeds 15, we reduce it; we do not expand scope.

---

## 3) Phase B — Evidence Capture (One File at a Time)
For each candidate in the FRCL, we must establish what it really is and how it is used.

### 3.1 Determine the file’s observed role
- Open the file and summarize in 1 line:
  - what it exports / defines
  - what subsystem it belongs to (window lifecycle, menu, IPC, storage, i18n, etc.)
  - what its primary responsibility is

### 3.2 Identify collision neighborhood
List “neighbor” files that could be confused with it:
- same folder files with similar names
- same role in other folders (e.g., multiple storages, multiple menus)
- any “parallel” module (e.g., stopwatch vs timer vs crono)

### 3.3 Check for dynamic path usage (critical gate)
We must be able to update all references reliably. Before renaming, search for:
- explicit imports/requires: `from '.../oldPath'`, `require('.../oldPath')`
- config references: build scripts, electron-builder config, preload/main entrypoints, etc.
- dynamic path constructions that include the file name or fragments of it

If path usage is dynamic in a way that cannot be safely enumerated, mark:
- `DynamicPathRisk = Yes`
- `Status = Blocked` until we refactor to deterministic references

---

## 4) Phase C — Propose New Names (Semantics-First)
For each candidate, the proposed new name must pass all three rules.

### 4.1 Rule-driven naming checklist
- Purpose clarity: does the new name communicate the observed role better?
- Non-collision: is the new name distinct from existing similar files?
- Lexicon consistency: does it use canonical repo terms (MRL) and avoid synonyms?

### 4.2 Avoid these anti-patterns
- vague role names: `helpers`, `common`, `utils` (unless the repo has a strongly-defined meaning for them)
- time-based labels: `new`, `old`, `final`
- domain synonyms for same concept: do not create `timer_*` if the repo already uses `stopwatch_*` for that feature

### 4.3 Approval gate
A candidate is “Approved” only when:
- the new path is specified,
- the justification explicitly references Rule 1/2/3,
- we have a plausible complete reference list (or a plan to make it deterministic).

---

## 5) Phase D — Atomic Rename Execution (Repo-Wide, No Aliases)
We rename in small batches (recommended 1–3 files per batch), but each rename must be complete across the repo within the same batch.

### 5.1 Pre-flight (hard gate)
For each `OldPath` in the batch:
1) Record all occurrences:
   - search for the exact old path
   - search for common import variants (relative path segments)
2) Identify all files impacted (imports, configs, scripts)

### 5.2 Perform rename using Git (not Explorer)
- `git mv OldPath NewPath`

Special case (Windows case-only rename):
- rename via a temporary name in two steps to force Git to register it.

### 5.3 Update all references repo-wide (same batch)
Update:
- import/require statements
- any config that names the file explicitly
- any string literal paths in scripts

**No aliases** means:
- do not keep both filenames
- do not keep stub files forwarding to the new module
- do not duplicate exports to “support old name”

### 5.4 Post-rename “Old name must be zero” gate
For each renamed file:
- global search for `OldPath` must return **0 results**
- if a name fragment search is used, it must be safe (avoid false positives)

### 5.5 Smoke test
Minimum:
- app starts in dev mode
- no immediate module resolution errors
- main/preload/renderer load without failing imports

If it breaks:
- fix in the same batch, or revert the batch
- do not leave the repo in a half-renamed state

### 5.6 Commit policy
One commit per batch with a message listing renames.
Commit message example:
- `chore(rename-files): OldPath -> NewPath, ...`

Commit body includes:
- FRCL candidate IDs covered
- verification performed (old path occurrences = 0; smoke test done)
- any intentional data resets (if applicable, though file renames alone should not require it)

---

## 6) Codex Prompts (Optional, Use When Helpful)
### 6.1 Candidate identification (focal)
> Given this `git ls-files` output, propose up to 10 confusing file names to rename.  
> Use these rules: (1) purpose clarity, (2) non-collision, (3) lexicon consistency.  
> For each candidate: OldPath, why confusing (rule mapping), related/possibly-colliding files, proposed new path, risk level.

### 6.2 Evidence mapping (references)
> For the file path `<OldPath>`, list all repo references: imports/requires, config references, build scripts, and any string path usage. Flag any dynamic path construction that prevents safe atomic renaming.

### 6.3 Rename proposal validation (lexicon)
> Check the proposed rename `<OldPath> -> <NewPath>` against existing file names and repo lexicon. Identify collisions or synonym conflicts (different words used for the same concept) and suggest alternatives that reduce confusion.

---

## 7) Working Rhythm (Recommended)
- Batch size: 1–3 file renames
- After each batch: enforce “old path = 0 occurrences” + smoke test + commit
- Update FRCL + MRL continuously to preserve context and prevent regressions

---

## 8) Stop Conditions (When We Pause Instead of Expanding Scope)
Pause and re-scope if:
- dynamic path usage blocks safe enumeration
- a rename cascades into unrelated breakage
- the repo lexicon is inconsistent and needs a minimal decision (MRL) before proceeding

---

## 9) Definition of Done (for the “File Names” phase)
This phase is complete when:
- all FRCL items marked “Approved” have been renamed and verified
- no approved `OldPath` strings remain in the repo
- MRL exists and prevents reintroducing synonyms for the same concepts
- the app runs (at least minimally) after each batch
