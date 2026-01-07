# Mapa AS-IS consolidado (lo que HAY HOY)

Convencion:
**N) [Actor] VALOR: ORIGEN -> OPERACION -> DESTINO**
Cada arista incluye su **localizador** (archivo + rango de lineas).

---

## SECTION 1 - Startup flow (AS-IS)

1. **[main] `settingsState.init`**: `_settingsFile` (disco) -> **read** -> `raw`
   Localizador: `electron/settings.js:L276-L280`.

2. **[main] `normalizeSettings`**: `s.language` -> **normalize** -> `s.language`
   Localizador: `electron/settings.js:L223-L231`.

3. **[main] `langBase`**: `langTag` -> **derive** -> `langBase`
   Localizador: `electron/settings.js:L229-L230`.

4. **[main] `numberFormat.json`**: `i18n/<langBase>/numberFormat.json` -> **loadResource** -> `nf`
   Localizador: `electron/settings.js:L60-L87`.

5. **[main] `settings.numberFormatting[langBase]`**: `nf` -> **assign** -> `settings.numberFormatting[langBase]`
   Localizador: `electron/settings.js:L107-L129`.

6. **[main] `settings.presets_by_language[langBase]`**: `settings.presets_by_language` -> **assign** -> `settings.presets_by_language[langBase]`
   Localizador: `electron/settings.js:L232-L248`.

7. **[main] `_currentSettings`**: `normalized` -> **assign** -> `_currentSettings`
   Localizador: `electron/settings.js:L282-L283`.

8. **[main] `_currentSettings`**: `_currentSettings` -> **persist** -> `_settingsFile`
   Localizador: `electron/settings.js:L285-L286`.

9. **[main] `currentLanguage`**: `'es'` -> **assign** -> `currentLanguage`
   Localizador: `electron/main.js:L89-L89`.

10. **[main] `currentLanguage`**: `settings.language || 'es'` -> **assign** -> `currentLanguage`
    Localizador: `electron/main.js:L1120-L1120`.

11. **[main] rama primer arranque**: `!settings.language || settings.language === ''` -> **apply** -> `createLanguageWindow()`
    Localizador: `electron/main.js:L1122-L1124`.

12. **[main] language window**: `LANGUAGE_WINDOW_HTML` -> **loadResource** -> `langWin.loadFile(...)`
    Localizador: `electron/main.js:L356-L389`.

13. **[langWin preload -> main] `get-available-languages`**: `ipcRenderer.invoke('get-available-languages')` -> **send** -> `ipcMain.handle('get-available-languages')`
    Localizador: `electron/language_preload.js:L15-L15` + `electron/main.js:L885-L916`.

14. **[main] manifest idiomas**: `i18n/languages.json` -> **loadResource** -> `availableLanguages`
    Localizador: `electron/main.js:L886-L911`.

15. **[main] fallback manifest**: `FALLBACK_LANGUAGES` -> **assign** -> `availableLanguages`
    Localizador: `electron/main.js:L53-L56` + `electron/main.js:L892-L914`.

16. **[langWin renderer] estado UI**: `availableLanguages` / `fallbackLanguages` -> **assign** -> `languages` / `filteredLanguages`
    Localizador: `public/language_window.html:L336-L343`.

17. **[langWin renderer] seleccion**: `tag` -> **apply** -> `window.languageAPI.setLanguage(tag)`
    Localizador: `public/language_window.html:L252-L258`.

18. **[langWin preload -> main] `set-language`**: `ipcRenderer.invoke('set-language', tag)` -> **send** -> `ipcMain.handle('set-language')`
    Localizador: `electron/language_preload.js:L7-L10` + `electron/settings.js:L430-L486`.

19. **[main/settings] `chosen`**: `tag` -> **normalize** -> `chosen`
    Localizador: `electron/settings.js:L432-L435`.

20. **[main/settings] `settings.language`**: `chosen` -> **assign** -> `settings.language`
    Localizador: `electron/settings.js:L437-L439`.

21. **[main/settings] persist**: `settings` -> **persist** -> `_settingsFile`
    Localizador: `electron/settings.js:L317-L326`.

