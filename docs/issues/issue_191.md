# OCR image extraction can prepend a separator-only first line

## Summary

Certain OCR text extractions from page photos can prepend an extra first line made only of separator characters, for example:

```text
________________
```

This appears before the real extracted text.

## What I observed

When running the current Google OCR route on page-photo style images, the extracted text can start with a separator-only line even when the source image does not visibly contain such a line.

Example shape of result:

```text
________________

Cuando abrio el libro, encontro una nota doblada entre las paginas.
...
```

## Investigation

The app does not appear to generate this line locally during import/extract post-processing.

The OCR route in `electron/import_extract_platform/ocr_google_drive_route.js`:

- uploads/converts the image through Google Drive/Docs
- exports the converted document as `text/plain`
- returns `extractedText` directly as the route result

Relevant points in code:
- export: `drive.files.export(...)`
- decode: `const extractedText = Buffer.from(exportResponse.data || '').toString('utf8')`
- return: `text: extractedText`

So the extra separator line seems to come from the provider OCR/export output and is currently surfaced verbatim by the app.

## Reproducibility

Reproduced on April 2, 2026 with the real OCR runtime on this machine.

I tested controlled synthetic images and got the same leading separator-only line in all of these cases:

1. A clean synthetic page image with no separator drawn.
2. The same page with a top horizontal rule.
3. A smaller control image with text beginning near the top.

In the repro outputs, the first extracted line was:

```text
________________
```

in every case.

## Expected behavior

OCR output should begin with actual extracted text, not with a separator-only artifact.

## Actual behavior

OCR output can begin with a separator-only line such as:

```text
________________
```

followed by a blank line and then the actual text.

## Possible fix

Add a narrow post-processing guard for OCR results only, removing a leading line if it matches a strict separator-only pattern, for example:

- only first line
- only OCR route
- only if it matches something like `^[ _-]{6,}$`

That would avoid masking normal text while removing this common artifact.

## Notes

This issue is best framed as either:
- a bug in current OCR user-visible behavior, or
- an improvement request to sanitize provider OCR artifacts before applying extracted text.
