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

### Access / activation models under evaluation
- vendor-managed
- user-managed + optional activation
- hybrid/optional

### Additional substrate candidates
- Candidate A: `Google Drive OCR via Google Docs conversion + user-managed + explicit sign-in activation`
- Candidate B: `Google Cloud Vision DOCUMENT_TEXT_DETECTION + user-managed + optional activation` (deferred in this revision)
- Candidate C: `Azure AI Document Intelligence Read + user-managed + optional activation` (deferred in this revision)

Notes:
- Google Document AI must be evaluated first.
- This revision adds one new serious contender: `Google Drive OCR via Google Docs conversion + user-managed + explicit sign-in activation`.
- Candidate B and Candidate C remain plausible, but are not evaluated in this revision because the immediate decision pressure is whether Google Drive should outrank the current Document AI baseline.
- Each serious entry in the actual comparison is a substrate + access-model pairing, not a substrate name alone.

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

This criterion evaluates how much user/admin friction the pairing introduces.

Evaluate at minimum:

- account creation requirements
- billing setup requirements
- credential onboarding
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

## 8. Candidate evaluations

## Candidate: `Google Document AI + vendor-managed`

### Metadata

- Evaluation date: `2026-03-12`
- Evaluator: `ChatGPT`
- Substrate: `Google Document AI`
- Access model: `vendor-managed`
- Version / product / API context: `Enterprise OCR style cloud processor model`
- Setup assumptions:
  - App owner operates the cloud project, billing, quotas, and credentials.
  - OCR is shipped as an app-provided managed service to distributed users.
  - Users do not bring their own project or billing.

### Access-model profile

- Who pays for OCR usage: `App owner / operator`
- Who owns the substrate account/project: `App owner / operator`
- Where credentials live: `Managed by the product operator, not by each user`
- Can each user enable OCR with their own account/billing?: `No`
- Is OCR enabled by default or manually activated?: `Would likely be enabled by product policy, not per-user cloud setup`
- Usage restrictions/limits: `Must be enforced by the product operator`
- Restriction enforcement path: `Server-side/project-side quota and budget control`
- Quota/budget/usage-limit behavior: `Operational responsibility remains on the product owner`
- Per-user revocation possible?: `Only through product-side account control, not through pure user-side ownership`

### Hard gates

| Hard gate | Result | Notes |
|---|---|---|
| HG-1 Photographed-page OCR viability | Pass | Likely strong enough to compete on OCR quality. |
| HG-2 Multilingual coverage | Pass | Plausibly capable of multilingual OCR. |
| HG-3 PDF suitability | Pass | Plausibly strong for scanned PDFs. |
| HG-4 Architecture viability | Pass | Cloud API model is portable across desktop platforms. |
| HG-5 Observability / explicit failure handling | Pass | Explicit API failures can be surfaced. |
| HG-6 Access-model / setup / compliance feasibility | Fail | Operational ownership, billing exposure, abuse control, privacy/compliance handling, and ongoing service responsibility are too heavy for the current product. |

### Strengths

- Strong OCR quality potential.
- Strong PDF suitability potential.
- Clear API-driven error surface.

### Weaknesses

- Requires the product to become a managed OCR operator.
- Introduces direct cost exposure for the product owner.
- Creates the heaviest privacy/compliance/abuse-control burden of the evaluated pairings.

### Downstream implementation constraints introduced by this candidate pairing

- Product would need durable service operations, not just desktop shipping.
- Product would need quota/budget and abuse controls.
- Product would need managed credential and legal/compliance surfaces beyond the current delivery model.

### Recommendation status

- [x] Reject
- [ ] Keep as fallback candidate
- [ ] Keep as serious contender
- [ ] Select as preferred substrate + access-model pairing

### Recommendation notes

`Reject. The OCR engine itself may be strong, but this access model is out of proportion to the current product and distribution model.`

---

## Candidate: `Google Document AI + user-managed + optional activation`

### Metadata