22. **[main/settings] `setCurrentLanguage`**: `menuLang` -> **apply** -> `setCurrentLanguage(menuLang)`
    Localizador: `electron/settings.js:L442-L444` + `electron/main.js:L431-L453`.

23. **[main/settings] rebuild menu**: `menuLang` -> **apply** -> `buildAppMenu(menuLang)`
    Localizador: `electron/settings.js:L448-L452` + `electron/main.js:L99-L105`.

24. **[langWin preload -> main] `language-selected`**: `ipcRenderer.send('language-selected', tag)` -> **send** -> `ipcMain.once('language-selected', ...)`
    Localizador: `electron/language_preload.js:L11-L12` + `electron/main.js:L1126-L1136`.

25. **[main] `language-selected`**: evento -> **receive** -> `createMainWindow(); close langWin`
    Localizador: `electron/main.js:L1126-L1136`.

26. **[main] main window**: `index.html` -> **loadResource** -> `mainWin.loadFile(...)`
    Localizador: `electron/main.js:L153-L173`.

27. **[mainWin preload -> main] `get-settings`**: `ipcRenderer.invoke('get-settings')` -> **send** -> `ipcMain.handle('get-settings')`
    Localizador: `electron/preload.js:L24-L25` + `electron/settings.js:L411-L427`.

28. **[mainWin renderer] cache settings**: `get-settings` payload -> **assign** -> `settingsCache`
    Localizador: `public/renderer.js:L167-L169`.

29. **[mainWin renderer] idioma**: `settingsCache.language || 'es'` -> **assign** -> `idiomaActual`
    Localizador: `public/renderer.js:L168-L169`.

30. **[mainWin renderer] modo conteo**: `settingsCache.modeConteo` -> **assign** -> `modoConteo`
    Localizador: `public/renderer.js:L169-L170`.

31. **[mainWin renderer] bundle UI**: `idiomaActual` -> **apply** -> `loadRendererTranslations(idiomaActual)`
    Localizador: `public/renderer.js:L165-L180` + `public/js/i18n.js:L18-L42`.

32. **[mainWin renderer] aplicar strings**: `rendererTranslations` -> **apply** -> `applyTranslations()`
    Localizador: `public/renderer.js:L165-L180`.

33. **[main] cierre langWin sin elegir**: `langWin.on('closed')` -> **apply** -> `applyFallbackLanguageIfUnset('es')`
    Localizador: `electron/main.js:L392-L395` + `electron/settings.js:L370-L383`.

---

## SECTION 2 - Runtime change: user changes language (AS-IS)

34. **[menu click] abrir selector**: `menu item (Language)` -> **apply** -> `createLanguageWindow()`
    Localizador: `electron/menu_builder.js:L235-L244` + `electron/main.js:L99-L105`.

35. **[langWin renderer] seleccion**: `tag` -> **apply** -> `window.languageAPI.setLanguage(tag)`
    Localizador: `public/language_window.html:L252-L258`.

36. **[langWin preload -> main] `set-language`**: `ipcRenderer.invoke('set-language', tag)` -> **send** -> `ipcMain.handle('set-language')`
    Localizador: `electron/language_preload.js:L7-L10` + `electron/settings.js:L430-L486`.

37. **[main/settings] `chosen`**: `tag` -> **normalize** -> `chosen`
    Localizador: `electron/settings.js:L432-L435`.

38. **[main/settings] `settings.language`**: `chosen` -> **assign** -> `settings.language`
    Localizador: `electron/settings.js:L437-L439`.

39. **[main/settings] persist**: `settings` -> **persist** -> `_settingsFile`
    Localizador: `electron/settings.js:L317-L326`.

40. **[main/settings] `setCurrentLanguage`**: `menuLang` -> **apply** -> `setCurrentLanguage(menuLang)`
    Localizador: `electron/settings.js:L442-L444` + `electron/main.js:L431-L453`.

41. **[main/settings] rebuild menu**: `menuLang` -> **apply** -> `buildAppMenu(menuLang)`
    Localizador: `electron/settings.js:L448-L452` + `electron/main.js:L99-L105`.

