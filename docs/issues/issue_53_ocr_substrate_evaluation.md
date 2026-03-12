# Issue 53 - OCR Substrate Evaluation

## Purpose

This document defines the evaluation method used to select the OCR substrate for Issue 53.

It exists to answer one question before implementation proceeds:

> Which OCR substrate and access / billing / activation model should power the OCR route for Issue 53, given the product goal, platform constraints, compliance burden, and future architecture requirements?

This document is decision-oriented. It is not a generic survey of OCR tools or commercial models.

## Source alignment

This evaluation is driven by the current Issue 53 materials.

Key constraints carried into this document:

- OCR quality for image files, especially photographed book pages, should be as close as realistically possible to Google Lens.
- OCR substrate is not fixed yet.
- Google Document AI must be evaluated first as the primary candidate.
- Extraction must support any language, including Asian scripts.
- No silent fallback is allowed.
- Initial delivery target is Windows.
- Architecture must remain viable for later macOS/Linux support.
- Platform-specific code must be isolated.
- This app is intended to be distributed to multiple users.
- The OCR access / billing / activation model must be explicitly defined for the chosen substrate.
- Setup, credential onboarding, billing onboarding, activation flow, and compliance/privacy surfaces may be required depending on the substrate and access model.

## Decision scope

This document evaluates the OCR substrate together with the access / billing / activation model that would make it shippable for this app.

It does **not** decide:

- native extraction strategy
- route-choice UX
- apply-modal behavior
- processing lock behavior
- progress/ETA implementation
- PDF triage policy beyond what is necessary to evaluate OCR suitability

Those items depend on, but are not equivalent to, the substrate + access-model decision.

## Evaluation model

The decision model has two layers:

1. **Hard gates**
   - Any candidate that fails one hard gate is rejected.
2. **Weighted scoring**
   - Candidates that pass all hard gates are scored and compared.

This structure prevents a weak-but-convenient candidate from winning on administrative criteria while failing the actual OCR goal.

### Evaluation unit

The evaluation unit is not just a substrate in isolation.

A serious candidate in this document is a **substrate + access model pairing**.

A substrate may be viable under one access model and non-viable under another.

---

## 1. Candidates under evaluation

### Primary substrate candidate
- Google Document AI

### Access models under evaluation
- vendor-managed
- user-managed
- hybrid/optional

### Additional substrate candidates
- Candidate A: `<name>`
- Candidate B: `<name>`
- Candidate C: `<name>`

Notes:
- Google Document AI must be evaluated first.
- Additional substrate candidates should only be included if they are plausible enough to compete on product quality or materially reduce strategic risk.
- Each serious entry in the actual comparison should be a substrate + access-model pairing, not a substrate name alone.

---

## 2. Hard gates

A candidate pairing is rejected immediately if it fails any of the following.

### HG-1. Photographed-page OCR viability

The candidate must be plausibly capable of strong OCR performance on real photographed book/document pages.

Failure examples:
- clear weakness on photographed pages even if scanned PDFs are acceptable
- severe sensitivity to mild perspective, uneven lighting, or common phone-camera artifacts
- quality too far from the target to justify integration work

Pass / Fail:
- [ ] Pass
- [ ] Fail

Notes:
- `<fill>`

### HG-2. Multilingual coverage

The candidate must support text extraction in any language required by Issue 53, including Asian scripts.

Failure examples:
- no credible support for CJK or other non-Latin scripts
- impractical language setup constraints for real use
- large quality collapse on mixed-language pages

Pass / Fail:
- [ ] Pass
- [ ] Fail

Notes:
- `<fill>`

### HG-3. PDF suitability

The candidate must be usable for the PDF portion of the OCR route within the Issue 53 scope.

Failure examples:
- no realistic support for scanned PDFs
- unusable multipage limitations
- workflow complexity that would make the PDF route fragile or misleading

Pass / Fail:
- [ ] Pass
- [ ] Fail

Notes:
- `<fill>`

### HG-4. Architecture viability

The candidate must fit a design that is Windows-first in delivery but remains viable for later macOS/Linux support.

Failure examples:
- Windows-only integration with no sane portability path
- core orchestration would need to become OS-specific
- platform-specific concerns cannot be isolated behind adapters

Pass / Fail:
- [ ] Pass
- [ ] Fail

Notes:
- `<fill>`

### HG-5. Operational observability and explicit failure handling

