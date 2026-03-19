# Issue 53 Contracts

Linked issue: `docs/issues/issue_53.md`  
Linked plan: `docs/issues/issue_53_implementation_plan.md`  
Linked substrate decision: `docs/issues/issue_53_ocr_substrate_evaluation.md`  
Linked tracker: `docs/issues/issue_53_operation_tracker.md`

## Purpose

Revalidate and lock Section 3 contracts so implementation can proceed with:

- substrate-agnostic core behavior
- substrate-specific behavior isolated behind an adapter boundary
- explicit setup/auth/quota/connectivity/runtime failures
- no silent fallback

Authoritative revalidation note:

- Revalidated on `2026-03-14` after completion of Section 2 items 7/8.
- This revision supersedes earlier draft wording where semantics were still pending.
- Current runtime also includes a prepare/execute split; this document keeps the core contracts lean and defers detailed transport/lifecycle rules to `docs/issues/issue_53_prepare_execute_native_triage_plan.md`.

## Decision baseline

Chosen OCR pairing:

- substrate: `Google Drive OCR via Google Docs conversion`
- access model: `user-managed + explicit sign-in activation`

This document applies that decision without coupling core extraction/apply orchestration to provider internals.

## 1) Core extraction result contract (substrate-agnostic)

Every extraction route (`native`, `ocr`) must return this shape.

```ts
type ExtractionRoute = "native" | "ocr";

type ExtractionState =
  | "success"
  | "precondition_rejected"   // blocked start; extraction did not begin
  | "failure"                 // extraction started and failed
  | "cancelled";              // user abort/close during processing

type ExtractionErrorCode =
  | "unsupported_format"
  | "unreadable_or_corrupt"
  | "route_classification_failed"
  | "setup_incomplete"
  | "credentials_missing"
  | "auth_failed"
  | "quota_or_rate_limited"
  | "connectivity_failed"
  | "platform_runtime_failed"
  | "native_extraction_failed"
  | "ocr_unavailable"
  | "ocr_activation_required"
  | "ocr_upload_failed"
  | "ocr_conversion_failed"
  | "ocr_export_failed"
  | "ocr_cleanup_failed"
  | "aborted_by_user"
  | "unknown";

interface ExtractionResult {
  state: ExtractionState;
  executedRoute: ExtractionRoute | null;
  text: string; // empty unless state === "success"
  warnings: string[];
  summary: string;
  provenance: {
    sourceFileName: string;
    sourceFileExt: string;
    sourceFileKind: "image" | "pdf" | "text_document" | "unknown";
    ocrProvider: "google_drive_docs_conversion" | null;
    metadataSafeForLogs: Record<string, string | number | boolean | null>;
  };
  error: null | {
    code: ExtractionErrorCode;
    message: string; // user-displayable, localized by UI key in renderer layer
    detailsSafeForLogs: Record<string, string | number | boolean | null>;
  };
}
```

Rules:

- `state === "success"`:
  - `text` must be non-empty (or explicitly allowed empty for truly empty sources, surfaced as warning).
  - `error` must be `null`.
- `state !== "success"`:
  - `text` must be empty.
  - apply modal must not open.
  - current text must remain unchanged.
- Never switch routes silently after failure.
- Setup validation readiness is handled by Section 8 contract and must not be hidden as silent extraction fallback.

Clarification:

- `ExtractionResult` is the execute-stage route result.
- Prepare-stage responses do not return extracted text.

## 2) Route metadata contract (substrate-agnostic)

```ts
type OcrSetupStateForRouting =
  | "not_checked"
  | "ready"
  | "setup_incomplete"
  | "ocr_activation_required"
  | "failure";

interface RouteAvailability {
  fileKind: "image" | "pdf" | "text_document" | "unknown";
  availableRoutes: Array<"native" | "ocr">;
  chosenRoute: "native" | "ocr" | null;
  executedRoute: "native" | "ocr" | null;
  pdfTriage: "not_pdf" | "native_only" | "ocr_only" | "both";
  triageReason: string; // safe diagnostic explanation
  ocrSetupState: OcrSetupStateForRouting; // setup gate status at route-decision time
}
```

Rules:

