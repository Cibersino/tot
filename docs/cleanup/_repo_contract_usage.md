# Repo Contract Usage Cache (strings; mandatory)

Purpose:
- Centralize repo-wide usage evidence for **contract keys** (strings) captured in per-file **B2 Contract Lock**.
- Avoid repeating the same Ctrl+Shift+F searches in every cleanup note.

Scope:
- Strings only (IPC channel names, webContents.send event names, menu IDs, persistent storage filenames/keys, other contractual string identifiers).
- Do NOT include generic patterns like `ipcMain.handle(` or `webContents.send(` (those stay local in each per-file B2.1 raw map).

## Metadata
- Series baseline commit (short SHA): `bc16c9a`
- Last updated at commit (short SHA): `36fe2e1`
- Date: `2025-12-15`
- Method: VS Code Ctrl+Shift+F (record “N matches in M files” + top files)

## Update rule (mandatory)
Whenever you audit a file and produce/refresh its **B2 Contract Lock**:
1) For every B2 key not present here: add an entry and run Ctrl+Shift+F.
2) For every B2 key present here but with an older “Verified at commit”: refresh Ctrl+Shift+F and update counts/files + Verified at.
3) Update “Last updated at commit”.
Pass condition for the per-file note: all B2 keys are present here with Verified-at = current HEAD.

## Surface-only rule (mandatory)
- The “Repo search (Ctrl+Shift+F)” number recorded here is an official surface-only count: only contract surface statements.
- Exclude any key occurrences found in:
  - comments (//, /* */),
  - logs (console.*),
  - user-facing strings (dialogs/notifications/toasts),
  - non-binding listener management calls such as removeListener( / off( / removeAllListeners(.
- Operational method: use the protocol’s surface-only regex search (preferred). If you run a raw '<key>' / "<key>" search as a quick presence check, it is not the official count unless filtered down to surfaces.

## Entries

### IPC — ipcMain.handle

- Key: `crono-get-state`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit: `bc16c9a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in main; preload calls the same channel.

- Key: `floating-close`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit: `bc16c9a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in main; preload calls the same channel.

- Key: `floating-open`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit: `bc16c9a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in main; preload calls the same channel.

- Key: `get-app-config`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `3` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `electron/manual_preload.js`)
  - Verified at commit: `bc16c9a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in main; called from multiple preloads.  

- Key: `open-editor`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit: `bc16c9a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in main; preload calls the same channel.

- Key: `open-preset-modal`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit: `bc16c9a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in main; preload calls the same channel.

### IPC — ipcMain.on

- Key: `crono-reset`
  - Class: `ipc.on`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit: `bc16c9a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): listener in main; called from preload.

- Key: `crono-set-elapsed`
  - Class: `ipc.on`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit: `bc16c9a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): listener in main; called from preload.

- Key: `crono-toggle`
  - Class: `ipc.on`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit: `bc16c9a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): listener in main; called from preload.

- Key: `flotante-command`
  - Class: `ipc.on`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/flotante_preload.js`)
  - Verified at commit: `bc16c9a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): listener in main; called from flotante preload.

### IPC — ipcMain.once

- Key: `language-selected`
  - Class: `ipc.once`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/language_preload.js`)
  - Verified at commit: `bc16c9a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): once-listener in main; called from language preload.

### Renderer events — webContents.send / equivalents

- Key: `crono-state`
  - Class: `send.event`
  - Repo search (Ctrl+Shift+F): `5` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `electron/flotante_preload.js`)
  - Verified at commit: `bc16c9a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): main sends 3x.

- Key: `flotante-closed`
  - Class: `send.event`
  - Repo search (Ctrl+Shift+F): `3` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `electron/flotante_preload.js`)
  - Verified at commit: `bc16c9a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): main sends 1x.

- Key: `manual-editor-ready`
  - Class: `send.event`
  - Repo search (Ctrl+Shift+F): `3` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit: `bc16c9a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): main sends 2x.

- Key: `manual-init-text`
  - Class: `send.event`
  - Repo search (Ctrl+Shift+F): `3` matches in `2` files (top: `electron/main.js`, `electron/manual_preload.js`)
  - Verified at commit: `bc16c9a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): main sends 2x.

- Key: `preset-init`
  - Class: `send.event`
  - Repo search (Ctrl+Shift+F): `3` matches in `2` files (top: `electron/main.js`, `electron/preset_preload.js`)
  - Verified at commit: `bc16c9a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): main sends 2x.

### Menu action IDs / routing keys
- (populate from per-file B2)

### Persistent storage filenames / keys

- Key: `current_text.json`
  - Class: `storage.filename`
  - Repo search (Ctrl+Shift+F): `1` match in `1` file (top: `electron/main.js`)
  - Verified at commit: `bc16c9a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): main binds CURRENT_TEXT_FILE via path.join.

- Key: `user_settings.json`
  - Class: `storage.filename`
  - Repo search (Ctrl+Shift+F): `1` match in `1` file (top: `electron/main.js`)
  - Verified at commit: `bc16c9a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): main binds SETTINGS_FILE via path.join.

### Other contracts
- (populate from per-file B2)

