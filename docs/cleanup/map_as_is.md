# Mapa AS-IS consolidado (lo que HAY HOY)

**Baseline / snapshot:** este mapa describe el estado AS-IS evidenciado **antes** de implementar Gate A (Autoridad única en main + `langKey` canónico en settings).  
Para trabajar sobre el estado **post-Gate A** sin rehacer el mapa, usa el addendum siguiente como “delta” gate-relevante.

## ADDENDUM — Delta Gate A (post-implementación; sin re-mapear)

Cambios gate-relevantes confirmados por los parches aplicados:

1) **Se elimina la autoridad paralela en main (`currentLanguage` / `setCurrentLanguage`).**
   - Menú: el idioma efectivo se resuelve desde settings (SELECTED_LANG) vía un helper tipo `getSelectedLanguage()` en `electron/main.js`.
   - Updater: `currentLanguageRef` pasa a consultar settings (p. ej. `currentLanguageRef: () => getSelectedLanguage()`), no un state local.
   - Implicación para este mapa: las aristas **(9), (10), (22), (40), (41)** quedan como **baseline pre-Gate A** y no describen el estado actual.

   Localizador operativo (post-Gate A, por búsqueda):
   - `electron/main.js`: buscar `function getSelectedLanguage` y el llamado `buildAppMenu()` sin `currentLanguage`.
   - `electron/main.js`: buscar `updater.registerIpc` y `currentLanguageRef`.
   - `electron/settings.js`: buscar `registerIpc(` y verificar que ya no recibe `setCurrentLanguage`.

2) **`langKey` canónico centralizado en settings.**
   - Se introduce `deriveLangKey(langTag)` (equivalente funcional del `langBase` previo) como derivación única.
   - Se usa para indexación de buckets por idioma (p. ej. `numberFormatting[...]`, `presets_by_language[...]`).

   Localizador operativo:
   - `electron/settings.js`: buscar `deriveLangKey` y usos en `ensureNumberFormatting...` y `normalizeSettings`.

3) **Invariante TO-BE 4.2 reforzado en IPC `set-language`: no degrada a vacío.**
   - Si `normalizeLangTag(tag)` produce `''` (inválido/vacío), se **loguea** (warnOnce) pero **no** se persiste `settings.language = ''` (se conserva el valor previo).
   - Esto elimina la degradación de SELECTED_LANG a vacío en runtime.

   Localizador operativo:
   - `electron/settings.js`: buscar `ipcMain.handle('set-language'` y el patrón `if (chosen) { settings.language = chosen; ... saveSettings ... }`.

## ADDENDUM — Delta Gate B (post-implementación; Gate 4 Transporte runtime)

Cambios gate-relevantes confirmados por los parches aplicados (sin re-mapear):

1) **`settings-updated` ahora se difunde a todas las ventanas activas relevantes (best-effort).**
   - Targets: `mainWin`, `editorWin`, `presetWin`, `flotanteWin`.
   - El envío es best-effort; fallas se loguean con `warnOnce` por ventana (no rompe flujo).

   Localizador operativo:
   - `electron/settings.js`: buscar `function broadcastSettingsUpdated` y el arreglo `targets = [` con `mainWin/editorWin/presetWin/flotanteWin`.

2) **Cada ventana relevante implementa suscripción runtime a `settings-updated` vía preload (`onSettingsChanged`).**
   - Editor: `editorAPI.onSettingsChanged(...)`
   - Preset modal: `presetAPI.onSettingsChanged(...)`
   - Flotante: `flotanteAPI.onSettingsChanged(...)`
   - Cada helper expone un `unsubscribe` que remueve el listener.

   Localizador operativo:
   - `electron/editor_preload.js`: buscar `onSettingsChanged` y `ipcRenderer.on('settings-updated'`
   - `electron/preset_preload.js`: buscar `onSettingsChanged`
   - `electron/flotante_preload.js`: buscar `onSettingsChanged`