- Evaluation date: `2026-03-12`
- Evaluator: `ChatGPT`
- Substrate: `Google Document AI`
- Access model: `user-managed + optional activation`
- Version / product / API context: `User-owned Document AI project/account/billing model`
- Setup assumptions:
  - Each user creates or already owns the required Google Cloud / Document AI setup.
  - OCR remains disabled until the user completes setup.
  - Credentials live locally on the user's machine.
  - No shared app-wide vendor credentials are shipped.

### Access-model profile

- Who pays for OCR usage: `Each user`
- Who owns the substrate account/project: `Each user`
- Where credentials live: `Locally on the user's machine`
- Can each user enable OCR with their own account/billing?: `Yes`
- Is OCR enabled by default or manually activated?: `Manually activated`
- Usage restrictions/limits: `Document AI account/project restrictions and quotas apply`
- Restriction enforcement path: `User-side setup validation + explicit product-side preflight checks`
- Quota/budget/usage-limit behavior: `Must surface explicit auth, billing, quota, and connectivity states`
- Per-user revocation possible?: `Yes, by removing local credentials or disabling the substrate account/project`

### Hard gates

| Hard gate | Result | Notes |
|---|---|---|
| HG-1 Photographed-page OCR viability | Pass (provisional) | Strong candidate on paper, but still needs corpus benchmarking. |
| HG-2 Multilingual coverage | Pass (provisional) | Plausibly broad enough, subject to real corpus confirmation. |
| HG-3 PDF suitability | Pass (provisional) | Strong candidate for scanned PDFs, pending corpus confirmation. |
| HG-4 Architecture viability | Pass | Cloud API model remains portable and adapter-friendly. |
| HG-5 Observability / explicit failure handling | Pass | Explicit API-style error taxonomy is achievable. |
| HG-6 Access-model / setup / compliance feasibility | Pass (narrow) | Viable, but the setup/billing burden is high for normal desktop users. |

### Weighted scoring

| Criterion | Weight | Score (0-5) | Weighted score | Notes |
|---|---:|---:|---:|---|
| A. OCR quality on photographed corpus | 35 | 4 | 28 | Likely stronger than Drive OCR in raw OCR quality, but not yet benchmarked here. |
| B. Language and script coverage | 15 | 4 | 12 | Plausibly broad enough for the issue target. |
| C. PDF support and file-family suitability | 15 | 4 | 12 | Strong fit for scanned PDFs. |
| D. Cost model and cost controllability | 10 | 2 | 4 | Cost is controllable only because each user bears it; that same fact hurts adoption. |
| E. Setup / auth / activation burden | 10 | 1 | 2 | User-side cloud onboarding and billing are the main weakness. |
| F. Cross-platform architectural viability | 10 | 4 | 8 | Clean cloud integration shape. |
| G. Privacy / compliance / disclosure burden | 5 | 3 | 3 | External-processing disclosure exists, but the operational model is at least explicit. |
| **Total** | **100** |  | **69** |  |

### Strengths

- Probably the strongest OCR-quality candidate among the pairings currently discussed.
- Strong scanned-PDF story.
- Clean explicit failure taxonomy.

### Weaknesses

- User-side setup is unusually heavy for a desktop app.
- User may need cloud-project/account/billing understanding that is outside normal consumer expectations.
- The "bring your own cloud project" story is honest but friction-heavy.

### Downstream implementation constraints introduced by this candidate pairing

- Must provide setup guidance, validation, and explicit recovery states for missing/incomplete billing/auth/project setup.
- Must store user credentials locally and expose clear disconnect/remove actions.
- Must keep OCR disabled until the user finishes setup; no hidden partial activation.

### Recommendation status

- [ ] Reject
- [ ] Keep as fallback candidate
- [x] Keep as serious contender
- [ ] Select as preferred substrate + access-model pairing

### Recommendation notes

`Keep as the second-ranked alternative. This pairing remains serious because of likely OCR quality, but it loses product-level preference because the user-side cloud onboarding burden is too high for a single default OCR route.`

---

## Candidate: `Google Document AI + hybrid/optional`

### Metadata

