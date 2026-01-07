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
   Localizador: `electron/settings.js:L60-L73`.

5. **[main] `settings.numberFormatting[langBase]`**: `nf` -> **assign** -> `settings.numberFormatting[langBase]`  
   Localizador: `electron/settings.js:L114-L128`.

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
    Localizador: `electron/main.js:L385-L386`.

13. **[langWin preload] IPC**: `ipcRenderer.invoke('get-available-languages')` -> **send** -> `ipcMain.handle('get-available-languages')`  
    Localizador: `electron/language_preload.js:L15-L15`.

14. **[main] manifest idiomas**: `i18n/languages.json` -> **loadResource** -> `availableLanguages`  
    Localizador: `electron/main.js:L885-L903`.

15. **[langWin renderer] estado UI**: `availableLanguages` -> **assign** -> `languages` / `filteredLanguages`  
    Localizador: `public/language_window.html:L336-L343`.

16. **[langWin renderer] seleccion**: `tag` -> **apply** -> `window.languageAPI.setLanguage(tag)`  
    Localizador: `public/language_window.html:L252-L258`.

17. **[langWin preload] IPC**: `ipcRenderer.invoke('set-language', tag)` -> **send** -> `ipcMain.handle('set-language')`  
    Localizador: `electron/language_preload.js:L7-L10`.

18. **[main/settings] `chosen`**: `tag` -> **normalize** -> `chosen`  
    Localizador: `electron/settings.js:L432-L435`.

19. **[main/settings] `settings.language`**: `chosen` -> **assign** -> `settings.language`  
    Localizador: `electron/settings.js:L437-L439`.

20. **[main/settings] persist**: `settings` -> **persist** -> `_settingsFile`  
    Localizador: `electron/settings.js:L317-L326`.

21. **[main/settings] `setCurrentLanguage`**: `menuLang` -> **apply** -> `setCurrentLanguage(menuLang)`  
    Localizador: `electron/settings.js:L442-L444` + `electron/main.js:L431-L453`.

22. **[main/settings] rebuild menu**: `menuLang` -> **apply** -> `buildAppMenu(menuLang)`  
    Localizador: `electron/settings.js:L448-L452`.

23. **[main/menu] traducciones menu**: `menuLang` -> **loadResource** -> `i18n/.../main.json`  
    Localizador: `electron/menu_builder.js:L70-L124`.

24. **[main/settings] push a mainWin**: `settings` -> **send** -> `mainWin.webContents.send('settings-updated', settings)`  
    Localizador: `electron/settings.js:L346-L352`.

25. **[langWin preload] senal adicional**: `ipcRenderer.send('language-selected', tag)` -> **send** -> `ipcMain.once('language-selected', ...)`  
    Localizador: `electron/language_preload.js:L11-L12` + `electron/main.js:L1126-L1136`.

26. **[main] `language-selected`**: evento -> **receive** -> `createMainWindow(); close langWin`  
    Localizador: `electron/main.js:L1126-L1136`.

27. **[main] main window**: `index.html` -> **loadResource** -> `mainWin.loadFile(...)`  
    Localizador: `electron/main.js:L170-L170`.

28. **[mainWin preload] IPC settings**: `ipcRenderer.invoke('get-settings')` -> **send** -> `ipcMain.handle('get-settings')`  
    Localizador: `electron/preload.js:L24-L25`.

29. **[mainWin renderer] cache settings**: `get-settings` payload -> **assign** -> `settingsCache`  
    Localizador: `public/renderer.js:L167-L169`.

30. **[mainWin renderer] idioma**: `settingsCache.language || 'es'` -> **assign** -> `idiomaActual`  
    Localizador: `public/renderer.js:L168-L169`.

31. **[mainWin renderer] modo conteo**: `settingsCache.modeConteo` -> **assign** -> `modoConteo`  
    Localizador: `public/renderer.js:L169-L170`.

32. **[mainWin renderer] bundle UI**: `idiomaActual` -> **loadResource** -> `../i18n/<...>/renderer.json`  
    Localizador: `public/js/i18n.js:L18-L42`.

