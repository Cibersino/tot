# Repo Contract Usage Cache (strings; mandatory)

Purpose:
- Centralize repo-wide usage evidence for **contract keys** (strings) captured in per-file **B2 Contract Lock**.
- Avoid repeating the same Ctrl+Shift+F searches in every cleanup note.

Scope:
- Strings only (IPC channel names, webContents.send event names, menu IDs, persistent storage filenames/keys, other contractual string identifiers).
- Do NOT include generic patterns like `ipcMain.handle(` or `webContents.send(` (those stay local in each per-file B2.1 raw map).

## Metadata
- Series baseline commit (short SHA): `bc16c9a`
- Date: `2025-12-15`
- Last updated at commit (short SHA): `682c26a`
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

### Template:

- Key: `<KEY>`
  - Class: `<CLASS>`
  - Repo search (Ctrl+Shift+F): `<N>` matches in `<N>` files (top: `<FILES>`)
  - Verified at commit: `<SHA>`
  - Bump rationale: no code changes in `electron/**,public/**` since `<SHA>` (git diff empty for those paths); counts unchanged.
  - Notes (optional): `<notes>`

## Entries

### IPC — ipcMain.handle

- Key: `check-for-updates`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/updater.js`, `electron/preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in updater; preload calls the same channel.

- Key: `crono-get-state`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in main; preload calls the same channel.

- Key: `floating-close`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in main; preload calls the same channel.

- Key: `floating-open`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in main; preload calls the same channel.

- Key: `force-clear-editor`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/text_state.js`, `electron/preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in text_state; preload calls the same channel.  

- Key: `get-app-config`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `3` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `electron/manual_preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in main; called from multiple preloads.  

- Key: `get-current-text`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `3` matches in `3` files (top: `electron/text_state.js`, `electron/preload.js`, `electron/manual_preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in text_state; preload and manual_preload call the same channel.

- Key: `get-default-presets`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in presets_main; preload calls the same channel.   

- Key: `get-settings`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `5` matches in `5` files (top: `electron/settings.js`, `electron/preload.js`, `electron/manual_preload.js`, `electron/preset_preload.js`, `electron/flotante_preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in text_state; preloads call the same channel.
  
- Key: `notify-no-selection-edit`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in presets_main; preload calls the same channel.   

- Key: `open-default-presets-folder`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in presets_main; preload calls the same channel.

- Key: `open-editor`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in main; preload calls the same channel.

- Key: `open-preset-modal`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in main; preload calls the same channel.

- Key: `request-delete-preset`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in presets_main; preload calls the same channel.

- Key: `request-restore-defaults`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in presets_main; preload calls the same channel.

- Key: `set-current-text`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `3` matches in `3` files (top: `electron/text_state.js`, `electron/preload.js`, `electron/manual_preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in text_state; preload and manual_preload call the same channel.

- Key: `set-mode-conteo`
  - Class: `ipc.handle`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/settings.js`, `electron/preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): handler in settings; preload calls the same channel.

### IPC — ipcMain.on

- Key: `crono-reset`
  - Class: `ipc.on`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): listener in main; called from preload.

- Key: `crono-set-elapsed`
  - Class: `ipc.on`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): listener in main; called from preload.

- Key: `crono-toggle`
  - Class: `ipc.on`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): listener in main; called from preload.

- Key: `flotante-command`
  - Class: `ipc.on`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/flotante_preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): listener in main; called from flotante preload.

### IPC — ipcMain.once

- Key: `language-selected`
  - Class: `ipc.once`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/language_preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): once-listener in main; called from language preload.

### Renderer events — webContents.send / equivalents

- Key: `crono-state`
  - Class: `send.event`
  - Repo search (Ctrl+Shift+F): `5` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `electron/flotante_preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): main sends 3x.

- Key: `current-text-updated`
  - Class: `send.event`
  - Repo search (Ctrl+Shift+F): `3` matches in `2` files (top: `electron/text_state.js`, `electron/preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): text_state sends 2x. 

- Key: `flotante-closed`
  - Class: `send.event`
  - Repo search (Ctrl+Shift+F): `3` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `electron/flotante_preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): main sends 1x.

- Key: `manual-editor-ready`
  - Class: `send.event`
  - Repo search (Ctrl+Shift+F): `3` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): main sends 2x.

- Key: `manual-init-text`
  - Class: `send.event`
  - Repo search (Ctrl+Shift+F): `3` matches in `2` files (top: `electron/main.js`, `electron/manual_preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): main sends 2x.

- Key: `menu-click`
  - Class: `send.event`
  - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/menu_builder.js`, `electron/preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): menu_builder sends 1x. 

