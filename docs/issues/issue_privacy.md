**Title**

Align app-facing documentation with the intended OCR connectivity and privacy model before public OCR exposure

**Body**

## Summary

The repo currently has documentation drift between:

- the intended OCR product model already documented in internal issue/design docs
- the current app-facing privacy/connectivity wording shown to users in app docs and info pages

This issue is to align the app-facing documentation before OCR is exposed to normal users.

This is a documentation/readiness issue, not an architecture refactor and not a security incident.

## Current problem

The intended OCR model is already explicit in internal docs:

- OCR uses Google
- OCR activation uses desktop OAuth in the system browser
- selected files are uploaded to Google for OCR conversion
- this external processing must be disclosed clearly

Repository evidence:

- [`docs/issues/issue_53.md`](docs/issues/issue_53.md)
- [`docs/issues/issue_53_ocr_substrate_evaluation.md`](docs/issues/issue_53_ocr_substrate_evaluation.md)
- [`docs/tree_folders_files.md`](docs/tree_folders_files.md)
- [`i18n/en/renderer.json`](i18n/en/renderer.json)
- [`i18n/es/renderer.json`](i18n/es/renderer.json)

But some user-facing app documentation still describes connectivity in narrower terms, as if internet use were limited to:

- update checks / releases
- external links opened by the user

This is now stale relative to the intended OCR model.

Important precision:

- [`public/info/acerca_de.html`](public/info/acerca_de.html) does include a privacy/data section.
- The problem is not that the page ignores privacy altogether.
- The problem is that its current privacy/connectivity summary is incomplete and stale relative to the intended OCR model and other external-open cases already present in the app.

## Affected app-facing docs

Primary targets:

- [`PRIVACY.md`](PRIVACY.md)
- [`public/info/acerca_de.html`](public/info/acerca_de.html)
- [`public/info/instrucciones.en.html`](public/info/instrucciones.en.html)
- [`public/info/instrucciones.es.html`](public/info/instrucciones.es.html)

Concrete drift examples must be handled using the exact current wording, not paraphrases. Relevant examples:

- [`public/info/acerca_de.html`](public/info/acerca_de.html) currently says:
  - `Actualizaciones: la app solo consulta información pública de versiones y abre el navegador para descargar; no descarga ni instala actualizaciones automáticamente.`
  - `Conectividad: solo para verificar actualizaciones en GitHub y abrir releases en el navegador. No se envía tu texto; GitHub verá tu IP (tráfico HTTPS estándar).`
  - The same page does include privacy claims about no telemetry, local processing of typed/pasted text, and local storage of settings/state; the drift is specifically in the connectivity summary and in the omission of OCR and other external-open cases.
- [`PRIVACY.md`](PRIVACY.md) currently says:
  - `La única conectividad prevista no dependiente de acciones del usuario es la verificación de actualizaciones en GitHub. La app no descarga ni instala actualizaciones automáticamente.`
  - `El resto de las operaciones de conectividad solo ocurre por acciones explícitas del usuario (por ejemplo, al abrir enlaces externos desde la app).`
  - `### 3.2 Apertura de enlaces externos por acción del usuario`
  - `### 3.3 Sin otros servicios externos`
- [`public/info/instrucciones.en.html`](public/info/instrucciones.en.html) currently says:
  - `Internet: the app may require connection only when you execute actions that open external resources, such as:`
  - `open external links clicked by the user (including links opened from Tasks),`
  - `check/open update information (e.g. on GitHub).`
  - `Practical implication: although toT does not “upload your text", any action that opens an external site exposes to that service your IP address and normal connection metadata (as in any browser).`
- [`public/info/instrucciones.es.html`](public/info/instrucciones.es.html) currently says:
  - `Internet: la app puede requerir conexión solo cuando tú ejecutas acciones que abren recursos externos, como:`
  - `abrir enlaces externos en los que el usuario hizo clic (incluidos los enlaces abiertos desde Tareas),`
  - `comprobar/abrir información de actualización (por ejemplo, en GitHub).`
  - `Implicación práctica: aunque toT no “sube tu texto”, cualquier acción que abra un sitio externo expone a ese servicio tu dirección IP y metadatos normales de conexión (como en cualquier navegador).`

## Clarified scope

Important clarifications for this issue:

- OCR is not yet exposed to normal users in current builds.
- The website privacy pages are intended only for the website.

Because of that:

- this issue is about app-facing documentation drift
- this issue is not a claim that the public website privacy pages must be rewritten as part of this task
- this issue should be resolved before normal-user OCR exposure, not treated as an immediate release-blocker for the current non-public OCR state

## Goal

Make the app-facing documentation accurately reflect the app's real connectivity/privacy surface without overstating or confusing other claims.

OCR is the highest-priority source of drift, but this issue is not OCR-only.

The corrected docs should make clear that:

- the app remains primarily local for normal text entry/edit/count flows
- update checks exist as their own connectivity case
- external links opened from app info pages exist as their own connectivity case
- links opened from Tasks exist as their own connectivity case, with their own current behavior
- About/Privacy/Manual wording must not erase distinctions that already exist between:
  - ordinary local text processing
  - updates
  - external links opened from app info pages
  - links opened from Tasks
- OCR is an optional Google-connected capability
- OCR activation opens the system browser for Google sign-in/authorization
- only files explicitly chosen by the user for OCR are sent to Google
- OCR requires internet connectivity
- OAuth token/credential handling remains local to the app instance as already designed

## Non-goals

- Do not refactor the external-link architecture.
- Do not rewrite the OCR implementation.
- Do not expand the website privacy/cookies pages in this issue.
- Do not turn this into a general security-policy redesign.

## Work plan

1. Inventory the stale claims in the affected app-facing docs.

2. Define the canonical truth model for app-facing wording across the whole app-facing connectivity/privacy surface:
   - ordinary local text handling
   - update checks and release-opening behavior
   - external links from app info pages
   - Task links and their current confirmation/trust-host behavior
   - optional OCR capability
   - Google sign-in in system browser
   - external processing only for user-selected OCR files
   - local token/credential persistence as applicable

3. Update the affected docs so they no longer imply:
   - connectivity is limited to an incomplete subset of actual cases
   - the app never sends any user-selected file/content to third parties under any feature

4. Preserve important distinctions:
   - typed/pasted text used in ordinary app flows remains local
   - external-link behavior is not described more narrowly than it really is
   - Task link behavior is not conflated with generic info-page links if the current behavior differs
   - OCR is separate, optional, and explicitly activated
   - existing non-OCR external-open cases should not be collapsed into inaccurate shorthand

5. Review wording for consistency between:
   - privacy policy
   - About page
   - English manual
   - Spanish manual

## Acceptance criteria

- [`PRIVACY.md`](PRIVACY.md) accurately describes the app's app-facing connectivity/privacy surface, including the optional Google-connected OCR flow.
- [`public/info/acerca_de.html`](public/info/acerca_de.html) still accurately states its existing local/privacy claims, but no longer presents an incomplete connectivity summary that omits other external-open cases and the intended OCR model.
- [`public/info/instrucciones.en.html`](public/info/instrucciones.en.html) no longer says internet is required only for external links/updates.
- [`public/info/instrucciones.es.html`](public/info/instrucciones.es.html) no longer says internet is required only for external links/updates.
- App-facing wording consistently distinguishes:
  - local text handling
  - updates
  - external links/info-page links
  - Task links where relevant
  - optional OCR connectivity and Google processing
- The result is suitable for shipping before OCR is exposed to normal users.

## Risks

- Overcorrecting the wording and making the app sound more network-dependent than it really is.
- Collapsing distinct cases into vague wording that is less informative than the current text.
- Introducing mismatch between English and Spanish app-facing docs.
- Fixing OCR wording while leaving the rest of the connectivity surface described inaccurately.

## Suggested wording constraints

- Be concrete.
- Do not imply telemetry where none exists.
- Do not imply that all user text is broadly uploaded.
- Keep the OCR disclosure explicit and limited to the feature that actually uses it.
- Do not describe the app as if updates were the only connectivity case when external-link features are also documented behavior.
- Do not describe all link-opening cases as identical if the current user-facing behavior differs by feature.
- Prefer "optional", "when the user activates OCR", and "files selected by the user for OCR".

## Release-readiness note

This issue should be treated as part of OCR public-exposure readiness.

It does not require immediate emergency action while OCR remains unavailable to normal users, but it should be completed before presenting OCR as a normal end-user feature.
