# PDF Test Fixtures

These PDFs are synthetic tracked fixtures for automated tests under `test/unit/**`.

They are intentionally:

- non-personal
- purpose-built for contract testing
- independent from `tools_local/smoke/**`

Current fixture roles:

- `selectable_text_fixture_12_pages.pdf`
  - 12-page PDF with normal selectable text content
- `image_only_fixture_12_pages.pdf`
  - 12-page PDF with raster-image-only pages and no selectable text layer
- `encrypted_selectable_text_fixture.pdf`
  - encrypted PDF fixture used for password/encryption failure-path coverage

These files live under `test/**`, which is not included in the current packaged-app build inputs from `package.json`.
