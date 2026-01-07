# Mapa AS-IS consolidado (lo que HAY HOY)

Convención:
**N) [Actor] VALOR: ORIGEN → OPERACIÓN → DESTINO**
Cada arista incluye su **localizador** (archivo + rango de líneas).

---

## SECTION 1 — Startup flow (AS-IS)

1. **[main] `settingsState.init`**: `user_settings.json` (disco) → **read** → `raw`  
   Localizador: `electron/settings.js:L260-L306`.

2. **[main] `normalizeSettings`**: `raw.language` → **normalize** → `settings.language` (normalizado a minúsculas; puede caer a `'es'`)  
   Localizador: `electron/settings.js:L173-L231`.

3. **[main] `langBase`**: `settings.language` → **derive** → `langBase`  
   Localizador: `electron/settings.js:L201-L229`.

4. **[main] `numberFormat.json`**: `i18n/<langBase>/numberFormat.json` → **loadResource** → `nf` (o null si falla)  
   Localizador: `electron/settings.js:L40-L93`.

5. **[main] `settings.numberFormatting[langBase]`**: `nf` → **assign** → `settings.numberFormatting[langBase]` (o fallback hardcoded `.`/`,` si falla)  
   Localizador: `electron/settings.js:L107-L152`.

6. **[main] `settings.presets_by_language[langBase]`**: `settings.presets_by_language` → **assign** → `settings.presets_by_language[langBase]` (asegura estructura)  
   Localizador: `electron/settings.js:L232-L255`.

7. **[main] `_currentSettings`**: `normalized` → **assign** → `_currentSettings`  
   Localizador: `electron/settings.js:L308-L312`.

8. **[main] `_currentSettings`**: `_currentSettings` → **persist** → `user_settings.json` (best-effort)  
   Localizador: `electron/settings.js:L313-L336`.

9. **[main] `currentLanguage` (variable de main)**: literal `'es'` → **assign** → `currentLanguage` (bootstrap)  
   Localizador: `electron/main.js:L97-L99`.

10. **[main] `settings.language`**: `_currentSettings.language || 'es'` → **assign** → `currentLanguage`  
    Localizador: `electron/main.js:L1119-L1121`.

11. **[main] rama primer arranque**: `!settings.language || settings.language===''` → **apply** → `createLanguageWindow()`  
    Localizador: `electron/main.js:L1122-L1125`.

12. **[main] language window**: `LANGUAGE_WINDOW_HTML` → **loadResource** → `langWin.loadFile(...)`  
    Localizador: `electron/main.js:L365-L386`.

13. **[langWin preload] IPC**: `ipcRenderer.invoke('get-available-languages')` → **send** → `ipcMain.handle('get-available-languages')`  
    Localizador: `electron/language_preload.js:L6-L16`.

14. **[main] manifest idiomas**: `i18n/languages.json` → **loadResource** → `availableLanguages` (respuesta IPC)  
    Localizador: `electron/main.js:L879-L936`.

15. **[langWin renderer] estado UI**: `availableLanguages` → **assign** → `languages` / `filteredLanguages`  
    Localizador: `public/language_window.html:L296-L360`.

16. **[langWin renderer] selección**: `tag` (dataset del botón) → **apply** → `window.languageAPI.setLanguage(tag)`  
    Localizador: `public/language_window.html:L239-L288`.

17. **[langWin preload] IPC**: `ipcRenderer.invoke('set-language', tag)` → **send** → `ipcMain.handle('set-language')`  
    Localizador: `electron/language_preload.js:L7-L12` + `electron/settings.js:L429-L480`.

18. **[main/settings] `set-language`**: `tag` → **normalize** → `chosen` (normaliza tag; deriva `menuLang`)  
    Localizador: `electron/settings.js:L435-L455`.

19. **[main/settings] `settings.language`**: `chosen` → **assign** → `settings.language`  
    Localizador: `electron/settings.js:L457-L463`.

20. **[main/settings] persist**: `settings` → **persist** → `user_settings.json`  
    Localizador: `electron/settings.js:L464-L466` + `electron/settings.js:L317-L326`.

21. **[main/settings] `setCurrentLanguage`**: `menuLang` → **apply** → `setCurrentLanguage(menuLang)` (main.js valida/normaliza y muta `currentLanguage`)  
    Localizador: `electron/settings.js:L467-L470` + `electron/main.js:L430-L453`.