42. **[main/settings] `settings-updated`**: `settings` -> **send** -> `mainWin.webContents.send('settings-updated', settings)`
    Localizador: `electron/settings.js:L346-L352`.

43. **[mainWin renderer] cache settings**: `newSettings` -> **assign** -> `settingsCache`
    Localizador: `public/renderer.js:L392-L394`.

44. **[mainWin renderer] idioma**: `settingsCache.language` -> **assign** -> `idiomaActual`
    Localizador: `public/renderer.js:L394-L397`.

45. **[mainWin renderer] recargar bundle UI**: `idiomaActual` -> **apply** -> `loadRendererTranslations(idiomaActual)`
    Localizador: `public/renderer.js:L396-L407` + `public/js/i18n.js:L18-L42`.

46. **[mainWin renderer] reaplicar UI**: `rendererTranslations` -> **apply** -> `applyTranslations()`
    Localizador: `public/renderer.js:L396-L408`.

47. **[mainWin renderer] recargar presets**: `idiomaActual` -> **apply** -> `loadPresets()`
    Localizador: `public/renderer.js:L408-L418`.

---

## SECTION 3 - Runtime change: OTHER settings (AS-IS) que afectan comportamiento dependiente de idioma

### 3.1 modeConteo (end-to-end)

48. **[mainWin renderer] UI toggle**: `toggleModoPreciso.checked` -> **derive** -> `nuevoModo`
    Localizador: `public/renderer.js:L458-L460`.

49. **[mainWin renderer] `setModoConteo`**: `nuevoModo` -> **apply** -> `setModoConteo(nuevoModo)`
    Localizador: `public/renderer.js:L462-L463` + `public/renderer.js:L210-L213`.

50. **[mainWin renderer] persist mode**: `window.electronAPI.setModeConteo(nuevoModo)` -> **apply** -> `electronAPI.setModeConteo`
    Localizador: `public/renderer.js:L470-L473`.

51. **[renderer->main] `set-mode-conteo`**: `ipcRenderer.invoke('set-mode-conteo', mode)` -> **send** -> `ipcMain.handle('set-mode-conteo')`
    Localizador: `electron/preload.js:L64-L64` + `electron/settings.js:L489-L503`.

52. **[main/settings] `settings.modeConteo`**: `mode` -> **assign** -> `settings.modeConteo`
    Localizador: `electron/settings.js:L491-L493`.

53. **[main/settings] persist**: `settings` -> **persist** -> `_settingsFile`
    Localizador: `electron/settings.js:L317-L326`.

54. **[main/settings] `settings-updated`**: `settings` -> **send** -> `mainWin.webContents.send('settings-updated', settings)`
    Localizador: `electron/settings.js:L346-L352`.

55. **[mainWin renderer] modo conteo**: `settingsCache.modeConteo` -> **assign** -> `modoConteo`
    Localizador: `public/renderer.js:L425-L427`.

---

### 3.2 presets (AS-IS) - cadenas end-to-end que si se pueden cerrar

#### 3.2.1 Delete preset (main window)

56. **[mainWin renderer] UI delete**: click -> **apply** -> `window.electronAPI.requestDeletePreset(name)`
    Localizador: `public/renderer.js:L962-L967`.

57. **[mainWin preload -> main] `request-delete-preset`**: `ipcRenderer.invoke('request-delete-preset', name)` -> **send** -> `ipcMain.handle('request-delete-preset')`
    Localizador: `electron/preload.js:L35-L36` + `electron/presets_main.js:L327-L328`.

58. **[main/presets] `presets_by_language[lang]`**: `settings.presets_by_language[lang]` -> **assign** -> `settings.presets_by_language[lang]`
    Localizador: `electron/presets_main.js:L388-L403`.

59. **[main/presets] `disabled_default_presets[lang]`**: `settings.disabled_default_presets[lang]` -> **assign** -> `settings.disabled_default_presets[lang]`
    Localizador: `electron/presets_main.js:L381-L414`.

60. **[main/settings] persist**: `settings` -> **persist** -> `_settingsFile`
    Localizador: `electron/settings.js:L317-L326`.

