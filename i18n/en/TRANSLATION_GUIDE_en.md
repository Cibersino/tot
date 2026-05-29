# Language-specific translation guide — English (`en`)

This language-specific guide is read together with [`../TRANSLATION_GUIDE.md`](../TRANSLATION_GUIDE.md). It records editorial decisions specific to the English parent locale of toT.

## 1. Editorial model for the English parent locale

`en` uses clear international interface English. It is not a bare fallback layer, a mechanically neutral base, or a translation aid subordinate to Spanish.

English in toT should read as a complete parent locale: direct, precise, technically literate when needed, and natural as English UI copy. It should avoid both generic corporate product language and internal diagnostic language.

The goal is not to erase all regional or editorial marks. The goal is broad intelligibility without flattening the language into artificial platform English. When a form is natural, precise, and stable in the UI surface, it can be accepted even if a more globally neutral alternative exists.

Avoid promotional filler such as `seamless`, `enhance`, `powerful`, or `experience` unless a future marketing surface explicitly requires that register. Avoid log-like phrasing in user-facing copy unless the user needs the technical distinction.

## 2. Addressing the user

English uses direct instructions and descriptive states according to surface.

| Surface | Preferred treatment |
|---|---|
| Buttons, menus, compact commands | Imperative or short phrase: `Save`, `Load task`, `Start extraction`, `Use OCR`. |
| Status, errors, and blockers | Descriptive or actionable forms: `Could not load the task.`, `Current text is still updating.` |
| Direct recovery instructions | Imperative without excess politeness: `Check your connection and try again.` |
| Confirmations | State the consequence and ask directly: `Do you want to continue?` |
| Long help or disclosure text | Clear explanatory prose; direct address is acceptable when it improves clarity. |

`Please` is not the default politeness layer. Use it when the required action is waiting, as in `Please wait...`, but do not add it mechanically to ordinary instructions.

Avoid `kindly`, `please be advised`, `you may want to`, and similar formulas as the ordinary UI voice.

## 3. Functional lexicon

These forms govern frequent English concepts in toT. This is not a full glossary; it records terms where English drift is likely.

| Term | Use in `en` | Notes / alternatives |
|---|---|---|
| `batch extraction` | Stable term for the multi-input planning, execution, and report flow. | Do not replace with `bulk extraction` or `mass extraction` without a documented decision. |
| `current text` | Stable term for the central text currently loaded in the main window. | Avoid `active text`, `loaded text`, `working text`, or `current document` for this concept. |
| `extraction route` | General term for the native/OCR route choice. | Do not normalize to `method` unless a new surface clearly needs that wording. |
| `Floating Stopwatch` | Name of the floating stopwatch surface. | Use initial capitals as a surface name. |
| `generated PDF` | Local PDF derivative created by the app. | Use for selected-page or split-part artifacts created by toT. |
| `item` | Use for the entry processed inside a batch unit. | Do not force `file` when generated parts or non-file processing inputs may be involved. |
| `native route` / `native extraction route` | Use `native route` in compact route-choice surfaces; use the fuller form when clarity requires it. | `Native` alone is acceptable only when the OCR contrast is visible. |
| `OCR extraction` | Use when the surface names the OCR route or process as extraction. | Use `OCR` alone in compact route labels or status text where the contrast is clear. Do not expand to `optical character recognition` in normal UI copy. |
| `reading` | Use when the surface presents the task entry as reading content rather than table structure. | This covers the `Reading` column and saved/reusable library entries. Use `row` for structural table operations such as add, move, validate, or delete a row. |
| `Reading time` | English title of the browser extension. | Do not replace with `Reading speed test` or `Estimated reading time`. |
| `reading library` | Library of reusable readings inside the Task Editor. | Avoid plain `library` when ambiguity is likely. |
| `reading speed test` | Stable term for the guided speed-measurement flow. | Use sentence case unless the surface explicitly treats it as a formal title. |
| `row` | Use when the surface treats the entry as table structure. | Examples: add, move, delete, validate, or name a row. |
| `saved PDF` | Generated PDF kept by user choice. | `Reveal saved PDF` means showing it in the file system, not opening it. |
| `source PDF` | Original PDF selected by the user. | Do not collapse with generated or saved PDFs. |
| `stopwatch` | Term for the timing tool. | Avoid `timer` for the stopwatch surfaces, since it may imply countdown behavior. |
| `Task Editor` | Name of the task-editing window. | Use initial capitals as a surface name. |
| `Text Editor` | Name of the manual text-editing window. | Use initial capitals as a surface name. |
| `text extraction` | Stable term for the flow that obtains text from files. | Do not replace with `import`, `load`, or `open` when referring to the extraction flow. |
| `text snapshot` | Stable term for saved/loadable text snapshots. | Avoid `screenshot`, `capture`, or `saved copy`. |
| `unit` | Use for batch extraction containers. | Avoid `group` when referring to the app concept. |