22. **[main/settings] rebuild menú**: `menuLang` → **apply** → `buildAppMenu(menuLang)`  
    Localizador: `electron/settings.js:L476-L484` + `electron/main.js:L172-L173`.

23. **[main/menu] traducciones menú**: `menuLang` → **loadResource** → `i18n/.../main.json` (cadena de candidatos)  
    Localizador: `electron/menu_builder.js:L62-L132`.

24. **[main/settings] push a mainWin**: `settings` → **send** → `mainWin.webContents.send('settings-updated', settings)`  
    Localizador: `electron/settings.js:L346-L360`.

25. **[langWin preload] señal adicional**: `ipcRenderer.send('language-selected', tag)` → **send** → `ipcMain.once('language-selected', ...)` (solo en rama primer arranque)  
    Localizador: `electron/language_preload.js:L11-L12` + `electron/main.js:L1126-L1136`.

26. **[main] `language-selected`**: evento → **receive** → `createMainWindow(); close langWin`  
    Localizador: `electron/main.js:L1126-L1136`.

27. **[main] main window**: `index.html` → **loadResource** → `mainWin.loadFile(...)`  
    Localizador: `electron/main.js:L153-L170`.

28. **[mainWin preload] IPC settings**: `ipcRenderer.invoke('get-settings')` → **send** → `ipcMain.handle('get-settings')`  
    Localizador: `electron/preload.js:L20-L29` + `electron/settings.js:L407-L415`.

29. **[mainWin renderer] cache settings**: `get-settings` payload → **assign** → `settingsCache`  
    Localizador: `public/renderer.js:L156-L171`.

30. **[mainWin renderer] idioma**: `settingsCache.language || 'es'` → **assign** → `idiomaActual`  
    Localizador: `public/renderer.js:L166-L170`.

31. **[mainWin renderer] modo conteo**: `settingsCache.modeConteo || 'preciso'` → **assign** → `modoConteo`  
    Localizador: `public/renderer.js:L169-L170`.

32. **[mainWin renderer] bundle UI**: `idiomaActual` → **loadResource** → `public/i18n/<...>/renderer.json` (cadena de candidatos)  
    Localizador: `public/js/i18n.js:L16-L84`.

33. **[mainWin renderer] aplicar strings**: `rendererTranslations` → **apply** → `applyTranslations()`  
    Localizador: `public/renderer.js:L174-L175` + `public/renderer.js:L81-L118`.

34. **[mainWin renderer] carga texto actual**: `electronAPI.getCurrentText()` → **send** → (IPC main) → **receive** → `currentText`  
    Localizador: `public/renderer.js:L177-L188`.

35. **[mainWin renderer] formato numérico**: (`idiomaActual`, `settingsCache`) → **apply** → `obtenerSeparadoresDeNumeros(idiomaActual, settingsCache)`  
    Localizador: `public/renderer.js:L242-L246` + `public/js/format.js:L25-L56`.

36. **[mainWin renderer] presets**: `idiomaActual` → **apply** → `loadPresetsIntoDom({ language: idiomaActual })`  
    Localizador: `public/renderer.js:L311-L316` + `public/renderer.js:L309-L346`.

37. **[renderer→main] defaults presets**: `electronAPI.getDefaultPresets()` → **send** → `ipcMain.handle('get-default-presets')`  
    Localizador: `electron/preload.js:L31-L33` + `electron/presets_main.js:L187-L260`.

38. **[renderer] presets finalList**: (`defaults`, `settingsCache.presets_by_language`, `settingsCache.disabled_default_presets`, `langBase`) → **derive/assign** → `finalList`  
    Localizador: `public/js/presets.js:L4-L142`.

39. **[main] cierre langWin sin elegir**: `langWin.on('closed')` → **apply** → `applyFallbackLanguageIfUnset(DEFAULT='es')`  
    Localizador: `electron/main.js:L392-L405` + `electron/settings.js:L373-L392`.

---

## SECTION 2 — Runtime change: user changes language (AS-IS)

40. **[menu click] abrir selector**: `menu item (Language)` → **apply** → `onOpenLanguage()` → `createLanguageWindow()`  
    Localizador: `electron/menu_builder.js:L244-L250` + `electron/main.js:L101-L104`.