61. **[mainWin renderer] post-delete refresh**: `res.ok` -> **apply** -> `loadPresets()`
    Localizador: `public/renderer.js:L962-L974`.

#### 3.2.2 Restore defaults (main window)

62. **[mainWin renderer] UI restore**: click -> **apply** -> `window.electronAPI.requestRestoreDefaults()`
    Localizador: `public/renderer.js:L997-L1001`.

63. **[mainWin preload -> main] `request-restore-defaults`**: `ipcRenderer.invoke('request-restore-defaults')` -> **send** -> `ipcMain.handle('request-restore-defaults')`
    Localizador: `electron/preload.js:L38-L39` + `electron/presets_main.js:L431-L432`.

64. **[main/presets] `presets_by_language[lang]`**: `settings.presets_by_language[lang]` -> **assign** -> `settings.presets_by_language[lang]`
    Localizador: `electron/presets_main.js:L463-L471`.

65. **[main/presets] `disabled_default_presets[lang]`**: `settings.disabled_default_presets[lang]` -> **assign** -> `settings.disabled_default_presets[lang]`
    Localizador: `electron/presets_main.js:L473-L487`.

66. **[main/settings] persist**: `settings` -> **persist** -> `_settingsFile`
    Localizador: `electron/settings.js:L317-L326`.

67. **[mainWin renderer] post-restore refresh**: `res.ok` -> **apply** -> `loadPresets()`
    Localizador: `public/renderer.js:L997-L1005`.

#### 3.2.3 Create/Edit preset (preset modal -> main -> mainWin)

68. **[preset modal renderer] UI save (create/edit)**: click -> **apply** -> `presetAPI.createPreset(...)` / `presetAPI.editPreset(...)`
    Localizador: `public/preset_modal.js:L172-L191`.

69. **[preset modal preload -> main] `create-preset`**: `ipcRenderer.invoke('create-preset', preset)` -> **send** -> `ipcMain.handle('create-preset')`
    Localizador: `electron/preset_preload.js:L57-L58` + `electron/presets_main.js:L292-L293`.

70. **[preset modal preload -> main] `edit-preset`**: `ipcRenderer.invoke('edit-preset', { originalName, newPreset })` -> **send** -> `ipcMain.handle('edit-preset')`
    Localizador: `electron/preset_preload.js:L64-L65` + `electron/presets_main.js:L542-L543`.

71. **[main/presets] `presets_by_language[lang]`**: `settings.presets_by_language[lang]` -> **assign** -> `settings.presets_by_language[lang]`
    Localizador: `electron/presets_main.js:L296-L304` + `electron/presets_main.js:L610-L615`.

72. **[main/settings] persist**: `settings` -> **persist** -> `_settingsFile`
    Localizador: `electron/settings.js:L317-L326`.

#### 3.2.4 Preset selection (renderer)

73. **[mainWin renderer] `loadPresets`**: `async () => { ... }` -> **assign** -> `loadPresets`
    Localizador: `public/renderer.js:L310-L337`.

74. **[renderer/presets] `langBase`**: `settings.language` -> **derive** -> `langBase`
    Localizador: `public/js/presets.js:L15-L17`.

75. **[renderer/presets] `userPresets`**: `settings.presets_by_language[langBase]` -> **assign** -> `userPresets`
    Localizador: `public/js/presets.js:L17-L19`.

76. **[renderer/presets -> main] `get-default-presets`**: `ipcRenderer.invoke('get-default-presets')` -> **send** -> `ipcMain.handle('get-default-presets')`
    Localizador: `public/js/presets.js:L76-L78` + `electron/preload.js:L32-L33` + `electron/presets_main.js:L188-L210`.

77. **[renderer/presets] `finalList`**: (`settings`, `defaults`) -> **derive** -> `finalList`
    Localizador: `public/js/presets.js:L15-L38` + `public/js/presets.js:L82-L83`.

---

## SECTION 4 - Translation resolution (AS-IS)

### 4.1 Menu (electron/menu_builder.js)