3) **Re-aplicación de strings en runtime (sin refactor de Regla A/B):**
   - `public/editor.js`: al cambiar `settings.language`, se actualiza `idiomaActual` y se re-ejecuta `applyEditorTranslations()`.
   - `public/preset_modal.js`: al cambiar `settings.language`, se actualiza `idiomaActual` y se re-ejecuta `applyPresetTranslations(mode)`.
   - `public/flotante.js`: se factoriza `applyFlotanteTranslations(lang)` y se re-aplican labels (play/pause) al cambiar idioma; se evita recarga innecesaria con `translationsLoadedFor`.

   Localizador operativo:
   - `public/editor.js`: buscar `editorAPI.onSettingsChanged` y `applyEditorTranslations`
   - `public/preset_modal.js`: buscar `presetAPI.onSettingsChanged` y `applyPresetTranslations`
   - `public/flotante.js`: buscar `applyFlotanteTranslations` + `flotanteAPI.onSettingsChanged` + `translationsLoadedFor`

4) **Language window (picker) sin suscripción a `settings-updated` (decisión explícita).**
   - Justificación: ventana transitoria; no requiere re-aplicación en vivo más allá de su acción de selección/cierre.

5) **Implicación para este mapa (baseline pre-Gate B):**
   - Cualquier arista que indique que `settings-updated` solo notifica a `mainWin` queda **stale post-Gate B**.
   - Cualquier arista que afirme que `editor/preset/flotante` no tienen listeners de settings queda **stale post-Gate B**.

## ADDENDUM — Delta Gate C (post-implementación; Gates 5–6 Strings + Number formatting)

Cambios gate-relevantes confirmados por los parches aplicados (sin re-mapear):

1) **Strings: Regla A/B aplicada (DEFAULT obligatorio + overlay opcional + merge).**
   - Menú (main process): `menu_builder.js` carga DEFAULT (`es`) y luego overlay (tag/base), y hace merge profundo.
   - Renderers: `public/js/i18n.js` carga DEFAULT (`es`) como baseline y overlay (tag/base) opcional; hace merge profundo.
   - Regla de keys faltantes: si falta una key en overlay (o en el objeto merge), se usa DEFAULT; cuando falta la key se emite `warnOnce` (no silencioso).
   - Nota: si falta el bundle DEFAULT (build-time issue), se loguea `errorOnce` y se cae a fallback duro para no romper UI.

   Localizadores operativos:
   - `electron/menu_builder.js`: buscar `DEFAULT_LANG = 'es'`, `loadMainTranslations`, `deepMerge`, `resolveMenuLabel`.
   - `public/js/i18n.js`: buscar `DEFAULT_LANG = 'es'`, `rendererDefaultTranslations`, `deepMerge`, `tRenderer` con `warnOnce`.

2) **Formato numérico: deriva por langKey y cae a DEFAULT bucket antes de hardcoded.**
   - `public/js/format.js`:
     - intenta `settings.numberFormatting[langKey]`
     - si falta, usa bucket DEFAULT (`es`) con `warnOnce`
     - si falta también DEFAULT, usa separadores hardcoded con `warnOnce`

   Localizador operativo:
   - `public/js/format.js`: buscar `DEFAULT_LANG = 'es'` y `format.numberFormatting.fallback` / `format.numberFormatting.missing`.

3) **Main-process dialogs: trazabilidad de keys faltantes.**
   - Dialog texts en `presets_main.js` y `updater.js` usan `resolveDialogText` con `warnOnce` cuando falta una key, en vez de fallback silencioso.

   Localizadores operativos:
   - `electron/presets_main.js`: buscar `resolveDialogText` + `presets_main.dialog.missing:`
   - `electron/updater.js`: buscar `resolveDialogText` + `updater.dialog.missing:`

4) **Implicación para este mapa (baseline pre-Gate C):**
   - Donde el mapa describa “candidates es-first-hit” para bundles, queda stale post-Gate C:
     ahora es **DEFAULT-first + overlay + merge**.
   - Donde el mapa describa fallback numérico directo a hardcoded, queda stale post-Gate C:
     ahora es **langKey -> DEFAULT bucket -> hardcoded**, con `warnOnce`.