41. **[langWin renderer] selección**: `tag` → **apply** → `window.languageAPI.setLanguage(tag)`  
    Localizador: `public/language_window.html:L239-L288`.

42. **[langWin→main] persist idioma**: `ipcRenderer.invoke('set-language', tag)` → **send/receive** → handler `set-language` → `settings.language` actualizado + persistido  
    Localizador: `electron/language_preload.js:L7-L10` + `electron/settings.js:L429-L466`.

43. **[main/settings] push mainWin**: `settings` → **send** → `mainWin.webContents.send('settings-updated', settings)`  
    Localizador: `electron/settings.js:L346-L352`.

44. **[mainWin preload] evento**: `'settings-updated'` → **receive** → callback registrada por `electronAPI.onSettingsChanged`  
    Localizador: `electron/preload.js:L65-L70`.

45. **[mainWin renderer] actualizar caches**: `newSettings` → **assign** → `settingsCache`, `idiomaActual`, `modoConteo`  
    Localizador: `public/renderer.js:L388-L397`.

46. **[mainWin renderer] recargar bundle UI**: `idiomaActual` → **apply** → `loadRendererTranslations(idiomaActual)`  
    Localizador: `public/renderer.js:L398-L400` + `public/js/i18n.js:L16-L84`.

47. **[mainWin renderer] reaplicar UI**: `rendererTranslations` → **apply** → `applyTranslations()`  
    Localizador: `public/renderer.js:L407`.

48. **[mainWin renderer] recargar presets**: `idiomaActual` → **apply** → `loadPresetsIntoDom({ language: idiomaActual })`  
    Localizador: `public/renderer.js:L408-L417` + `public/renderer.js:L311-L316`.

49. **[mainWin renderer] refrescar outputs**: `currentText` → **apply** → `updatePreviewAndResults(currentText)`  
    Localizador: `public/renderer.js:L423-L429`.

50. **[main] evento `language-selected` en runtime**: `ipcRenderer.send('language-selected')` → **send** → listener fuera del “primer arranque”  
    Localizador: `electron/main.js:L1122-L1136`.

---

## SECTION 3 — Runtime change: OTHER settings (AS-IS) que afectan comportamiento dependiente de idioma

### 3.1 modeConteo (end-to-end)

51. **[mainWin renderer] UI toggle**: `toggleModoPreciso.checked` → **derive** → `nuevoModo`  
    Localizador: `public/renderer.js:L458-L474`.

52. **[mainWin renderer] estado local**: `nuevoModo` → **assign** → `modoConteo`  
    Localizador: `public/renderer.js:L472-L474`.

53. **[renderer→main] persist mode**: `electronAPI.setModeConteo(nuevoModo)` → **send** → `ipcMain.handle('set-mode-conteo')`  
    Localizador: `electron/preload.js:L63-L64` + `electron/settings.js:L487-L507`.

54. **[main/settings] `settings.modeConteo`**: `mode` → **assign** → `settings.modeConteo` + **persist**  
    Localizador: `electron/settings.js:L492-L503` + `electron/settings.js:L317-L326`.

55. **[main/settings] push mainWin**: `settings` → **send** → `'settings-updated'`  
    Localizador: `electron/settings.js:L346-L352`.

56. **[mainWin renderer] aplicar**: `settingsCache.modeConteo` → **assign** → `modoConteo` → **apply** → `updatePreviewAndResults(currentText)`  
    Localizador: `public/renderer.js:L425-L429`.

---

### 3.2 presets (AS-IS) — cadenas end-to-end que sí se pueden cerrar

#### 3.2.1 Delete preset (main window)

57. **[mainWin renderer] UI delete**: click → **apply** → `window.electronAPI.requestDeletePreset(name)`  
    Localizador: `public/renderer.js:L962-L975`.

58. **[mainWin preload] IPC delete**: `ipcRenderer.invoke('request-delete-preset', name)` → **send** → `ipcMain.handle('request-delete-preset')`  
    Localizador: `electron/preload.js:L37` + `electron/presets_main.js:L327`.

59. **[main/presets] handler delete**: `name` → **assign/persist/apply** → muta `settings.presets_by_language[lang]` y `settings.disabled_default_presets[lang]` + `saveSettings` + `broadcast(settings)`  
    Localizador: `electron/presets_main.js:L327-L429`.