- `availableRoutes.length === 0` must fail explicitly with `unsupported_format` or equivalent explicit failure.
- If both routes are available, UI must ask user to choose.
- `chosenRoute` and `executedRoute` must both be logged.
- For non-PDF files: `pdfTriage = "not_pdf"`.
- `ocrSetupState` must be logged whenever OCR route is unavailable due to setup/activation/runtime gating.

## 2A) Prepare/Execute orchestration note

Current runtime orchestration is:

1. `prepare`
2. optional route choice
3. `execute`

Rules:

- `prepare` performs route classification and may fail before any `ExtractionResult` exists.
- `execute` returns the final extraction outcome and is the stage that produces `ExtractionResult`.
- `prepare` stays outside processing mode.
- `execute` must use the prepared route decision and must not recompute triage.
- Detailed prepare/execute transport, token, and lifecycle rules are governed by `docs/issues/issue_53_prepare_execute_native_triage_plan.md`.

## 3) Apply contract (reuse existing canonical path)

Post-extraction apply options remain:

- `overwrite`
- `append`
- `repetitions`

Hard rules:

- Extracted text must go through the existing canonical apply path.
- No parallel apply pipeline.
- No new text semantics introduced by Issue 53.
- Existing `MAX_TEXT_CHARS` enforcement and truncation notice behavior remain unchanged.

## 4) State taxonomy contract

Extraction state separation is mandatory:

- `precondition_rejected`: blocked before extraction starts.
- `failure`: extraction started and failed.
- `cancelled`: user abort/close during processing.

Behavior guarantees:

- `precondition_rejected` is not an extraction failure.
- `cancelled` is not an extraction failure.
- none of these states may mutate current text.

Clarification:

- Setup-validation readiness (Section 8) is a separate contract from extraction-state taxonomy.

## 5) Processing-mode contract

Processing mode is separate from startup lock.

While active:

- block normal main-window and app-menu interactions
- allow only `close`, `minimize`, `move`, `abort`
- show progress + ETA when window is not minimized

Close during processing must map to `cancelled` with the same guarantees as explicit abort.

## 6) OCR adapter boundary (substrate-aware, not substrate-forced)

Core orchestration must depend on this interface, not on Google-specific APIs.

```ts
interface OcrAdapter {
  id: "google_drive_docs_conversion";
  isAvailable(): Promise<{ available: boolean; reason?: string }>;
  ensureActivated(): Promise<{ activated: boolean; reason?: string }>;
  run(input: {
    localFilePath: string;
    mimeType: string;
    abortSignal: AbortSignal;
  }): Promise<{
    text: string;
    warnings: string[];
    remoteArtifactId?: string;
  }>;
  disconnect(): Promise<void>;
}
```

Boundary rules:

- Core layer only consumes adapter contracts/results.
- Adapter maps provider-specific failures into shared `ExtractionErrorCode`.
- Adapter may add provider-specific details only in `detailsSafeForLogs`.
- Replacing OCR substrate later must not require core contract changes.

## 7) Google Drive OCR adapter contract (current chosen substrate)

Required flow:

1. Ensure user activation via desktop OAuth in system browser.
2. Upload local file to Drive (or normalized local format when needed).
3. Convert upload to Google Docs for OCR.
4. Export to plain text.
5. Attempt deletion of temporary remote artifact.

Required policy:

- minimum practical scopes (default target: `drive.file`)
- no embedded webview auth
- explicit sign-in required before OCR route is available
- explicit user disclosure that OCR uploads files to Google
- explicit disconnect action and local token removal path
- disconnect removes only local OAuth token state; app-side flows must not delete the local OAuth client credentials file
- availability baseline:
  - `setup_incomplete` when local `credentials.json` is missing
  - `ocr_activation_required` when local `token.json` is missing
  - route available only when both files are present under `app.getPath('userData')/config/ocr_google_drive/`
  - first successful sign-in persists token state for reuse across files/sessions for the same user
  - browser re-auth required only when token state is missing/invalid/revoked or scope requirements change
- restrictions/limits baseline:
  - no additional app-imposed hard caps at this phase (for example custom file-size/page-count caps)
  - enforced restrictions come from route/file-kind rules, setup/activation gates, and provider/API runtime constraints
  - no separate app-managed OCR billing-failure state is introduced in this phase
- quota/rate-limit baseline:
  - temporary rate-limit responses (including HTTP `429`) use bounded exponential-backoff retries
  - exhausted retry window => `quota_or_rate_limited`
  - explicit non-retryable provider limit responses => `quota_or_rate_limited` (no retry loop)
  - guidance: wait/retry for rate limits; reconnect is reserved for auth/activation failures