## ADDENDUM — Delta Gate D (post-implementación; Gate 7 Presets por idioma / selección persistida)

Cambios gate-relevantes confirmados por los parches aplicados (sin re-mapear):

1) **Se agrega bucket de selección de preset por idioma en settings (persistencia compatible).**
   - Nuevo bucket: `selected_preset_by_language` (objeto) indexado por `langKey`.
   - Normalización:
     - si falta → `{}` (default seguro),
     - si tipo inválido → `warnOnce` y reset a `{}`,
     - entradas por idioma: `trim()`, vacío se elimina, tipo no-string se elimina con `warnOnce`.

   Localizadores operativos:
   - `electron/settings.js`: buscar `selected_preset_by_language` dentro de `normalizeSettings(...)`, y en defaults de `init/getSettings`.

2) **Nuevo IPC para persistir selección por idioma: `set-selected-preset`.**
   - Flujo: renderer → preload → main(settings).
   - Reglas:
     - nombre inválido/vacío → `warnOnce` (ignorado),
     - `langKey` se deriva desde `settings.language` vía `deriveLangKey`,
     - si `settings.language` está vacío → `warnOnce` + se usa fallback `langKey`,
     - micro-opt: si el valor persistido ya coincide, retorna OK sin escribir a disco.

   Localizadores operativos:
   - `electron/settings.js`: buscar `ipcMain.handle('set-selected-preset'`.
   - `electron/preload.js`: buscar `setSelectedPreset: (name) => ipcRenderer.invoke('set-selected-preset', name)`.

3) **Selección aplicada y autocorrección (renderer/presets) sin reinicio.**
   - `public/js/presets.js`:
     - prioridad: `selected_preset_by_language[langKey]` → `currentPresetName` → fallback determinista (`default` o primer preset).
     - si NO hay selección persistida y tampoco preset actual → `warnOnce` `presets.selectedPreset.none:<langKey>` y se persiste la selección segura.
     - si hay selección persistida pero no existe en la lista → `warnOnce` `presets.selectedPreset.missing:<langKey>` y fallback + persistencia correctiva.
   - `public/renderer.js`:
     - se elimina el override inicial “seleccionar default siempre”;
     - al cambiar idioma (Gate B), se recarga presets y la selección se resuelve por `langKey`;
     - al cambiar selección en UI y al crear preset, se persiste vía `electronAPI.setSelectedPreset(...)`;
     - delete/restore defaults recargan presets y permiten que el fallback aplique selección válida (no deja selección inválida silenciosa).

   Localizadores operativos:
   - `public/js/presets.js`: buscar `presets.selectedPreset.none:` y `presets.selectedPreset.missing:`.
   - `public/renderer.js`: buscar `electronAPI.setSelectedPreset` y la sección donde antes se forzaba `default` al inicio.

4) **Implicación para este mapa (baseline pre-Gate D):**
   - Cualquier descripción de “selección inicial siempre default” queda stale post-Gate D.
   - Cualquier descripción de “selección no persistida por idioma” queda stale post-Gate D:
     ahora existe `selected_preset_by_language[langKey]` + autocorrección con `warnOnce`.
   - Cualquier descripción de “delete/restore limpia selección” queda stale post-Gate D:
     ahora se recarga y se asegura una selección válida por idioma.

## ADDENDUM - Delta Gate E (post-implementacion; sin re-mapear)

Cambios gate-relevantes confirmados por los parches aplicados (sin re-mapear):

1) **Se eliminan prefijos "FALLBACK:" en dialogs user-facing del main process.**
   - Presets/updater ahora usan textos limpios en fallbacks, manteniendo `resolveDialogText` + `warnOnce`.

   Localizador operativo:
   - `electron/presets_main.js:L337-L386`
   - `electron/updater.js:L83-L140`