- Evaluation date: `2026-03-12`
- Evaluator: `ChatGPT`
- Substrate: `Google Document AI`
- Access model: `hybrid/optional`
- Version / product / API context: `Mixed managed + user-managed model`
- Setup assumptions:
  - Some users would rely on a managed path while others would bring their own configuration.
  - The app would need to explain and support both paths.

### Access-model profile

- Who pays for OCR usage: `Mixed / ambiguous`
- Who owns the substrate account/project: `Mixed / ambiguous`
- Where credentials live: `Mixed / ambiguous`
- Can each user enable OCR with their own account/billing?: `Sometimes`
- Is OCR enabled by default or manually activated?: `Mixed`
- Usage restrictions/limits: `Different by path`
- Restriction enforcement path: `Different by path`
- Quota/budget/usage-limit behavior: `Different by path`
- Per-user revocation possible?: `Different by path`

### Hard gates

| Hard gate | Result | Notes |
|---|---|---|
| HG-1 Photographed-page OCR viability | Pass | Same underlying substrate as the other Document AI pairings. |
| HG-2 Multilingual coverage | Pass | Same substrate capability story. |
| HG-3 PDF suitability | Pass | Same substrate capability story. |
| HG-4 Architecture viability | Pass | Still technically portable. |
| HG-5 Observability / explicit failure handling | Fail | Split-path failures and entitlement states would complicate user-visible behavior materially. |
| HG-6 Access-model / setup / compliance feasibility | Fail | This product does not benefit from carrying two access models for one OCR route. |

### Strengths

- Preserves optionality in theory.
- Could serve multiple user profiles.
- Reuses the same substrate family.

### Weaknesses

- Needlessly complicates one-route product semantics.
- Multiplies setup, support, and error-taxonomy burden.
- Weakens clarity about who pays, who owns the account, and what happens on quota/auth failures.

### Downstream implementation constraints introduced by this candidate pairing

- Product would need to communicate dual entitlement/setup paths.
- Error handling would branch by access model.
- Support burden would rise without improving the single-route product story.

### Recommendation status

- [x] Reject
- [ ] Keep as fallback candidate
- [ ] Keep as serious contender
- [ ] Select as preferred substrate + access-model pairing

### Recommendation notes

`Reject. Even if technically feasible, it is the wrong shape for a one-route OCR feature.`

---

## Candidate: `Google Drive OCR via Google Docs conversion + user-managed + explicit sign-in activation`

### Metadata

- Evaluation date: `2026-03-12`
- Evaluator: `ChatGPT`
- Substrate: `Google Drive OCR via conversion to Google Docs, text export, and cleanup`
- Access model: `user-managed + explicit sign-in activation`
- Version / product / API context: `Google Drive API v3 upload/import + Google Docs export flow`
- Setup assumptions:
  - User signs in with a Google account using official desktop OAuth in the system browser.
  - The app uses official Google APIs only.
  - The app targets `drive.file` rather than broad restricted Drive scopes.
  - OCR is activated only after explicit user sign-in/consent.
  - Input starts from local files selected in the app.
  - The app uploads the file, converts it to a Google Doc, exports the text result, and then attempts cleanup of the temporary remote artifact.
  - If broader OCR image-family support is needed, unsupported local formats such as WebP/TIFF may require a local normalization step before upload.

### Access-model profile

- Who pays for OCR usage: `The user uses their own Google account/Drive/API quota; no separate OCR billing path is required by the product`
- Who owns the substrate account/project: `User owns the Drive data/account boundary; app owner owns the OAuth client registration`
- Where credentials live: `User OAuth tokens live locally on the user's machine`
- Can each user enable OCR with their own account/billing?: `Yes, through their own Google account`
- Is OCR enabled by default or manually activated?: `Manually activated by explicit sign-in`
- Usage restrictions/limits: `Drive API quotas apply; conversion/export behavior and document-format limits apply`
- Restriction enforcement path: `Explicit OAuth gate + preflight + surfaced Drive/API failures`
- Quota/budget/usage-limit behavior: `Quota/auth/export/delete failures must map to explicit user-visible states`
- Per-user revocation possible?: `Yes, via disconnect/removal in-app and Google account-side revocation`

### Hard gates