Error mapping minimum:

- sign-in required / consent denied -> `ocr_activation_required` or `auth_failed`
- upload failure -> `ocr_upload_failed`
- conversion failure -> `ocr_conversion_failed`
- export failure -> `ocr_export_failed`
- cleanup failure -> `ocr_cleanup_failed` (warning-or-failure policy must be explicit)
- quota / rate / billing-limit style provider responses -> `quota_or_rate_limited`
- network failure -> `connectivity_failed`

Cleanup policy:

- attempt best-effort delete always
- if cleanup fails, surface explicit warning/error and log structured details
- never silently hide cleanup failures

## 8) Setup validation contract (Section 2 item 7/8)

Setup validation runs in backend/IPC before OCR execution and must return explicit readiness/failure states.

```ts
type OcrSetupValidationState =
  | "ready"
  | "setup_incomplete"
  | "ocr_activation_required"
  | "failure";

type OcrSetupIssueType =
  | "setup"
  | "credentials"
  | "activation"
  | "auth"
  | "quota_or_rate"
  | "connectivity"
  | "platform_runtime"
  | "unknown";

interface OcrSetupValidationResult {
  ok: boolean;
  state: OcrSetupValidationState;
  summary: string;
  checks: {
    credentialsPresent: boolean;
    tokenPresent: boolean;
    credentialsValid: boolean;
    tokenValid: boolean;
    tokenHasAccessToken: boolean;
    tokenHasRefreshToken: boolean;
    apiProbeAttempted: boolean;
    apiReachable: boolean;
    apiStatusCode: number | null;
    apiReasonCode: string;
    apiIssueSubtype: string;
  };
  error: null | {
    code: ExtractionErrorCode;
    issueType: OcrSetupIssueType;
    userMessageKey: string;
    userMessageFallback: string;
    userActionKey: string;
    detailsSafeForLogs: Record<string, string | number | boolean | null>;
  };
}
```

Rules:

- Validation must check:
  - credentials presence
  - activation/token presence
  - reachable API path (unless probe is explicitly disabled by caller)
- Required mapping:
  - missing credentials file -> `state=setup_incomplete`, `code=setup_incomplete`
  - missing token file -> `state=ocr_activation_required`, `code=ocr_activation_required`
  - invalid credentials shape -> `state=failure`, `code=credentials_missing`
  - auth failures (including invalid token/access) -> `state=failure`, `code=auth_failed`
  - quota/rate/billing-limit provider responses -> `state=failure`, `code=quota_or_rate_limited`
  - network/timeout/connectivity failures -> `state=failure`, `code=connectivity_failed`
  - IPC/runtime failures -> `state=failure`, `code=platform_runtime_failed`
- Every non-ready result must be explicit user-visible and structured-loggable.
- No setup-validation failure may trigger silent route fallback.

## 9) Logging and bridge-failure policy alignment (Section 2 item 8)

Required behavior:

- Setup/activation/auth/quota/connectivity blocking outcomes must log explicit structured `warn`/`error`.
- Required-path registration failures must be explicit and blocking (throw on missing required dependencies).
- Handler/runtime failures must be explicit and non-crashing (return structured failure result).
- Bridge failures must preserve no-silent-fallback policy.
- Logging must remain consistent with `electron/log.js` conventions.

## 10) Observability contract alignment

At minimum log:

- selected file type
- available/chosen/executed route
- extraction state
- setup validation attempts/outcomes (`state`, `code`, `issueType`)
- OCR/native latency
- apply choice + repetition count
- truncation events
- setup/activation/auth/quota/restriction failures
- precondition_rejected/failure/cancelled distinction

## 11) Implementation sequencing after this contract revalidation

1. Keep Section 2 semantics frozen (setup validation + bridge policy) as baseline.
2. Start Section 4 from dedicated import/extract entrypoint guardrail.
3. Build route-classification + metadata pipeline against this contract set.
4. Build processing-mode state machine.
5. Integrate OCR adapter behind interface boundary.
6. Integrate native extraction route to shared `ExtractionResult`.
7. Wire post-extraction apply modal to canonical apply path.
8. Add smoke tests for state separation and no-silent-fallback guarantees.