2) **DEFAULT_LANG centralizado en fallbacks de idioma del sistema.**
   - Sustituye hardcoded "es" en fallbacks de idioma/seleccion en main/settings/renderers.
   - No cambia buckets ni esquema persistido.

   Localizador operativo:
   - `electron/main.js:L38-L108`
   - `electron/settings.js:L25-L45`
   - `public/renderer.js:L1-L12`

## ADDENDUM - Delta Gate E (follow-up)

Cambios gate-relevantes (solo alta prioridad) confirmados por repo (sin re-mapear):

1) **Se elimina suscripcion legacy `onSettingsUpdated` en renderer principal.**
   - El renderer principal ahora se suscribe solo via `onSettingsChanged` (un solo canal efectivo).

   Localizador operativo:
   - `public/renderer.js`: bloque de suscripcion `window.electronAPI.onSettingsChanged(settingsChangeHandler)`.
   - `electron/preload.js`: `onSettingsChanged` dentro de `electronAPI` (contextBridge).

---

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
    Localizador: `electron/language_preload.js:L6-L16` + `electron/main.js:L885-L916`.

14. **[main] manifest idiomas**: `i18n/languages.json` -> **loadResource** -> `availableLanguages`
    Localizador: `electron/main.js:L886-L911`.

15. **[main] fallback manifest**: `FALLBACK_LANGUAGES` -> **assign** -> `availableLanguages`
    Localizador: `electron/main.js:L53-L56` + `electron/main.js:L892-L914`.

16. **[langWin renderer] estado UI**: `availableLanguages` / `fallbackLanguages` -> **assign** -> `languages` / `filteredLanguages`
    Localizador: `public/language_window.html:L336-L343`.

17. **[langWin renderer] seleccion**: `tag` -> **apply** -> `window.languageAPI.setLanguage(tag)`
    Localizador: `public/language_window.html:L252-L258`.

18. **[langWin preload -> main] `set-language`**: `ipcRenderer.invoke('set-language', tag)` -> **send** -> `ipcMain.handle('set-language')`
    Localizador: `electron/language_preload.js:L6-L16` + `electron/settings.js:L430-L486`.

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
    Localizador: `electron/language_preload.js:L6-L16` + `electron/main.js:L1126-L1136`.

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
    Localizador: `electron/language_preload.js:L6-L16` + `electron/settings.js:L430-L486`.

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

76. **[renderer/presets] `electronAPI.getDefaultPresets()`**: `window.electronAPI.getDefaultPresets()` -> **apply** -> `defaults`
    Localizador: `public/js/presets.js:L75-L78`.

77. **[preload -> main] `get-default-presets`**: `ipcRenderer.invoke('get-default-presets')` -> **send** -> `ipcMain.handle('get-default-presets')`
    Localizador: `electron/preload.js:L32-L33` + `electron/presets_main.js:L188-L210`.

78. **[renderer/presets] `finalList`**: (`settings`, `defaults`) -> **derive** -> `finalList`
    Localizador: `public/js/presets.js:L15-L38` + `public/js/presets.js:L82-L83`.

---

## SECTION 4 - Translation resolution (AS-IS)

### 4.1 Menu (electron/menu_builder.js)

79. **[menu_builder] `requested`**: input `lang` -> **normalize** -> `requested`
    Localizador: `electron/menu_builder.js:L70-L72`.

80. **[menu_builder] `base`**: `requested` -> **derive** -> `base`
    Localizador: `electron/menu_builder.js:L71-L72`.

81. **[menu_builder] candidates**: `[requested] (+ base si distinto) (+ 'es' si no esta)` -> **assign** -> `candidates[]`
    Localizador: `electron/menu_builder.js:L74-L78`.

82. **[menu_builder] paths por candidato**: `candidate` -> **derive** -> `files[]` (orden)
    Localizador: `electron/menu_builder.js:L82-L86`.

83. **[menu_builder] carga**: `files[]` -> **loadResource** -> `translations` (primer JSON valido gana)
    Localizador: `electron/menu_builder.js:L88-L106`.