- Key: `preset-init`
  - Class: `send.event`
  - Repo search (Ctrl+Shift+F): `3` matches in `2` files (top: `electron/main.js`, `electron/preset_preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): main sends 2x.

- Key: `preset-created`
  - Class: `send.event`
  - Repo search (Ctrl+Shift+F): `3` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): presets_main sends 2x. 

- Key: `settings-updated`
  - Class: `send.event`
  - Repo search (Ctrl+Shift+F): `9` matches in `3` files (top: `electron/presets_main.js`, `electron/settings.js`, `electron/preload.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): presets_main sends 4x; settings sends 4x. 

### Menu action IDs / routing keys

- Key: `acerca_de`
  - Class: `menu.id`
  - Repo search definition (Ctrl+Shift+F): 
    - definition [regex `\bsendMenuClick\(\s*['"]acerca_de['"]`]: `1` match in `1` file (top: `electron/menu_builder.js`)
    - usage (Ctrl+Shift+F): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]acerca_de['"]`]: `1` match in `1` file (top: `public/renderer.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): 

- Key: `actualizar_version`
  - Class: `menu.id`
  - Repo search definition (Ctrl+Shift+F): 
    - definition [regex `\bsendMenuClick\(\s*['"]actualizar_version['"]`]: `1` match in `1` file (top: `electron/menu_builder.js`)
    - usage (Ctrl+Shift+F): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]actualizar_version['"]`]: `1` match in `1` file (top: `public/renderer.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional):   

- Key: `avisos`
  - Class: `menu.id`
  - Repo search definition (Ctrl+Shift+F): 
    - definition [regex `\bsendMenuClick\(\s*['"]avisos['"]`]: `1` match in `1` file (top: `electron/menu_builder.js`)
    - usage (Ctrl+Shift+F): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]avisos['"]`]: `1` match in `1` file (top: `public/renderer.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional):   

- Key: `cargador_texto`
  - Class: `menu.id`
  - Repo search definition (Ctrl+Shift+F): 
    - definition [regex `\bsendMenuClick\(\s*['"]cargador_texto['"]`]: `1` match in `1` file (top: `electron/menu_builder.js`)
    - usage (Ctrl+Shift+F): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]cargador_texto['"]`]: `1` match in `1` file (top: `public/renderer.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional):  

- Key: `colabora`
  - Class: `menu.id`
  - Repo search definition (Ctrl+Shift+F): 
    - definition [regex `\bsendMenuClick\(\s*['"]colabora['"]`]: `1` match in `1` file (top: `electron/menu_builder.js`)
    - usage (Ctrl+Shift+F): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]colabora['"]`]: `1` match in `1` file (top: `public/renderer.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional):  

- Key: `contador_imagen`
  - Class: `menu.id`
  - Repo search definition (Ctrl+Shift+F): 
    - definition [regex `\bsendMenuClick\(\s*['"]contador_imagen['"]`]: `1` match in `1` file (top: `electron/menu_builder.js`)
    - usage (Ctrl+Shift+F): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]contador_imagen['"]`]: `1` match in `1` file (top: `public/renderer.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional):  

- Key: `discord`
  - Class: `menu.id`
  - Repo search definition (Ctrl+Shift+F): 
    - definition [regex `\bsendMenuClick\(\s*['"]discord['"]`]: `1` match in `1` file (top: `electron/menu_builder.js`)
    - usage (Ctrl+Shift+F): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]discord['"]`]: `1` match in `1` file (top: `public/renderer.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional):  

- Key: `diseno_colores`
  - Class: `menu.id`
  - Repo search definition (Ctrl+Shift+F): 
    - definition [regex `\bsendMenuClick\(\s*['"]diseno_colores['"]`]: `1` match in `1` file (top: `electron/menu_builder.js`)
    - usage (Ctrl+Shift+F): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]diseno_colores['"]`]: `1` match in `1` file (top: `public/renderer.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional):  

- Key: `diseno_crono_flotante`
  - Class: `menu.id`
  - Repo search definition (Ctrl+Shift+F): 
    - definition [regex `\bsendMenuClick\(\s*['"]diseno_crono_flotante['"]`]: `1` match in `1` file (top: `electron/menu_builder.js`)
    - usage (Ctrl+Shift+F): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]diseno_crono_flotante['"]`]: `1` match in `1` file (top: `public/renderer.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional):  

- Key: `diseno_fuentes`
  - Class: `menu.id`
  - Repo search definition (Ctrl+Shift+F): 
    - definition [regex `\bsendMenuClick\(\s*['"]diseno_fuentes['"]`]: `1` match in `1` file (top: `electron/menu_builder.js`)
    - usage (Ctrl+Shift+F): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]diseno_fuentes['"]`]: `1` match in `1` file (top: `public/renderer.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional):  

- Key: `diseno_skins`
  - Class: `menu.id`
  - Repo search definition (Ctrl+Shift+F): 
    - definition [regex `\bsendMenuClick\(\s*['"]diseno_skins['"]`]: `1` match in `1` file (top: `electron/menu_builder.js`)
    - usage (Ctrl+Shift+F): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]diseno_skins['"]`]: `1` match in `1` file (top: `public/renderer.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional):  

- Key: `faq`
  - Class: `menu.id`
  - Repo search definition (Ctrl+Shift+F): 
    - definition [regex `\bsendMenuClick\(\s*['"]faq['"]`]: `1` match in `1` file (top: `electron/menu_builder.js`)
    - usage (Ctrl+Shift+F): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]faq['"]`]: `1` match in `1` file (top: `public/renderer.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional):  

- Key: `guia_basica`
  - Class: `menu.id`
  - Repo search definition (Ctrl+Shift+F): 
    - definition [regex `\bsendMenuClick\(\s*['"]guia_basica['"]`]: `1` match in `1` file (top: `electron/menu_builder.js`)
    - usage (Ctrl+Shift+F): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]guia_basica['"]`]: `1` match in `1` file (top: `public/renderer.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional):  

- Key: `instrucciones_completas`
  - Class: `menu.id`
  - Repo search definition (Ctrl+Shift+F): 
    - definition [regex `\bsendMenuClick\(\s*['"]instrucciones_completas['"]`]: `1` match in `1` file (top: `electron/menu_builder.js`)
    - usage (Ctrl+Shift+F): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]instrucciones_completas['"]`]: `1` match in `1` file (top: `public/renderer.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional):  

- Key: `links_interes`
  - Class: `menu.id`
  - Repo search definition (Ctrl+Shift+F): 
    - definition [regex `\bsendMenuClick\(\s*['"]links_interes['"]`]: `1` match in `1` file (top: `electron/menu_builder.js`)
    - usage (Ctrl+Shift+F): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]links_interes['"]`]: `1` match in `1` file (top: `public/renderer.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional):  

- Key: `presets_por_defecto`
  - Class: `menu.id`
  - Repo search definition (Ctrl+Shift+F): 
    - definition [regex `\bsendMenuClick\(\s*['"]presets_por_defecto['"]`]: `1` match in `1` file (top: `electron/menu_builder.js`)
    - usage (Ctrl+Shift+F): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]presets_por_defecto['"]`]: `1` match in `1` file (top: `public/renderer.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional):  

- Key: `readme`
  - Class: `menu.id`
  - Repo search definition (Ctrl+Shift+F): 
    - definition [regex `\bsendMenuClick\(\s*['"]readme['"]`]: `1` match in `1` file (top: `electron/menu_builder.js`)
    - usage (Ctrl+Shift+F): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]readme['"]`]: `1` match in `1` file (top: `public/renderer.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional):  

- Key: `shortcuts`
  - Class: `menu.id`
  - Repo search definition (Ctrl+Shift+F): 
    - definition [regex `\bsendMenuClick\(\s*['"]shortcuts['"]`]: `1` match in `1` file (top: `electron/menu_builder.js`)
    - usage (Ctrl+Shift+F): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]shortcuts['"]`]: `0` matches in `0` files (top: `public/renderer.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): No consume matches.

- Key: `test_velocidad`
  - Class: `menu.id`
  - Repo search definition (Ctrl+Shift+F): 
    - definition [regex `\bsendMenuClick\(\s*['"]test_velocidad['"]`]: `1` match in `1` file (top: `electron/menu_builder.js`)
    - usage (Ctrl+Shift+F): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]test_velocidad['"]`]: `1` match in `1` file (top: `public/renderer.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional):  

### Persistent storage filenames / keys

- Key: `current_text.json`
  - Class: `storage.filename`
  - Repo search (Ctrl+Shift+F): `1` match in `1` file (top: `electron/main.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): main binds CURRENT_TEXT_FILE via path.join.

- Key: `user_settings.json`
  - Class: `storage.filename`
  - Repo search (Ctrl+Shift+F): `1` match in `1` file (top: `electron/main.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): main binds SETTINGS_FILE via path.join.

### Other contracts

#### Preload boundary — contextBridge.exposeInMainWorld

- Key: `electronAPI`
  - Class: `preload.expose.key`
  - Repo search definition (Ctrl+Shift+F):
    - definition [regex `contextBridge\.exposeInMainWorld\(\s*['"]electronAPI['"]`]: `1` match in `1` file (top: `electron/preload.js`)
    - usage [regex `\b(?:window|globalThis)\.electronAPI\b`]: `69` matches in `2` files (top: `public/renderer.js`, `public/js/menu.js`)
  - Verified at commit: `682c26a`
  - Bump rationale: no code changes in `electron/**,public/**` since `bc16c9a` (git diff empty for those paths); counts unchanged.
  - Notes (optional): exposed from `electron/preload.js` as `api`.
