# Issue 53 Contracts

Linked issue: `docs/issues/issue_53.md`  
Linked plan: `docs/issues/issue_53_implementation_plan.md`  
Linked substrate decision: `docs/issues/issue_53_ocr_substrate_evaluation.md`

## Purpose

Lock the Section 3 contracts for Issue 53 so implementation can proceed with:

- substrate-agnostic core behavior
- substrate-specific behavior isolated behind an adapter boundary
- no silent fallback

## Decision baseline

Chosen OCR pairing (already decided):

- substrate: `Google Drive OCR via Google Docs conversion`
- access model: `user-managed + explicit sign-in activation`

This document applies that decision without coupling core extraction/apply orchestration to Google-specific internals.

## 1) Core extraction result contract (substrate-agnostic)

Every route (`native`, `ocr`) must return this shape.

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
  | "billing_or_quota_limited"
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
  - `text` must be non-empty (or explicitly allowed empty when source is truly empty and surfaced as warning).
  - `error` must be `null`.
- `state !== "success"`:
  - `text` must be empty.
  - apply modal must not open.
  - current text must remain unchanged.
- Never switch routes silently after failure.

## 2) Route metadata contract (substrate-agnostic)

```ts
interface RouteAvailability {
  fileKind: "image" | "pdf" | "text_document" | "unknown";
  availableRoutes: Array<"native" | "ocr">;
  chosenRoute: "native" | "ocr" | null; // null until user chooses or single-route auto-choice
  executedRoute: "native" | "ocr" | null;
  pdfTriage: "not_pdf" | "native_only" | "ocr_only" | "both";
  triageReason: string; // safe diagnostic explanation
}
```

Rules:

- `availableRoutes.length === 0` must fail explicitly with `unsupported_format` or equivalent explicit failure.
- If both routes are available, UI must ask user to choose.
- `chosenRoute` and `executedRoute` must both be logged.
- For non-PDF files: `pdfTriage = "not_pdf"`.

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

State separation is mandatory:

- `precondition_rejected`: blocked before extraction starts.
- `failure`: extraction started and failed.
- `cancelled`: user abort/close during processing.

Behavior guarantees:

- `precondition_rejected` is not an extraction failure.
- `cancelled` is not an extraction failure.
- none of these states may mutate current text.

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

- Core layer only consumes `OcrAdapter` results/errors.
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
  - route is available only when both files are present under `app.getPath('userData')/config/ocr_google_drive/`

Error mapping minimum:

- sign-in required / consent denied -> `ocr_activation_required` or `auth_failed`
- upload failure -> `ocr_upload_failed`
- conversion failure -> `ocr_conversion_failed`
- export failure -> `ocr_export_failed`
- cleanup failure -> `ocr_cleanup_failed` (warning-or-failure policy must be explicit)
- quota / rate / limit -> `billing_or_quota_limited`
- network failure -> `connectivity_failed`

Cleanup policy:

- attempt best-effort delete always
- if cleanup fails, surface explicit warning/error and log structured details
- never silently hide cleanup failures

## 8) Observability contract alignment

At minimum log:

- selected file type
- available/chosen/executed route
- extraction state
- OCR/native latency
- apply choice + repetition count
- truncation events
- setup/activation/auth/quota/restriction failures
- precondition_rejected/failure/cancelled distinction

## 9) Implementation sequencing after this contract lock

1. Build route-classification + metadata pipeline.
2. Build processing-mode state machine.
3. Integrate OCR adapter behind interface boundary.
4. Integrate native extraction route to same `ExtractionResult`.
5. Wire post-extraction apply modal to canonical apply path.
6. Add smoke tests for state separation and no-silent-fallback guarantees.
