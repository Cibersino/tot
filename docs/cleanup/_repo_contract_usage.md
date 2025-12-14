# Repo Contract Usage Cache (strings; mandatory)

Purpose:
- Centralize repo-wide usage evidence for **contract keys** (strings) captured in per-file **B2 Contract Lock**.
- Avoid repeating the same Ctrl+Shift+F searches in every cleanup note.

Scope:
- Strings only (IPC channel names, webContents.send event names, menu IDs, persistent storage filenames/keys, other contractual string identifiers).
- Do NOT include generic patterns like `ipcMain.handle(` or `webContents.send(` (those stay local in each per-file B2.1 raw map).

## Metadata
- Series baseline commit (short SHA): `54e1147`
- Last updated at commit (short SHA): `7297035`
- Date: `2025-12-13`
- Method: VS Code Ctrl+Shift+F (record “N matches in M files” + top files)

## Update rule (mandatory)
Whenever you audit a file and produce/refresh its **B2 Contract Lock**:
1) For every B2 key not present here: add an entry and run Ctrl+Shift+F.
2) For every B2 key present here but with an older “Verified at commit”: refresh Ctrl+Shift+F and update counts/files + Verified at.
3) Update “Last updated at commit”.
Pass condition for the per-file note: all B2 keys are present here with Verified-at = current HEAD.

## Entries

Format:
- Key: `<contract-string>`
  - Class: `<ipc.handle | ipc.on | ipc.once | send.event | menu.id | storage.filename | other>`
  - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<f1>`, `<f2>`, `<f3>`)
  - Verified at commit (short SHA): `<sha>`
  - Notes (optional): variants searched (`'key'`, `"key"`, bare), ambiguities.

### IPC — ipcMain.handle

- Key: `crono-get-state`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit (short SHA): `7297035`
  - Notes (optional): handler in main; invoke in preload.

- Key: `floating-open`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `3` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit (short SHA): `7297035`
  - Notes (optional): includes one non-contract match in error log string (main.js); preload invokes the same channel.

- Key: `floating-close`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `3` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit (short SHA): `7297035`
  - Notes (optional): includes one non-contract match in error log string (main.js); preload calls the same channel.

- Key: `open-editor`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `3` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit (short SHA): `7297035`
  - Notes (optional): includes one non-contract match in error log string (main.js); preload calls the same channel.

- Key: `open-preset-modal`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit (short SHA): `7297035`
  - Notes (optional): handler in main; preload calls the same channel.

- Key: `get-app-config`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `4` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `electron/manual_preload.js`)
  - Verified at commit (short SHA): `7297035`
  - Notes (optional): includes one non-contract match in error log string (main.js); called from multiple preloads.

### IPC — ipcMain.on

- Key: `crono-toggle`
  - Class: `ipc.on`
  - Repo search (Ctrl+Shift+F): `3` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit (short SHA): `7297035`
  - Notes (optional): includes one non-contract match in error log string (main.js); called from preload.

- Key: `crono-reset`
  - Class: `ipc.on`
  - Repo search (Ctrl+Shift+F): `3` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit (short SHA): `7297035`
  - Notes (optional): includes one non-contract match in error log string (main.js); called from preload.

- Key: `crono-set-elapsed`
  - Class: `ipc.on`
  - Repo search (Ctrl+Shift+F): `3` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit (short SHA): `7297035`
  - Notes (optional): includes one non-contract match in error log string (main.js); called from preload.

- Key: `flotante-command`
  - Class: `ipc.on`
  - Repo search (Ctrl+Shift+F): `3` matches in `2` files (top: `electron/main.js`, `electron/flotante_preload.js`)
  - Verified at commit (short SHA): `7297035`
  - Notes (optional): includes one non-contract match in error log string (main.js); called from flotante preload.

### IPC — ipcMain.once

- Key: `language-selected`
  - Class: `ipc.once`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/language_preload.js`)
  - Verified at commit (short SHA): `7297035`
  - Notes (optional): once-listener in main; called from language preload.

### Renderer events — webContents.send / equivalents

- Key: `crono-state`
  - Class: `send.event`
  - Repo search (Ctrl+Shift+F): `12` matches in `5` files (top: `electron/main.js`, `electron/preload.js`, `electron/flotante_preload.js`, `public/renderer.js`, `public/flotante.js`)
  - Verified at commit (short SHA): `7297035`
  - Notes (optional): includes multiple non-contract matches in logs/comments (preload removeListener error logs; renderer error log; flotante comment). Main sends 3x via webContents.send.

- Key: `flotante-closed`
  - Class: `send.event`
  - Repo search (Ctrl+Shift+F): `8` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `electron/flotante_preload.js`)
  - Verified at commit (short SHA): `7297035`
  - Notes (optional): includes non-contract matches in comments/logs (preloads). Main sends 1x on floatingWin closed.

- Key: `manual-editor-ready`
  - Class: `send.event`
  - Repo search (Ctrl+Shift+F): `7` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit (short SHA): `7297035`
  - Notes (optional): includes non-contract matches in error/warn logs (main/preload). Main sends 2x.

- Key: `manual-init-text`
  - Class: `send.event`
  - Repo search (Ctrl+Shift+F): `5` matches in `2` files (top: `electron/main.js`, `electron/manual_preload.js`)
  - Verified at commit (short SHA): `7297035`
  - Notes (optional): includes non-contract matches in error logs (main). Main sends 2x.

- Key: `preset-init`
  - Class: `send.event`
  - Repo search (Ctrl+Shift+F): `7` matches in `3` files (top: `electron/main.js`, `electron/preset_preload.js`, `public/preset_modal.js`)
  - Verified at commit (short SHA): `7297035`
  - Notes (optional): includes non-contract matches in logs/comments (preset preload + preset modal). Main sends 2x.

### Menu action IDs / routing keys
- (populate from per-file B2)

### Persistent storage filenames / keys

- Key: `current_text.json`
  - Class: `storage.filename`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/text_state.js`)
  - Verified at commit (short SHA): `7297035`
  - Notes (optional): main binds CURRENT_TEXT_FILE via path.join; text_state contains a non-contract match in an error log.

- Key: `user_settings.json`
  - Class: `storage.filename`
  - Repo search (Ctrl+Shift+F): `3` matches in `2` files (top: `electron/main.js`, `electron/settings.js`)
  - Verified at commit (short SHA): `7297035`
  - Notes (optional): main binds SETTINGS_FILE via path.join; settings.js contains non-contract matches in comments.

### Other contracts
- (populate from per-file B2)