The candidate must allow explicit, user-visible error handling and must not force silent fallback behavior.

Failure examples:
- frequent ambiguous states that cannot be classified or surfaced well
- opaque substrate failures that would degrade the UX into silent or misleading behavior
- setup/auth/billing/quota/restriction failures that cannot be clearly distinguished and reported

Pass / Fail:
- [ ] Pass
- [ ] Fail

Notes:
- `<fill>`

### HG-6. Access-model / setup / compliance feasibility

The substrate + access-model pairing must have an access, billing, activation, privacy, and compliance burden that is realistic for this product.

Failure examples:
- no clear answer to who pays for OCR usage
- no clear answer to who owns the substrate account/project
- no clear answer to where credentials live
- user-managed onboarding too brittle for plausible product use
- vendor-managed model would require operational control not realistic for the product
- quota/budget/usage-limit behavior cannot be explained or surfaced clearly
- usage restrictions cannot be enforced or documented as required
- privacy or external-processing implications too heavy for acceptable UX/compliance handling
- licensing/compliance surfaces too unclear to close responsibly

Pass / Fail:
- [ ] Pass
- [ ] Fail

Notes:
- `<fill>`

---

## 3. Weighted scoring

Only candidates that pass all hard gates are scored.

### Scoring scale

Use the following scale for every criterion:

- **0** = unacceptable / effectively fails in practice
- **1** = very weak
- **2** = usable only with major reservations
- **3** = acceptable
- **4** = strong
- **5** = very strong

### Score table

| Criterion | Weight | Score (0-5) | Weighted score | Notes |
|---|---:|---:|---:|---|
| A. OCR quality on photographed corpus | 35 |  |  |  |
| B. Language and script coverage | 15 |  |  |  |
| C. PDF support and file-family suitability | 15 |  |  |  |
| D. Cost model and cost controllability | 10 |  |  |  |
| E. Setup / auth / activation burden | 10 |  |  |  |
| F. Cross-platform architectural viability | 10 |  |  |  |
| G. Privacy / compliance / disclosure burden | 5 |  |  |  |
| **Total** | **100** |  |  |  |

---

## 4. Criterion definitions

### A. OCR quality on photographed corpus (35)

This is the highest-weight criterion.

The issue goal is not generic OCR quality. The relevant target is OCR quality on real photographed pages, especially photographed book pages.

Evaluate at minimum against:

- photographed book pages
- photographed printed documents
- mild perspective distortion
- uneven but realistic lighting
- modest shadows/reflections
- normal phone-camera capture quality
- Spanish and English text
- diacritics
- samples with mixed layout density

Questions:

- How close is the output to the practical target quality?
- Is quality stable across good, medium, and difficult samples?
- Does performance degrade gradually or collapse abruptly?
- Are recognition errors mostly tolerable character/spacing noise, or do they break reading usefulness?

Score:
- `<fill>`

Notes:
- `<fill>`

### B. Language and script coverage (15)

The substrate must support multilingual extraction, including Asian scripts.

Evaluate at minimum:

- Spanish
- English
- mixed-language pages
- at least one CJK sample
- at least one RTL sample if relevant to corpus availability
- configuration burden for language selection or autodetection

Questions:

- Does the substrate support required scripts credibly?
- Does mixed-language quality remain usable?
- Does it require manual language configuration that would materially hurt UX?
- Are there model/processor limitations that affect real use?

Score:
- `<fill>`

Notes:
- `<fill>`

### C. PDF support and file-family suitability (15)

Issue 53 includes OCR for PDFs in scope.

Evaluate at minimum:

- scanned PDF
- multipage scanned PDF
- PDF latency and limits
- interaction with likely triage rules
- whether OCR route remains coherent for PDF files

Questions:

- Can the substrate handle scanned PDFs cleanly enough for the intended feature?
- Are there important page-count, size, or rate limits?
- Does PDF support feel native to the substrate, or bolted on?
- Would PDF support create downstream complexity that should be treated as a strategic warning?

Score:
- `<fill>`

Notes:
- `<fill>`

### D. Cost model and cost controllability (10)

This criterion evaluates whether the substrate + access-model pairing is economically compatible with the product.

Evaluate at minimum:

- who pays for OCR usage
- per-page or per-document cost
- predictability of cost
- free-tier usefulness, if any
- sensitivity to retries/reprocessing
- likely cost impact under realistic user behavior
- ability to control or limit cost exposure

Questions:

- Is the cost understandable and controllable?
- Is there a realistic path to shipping this without unacceptable cost ambiguity?
- Does the cost model distort UX decisions or product scope?
- Does the chosen access model create cost exposure that the product cannot safely manage?

Score:
- `<fill>`

Notes:
- `<fill>`

### E. Setup / auth / activation burden (10)

This criterion evaluates the operational burden of turning the substrate into a usable feature under the chosen access model.

Evaluate at minimum:

- developer setup
- packaging implications
- user setup
- credential onboarding
- billing onboarding
- activation flow
- validation/test flow
- incomplete setup failure modes

Questions:

- Can the setup be explained clearly?
- Are credential, billing, and activation steps manageable for real users?
- Can validation/test flow be made explicit and reliable?
- Does the setup burden create a major trust problem?
- Is the activation model acceptable for distributed desktop delivery?

Score:
- `<fill>`

Notes:
- `<fill>`

### F. Cross-platform architectural viability (10)

The first implementation targets Windows, but the architecture must remain viable for later macOS/Linux support.

Evaluate at minimum:

- OS-specific SDK/runtime coupling
- portability path
- ease of isolating platform-specific code
- impact on core routing/contracts/orchestration
- impact of access-model boundaries on architecture
- risk of platform debt becoming structural

Questions:

- Can this be implemented Windows-first without becoming Windows-only by design?
- Can platform-specific integration be isolated behind adapters?
- Would later macOS/Linux support be incremental or near-rewrite?
- Does the chosen access model force architecture that would age badly across platforms?

Score:
- `<fill>`

Notes:
- `<fill>`

### G. Privacy / compliance / disclosure burden (5)

This criterion evaluates whether the substrate + access-model pairing introduces acceptable legal/product disclosure work.

Evaluate at minimum:

- external-processing disclosure need
- privacy implications
- third-party notices
- attributions
- license display requirements
- clarity of the compliance story
- access-model-specific disclosures

Questions:

- Can the privacy model be explained clearly in-app?
- Are disclosure obligations straightforward or unusually heavy?
- Would this pairing materially complicate release readiness?
- Does the chosen access model create additional compliance burden beyond the OCR engine itself?

Score:
- `<fill>`

Notes:
- `<fill>`

---

## 5. Access-model requirements

For each candidate pairing, the access / billing / activation model must be made explicit.

At minimum, record:

- who pays for OCR usage
- who owns the substrate account/project
- where credentials live
- whether the model is vendor-managed, user-managed, or hybrid
- whether each user can enable OCR with their own account/billing
- whether OCR is enabled by default or requires explicit activation
- whether usage restrictions/limits exist
- how restrictions/limits are enforced
- what happens when quota, budget, or usage limits are reached
- whether access can be revoked per user
- what support burden the model creates

This section exists because a substrate cannot be evaluated seriously for this epic without also evaluating the way distributed users would actually access and pay for it.

---

## 6. Benchmark corpus requirements

This evaluation must use a benchmark corpus that reflects the actual product goal.

### Minimum corpus priorities

The corpus should emphasize:

- real photographed book pages
- real photographed printed documents
- scanned PDFs
- at least some medium-difficulty samples, not only clean ones
- multilingual samples

### Recommended corpus buckets

#### Bucket P1 - photographed book pages
Examples:
- single-column printed prose
- denser page with footnotes or headers
- moderate perspective
- minor shadow/lighting unevenness

#### Bucket P2 - photographed printed documents
Examples:
- forms
- reports
- instructional pages
- mixed typography

#### Bucket P3 - scanned PDFs
Examples:
- clean scanned text pages
- medium-quality scans
- multipage document

#### Bucket P4 - multilingual samples
Examples:
- Spanish
- English
- CJK
- mixed-language page if available

### Corpus quality notes

The benchmark should avoid two bad extremes:

1. unrealistically perfect samples only
2. pathological junk samples that do not reflect normal use

The goal is realistic decision-making, not staged success or staged failure.

---

## 7. Evaluation procedure

For each candidate pairing:

1. Record substrate identity and version context.
2. Record access-model assumptions.
3. Record setup/auth/billing/activation assumptions.
4. Run hard-gate evaluation.
5. If any hard gate fails, reject candidate and stop scoring.
6. If all hard gates pass, complete weighted scoring.
7. Record concrete strengths, weaknesses, and downstream constraints.
8. Compare against other passing candidates.

### Required evidence per candidate pairing