| Hard gate | Result | Notes |
|---|---|---|
| HG-1 Photographed-page OCR viability | Pass | Developer-side validation on a real photographed-page image sample produced practically strong OCR output suitable for the product use case. |
| HG-2 Multilingual coverage | Pass (provisional) | Spanish and English validation path is now practically supported by the successful test flow; broader multilingual coverage still remains to be expanded later. |
| HG-3 PDF suitability | Pass | Developer-side validation on a scanned PDF sample produced practically strong OCR output suitable for the product use case. |
| HG-4 Architecture viability | Pass | Official HTTPS/OAuth/API flow is cross-platform-friendly. |
| HG-5 Observability / explicit failure handling | Pass (narrow) | Auth/quota/export/delete failures can be explicit, but OCR internals are more opaque than in a dedicated OCR API. |
| HG-6 Access-model / setup / compliance feasibility | Pass | Viable if and only if the app uses official APIs, minimum scopes, explicit sign-in activation, and clear privacy/disclosure handling. |

### Weighted scoring

| Criterion | Weight | Score (0-5) | Weighted score | Notes |
|---|---:|---:|---:|---|
| A. OCR quality on photographed corpus | 35 | 5 | 35 | Developer-side validation on a photographed-page image sample was strong enough for the intended product use case. |
| B. Language and script coverage | 15 | 4 | 12 | Broad enough to remain viable for the issue target; broader multilingual validation can still grow later. |
| C. PDF support and file-family suitability | 15 | 5 | 15 | Developer-side validation on a scanned PDF sample was strong enough for the intended product use case. |
| D. Cost model and cost controllability | 10 | 5 | 10 | Its biggest advantage: no separate OCR billing workflow for the user. |
| E. Setup / auth / activation burden | 10 | 4 | 8 | Sign-in consent is materially lighter than asking users to create cloud OCR projects/billing. |
| F. Cross-platform architectural viability | 10 | 4 | 8 | Works as a normal OAuth/API integration across desktop platforms. |
| G. Privacy / compliance / disclosure burden | 5 | 2 | 2 | External upload and temporary remote artifacts still require strong disclosure and cleanup policy. |
| **Total** | **100** |  | **90** |  |

### Strengths

- Best fit for a single OCR route that does not ask users to contract or configure a separate paid OCR service.
- Uses a Google flow that users already recognize conceptually from Drive/Docs.
- Official API path exists for conversion, export, and cleanup.
- Has now been validated empirically in a real developer-side setup on both an image sample and a scanned PDF sample.

### Weaknesses

- It is not a clean dedicated OCR API; it is a conversion workflow.
- External upload/privacy burden is unavoidable.
- Some desired file families may require local normalization to a supported upload format before conversion.
- OCR internals are more opaque than in a dedicated structured OCR API.

### Downstream implementation constraints introduced by this candidate pairing

- Must use desktop OAuth in the system browser with minimum scopes and no embedded webview.
- Must define temporary remote-artifact lifecycle explicitly, including best-effort deletion and explicit user-visible warning if cleanup fails.
- Must document that OCR requires Google sign-in and that files are uploaded to Google for text extraction.

### Production OAuth / publication requirements for a distributed public release

This candidate pairing remains viable for private testing and narrow manual distribution with an unverified OAuth app, but that mode is not equivalent to a normal public product release.

#### Private testing / narrow non-public distribution

For private testing, the app can technically function before full production verification, but with important restrictions:

- the OAuth app may show an unverified-app warning to users
- Google testing/user-cap restrictions may apply
- testing-mode token behavior may be less stable than production
- this is acceptable for development and controlled testers, not as the intended release posture

This means the pairing is implementable early, but that does not remove the publication/compliance work required for a real public rollout.

#### Minimum production publication requirements

If this app is distributed publicly as a normal external desktop app, the Google account connection flow must be treated as a production OAuth integration, not as an ad-hoc test setup.

At minimum, the release story must include:

- a Google Cloud project with an OAuth client registered for the correct installed-app / desktop flow
- desktop OAuth using the system browser, not an embedded webview
- minimum-scope design, with `drive.file` as the intended default unless a later requirement proves it insufficient
- a publicly accessible application home page that clearly describes the app and the Google-connected OCR functionality
- a publicly accessible privacy policy that explains how the app accesses, uses, stores, and deletes Google user data
- app home page and privacy policy hosted on a verified domain under project ownership/control for production verification
- OAuth consent-screen branding/support metadata aligned with the real app identity
- submission for Google's basic/brand verification before treating this as a normal public release path

#### What does not count as "done"

The following should not be treated as sufficient production-readiness by themselves:

- "the OAuth flow works locally"
- "the app is usable by the developer personally"
- "the code lives on GitHub"
- "a GitHub repository exists"
- "a GitHub profile or repository page is the only app presence"

A repository can support development, but production OAuth publication requires a clearer and more formal public app identity/compliance surface.

#### App-shape implication for this project

For this project, part of that minimum production shape is no longer hypothetical: the project already has a dedicated public domain and a public website surface. That materially reduces the publication-readiness gap for this candidate pairing, because a public web/app-identity surface is a real production OAuth requirement here, not a cosmetic extra.

What still remains is to ensure that this existing public surface also serves as the compliance surface required for production publication. A minimal acceptable production shape for this pairing is therefore:

- public project home page
- public privacy policy
- verified domain ownership/control
- OAuth consent-screen identity aligned with the same public app identity

With that in place, the pairing is not blocked by lack of a domain or website; the remaining publication work is privacy-policy / consent-screen / verification alignment.

#### Evaluation impact

This does not force rejection of the candidate.

However, it does narrow the recommendation:

- Pass for distributed-public feasibility only if the release plan explicitly includes production OAuth verification work.
- If the project does not complete privacy-policy / consent-screen / domain-verification alignment on that existing public surface, this candidate should be downgraded from "public-release preferred" to "private-testing preferred only".

### Development-vs-production implementation clarification

This pairing can and should be developed first against a testing setup.

That is not only acceptable, but operationally preferable. The current test-project / external-test-user mode is sufficient for implementing and validating the core OCR route inside the app, as long as the implementation is designed so that environment-specific publication details remain configuration concerns rather than deep logic concerns.

#### What can be built safely in testing mode

The following implementation work should be treated as stable and worth doing now, even before public production publication is completed:

- desktop OAuth launched in the system browser
- explicit sign-in / disconnect flow
- minimum-scope authorization design
- local file selection
- upload -> convert -> export -> delete OCR flow
- token storage / revocation handling
- explicit OCR error taxonomy and user-visible failure states
- disclosure/consent UX around external processing

These are core product behaviors, not merely temporary test scaffolding.

#### What should remain environment-specific

The following pieces should be treated as environment/publication configuration, not as reasons to fork the OCR logic:

- Google Cloud project identity
- OAuth client identity
- consent-screen publication state
- test-user restrictions versus public production availability
- branding/homepage/privacy-policy/domain-verification surfaces

In other words, the code path for the OCR route should be kept as stable as possible across testing and future production rollout.

#### Practical implementation consequence

The app should be implemented so that:

- test versus production differences are handled primarily through configuration and deployment inputs
- the OCR route itself is not rewritten when moving from private testing to public release
- environment-specific values are isolated from the core OCR orchestration logic

If implemented this way, the later transition to production should mostly involve:
- switching to the production Google project / OAuth client
- completing OAuth publication/verification requirements
- updating public app-identity/compliance surfaces

It should not require major changes to the core OCR route itself.

#### Recommendation impact

This materially supports starting app-side implementation now against the testing setup.

The testing setup should be treated as a legitimate development environment for the chosen OCR route, not as disposable throwaway work, provided that the implementation keeps:
- environment configuration separated from route logic
- OAuth/publication surfaces separated from OCR orchestration
- project-specific credentials out of hardcoded app logic

### Empirical validation update

Developer-side/manual validation was completed after the initial drafting of this evaluation.

#### Validation scope executed
- dedicated Google Cloud test project created for the Drive OCR route
- Google Drive API enabled
- desktop OAuth consent/client configured for external test usage
- test users added
- local credentials downloaded
- official-style authentication path validated first through a Drive list-files test
- local proof-of-concept OCR flow executed successfully:
  - local file selection
  - upload to Drive
  - conversion to Google Docs
  - export to `text/plain`
  - deletion of the temporary Google Doc artifact