### 4.2 Renderer UI strings (public/js/i18n.js)

84. **[renderer i18n] `requested`**: input `lang` -> **normalize** -> `requested`
    Localizador: `public/js/i18n.js:L18-L20`.

85. **[renderer i18n] `base`**: `requested` -> **derive** -> `base`
    Localizador: `public/js/i18n.js:L21-L21`.

86. **[renderer i18n] candidates**: `[requested] (+ base si distinto) (+ 'es' si no esta)` -> **assign** -> `candidates[]`
    Localizador: `public/js/i18n.js:L22-L25`.

87. **[renderer i18n] paths por candidato**: `target` -> **derive** -> `paths[]` (orden)
    Localizador: `public/js/i18n.js:L29-L33`.

88. **[renderer i18n] carga**: `fetch(path)` -> **loadResource** -> `rendererTranslations` (primer JSON valido gana)
    Localizador: `public/js/i18n.js:L34-L42`.

---

## SECTION 5 - Numeric formatting (AS-IS)

89. **[mainWin renderer] obtenerSeparadoresDeNumeros**: `idiomaActual` -> **apply** -> `obtenerSeparadoresDeNumeros(idiomaActual, settingsCache)`
    Localizador: `public/renderer.js:L242-L249`.

90. **[renderer/format] `langTag`**: input `idioma` -> **normalize** -> `langTag`
    Localizador: `public/js/format.js:L29-L31`.

91. **[renderer/format] `langBase`**: `langTag` -> **derive** -> `langBase`
    Localizador: `public/js/format.js:L31-L31`.

92. **[renderer/format] `nf`**: `settings.numberFormatting` -> **read** -> `nf`
    Localizador: `public/js/format.js:L32-L32`.

93. **[renderer/format] rama A (existe)**: `nf[langBase]` -> **apply** -> `nf[langBase]`
    Localizador: `public/js/format.js:L33-L33`.

94. **[renderer/format] rama B (no existe)**: hardcoded `{ separadorMiles: '.', separadorDecimal: ',' }` -> **apply** -> `{ separadorMiles: '.', separadorDecimal: ',' }`
    Localizador: `public/js/format.js:L35-L35`.

---

## SECTION 6 - Multi-window semantics (AS-IS): push vs pull

