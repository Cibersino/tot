# Repo Contract Usage Cache (strings; mandatory)

Purpose:
- Centralize repo-wide usage evidence for **contract keys** (strings) captured in per-file **B2 Contract Lock**.
- Avoid repeating the same Ctrl+Shift+F searches in every cleanup note.

Scope:
- Strings only (IPC channel names, webContents.send event names, menu IDs, persistent storage filenames/keys, other contractual string identifiers).
- Do NOT include generic patterns like `ipcMain.handle(` or `webContents.send(` (those stay local in each per-file B2.1 raw map).

## Metadata
- Series baseline commit (short SHA): `54e1147`
- Last updated at commit (short SHA): `TBD`
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
- (populate from per-file B2)

### IPC — ipcMain.on
- (populate from per-file B2)

### IPC — ipcMain.once
- (populate from per-file B2)

### Renderer events — webContents.send / equivalents
- (populate from per-file B2)

### Menu action IDs / routing keys
- (populate from per-file B2)

### Persistent storage filenames / keys
- (populate from per-file B2)

### Other contracts
- (populate from per-file B2)