#### Samples validated
- one photographed-page image sample
- one scanned PDF sample

#### Observed outcome
- authentication and consent flow worked successfully in the intended desktop/browser model
- the full OCR route worked end-to-end for both tested file families
- practical OCR quality on the photographed-page image was strong enough to satisfy the product goal
- practical OCR quality on the scanned PDF was likewise strong enough and materially consistent with the image result
- the main defects observed were post-processing/formatting defects (line breaks, hyphenation, spacing, cleanup), not major content-loss failures

#### Interpretation
This candidate is no longer only a theoretical or paper-viable favorite. It has now been validated empirically in a real developer-side setup and has demonstrated output quality that is acceptable for the intended product use case.

This does not eliminate the need for broader corpus testing later, but it materially upgrades confidence in:
- photographed-page OCR viability
- scanned-PDF suitability
- setup/activation realism for a user-managed test path

### Recommendation status

- [ ] Reject
- [ ] Keep as fallback candidate
- [ ] Keep as serious contender
- [x] Select as preferred substrate + access-model pairing

### Recommendation notes

`Select as the current preferred pairing. Under the one-route product constraint, the decisive advantage is that users do not need to create or fund a separate OCR service account/project. This pairing is no longer only theoretically attractive: it has also been validated empirically in a real developer-side setup on both a photographed-page image and a scanned PDF, with output quality judged strong enough for the intended product use case. The pairing stays acceptable only if implemented with strict scope minimization, official APIs only, explicit sign-in activation, explicit privacy disclosure, explicit temporary-artifact cleanup, and an explicit production OAuth publication plan for distributed public release. If the project is unwilling to add the minimal homepage/privacy-policy/verified-domain surface required for that publication path, the pairing should still be treated as private-testing/public-release-conditional rather than fully production-ready by default.`

---

## 9. Comparative summary

| Substrate | Access model | Hard gates passed? | Total score | Decision status | Main reason |
|---|---|---|---:|---|---|
| Google Document AI | vendor-managed | No | - | Reject | Operational/billing/compliance burden is too heavy for the current product. |
| Google Document AI | user-managed + optional activation | Yes | 69 | Serious contender (second choice) | Probably stronger raw OCR, but user-side cloud onboarding is too heavy for the default one-route product. |
| Google Document AI | hybrid/optional | No | - | Reject | Wrong shape for a one-route OCR feature; access-model ambiguity adds support and UX debt. |
| Google Drive OCR via Google Docs conversion | user-managed + explicit sign-in activation | Yes | 90 | Preferred current pairing | Best fit for one OCR route with no separate OCR contracting/billing workflow; now also empirically validated in developer-side image + PDF testing. |
| Google Cloud Vision DOCUMENT_TEXT_DETECTION | user-managed + optional activation | Not evaluated in this revision | - | Deferred | Plausible alternative, but not needed to answer the current product decision. |
| Azure AI Document Intelligence Read | user-managed + optional activation | Not evaluated in this revision | - | Deferred | Plausible alternative, but not needed to answer the current product decision. |

---

## 10. Final decision

### Chosen substrate
- `Google Drive OCR via Google Docs conversion`

### Chosen access model
- `user-managed + explicit sign-in activation`

### Rejected candidates / pairings
- `Google Document AI + vendor-managed`
- `Google Document AI + hybrid/optional`

### Rationale

`Given the current product constraint that the app should expose one OCR route rather than a menu of OCR providers, the decision is no longer just about which substrate might deliver the highest raw OCR quality. It is about which single route is most realistic for distributed desktop users. Google Drive OCR via Google Docs conversion now outranks the prior Document AI baseline because it removes the need for each user to create or fund a separate OCR service/project while still remaining implementable through official Google APIs. This is a narrower and more opinionated choice than the earlier conservative baseline. It accepts external upload and Google-account dependence as part of the product contract in exchange for a much lower user-side activation burden. That product judgment is no longer based only on theory: developer-side empirical validation has already shown that the Drive OCR route can produce excellent practical results for both an image sample and a scanned PDF sample. However, the pairing should only be treated as public-release ready if the project also commits to the minimum OAuth publication surface required for an external production app.`