Each candidate section should include:

- substrate name
- access model
- date of evaluation
- evaluator
- benchmark corpus used
- explicit setup assumptions
- explicit access-model assumptions
- hard-gate outcomes
- score table
- final recommendation status

---

## 8. Candidate evaluation template

## Candidate: `<substrate + access model>`

### Metadata

- Evaluation date: `<date>`
- Evaluator: `<name>`
- Substrate: `<fill>`
- Access model: `<vendor-managed | user-managed | hybrid>`
- Version / product / API context: `<fill>`
- Setup assumptions: `<fill>`

### Access-model profile

- Who pays for OCR usage: `<fill>`
- Who owns the substrate account/project: `<fill>`
- Where credentials live: `<fill>`
- Can each user enable OCR with their own account/billing?: `<fill>`
- Is OCR enabled by default or manually activated?: `<fill>`
- Usage restrictions/limits: `<fill>`
- Restriction enforcement path: `<fill>`
- Quota/budget/usage-limit behavior: `<fill>`
- Per-user revocation possible?: `<fill>`

### Hard gates

| Hard gate | Result | Notes |
|---|---|---|
| HG-1 Photographed-page OCR viability | Pass / Fail |  |
| HG-2 Multilingual coverage | Pass / Fail |  |
| HG-3 PDF suitability | Pass / Fail |  |
| HG-4 Architecture viability | Pass / Fail |  |
| HG-5 Observability / explicit failure handling | Pass / Fail |  |
| HG-6 Access-model / setup / compliance feasibility | Pass / Fail |  |

### Weighted scoring

| Criterion | Weight | Score (0-5) | Weighted score | Notes |
|---|---:|---:|---:|---|
| A. OCR quality on photographed corpus | 35 |  |  |  |
| B. Language and script coverage | 15 |  |  |  |
| C. PDF support and file-family suitability | 15 |  |  |  |
| D. Cost model and cost controllability | 10 |  |  |  |
| E. Setup / auth / activation burden | 10 |  |  |  |
| F. Cross-platform architectural viability | 10 |  |  |  |
| G. Privacy / compliance / disclosure burden | 5 |  |  |  |
| **Total** | **100** |  |  |  |

### Strengths

- `<fill>`
- `<fill>`
- `<fill>`

### Weaknesses

- `<fill>`
- `<fill>`
- `<fill>`

### Downstream implementation constraints introduced by this candidate pairing

- `<fill>`
- `<fill>`
- `<fill>`

### Recommendation status

- [ ] Reject
- [ ] Keep as fallback candidate
- [ ] Keep as serious contender
- [ ] Select as preferred substrate + access-model pairing

### Recommendation notes

`<fill>`

---

## 9. Comparative summary

| Substrate | Access model | Hard gates passed? | Total score | Decision status | Main reason |
|---|---|---|---:|---|---|
| Google Document AI | vendor-managed |  |  |  |  |
| Google Document AI | user-managed |  |  |  |  |
| Google Document AI | hybrid/optional |  |  |  |  |
| Candidate A | `<fill>` |  |  |  |  |
| Candidate B | `<fill>` |  |  |  |  |
| Candidate C | `<fill>` |  |  |  |  |

---

## 10. Final decision

### Chosen substrate
- `<fill>`

### Chosen access model
- `<fill>`

### Rejected candidates / pairings
- `<fill>`
- `<fill>`

### Rationale

`<fill>`

### Known constraints that propagate downstream

These constraints must be treated as implementation inputs, not post-hoc discoveries.

- access-model constraints: `<fill>`
- setup/onboarding constraints: `<fill>`
- credential/auth constraints: `<fill>`
- billing constraints: `<fill>`
- restriction/quota constraints: `<fill>`
- privacy/external-processing constraints: `<fill>`
- platform adapter constraints: `<fill>`
- PDF/latency/limits constraints: `<fill>`
- observability/error-taxonomy constraints: `<fill>`

---

## 11. Exit criteria for this document

This document is considered complete when:

- at least one primary substrate candidate and all serious alternatives have been evaluated
- serious access-model pairings have been evaluated, not just substrate names
- hard-gate results are explicit
- weighted scores are filled
- final recommendation is explicit
- chosen substrate is explicit
- chosen access / billing / activation model is explicit
- downstream constraints are recorded clearly enough to guide architecture and UX work
- the result is strong enough to justify moving from substrate evaluation into contract definition and implementation planning