## 4. Technical and product terms

These forms are normal in English UI or technical product language. Use them with the scope indicated.

| Term | Use in `en` | Note |
|---|---|---|
| `app` | Normal product term. | `Application` may be used in more formal or explanatory surfaces if it improves the register. |
| `build` | Technical app build/version artifact. | Keep in contexts such as `this app build`. |
| `feedback` | Acceptable as a compact label where already established. | Do not turn it into the automatic term for all user responses or reports. |
| `pool` | Use for the local set of reading speed test files. | Do not replace with `collection`, `set`, or `bank` for the app concept. |
| `preset` | Use for saved reading-speed configurations. | Avoid `profile`, `setting`, or `configuration` when the concept is the app preset. |
| `snapshot` | Use as the app's saved/loadable text entity. | In normal UI, prefer the fuller `text snapshot` where clarity is needed. |
| `spoiler` | Use for the preview-control function that hides the final segment. | Do not replace with `reveal`, `ending`, or `preview hiding` unless a new surface requires explanation. |
| `token` | Use in OAuth/session-state contexts. | It may be explained as sign-in or authorization state when the surface requires it. |
| `tooltip` | Avoid in user-facing copy unless the UI is explicitly about tooltips. | Prefer contextual terms such as `tip`, `label`, `help`, or an action-specific phrase. |
| `WIP` | Use only as a protected temporary development marker. | Do not extend it as final user-facing product style. |
| `DevTools` | Preserve the technical tool name. | Do not translate or recase. |

## 5. Formal conventions for English

These conventions govern review of strings in the `en` bundles.

| Aspect | Convention |
|---|---|
| Surface names | Use initial capitals for stabilized surface names: `Text Editor`, `Task Editor`, `Floating Stopwatch`. |
| Common app concepts | Use lowercase when not naming a surface: `current text`, `text snapshot`, `batch extraction`, `reading library`. |
| Buttons and commands | Prefer sentence case, not automatic Title Case: `Start extraction`, `Restore default presets`. |
| Section headings | All caps are acceptable only where the UI design uses them as section labels: `READING SPEED`, `COUNT RESULTS`, `STOPWATCH`. |
| Extension title | Use `Reading time`. Do not recase or rename without a branding decision. |
| Short alerts | Complete sentences normally close with a period: `Task saved.` |
| Labels with colons | Use colons when introducing immediate values: `Source PDF:`, `Speed:`, `Elapsed: `. |
| Ellipses | Use `...` in progress/waiting states and placeholders unless a cross-UI typography decision changes this. |
| Quotation marks | Use straight double quotes for dynamic names when needed; in JSON strings, escape them as `\"{name}\"`. Do not apply them mechanically to numbers, units, paths, or codes. |
| Apostrophes | Use standard ASCII apostrophes in JSON strings: `you're`, `app's`. Do not introduce typographic apostrophes without a repo-wide decision. |
| Hyphenated compounds | Use hyphens when they improve English parsing: `password-protected PDF`, `built-in tests`, `selected-page PDF`. Do not over-hyphenate stable noun phrases such as `current text`, `text snapshot`, or `reading speed`. |

## 6. English spelling variants

For recognized English spelling variants with no intended semantic, product, or surface distinction, use one stable form across the `en` bundles. When more than one form is equally valid, prefer the one that best preserves natural interface reading, clarity, and lexical continuity within toT.

Use these spelling choices consistently:

| Use | Avoid |
|---|---|
| `authorize`, `authorization`, `authorized` | `authorise`, `authorisation`, `authorised` |
| `behavior` | `behaviour` |
| `cancelled`, `cancelling`; keep with `cancellation` | `canceled`, `canceling` |
| `color` | `colour` |
| `customize`, `customized` | `customise`, `customised` |
| `dialog` for UI windows | `dialogue` for UI windows |
| `focused` | `focussed` |
| `labeled`, `labeling` | `labelled`, `labelling` |
| `program` | `programme` |