33. **[mainWin renderer] aplicar strings**: `rendererTranslations` -> **apply** -> `applyTranslations()`  
    Localizador: `public/renderer.js:L174-L175` + `public/renderer.js:L81-L118`.

34. **[mainWin renderer] formato numerico**: (`idiomaActual`, `settingsCache`) -> **apply** -> `obtenerSeparadoresDeNumeros(idiomaActual, settingsCache)`  
    Localizador: `public/renderer.js:L243-L245` + `public/js/format.js:L29-L35`.

35. **[mainWin renderer] presets**: `idiomaActual` -> **apply** -> `loadPresetsIntoDom({ language: idiomaActual })`  
    Localizador: `public/renderer.js:L311-L316`.

36. **[renderer->main] defaults presets**: `electronAPI.getDefaultPresets()` -> **send** -> `ipcMain.handle('get-default-presets')`  
    Localizador: `electron/preload.js:L32-L33` + `electron/presets_main.js:L188-L189`.

37. **[renderer] presets finalList**: (`settings`, `defaults`) -> **derive** -> `finalList`  
    Localizador: `public/js/presets.js:L15-L38` + `public/js/presets.js:L82-L83`.

38. **[main] cierre langWin sin elegir**: `langWin.on('closed')` -> **apply** -> `applyFallbackLanguageIfUnset('es')`  
    Localizador: `electron/main.js:L392-L395` + `electron/settings.js:L370-L383`.

---

## SECTION 2 - Runtime change: user changes language (AS-IS)

39. **[menu click] abrir selector**: `menu item (Language)` -> **apply** -> `createLanguageWindow()`  
    Localizador: `electron/menu_builder.js:L235-L244` + `electron/main.js:L356-L386`.

40. **[langWin renderer] seleccion**: `tag` -> **apply** -> `window.languageAPI.setLanguage(tag)`  
    Localizador: `public/language_window.html:L252-L258`.

41. **[langWin preload] IPC**: `ipcRenderer.invoke('set-language', tag)` -> **send** -> `ipcMain.handle('set-language')`  
    Localizador: `electron/language_preload.js:L7-L10`.

42. **[main/settings] `set-language`**: `ipcMain.handle('set-language')` -> **receive** -> handler  
    Localizador: `electron/settings.js:L430-L431`.

43. **[main/settings] `settings.language`**: `chosen` -> **assign** -> `settings.language`  
    Localizador: `electron/settings.js:L437-L439`.

44. **[main/settings] persist**: `settings` -> **persist** -> `_settingsFile`  
    Localizador: `electron/settings.js:L317-L326`.

45. **[main/settings] `setCurrentLanguage`**: `menuLang` -> **apply** -> `setCurrentLanguage(menuLang)`  
    Localizador: `electron/settings.js:L442-L444` + `electron/main.js:L431-L453`.

46. **[main/settings] rebuild menu**: `menuLang` -> **apply** -> `buildAppMenu(menuLang)`  
    Localizador: `electron/settings.js:L448-L452`.

47. **[main/menu] traducciones menu**: `menuLang` -> **loadResource** -> `i18n/.../main.json`  
    Localizador: `electron/menu_builder.js:L70-L124`.

48. **[main/settings] push mainWin**: `settings` -> **send** -> `mainWin.webContents.send('settings-updated', settings)`  
    Localizador: `electron/settings.js:L346-L352`.

49. **[mainWin preload] evento**: `'settings-updated'` -> **receive** -> callback registrada por `electronAPI.onSettingsChanged`  
    Localizador: `electron/preload.js:L66-L70`.

50. **[mainWin renderer] cache settings**: `newSettings` -> **assign** -> `settingsCache`  
    Localizador: `public/renderer.js:L392-L394`.

51. **[mainWin renderer] idioma**: `settingsCache.language` -> **assign** -> `idiomaActual`  
    Localizador: `public/renderer.js:L394-L397`.

52. **[mainWin renderer] recargar bundle UI**: `idiomaActual` -> **apply** -> `loadRendererTranslations(idiomaActual)`  
    Localizador: `public/renderer.js:L398-L400` + `public/js/i18n.js:L18-L42`.

