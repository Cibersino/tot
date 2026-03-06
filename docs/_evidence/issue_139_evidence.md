# Issue 139 Evidence Log

## 2026-03-06 - Pre-Implementation Decision Gate Closure Pass

Entry `E139-SUBSTRATE-004`
- timestamp: `2026-03-06 10:23:56 -03:00`
- command/test executed: added explicit "non-negotiables" checklist in issue + matrix evidence for H01 carry-forward constraints.
- result:
  - issue now includes a compact implementation guardrail list under H01 substrate conditions.
  - matrix evidence now includes a matching non-negotiables snapshot to prevent drift between issue and evidence wording.
- artifact/log reference: `docs/issues/Issue_139.md:189`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:586`.

Entry `E139-SUBSTRATE-003`
- timestamp: `2026-03-06 10:15:52 -03:00`
- command/test executed: section-anchor verification in issue + matrix evidence docs (line-located checks).
- result:
  - issue now contains explicit H01 substrate conditions section at line `185`.
  - issue now records Batch 1 substrate-constraints documentation item checked at line `416`.
  - matrix evidence now contains H01 substrate conditions readout at line `582`.
- artifact/log reference: `docs/issues/Issue_139.md:185`, `docs/issues/Issue_139.md:416`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:582`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:593`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:613`.

Entry `E139-SUBSTRATE-002`
- timestamp: `2026-03-06 10:15:52 -03:00`
- command/test executed:
  - `Get-ChildItem -Path ocr/win32-x64/preprocess -Force`
  - `Select-String -Path package.json -Pattern "\"extraResources\"|\"from\": \"ocr\"|\"to\": \"ocr\""`
  - `Select-String -Path electron/import_ocr/platform/profile_registry.js -Pattern "'win32-x64'|'linux-x64'|'darwin-x64'|'darwin-arm64'"`
  - `Get-ChildItem -Path third_party_licenses -Recurse -File`
- result:
  - `ocr/win32-x64/preprocess` currently has no committed files (empty state confirmed).
  - packaging config includes `ocr/**` via `extraResources` (`from: "ocr"`, `to: "ocr"`).
  - target registry contains all four target keys (`win32-x64`, `linux-x64`, `darwin-x64`, `darwin-arm64`).
  - current `third_party_licenses/**` contains `poppler` and `tesseract` only (no ImageMagick/unpaper license files yet).
- artifact/log reference: `package.json:33`, `package.json:35`, `package.json:36`, `electron/import_ocr/platform/profile_registry.js:19`, `electron/import_ocr/platform/profile_registry.js:27`, `electron/import_ocr/platform/profile_registry.js:35`, `electron/import_ocr/platform/profile_registry.js:43`.

Entry `E139-SUBSTRATE-001`
- timestamp: `2026-03-06 10:15:52 -03:00`
- command/test executed: upstream-source review for selected substrate obligations.
- result:
  - ImageMagick license page reviewed for redistribution notice obligations.
  - unpaper repository reviewed for project license declaration and hard FFmpeg dependency note.
  - These source constraints are now reflected as carry-forward requirements in issue + matrix evidence.
- artifact/log reference: `https://imagemagick.org/license/`, `https://github.com/unpaper/unpaper`, `docs/issues/Issue_139.md:189`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:586`.

Entry `E139-GATE-005`
- timestamp: `2026-03-06 10:00:16 -03:00`
- command/test executed: `Get-Content docs/issues/Issue_139.md` line-range verification for the Pre-Implementation Decision Gate checklist.
- result:
  - gate checklist lines `378-385` now set to checked (`[x]`) for all decision-gate items.
  - Batch 1 setup items remain unchecked as expected.
- artifact/log reference: `docs/issues/Issue_139.md:377`, `docs/issues/Issue_139.md:378`, `docs/issues/Issue_139.md:379`, `docs/issues/Issue_139.md:382`, `docs/issues/Issue_139.md:384`, `docs/issues/Issue_139.md:388`.

Entry `E139-GATE-004`
- timestamp: `2026-03-06 09:59:16 -03:00`
- command/test executed: evidence content update in `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md` (frozen lists/order, per-candidate criteria outcomes, capability-gap conclusion, non-selected scope).
- result:
  - gate checkboxes `1-4` now have explicit evidence sections.
  - selection path remains `H01`; challenger remains `H05`.
- artifact/log reference: `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:18`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:472`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:513`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:532`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:559`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:560`.

Entry `E139-GATE-003`
- timestamp: `2026-03-06 09:59:16 -03:00`
- command/test executed: `Select-String -Path docs/issues/Issue_139.md -Pattern "### Pre-Implementation Decision Gate|Define bundled/custom candidate lists and freeze evaluation order in evidence|Evaluate candidates against decision-gate criteria|Run capability-gap analysis from candidate results and record evidence|Keep non-selected candidate evidence light"`
- result:
  - decision-gate checklist block located at lines `377-385`
  - pending checkbox lines confirmed before final sync: `378`, `379`, `382`, `384`
- artifact/log reference: `docs/issues/Issue_139.md:377`, `docs/issues/Issue_139.md:378`, `docs/issues/Issue_139.md:379`, `docs/issues/Issue_139.md:382`, `docs/issues/Issue_139.md:384`.

Entry `E139-GATE-002`
- timestamp: `2026-03-06 09:59:16 -03:00`
- command/test executed: `Select-String -Path docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md -Pattern "Frozen Candidate Lists \+ Evaluation Order|Per-Candidate Gate Results|Capability-Gap Analysis from Candidate Results|Non-Selected Candidate Evidence Scope|Revised Readout|Conclusion \(Gate Closure\)|Selected now" -CaseSensitive:$false`
- result:
  - freeze/order section present at line `18`
  - per-candidate gate results section present at line `472`
  - capability-gap analysis section present at line `513`
  - non-selected light-evidence section present at line `532`
  - revised readout section present at line `548`
  - selected-path line (`H01`) present at line `559`
  - gate-closure conclusion section present at line `570`
- artifact/log reference: `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:18`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:472`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:513`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:532`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:548`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:559`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:570`.

Entry `E139-GATE-001`
- timestamp: `2026-03-06 09:56:59 -03:00`
- command/test executed: `Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"`
- result: session timestamp captured for gate-closure evidence entries.
- artifact/log reference: `docs/_evidence/issue_139_evidence.md` (this entry), `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md`.