78. **[menu_builder] `requested`**: input `lang` -> **normalize** -> `requested`
    Localizador: `electron/menu_builder.js:L70-L72`.

79. **[menu_builder] `base`**: `requested` -> **derive** -> `base`
    Localizador: `electron/menu_builder.js:L71-L72`.

80. **[menu_builder] candidates**: `[requested] (+ base si distinto) (+ 'es' si no esta)` -> **assign** -> `candidates[]`
    Localizador: `electron/menu_builder.js:L74-L78`.

81. **[menu_builder] paths por candidato**: `candidate` -> **derive** -> `files[]` (orden)
    Localizador: `electron/menu_builder.js:L82-L86`.

82. **[menu_builder] carga**: `files[]` -> **loadResource** -> `translations` (primer JSON valido gana)
    Localizador: `electron/menu_builder.js:L88-L106`.

### 4.2 Renderer UI strings (public/js/i18n.js)

83. **[renderer i18n] `requested`**: input `lang` -> **normalize** -> `requested`
    Localizador: `public/js/i18n.js:L18-L20`.

84. **[renderer i18n] `base`**: `requested` -> **derive** -> `base`
    Localizador: `public/js/i18n.js:L21-L21`.

85. **[renderer i18n] candidates**: `[requested] (+ base si distinto) (+ 'es' si no esta)` -> **assign** -> `candidates[]`
    Localizador: `public/js/i18n.js:L22-L25`.

86. **[renderer i18n] paths por candidato**: `target` -> **derive** -> `paths[]` (orden)
    Localizador: `public/js/i18n.js:L29-L33`.

87. **[renderer i18n] carga**: `fetch(path)` -> **loadResource** -> `rendererTranslations` (primer JSON valido gana)
    Localizador: `public/js/i18n.js:L34-L42`.

---

## SECTION 5 - Numeric formatting (AS-IS)

88. **[mainWin renderer] obtenerSeparadoresDeNumeros**: `idiomaActual` -> **apply** -> `obtenerSeparadoresDeNumeros(idiomaActual, settingsCache)`
    Localizador: `public/renderer.js:L242-L249`.

89. **[renderer/format] `langTag`**: input `idioma` -> **normalize** -> `langTag`
    Localizador: `public/js/format.js:L29-L31`.

90. **[renderer/format] `langBase`**: `langTag` -> **derive** -> `langBase`
    Localizador: `public/js/format.js:L31-L31`.

91. **[renderer/format] `nf`**: `settings.numberFormatting` -> **read** -> `nf`
    Localizador: `public/js/format.js:L32-L32`.

92. **[renderer/format] rama A (existe)**: `nf[langBase]` -> **apply** -> `nf[langBase]`
    Localizador: `public/js/format.js:L33-L33`.

93. **[renderer/format] rama B (no existe)**: hardcoded `{ separadorMiles: '.', separadorDecimal: ',' }` -> **apply** -> `{ separadorMiles: '.', separadorDecimal: ',' }`
    Localizador: `public/js/format.js:L35-L35`.

---

## SECTION 6 - Multi-window semantics (AS-IS): push vs pull