53. **[mainWin renderer] reaplicar UI**: `rendererTranslations` -> **apply** -> `applyTranslations()`  
    Localizador: `public/renderer.js:L407-L407`.

54. **[mainWin renderer] recargar presets**: `idiomaActual` -> **apply** -> `loadPresetsIntoDom({ language: idiomaActual })`  
    Localizador: `public/renderer.js:L408-L417` + `public/renderer.js:L311-L316`.

55. **[mainWin renderer] refrescar outputs**: `currentText` -> **apply** -> `updatePreviewAndResults(currentText)`  
    Localizador: `public/renderer.js:L423-L429`.

56. **[main] `language-selected` (runtime)**: `ipcMain.on('language-selected', ...)` -> **receive** -> NOT FOUND  
    Localizador: `electron/main.js:L1122-L1136`.

---

## SECTION 3 - Runtime change: OTHER settings (AS-IS) que afectan comportamiento dependiente de idioma

### 3.1 modeConteo (end-to-end)

57. **[mainWin renderer] UI toggle**: `toggleModoPreciso.checked` -> **derive** -> `nuevoModo`  
    Localizador: `public/renderer.js:L458-L461`.

58. **[mainWin renderer] estado local**: `nuevoModo` -> **assign** -> `modoConteo`  
    Localizador: `public/renderer.js:L462-L464`.

59. **[renderer->main] persist mode**: `electronAPI.setModeConteo(nuevoModo)` -> **send** -> `ipcMain.handle('set-mode-conteo')`  
    Localizador: `electron/preload.js:L64-L64`.

60. **[main/settings] `set-mode-conteo`**: `ipcMain.handle('set-mode-conteo')` -> **receive** -> handler  
    Localizador: `electron/settings.js:L489-L490`.

61. **[main/settings] `settings.modeConteo`**: `mode` -> **assign** -> `settings.modeConteo`  
    Localizador: `electron/settings.js:L491-L493`.

62. **[main/settings] persist**: `settings` -> **persist** -> `_settingsFile`  
    Localizador: `electron/settings.js:L317-L326`.

63. **[main/settings] push mainWin**: `settings` -> **send** -> `'settings-updated'`  
    Localizador: `electron/settings.js:L346-L352`.

64. **[mainWin preload] evento**: `'settings-updated'` -> **receive** -> callback registrada por `electronAPI.onSettingsChanged`  
    Localizador: `electron/preload.js:L66-L70`.

65. **[mainWin renderer] aplicar**: `settingsCache.modeConteo` -> **assign** -> `modoConteo`  
    Localizador: `public/renderer.js:L425-L427`.

66. **[mainWin renderer] refrescar outputs**: `currentText` -> **apply** -> `updatePreviewAndResults(currentText)`  
    Localizador: `public/renderer.js:L429-L429`.

---

### 3.2 presets (AS-IS) - cadenas end-to-end que si se pueden cerrar

#### 3.2.1 Delete preset (main window)

67. **[mainWin renderer] UI delete**: click -> **apply** -> `window.electronAPI.requestDeletePreset(name)`  
    Localizador: `public/renderer.js:L962-L967`.

68. **[mainWin preload] IPC delete**: `ipcRenderer.invoke('request-delete-preset', name)` -> **send** -> `ipcMain.handle('request-delete-preset')`  
    Localizador: `electron/preload.js:L35-L36`.

69. **[main/presets] handler delete**: `ipcMain.handle('request-delete-preset')` -> **receive** -> handler  
    Localizador: `electron/presets_main.js:L327-L328`.

70. **[main/presets] presets_by_language**: `settings.presets_by_language[lang]` -> **assign** -> `settings.presets_by_language[lang]`  
    Localizador: `electron/presets_main.js:L388-L403`.

71. **[main/presets] disabled_default_presets**: `settings.disabled_default_presets[lang]` -> **assign** -> `settings.disabled_default_presets[lang]`  
    Localizador: `electron/presets_main.js:L381-L414`.

72. **[main/settings] persist**: `settings` -> **persist** -> `_settingsFile`  
    Localizador: `electron/settings.js:L317-L326`.