95. **[main/settings] `settings-updated` (SEND #1)**: `settings` -> **send** -> `mainWin.webContents.send('settings-updated', settings)`
    Localizador: `electron/settings.js:L346-L352`.

96. **[main/presets] `settings-updated` (SEND #2)**: `settings` -> **send** -> `mainWin.webContents.send('settings-updated', settings)`
    Localizador: `electron/presets_main.js:L138-L148`.

97. **[mainWin preload] `settings-updated` listener**: `'settings-updated'` -> **receive** -> `ipcRenderer.on('settings-updated', listener)`
    Localizador: `electron/preload.js:L66-L73`.

98. **[mainWin renderer] `onSettingsChanged`**: `window.electronAPI.onSettingsChanged(settingsChangeHandler)` -> **apply** -> `settingsChangeHandler`
    Localizador: `public/renderer.js:L435-L439`.

99. **[mainWin renderer] apply settings-updated**: `newSettings` -> **apply** -> `settingsChangeHandler(newSettings)`
    Localizador: `public/renderer.js:L391-L433`.

100. **[editor preload] settings-updated listener**: `ipcRenderer.on('settings-updated', ...)` -> **receive** -> NOT FOUND
     Localizador: `electron/editor_preload.js:L1-L21`.

101. **[preset preload] settings-updated listener**: `ipcRenderer.on('settings-updated', ...)` -> **receive** -> NOT FOUND
     Localizador: `electron/preset_preload.js:L1-L67`.

102. **[flotante preload] settings-updated listener**: `ipcRenderer.on('settings-updated', ...)` -> **receive** -> NOT FOUND
     Localizador: `electron/flotante_preload.js:L1-L26`.

103. **[language preload] settings-updated listener**: `ipcRenderer.on('settings-updated', ...)` -> **receive** -> NOT FOUND
     Localizador: `electron/language_preload.js:L1-L16`.

104. **[editor preload -> main] `get-settings`**: `ipcRenderer.invoke('get-settings')` -> **send** -> `ipcMain.handle('get-settings')`
     Localizador: `electron/editor_preload.js:L6-L10` + `electron/settings.js:L411-L427`.

105. **[editor renderer] idiomaActual**: `settings.language` -> **assign** -> `idiomaActual`
     Localizador: `public/editor.js:L29-L33`.

106. **[editor renderer] aplicar traducciones**: `idiomaActual` -> **apply** -> `applyEditorTranslations()`
     Localizador: `public/editor.js:L28-L36`.

107. **[preset modal preload -> main] `get-settings`**: `ipcRenderer.invoke('get-settings')` -> **send** -> `ipcMain.handle('get-settings')`
     Localizador: `electron/preset_preload.js:L67-L67` + `electron/settings.js:L411-L427`.

108. **[preset modal renderer] idiomaActual**: `settings.language` -> **assign** -> `idiomaActual`
     Localizador: `public/preset_modal.js:L92-L95`.

109. **[preset modal renderer] aplicar traducciones**: `idiomaActual` -> **apply** -> `applyPresetTranslations(mode)`
     Localizador: `public/preset_modal.js:L104-L121`.

110. **[flotante preload -> main] `get-settings`**: `ipcRenderer.invoke('get-settings')` -> **send** -> `ipcMain.handle('get-settings')`
     Localizador: `electron/flotante_preload.js:L24-L25` + `electron/settings.js:L411-L427`.

111. **[flotante renderer] lang**: `settings.language` -> **assign** -> `lang`
     Localizador: `public/flotante.js:L63-L68`.

112. **[flotante renderer] aplicar traducciones**: `lang` -> **apply** -> `loadRendererTranslations(lang)`
     Localizador: `public/flotante.js:L58-L79`.

---

## SECTION 7 - Event channels (AS-IS): `preset-created`

113. **[main/presets] `preset-created` (SEND #1)**: `preset` -> **send** -> `mainWin.webContents.send('preset-created', preset)`
     Localizador: `electron/presets_main.js:L309-L313`.

114. **[main/presets] `preset-created` (SEND #2)**: `newPreset` -> **send** -> `mainWin.webContents.send('preset-created', newPreset)`
     Localizador: `electron/presets_main.js:L620-L624`.

115. **[mainWin preload] `preset-created` listener**: `'preset-created'` -> **receive** -> `ipcRenderer.on('preset-created', ...)`
     Localizador: `electron/preload.js:L27-L30`.

116. **[mainWin renderer] `onPresetCreated`**: `window.electronAPI.onPresetCreated(...)` -> **apply** -> `preset-created` subscription
     Localizador: `public/renderer.js:L355-L373`.

117. **[mainWin renderer] apply preset-created**: `preset` -> **apply** -> `loadPresets()`
     Localizador: `public/renderer.js:L354-L367`.

118. **[editor preload] preset-created listener**: `ipcRenderer.on('preset-created', ...)` -> **receive** -> NOT FOUND
     Localizador: `electron/editor_preload.js:L1-L21`.

119. **[preset preload] preset-created listener**: `ipcRenderer.on('preset-created', ...)` -> **receive** -> NOT FOUND
     Localizador: `electron/preset_preload.js:L1-L67`.

120. **[flotante preload] preset-created listener**: `ipcRenderer.on('preset-created', ...)` -> **receive** -> NOT FOUND
     Localizador: `electron/flotante_preload.js:L1-L26`.

121. **[language preload] preset-created listener**: `ipcRenderer.on('preset-created', ...)` -> **receive** -> NOT FOUND
     Localizador: `electron/language_preload.js:L1-L16`.