94. **[main/settings] `settings-updated` (SEND #1)**: `settings` -> **send** -> `mainWin.webContents.send('settings-updated', settings)`
    Localizador: `electron/settings.js:L346-L352`.

95. **[main/presets] `settings-updated` (SEND #2)**: `settings` -> **send** -> `mainWin.webContents.send('settings-updated', settings)`
    Localizador: `electron/presets_main.js:L138-L148`.

96. **[mainWin preload] `settings-updated` listener**: `'settings-updated'` -> **receive** -> `ipcRenderer.on('settings-updated', listener)`
    Localizador: `electron/preload.js:L66-L70`.

97. **[mainWin renderer] apply settings-updated**: `newSettings` -> **apply** -> `settingsChangeHandler(newSettings)`
    Localizador: `public/renderer.js:L391-L433`.

98. **[editor preload] settings-updated listener**: `ipcRenderer.on('settings-updated', ...)` -> **receive** -> NOT FOUND
    Localizador: `electron/editor_preload.js:L1-L21`.

99. **[preset preload] settings-updated listener**: `ipcRenderer.on('settings-updated', ...)` -> **receive** -> NOT FOUND
    Localizador: `electron/preset_preload.js:L1-L67`.

100. **[flotante preload] settings-updated listener**: `ipcRenderer.on('settings-updated', ...)` -> **receive** -> NOT FOUND
     Localizador: `electron/flotante_preload.js:L1-L26`.

101. **[language preload] settings-updated listener**: `ipcRenderer.on('settings-updated', ...)` -> **receive** -> NOT FOUND
     Localizador: `electron/language_preload.js:L1-L16`.

102. **[editor preload -> main] `get-settings`**: `ipcRenderer.invoke('get-settings')` -> **send** -> `ipcMain.handle('get-settings')`
     Localizador: `electron/editor_preload.js:L6-L10` + `electron/settings.js:L411-L427`.

103. **[editor renderer] idiomaActual**: `settings.language` -> **assign** -> `idiomaActual`
     Localizador: `public/editor.js:L29-L33`.

104. **[editor renderer] aplicar traducciones**: `idiomaActual` -> **apply** -> `applyEditorTranslations()`
     Localizador: `public/editor.js:L28-L36`.

105. **[preset modal preload -> main] `get-settings`**: `ipcRenderer.invoke('get-settings')` -> **send** -> `ipcMain.handle('get-settings')`
     Localizador: `electron/preset_preload.js:L67-L67` + `electron/settings.js:L411-L427`.

106. **[preset modal renderer] idiomaActual**: `settings.language` -> **assign** -> `idiomaActual`
     Localizador: `public/preset_modal.js:L92-L95`.

107. **[preset modal renderer] aplicar traducciones**: `idiomaActual` -> **apply** -> `applyPresetTranslations(mode)`
     Localizador: `public/preset_modal.js:L104-L121`.

108. **[flotante preload -> main] `get-settings`**: `ipcRenderer.invoke('get-settings')` -> **send** -> `ipcMain.handle('get-settings')`
     Localizador: `electron/flotante_preload.js:L24-L25` + `electron/settings.js:L411-L427`.

109. **[flotante renderer] lang**: `settings.language` -> **assign** -> `lang`
     Localizador: `public/flotante.js:L63-L68`.

110. **[flotante renderer] aplicar traducciones**: `lang` -> **apply** -> `loadRendererTranslations(lang)`
     Localizador: `public/flotante.js:L58-L79`.

---

## SECTION 7 - Event channels (AS-IS): `preset-created`

111. **[main/presets] `preset-created` (SEND #1)**: `preset` -> **send** -> `mainWin.webContents.send('preset-created', preset)`
     Localizador: `electron/presets_main.js:L309-L313`.

112. **[main/presets] `preset-created` (SEND #2)**: `newPreset` -> **send** -> `mainWin.webContents.send('preset-created', newPreset)`
     Localizador: `electron/presets_main.js:L620-L624`.

113. **[mainWin preload] `preset-created` listener**: `'preset-created'` -> **receive** -> `ipcRenderer.on('preset-created', ...)`
     Localizador: `electron/preload.js:L28-L29`.

114. **[mainWin renderer] apply preset-created**: `preset` -> **apply** -> `loadPresets()`
     Localizador: `public/renderer.js:L354-L367`.

115. **[editor preload] preset-created listener**: `ipcRenderer.on('preset-created', ...)` -> **receive** -> NOT FOUND
     Localizador: `electron/editor_preload.js:L1-L21`.

116. **[preset preload] preset-created listener**: `ipcRenderer.on('preset-created', ...)` -> **receive** -> NOT FOUND
     Localizador: `electron/preset_preload.js:L1-L67`.

117. **[flotante preload] preset-created listener**: `ipcRenderer.on('preset-created', ...)` -> **receive** -> NOT FOUND
     Localizador: `electron/flotante_preload.js:L1-L26`.

118. **[language preload] preset-created listener**: `ipcRenderer.on('preset-created', ...)` -> **receive** -> NOT FOUND
     Localizador: `electron/language_preload.js:L1-L16`.