60. **[mainWin renderer] post-delete refresh**: `res.ok` → **apply** → `loadPresetsIntoDom({ language: idiomaActual })`  
    Localizador: `public/renderer.js:L968-L970`.

#### 3.2.2 Restore defaults (main window)

61. **[mainWin renderer] UI restore**: click → **apply** → `window.electronAPI.requestRestoreDefaults()`  
    Localizador: `public/renderer.js:L997-L1005`.

62. **[mainWin preload] IPC restore**: `ipcRenderer.invoke('request-restore-defaults')` → **send** → `ipcMain.handle('request-restore-defaults')`  
    Localizador: `electron/preload.js:L40` + `electron/presets_main.js:L431`.

63. **[main/presets] handler restore**: → **assign/persist/apply** → muta `settings.presets_by_language[lang]` + `settings.disabled_default_presets[lang]` + `saveSettings` + `broadcast(settings)`  
    Localizador: `electron/presets_main.js:L431-L519`.

64. **[mainWin renderer] post-restore refresh**: `res.ok` → **apply** → `loadPresetsIntoDom({ language: idiomaActual })`  
    Localizador: `public/renderer.js:L1002-L1004`.

#### 3.2.3 Create/Edit preset (preset modal → main → mainWin)

65. **[preset modal renderer] UI save (create/edit)**: click → **apply** → `presetAPI.createPreset(...)` / `presetAPI.editPreset(...)`  
    Localizador: `public/preset_modal.js` (acción UI).

66. **[preset modal preload] IPC create/edit**: `ipcRenderer.invoke('create-preset' ...)` / `ipcRenderer.invoke('edit-preset' ...)`  
    Localizador: `electron/preset_preload.js` (archivo no incluido en este mapa; rangos no disponibles aquí).

67. **[main/presets] handler create/edit + evento a mainWin**: create/edit → **persist** + **send** `preset-created` a `mainWin.webContents`  
    Localizador: create `electron/presets_main.js:L292-L313`; edit `electron/presets_main.js:L543-L624`.

68. **[mainWin] RECEIVE+apply preset-created**: `ipcRenderer.on('preset-created')` → **receive** → renderer handler → **apply** `loadPresetsIntoDom(...)`  
    Localizador: `electron/preload.js:L27-L30` + `public/renderer.js:L353-L359`.

---

## SECTION 4 — Translation resolution (AS-IS)

### 4.1 Menú (electron/menu_builder.js)

69. **[menu_builder] `requested`**: input `lang` → **normalize** → `requested` (fallback `'es'`)  
    Localizador: `electron/menu_builder.js:L70-L72`.

70. **[menu_builder] `base`**: `requested` → **derive** → `base`  
    Localizador: `electron/menu_builder.js:L71-L72`.

71. **[menu_builder] candidates**: `[requested] (+ base si distinto) (+ 'es' si no está)` → **assign** → `candidates[]`  
    Localizador: `electron/menu_builder.js:L74-L78`.

72. **[menu_builder] paths por candidato**: `candidate` → **derive** → `files[]` (orden)  
    Localizador: `electron/menu_builder.js:L82-L86`.

73. **[menu_builder] carga**: `files[]` → **loadResource** → `translations` (primer JSON válido gana)  
    Localizador: `electron/menu_builder.js:L88-L121`.

### 4.2 Renderer UI strings (public/js/i18n.js)

74. **[renderer i18n] `requested`**: `langTag` → **normalize** → `requested`  
    Localizador: `public/js/i18n.js:L18-L20`.

75. **[renderer i18n] `base`**: `requested` → **derive** → `base`  
    Localizador: `public/js/i18n.js:L21`.

76. **[renderer i18n] candidates**: `[requested] (+ base si distinto) (+ 'es' si no está)` → **assign** → `candidates[]`  
    Localizador: `public/js/i18n.js:L22-L25`.

77. **[renderer i18n] paths por candidato**: `candidate` → **derive** → `paths[]` (orden)  
    Localizador: `public/js/i18n.js:L30-L33`.

78. **[renderer i18n] carga**: `fetch(path)` → **loadResource** → `rendererTranslations` (primer JSON válido gana)  
    Localizador: `public/js/i18n.js:L34-L60`.