73. **[mainWin renderer] post-delete refresh**: `res.ok` -> **apply** -> `loadPresetsIntoDom({ language: idiomaActual })`  
    Localizador: `public/renderer.js:L968-L970`.

#### 3.2.2 Restore defaults (main window)

74. **[mainWin renderer] UI restore**: click -> **apply** -> `window.electronAPI.requestRestoreDefaults()`  
    Localizador: `public/renderer.js:L997-L1001`.

75. **[mainWin preload] IPC restore**: `ipcRenderer.invoke('request-restore-defaults')` -> **send** -> `ipcMain.handle('request-restore-defaults')`  
    Localizador: `electron/preload.js:L38-L39`.

76. **[main/presets] handler restore**: `ipcMain.handle('request-restore-defaults')` -> **receive** -> handler  
    Localizador: `electron/presets_main.js:L431-L432`.

77. **[main/presets] presets_by_language**: `settings.presets_by_language[lang]` -> **assign** -> `settings.presets_by_language[lang]`  
    Localizador: `electron/presets_main.js:L463-L471`.

78. **[main/presets] disabled_default_presets**: `settings.disabled_default_presets[lang]` -> **assign** -> `settings.disabled_default_presets[lang]`  
    Localizador: `electron/presets_main.js:L473-L487`.

79. **[main/settings] persist**: `settings` -> **persist** -> `_settingsFile`  
    Localizador: `electron/settings.js:L317-L326`.

80. **[mainWin renderer] post-restore refresh**: `res.ok` -> **apply** -> `loadPresetsIntoDom({ language: idiomaActual })`  
    Localizador: `public/renderer.js:L1002-L1004`.

#### 3.2.3 Create/Edit preset (preset modal -> main -> mainWin)

81. **[preset modal renderer] UI save (create/edit)**: click -> **apply** -> `presetAPI.createPreset(...)` / `presetAPI.editPreset(...)`  
    Localizador: `public/preset_modal.js:L172-L191`.

82. **[preset modal preload] IPC create**: `ipcRenderer.invoke('create-preset', preset)` -> **send** -> `ipcMain.handle('create-preset')`  
    Localizador: `electron/preset_preload.js:L57-L58`.

83. **[preset modal preload] IPC edit**: `ipcRenderer.invoke('edit-preset', { originalName, newPreset })` -> **send** -> `ipcMain.handle('edit-preset')`  
    Localizador: `electron/preset_preload.js:L64-L65`.

84. **[main/presets] handler create**: `ipcMain.handle('create-preset')` -> **receive** -> handler  
    Localizador: `electron/presets_main.js:L292-L293`.

85. **[main/presets] handler edit**: `ipcMain.handle('edit-preset')` -> **receive** -> handler  
    Localizador: `electron/presets_main.js:L542-L543`.

86. **[main/presets] presets_by_language**: `settings.presets_by_language[lang]` -> **assign** -> `settings.presets_by_language[lang]`  
    Localizador: `electron/presets_main.js:L296-L304` + `electron/presets_main.js:L610-L617`.

87. **[main/settings] persist**: `settings` -> **persist** -> `_settingsFile`  
    Localizador: `electron/settings.js:L317-L326`.

88. **[main/presets] preset-created**: `preset` -> **send** -> `mainWin.webContents.send('preset-created', preset)`  
    Localizador: `electron/presets_main.js:L309-L313` + `electron/presets_main.js:L620-L624`.

89. **[mainWin preload] RECEIVE preset-created**: `ipcRenderer.on('preset-created', ...)` -> **receive** -> `cb(preset)`  
    Localizador: `electron/preload.js:L28-L29`.

90. **[mainWin renderer] apply preset-created**: `preset` -> **apply** -> `loadPresetsIntoDom({ language: idiomaActual })`  
    Localizador: `public/renderer.js:L355-L359` + `public/renderer.js:L311-L316`.

---

## SECTION 4 - Translation resolution (AS-IS)

### 4.1 Menu (electron/menu_builder.js)

91. **[menu_builder] `requested`**: input `lang` -> **normalize** -> `requested`  
    Localizador: `electron/menu_builder.js:L70-L72`.