### Current recommendation baseline

Based on the current document set, current product constraint of one OCR route, and current scope assumptions, the working recommendation is:

- Preferred current pairing: `Google Drive OCR via Google Docs conversion + user-managed + explicit sign-in activation`.
- Second-ranked alternative: `Google Document AI + user-managed + optional activation`.
- OCR should ship unavailable until the user completes explicit Google sign-in/consent.
- OCR should be presented as one connected capability, not as a provider chooser.
- The app should use official Google APIs only.
- The app should request the minimum relevant Drive scope needed for the workflow and avoid broad restricted Drive scopes unless a later requirement proves that unavoidable.
- The app should start from local files selected in the app, upload them for OCR conversion, export the extracted text, and then attempt cleanup of the temporary remote artifact.
- `Disconnect Google OCR` and `Disable OCR availability in this app instance` should be treated as separate user actions if the implementation keeps cached credentials/tokens.
- Setup/auth/quota/export/delete failures must map to explicit user-visible states; no silent fallback is acceptable.
- Public release should assume Google OAuth production verification work, not only local technical integration.
- A normal public rollout requires a minimal public app identity surface: home page, privacy policy, and domain verification aligned with the OAuth consent screen.
- A plain source repository is not sufficient by itself as the production publication/compliance surface for this pairing.
- The project already has a public domain and website surface, so the remaining gap is not basic web presence itself but completion of the privacy-policy / consent-screen / domain-verification publication surface.
- Initial developer-side empirical validation has already been completed successfully for both a photographed-page image sample and a scanned PDF sample, with output quality judged strong enough for the intended product use case.
- Further corpus expansion can still refine confidence later, but the Drive path should no longer be treated as merely speculative on OCR quality.
- App-side implementation should proceed first against the testing setup, with test-versus-production differences isolated as configuration/publication concerns rather than changes to the core OCR route logic.

This revised baseline is less conservative than the previous document state. It sacrifices substrate purity in favor of a more realistic single-route product story for distributed users, while making the production OAuth publication burden explicit instead of leaving it implicit.

### Known constraints that propagate downstream

These constraints must be treated as implementation inputs, not post-hoc discoveries.

- access-model constraints: OCR depends on explicit Google account connection; no shared managed OCR path is assumed.
- setup/onboarding constraints: use desktop OAuth in the system browser; explain clearly that OCR requires Google sign-in and cloud processing.
- credential/auth constraints: OAuth tokens must live locally, be removable locally, and be revocable by the user.
- billing constraints: no separate OCR billing path is assumed; Drive quota/request limits still exist and must be surfaced honestly.
- restriction/quota constraints: Drive/API failures, quota limits, export-size limits, and cleanup failures require explicit UX states.
- privacy/external-processing constraints: files are uploaded to Google for OCR conversion; this must be disclosed prominently and truthfully.
- platform adapter constraints: OAuth/browser-launch/callback handling must be isolated cleanly for Windows-first delivery and later macOS/Linux support.
- PDF/latency/limits constraints: PDF/image conversion is remote and may be slower/less transparent than a dedicated OCR API; temporary Google Docs export limits apply; some image formats may need local normalization before upload.
- observability/error-taxonomy constraints: the app must distinguish sign-in required, consent denied, upload failed, conversion failed, export failed, delete failed, quota-limited, and connectivity-failed states.
- public-release publication constraints: if OCR is shipped as a Google-connected public feature, the release plan must include OAuth consent-screen publication readiness, public app identity, privacy-policy publication, and verified-domain ownership/control.
- project-presence constraints: a repository-only project presence is insufficient for clean production OAuth rollout; at least a minimal dedicated public app/policy surface is required.
- environment-separation constraints: test and production should use separate Google projects/clients, but the app should keep the OCR route logic stable across both environments and isolate environment differences as configuration/publication concerns.

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