79. **[renderer i18n] caching actual**: `rendererTranslationsLang = requested` aun si el JSON cargado provino de un candidato distinto (p.ej. base)  
    Localizador: `public/js/i18n.js:L49-L52`.

---

## SECTION 5 — Numeric formatting (AS-IS)

80. **[mainWin renderer] destructuring separators**: `window.FormatUtils.obtenerSeparadoresDeNumeros(idiomaActual, settingsCache)` → **apply** → `{ separadorMiles, separadorDecimal }`  
    Localizador: `public/renderer.js:L242-L246`.

81. **[renderer/format] `langTag`**: input `idioma` → **normalize** → `langTag` (via `normalizeLangTag`)  
    Localizador: `public/js/format.js:L29-L31`.

82. **[renderer/format] `langBase`**: `langTag` → **derive** → `langBase` (via `getLangBase`)  
    Localizador: `public/js/format.js:L31-L32`.

83. **[renderer/format] `nf`**: `settings.numberFormatting` → **read** → `nf`  
    Localizador: `public/js/format.js:L33`.

84a) **[renderer/format] rama A (existe)**: si `nf && nf[langBase]` → **apply** → resuelve a `nf[langBase]`  
     Localizador: `public/js/format.js:L34-L35`.

84b) **[renderer/format] rama B (no existe)**: else → **apply** → resuelve a hardcoded `{ separadorMiles: '.', separadorDecimal: ',' }`  
     Localizador: `public/js/format.js:L36`.

---

## SECTION 6 — Multi-window semantics (AS-IS): push vs pull

85. **[main/settings] push (sitio SEND #1, central)**: `broadcastSettingsUpdated(settings)` → **send** → `mainWin.webContents.send('settings-updated', settings)`  
    Localizador: `electron/settings.js:L346-L361`.

86. **[main/presets] push (sitio SEND #2, fallback local)**: `broadcast(settings)` → **send** → `mainWin.webContents.send('settings-updated', settings)`  
    Localizador: `electron/presets_main.js:L138-L153`.

87. **[mainWin preload] RECEIVE settings-updated**: `ipcRenderer.on('settings-updated', ...)` → **receive** → `cb(newSettings)`  
    Localizador: `electron/preload.js:L65-L75`.

88. **[mainWin renderer] apply chain (observable)**: `newSettings` → **assign/apply** → `settingsCache`/`idiomaActual`/reload translations (+ presets si cambia idioma)  
    Localizador: `public/renderer.js:L391-L417` + `public/renderer.js:L442-L451`.

89. **[editor/preset/flotante/lang windows] live-update por settings-updated**: listeners `ipcRenderer.on('settings-updated', ...)` en preloads secundarios  
    Localizador: `editor_preload.js`, `preset_preload.js`, `flotante_preload.js`, `language_preload.js` (NOT FOUND; rangos no disponibles aquí).

90. **[editor/preset/flotante] pull al abrir**: ventana secundaria abierta después → `get-settings` → **assign** `idiomaActual` → **apply** traducciones  
    Localizador: `public/editor.js:L38-L60` + `public/preset_modal.js:L86-L106`.

---

## SECTION 7 — Event channels (AS-IS): `preset-created`

91. **[main/presets] SEND preset-created (create)**: handler `create-preset` → **send** → `mainWin.webContents.send('preset-created', newPreset)`  
    Localizador: `electron/presets_main.js:L292-L313`.

92. **[main/presets] SEND preset-created (edit)**: handler `edit-preset` → **send** → `mainWin.webContents.send('preset-created', newPreset)`  
    Localizador: `electron/presets_main.js:L543-L624`.

93. **[mainWin preload] RECEIVE preset-created**: `ipcRenderer.on('preset-created', ...)` → **receive** → `cb(preset)`  
    Localizador: `electron/preload.js:L27-L30`.

94. **[mainWin renderer] apply preset-created**: `preset` → **apply** → `loadPresetsIntoDom({ language: idiomaActual })`  
    Localizador: `public/renderer.js:L353-L359` + `public/renderer.js:L309-L347`.

95. **[editor/preset/flotante/lang windows] RECEIVE preset-created**  
    Localizador: listeners fuera de `preload.js` (NOT FOUND; rangos no disponibles aquí).