92. **[menu_builder] `base`**: `requested` -> **derive** -> `base`  
    Localizador: `electron/menu_builder.js:L71-L72`.

93. **[menu_builder] candidates**: `[requested] (+ base si distinto) (+ 'es' si no esta)` -> **assign** -> `candidates[]`  
    Localizador: `electron/menu_builder.js:L74-L78`.

94. **[menu_builder] paths por candidato**: `candidate` -> **derive** -> `files[]` (orden)  
    Localizador: `electron/menu_builder.js:L82-L86`.

95. **[menu_builder] carga**: `files[]` -> **loadResource** -> `translations` (primer JSON valido gana)  
    Localizador: `electron/menu_builder.js:L88-L106`.

### 4.2 Renderer UI strings (public/js/i18n.js)

96. **[renderer i18n] `requested`**: input `lang` -> **normalize** -> `requested`  
    Localizador: `public/js/i18n.js:L18-L20`.

97. **[renderer i18n] `base`**: `requested` -> **derive** -> `base`  
    Localizador: `public/js/i18n.js:L21-L21`.

98. **[renderer i18n] candidates**: `[requested] (+ base si distinto) (+ 'es' si no esta)` -> **assign** -> `candidates[]`  
    Localizador: `public/js/i18n.js:L22-L25`.

99. **[renderer i18n] paths por candidato**: `target` -> **derive** -> `paths[]` (orden)  
    Localizador: `public/js/i18n.js:L29-L33`.

100. **[renderer i18n] carga**: `fetch(path)` -> **loadResource** -> `rendererTranslations` (primer JSON valido gana)  
     Localizador: `public/js/i18n.js:L34-L42`.

---

## SECTION 5 - Numeric formatting (AS-IS)

101. **[mainWin renderer] obtenerSeparadoresDeNumeros**: `idiomaActual` -> **apply** -> `obtenerSeparadoresDeNumeros(idiomaActual, settingsCache)`  
     Localizador: `public/renderer.js:L243-L245`.

102. **[renderer/format] `langTag`**: input `idioma` -> **normalize** -> `langTag`  
     Localizador: `public/js/format.js:L29-L31`.

103. **[renderer/format] `langBase`**: `langTag` -> **derive** -> `langBase`  
     Localizador: `public/js/format.js:L31-L31`.

104. **[renderer/format] `nf`**: `settings.numberFormatting` -> **read** -> `nf`  
     Localizador: `public/js/format.js:L32-L32`.

105. **[renderer/format] rama A (existe)**: `nf[langBase]` -> **apply** -> `nf[langBase]`  
     Localizador: `public/js/format.js:L33-L33`.

106. **[renderer/format] rama B (no existe)**: hardcoded `{ separadorMiles: '.', separadorDecimal: ',' }` -> **apply** -> `{ separadorMiles: '.', separadorDecimal: ',' }`  
     Localizador: `public/js/format.js:L35-L35`.

---

## SECTION 6 - Multi-window semantics (AS-IS): push vs pull

107. **[main/settings] push (SEND #1)**: `broadcastSettingsUpdated(settings)` -> **send** -> `mainWin.webContents.send('settings-updated', settings)`  
     Localizador: `electron/settings.js:L346-L352`.

108. **[main/presets] push (SEND #2)**: `broadcast(settings)` -> **send** -> `mainWin.webContents.send('settings-updated', settings)`  
     Localizador: `electron/presets_main.js:L138-L148`.

109. **[mainWin preload] RECEIVE settings-updated**: `ipcRenderer.on('settings-updated', ...)` -> **receive** -> `listener`  
     Localizador: `electron/preload.js:L66-L70`.

110. **[mainWin renderer] apply settings-updated**: `newSettings` -> **apply** -> `settingsChangeHandler(newSettings)`  
     Localizador: `public/renderer.js:L391-L433`.

111. **[editor preload] settings-updated listener**: `ipcRenderer.on('settings-updated', ...)` -> **receive** -> NOT FOUND  
     Localizador: `electron/editor_preload.js:L1-L20`.

112. **[preset preload] settings-updated listener**: `ipcRenderer.on('settings-updated', ...)` -> **receive** -> NOT FOUND  
     Localizador: `electron/preset_preload.js:L1-L67`.

113. **[flotante preload] settings-updated listener**: `ipcRenderer.on('settings-updated', ...)` -> **receive** -> NOT FOUND  
     Localizador: `electron/flotante_preload.js:L1-L26`.

114. **[language preload] settings-updated listener**: `ipcRenderer.on('settings-updated', ...)` -> **receive** -> NOT FOUND  
     Localizador: `electron/language_preload.js:L1-L16`.

115. **[editor preload] IPC get-settings**: `ipcRenderer.invoke('get-settings')` -> **send** -> `ipcMain.handle('get-settings')`  
     Localizador: `electron/editor_preload.js:L6-L10`.

116. **[editor renderer] idiomaActual**: `settings.language` -> **assign** -> `idiomaActual`  
     Localizador: `public/editor.js:L29-L33`.

117. **[editor renderer] aplicar traducciones**: `idiomaActual` -> **apply** -> `applyEditorTranslations()`  
     Localizador: `public/editor.js:L74-L89`.

118. **[preset preload] IPC get-settings**: `ipcRenderer.invoke('get-settings')` -> **send** -> `ipcMain.handle('get-settings')`  
     Localizador: `electron/preset_preload.js:L67-L67`.

119. **[preset modal renderer] idiomaActual**: `settings.language` -> **assign** -> `idiomaActual`  
     Localizador: `public/preset_modal.js:L92-L95`.

120. **[preset modal renderer] aplicar traducciones**: `idiomaActual` -> **apply** -> `applyPresetTranslations(mode)`  
     Localizador: `public/preset_modal.js:L63-L82`.

121. **[flotante preload] IPC get-settings**: `ipcRenderer.invoke('get-settings')` -> **send** -> `ipcMain.handle('get-settings')`  
     Localizador: `electron/flotante_preload.js:L24-L25`.

122. **[flotante renderer] lang**: `settings.language` -> **assign** -> `lang`  
     Localizador: `public/flotante.js:L63-L68`.

123. **[flotante renderer] aplicar traducciones**: `lang` -> **apply** -> `loadRendererTranslations(lang)`  
     Localizador: `public/flotante.js:L60-L73`.

---

## SECTION 7 - Event channels (AS-IS): `preset-created`

124. **[main/presets] SEND preset-created (create)**: `preset` -> **send** -> `mainWin.webContents.send('preset-created', preset)`  
     Localizador: `electron/presets_main.js:L309-L313`.

125. **[main/presets] SEND preset-created (edit)**: `newPreset` -> **send** -> `mainWin.webContents.send('preset-created', newPreset)`  
     Localizador: `electron/presets_main.js:L620-L624`.

126. **[mainWin preload] RECEIVE preset-created**: `ipcRenderer.on('preset-created', ...)` -> **receive** -> `cb(preset)`  
     Localizador: `electron/preload.js:L28-L29`.

127. **[mainWin renderer] apply preset-created**: `preset` -> **apply** -> `loadPresetsIntoDom({ language: idiomaActual })`  
     Localizador: `public/renderer.js:L355-L359` + `public/renderer.js:L311-L316`.

128. **[editor preload] preset-created listener**: `ipcRenderer.on('preset-created', ...)` -> **receive** -> NOT FOUND  
     Localizador: `electron/editor_preload.js:L1-L20`.

129. **[preset preload] preset-created listener**: `ipcRenderer.on('preset-created', ...)` -> **receive** -> NOT FOUND  
     Localizador: `electron/preset_preload.js:L1-L67`.

130. **[flotante preload] preset-created listener**: `ipcRenderer.on('preset-created', ...)` -> **receive** -> NOT FOUND  
     Localizador: `electron/flotante_preload.js:L1-L26`.

131. **[language preload] preset-created listener**: `ipcRenderer.on('preset-created', ...)` -> **receive** -> NOT FOUND  
     Localizador: `electron/language_preload.js:L1-L16`.
