# Plan "no silence"

## 1) Distinción “silencioso técnico” vs “silencioso al usuario”

* **Silencioso técnico** = no hay log (warn/error/once) o el log no respeta la política de `log.js`.
* **Silencioso al usuario** = no hay notificación/UI feedback.

Orden de implementación del plan:
1. primero eliminar silencios técnicos,
2. después decidir qué casos requieren notificación.

### 1.1 Default transitorio vs fallback (para evitar ambigüedad)

Para este plan distinguimos:

* **Default transitorio**: valor inicial necesario antes de que exista información (p.ej. antes de cargar settings). No es “recuperación” ante un error; es *bootstrapping*.  
  - Puede ser deseable loguearlo como `info`/`debug` (o `warnOnce` si se usa como “degradación real”), pero no necesariamente como `warn` en todos los casos.

* **Fallback**: sustitución/degradación causada por dato inválido/ausente/error (p.ej. `normalizeLangTag` vacío, assets i18n faltantes, parse error, IPC falla, etc.).  
  - Regla del plan: **ningún fallback puede ser silencioso técnicamente**.

Regla práctica:
* Si el “default” se usa **porque faltó algo o falló algo**, trátalo como fallback (debe loguear).
* Si es **solo un valor de arranque** y luego se reemplaza al cargar settings, puede tratarse como default transitorio (log opcional, idealmente sin ruido).

## 2) Dónde se ven los logs hoy (canales)

* **Main process** (`electron_log.js`): logs se ven por `console.*` del proceso main. En desarrollo normalmente se ven en el **terminal** desde donde se lanza Electron.
* **Renderer** (`public_js_log.js`): logs salen por `console.*` del renderer. Se ven en la **consola de DevTools** de esa ventana (por ejemplo, la ventana de idioma tiene su propia consola).

Esto importa porque “no silencioso técnico” puede cumplirse, pero igual “no lo ves” si no abres DevTools de esa ventana. Eso es distinto de “no hay log”.

## 3) Reglas operacionales de logging (alineadas a `log.js`)

Objetivo de fase 1: garantizar **cobertura de logs** sin destruir la señal (evitar spam).

Reglas mínimas:

* **warn**: degradación recuperable (fallback) que no aborta flujo, pero implica pérdida de intención o pérdida de calidad.
* **error**: falla que rompe intención del usuario o deja el sistema en estado inesperado (requiere rollback o ruta alternativa).
* **warnOnce/errorOnce**: usar cuando el fallback puede dispararse repetidamente (alta frecuencia) y spamear.  
  - Requisito: **key estable** (determinística) que permita deduplicar.

### 3.1 Control de ruido (alta frecuencia)

Hay fallbacks que pueden ocurrir cientos/miles de veces (p.ej. “missing translation key” o `tRenderer` devolviendo fallback).

Regla del plan:
* No loguear “por evento” en callsites de alta frecuencia.
* Preferir:
  - `warnOnce` por “subsystem degraded” (p.ej. “renderer translations missing; falling back to hardcoded strings”),
  - `warnOnce` por “bundle cargado pero faltan claves” (p.ej. una sola vez por ventana/idioma),
  - o agregación (contar eventos en memoria y emitir un solo warn al final de la operación; solo si existe un punto natural).

Esto mantiene “no silencio técnico” sin arruinar los logs.

## 4) Inventario de fallbacks relacionados con idioma (con estado de logging)

Formato copy/paste (sin tabla). Marco:

* **OK** = ya tiene logs (warn/error/once) en ruta de fallback.
* **PARCIAL** = loguea solo algunos subcasos; hay rutas de fallback sin log.
* **SILENCIOSO** = cae a fallback sin log.

### Grupo A — Selector de idioma (manifest + ventana)

**A1. Manifest IPC fallback (main.js / get-available-languages)**

* Disparador: `languages.json` faltante/ilegible; JSON inválido; array vacío/entradas inválidas
* Fallback: devuelve `FALLBACK_LANGUAGES`
* Logging: **OK** (warn/warn/error según caso)
* Visibilidad: **usuario sí** (lista reducida), **técnico en terminal**

**A2. Picker fallback (language_window.html / loadLanguages)**

* Disparador: `getAvailableLanguages` no existe / lanza error / devuelve vacío; `loadLanguages()` falla
* Fallback: `fallbackLanguages` (lista reducida)
* Logging: **OK** (`log.error(...)`)
* Visibilidad: **usuario sí**, **técnico en DevTools del picker**

### Grupo B — Estado de idioma en main/settings

**B1. setCurrentLanguage inválido/vacío (main.js)**

* Disparador: lang no-string / trim vacío
* Fallback: fuerza `'es'`
* Logging: **OK** (`warnOnce(...)`)
* Visibilidad: usuario sí (menu en español), técnico en terminal

**B2. default temprano `currentLanguage='es'` y `settings.language || 'es'` (main.js)**

* Disparador: settings.language falsy (antes de abrir picker)
* Tipo: **default transitorio** (aunque luego se abre picker) o **fallback** si termina afectando UX final
* Logging: **SILENCIOSO**
* Nota: decisión pendiente: si se considera fallback (por “falta de settings.language”), debe loguear (probablemente `warnOnce` para no spamear). Si se considera default transitorio, el log puede ser opcional (`info/debug`) o `warnOnce` solo si persiste/impacta.

**B3. Cierre de ventana de idioma sin seleccionar (settings.js / applyFallbackLanguageIfUnset)**

* Disparador: `settings.language` sigue unset cuando se cierra picker
* Fallback: persiste `'es'` (o fallbackLang configurado)
* Logging: **OK** (`warnOnce` al aplicar + `error` si falla)
* Visibilidad: usuario sí (termina en español), técnico en terminal

**B4. get-settings IPC fallback (settings.js)**

* Disparador: excepción al servir `get-settings`
* Fallback: settings seguros con `language:'es'`
* Logging: **OK** (`errorOnce`)
* Visibilidad: usuario sí (renderers reciben default), técnico en terminal

**B5. set-language: menuLang fallback (settings.js / handler set-language)**

* Disparador: `normalizeLangTag` produce vacío
* Fallback: `menuLang='es'` para reconstruir menú
* Logging: **SILENCIOSO**
* Esto es un fallback degradante y hoy no deja rastro.

**B6. normalizeSettings: langBase fallback a 'es' (settings.js)**

* Disparador: `settings.language` inválido/vacío al normalizar settings
* Fallback: `langBase='es'` para presets_by_language y numberFormatting
* Logging: **SILENCIOSO**
* Relevante porque puede ocultar que `settings.language` está malformado.

### Grupo C — Traducciones de menú (main/menu_builder)

**C1. loadMainTranslations: JSON vacío/parse error (menu_builder.js)**

* Disparador: archivo existe pero JSON vacío / parse falla
* Fallback: intenta base / es; si todo falla devuelve `{}` (y el menú cae a hardcoded labels)
* Logging: **OK** (warnOnce en esos casos)

**C2. loadMainTranslations: “archivo no existe” en un candidato (menu_builder.js)**

* Disparador: falta `i18n/<lang>/main.json` para el lang solicitado o para el base
* Fallback: prueba siguiente candidato silenciosamente; solo loguea cuando ninguno carga
* Logging: **PARCIAL** (puede haber fallback “requested -> base” sin log)
* Requiere un log del tipo “asset missing; using fallback candidate”. Debe cuidarse el ruido (idealmente `warnOnce` por idioma/candidato).

**C3. effectiveLang fallback a 'es' (menu_builder.js)**

* Disparador: lang inválido
* Fallback: usa `'es'`
* Logging: **SILENCIOSO**

**C4. Key missing -> hardcoded labels (menu_builder.js)**

* Disparador: falta clave en translations
* Fallback: etiqueta hardcodeada
* Logging: **SILENCIOSO** (y puede ser masivo si faltan muchas claves)
* Requiere control de ruido: no log por key; preferir `warnOnce` agregada por “missing keys in main.json”.

### Grupo D — Traducciones renderer (i18n.js / notify.js)

**D1. loadRendererTranslations: excepción de fetch/parse (i18n.js)**

* Disparador: error real (throw)
* Fallback: intenta chain; si falla retorna null
* Logging: **OK** para excepciones

**D2. loadRendererTranslations: 404/no ok (i18n.js)**

* Disparador: recurso no existe (resp.ok false)
* Fallback: intenta siguiente candidato; si ninguno, retorna null
* Logging: **PARCIAL** (no log en “missing asset”)
* Requiere un log del tipo “asset missing; using fallback candidate”, cuidando el ruido (idealmente `warnOnce` por idioma/candidato/ventana).

**D3. tRenderer fallback string (i18n.js)**

* Disparador: clave inexistente o path inválido
* Fallback: retorna fallback provisto
* Logging: **SILENCIOSO**
* Alta frecuencia: preferir `warnOnce` a nivel “subsystem degraded” o agregación, no por llamada.

**D4. msgRenderer fallback (i18n.js)**

* Disparador: traducción vacía/falsy
* Fallback: retorna fallback provisto
* Logging: **SILENCIOSO**
* Alta frecuencia: mismo criterio que D3.

**D5. notify: fallback a key (notify.js)**

* Disparador: no existe `RendererI18n.msgRenderer` o retorna falsy
* Fallback: retorna la key literal
* Logging: **SILENCIOSO**
* Alta frecuencia potencial: preferir `warnOnce` cuando notify detecta “i18n missing”.

### Grupo E — Formato numérico

**E1. numberFormat defaults (settings.js)**

* Disparador: schema inválido / parse error / falta defaults / no se puede asegurar numberFormatting[base]
* Fallback: separadores por defecto
* Logging: **OK** (warnOnce en “usando fallback”)

**E2. renderer number formatting fallback (format.js)**

* Disparador: idioma vacío o falta `settingsCache.numberFormatting[lang]`
* Fallback: usa base 'es' y separadores default
* Logging: **SILENCIOSO**

### Grupo F — Conteo/segmentación

**F1. count: idioma default 'es' (count.js)**

* Disparador: opts.idioma falsy
* Fallback: usa 'es'
* Logging: **SILENCIOSO**

**F2. count: falta Intl.Segmenter (count.js)**

* Disparador: entorno sin Segmenter
* Fallback: regex
* Logging: **SILENCIOSO**

### Grupo G — Renderers específicos (renderer/editor/preset_modal/presets)

**G1. renderer: idiomaActual inicial 'es' (renderer.js)**

* Disparador: arranque antes de settings / o settings faltante
* Tipo: default transitorio o fallback (según impacto final)
* Fallback: 'es'
* Logging: **SILENCIOSO**

**G2. renderer: post getSettings -> language faltante (renderer.js)**

* Disparador: settingsCache.language falsy
* Fallback: 'es'
* Logging: **SILENCIOSO**

**G3. renderer: settings-updated -> language faltante (renderer.js)**

* Disparador: settingsCache.language falsy
* Fallback: 'es'
* Logging: **SILENCIOSO**

**G4. editor: idiomaActual default 'es' / target 'es' en ensureEditorTranslations (editor.js)**

* Disparador: settings.language faltante
* Fallback: 'es'
* Logging: **SILENCIOSO**

**G5. preset_modal: default 'es' + getSettings failure (preset_modal.js)**

* Disparador: getSettings falla (error real)
* Fallback: mantiene idiomaActual
* Logging: **OK** para el fallo (warnOnce)
* Pero el default ‘es’ como fallback de idioma: **SILENCIOSO** (si se considera fallback y no solo default transitorio)

**G6. presets.js: base-language fallback a 'es' (presets.js)**

* Disparador: settings.language missing/invalid
* Fallback: langBase 'es'
* Logging: **SILENCIOSO**

**G7. presets_main: fallbacks de textos de diálogos (“FALLBACK: …”)**

* Disparador: faltan traducciones/dialog texts
* Fallback: strings hardcodeadas
* Logging: **SILENCIOSO**
* Alta frecuencia baja (dialogs puntuales), pero igualmente no debería ser silencioso técnicamente.

## 5) Plan de ejecución (Fase 1 logs)

Tu propuesta: dividir fase 1 en (1A) agregar logs faltantes y (1B) evaluar/corregir logs existentes.

Regla de operación:
* Usar Codex para implementar cambios con cobertura y sin olvidos.
* Después de cada operación: revisión humana + **actualizar este documento** (inventario OK/PARCIAL/SILENCIOSO).

### 5.1 Fase 1A — Cobertura (agregar logs faltantes)

Cola por archivo (prioridad sugerida por impacto y “centralidad” del idioma):

1) `settings.js`:
* B2, B5, B6

2) `menu_builder.js`:
* C2, C3, C4 (con control de ruido)

3) `i18n.js`:
* D2, D3, D4 (con control de ruido)

4) `notify.js`:
* D5 (con control de ruido)

5) `format.js`:
* E2

6) `count.js`:
* F1, F2

7) `renderer.js`:
* G1, G2, G3

8) `editor.js`:
* G4

9) `preset_modal.js`:
* G5 (solo lo “default es” si se decide tratarlo como fallback)

10) `presets.js`:
* G6

11) `presets_main.js`:
* G7

### 5.2 Fase 1B — Calidad (corregir logs existentes)

Revisar y corregir donde sea necesario:

* Nivel correcto (warn vs error)
* Uso consistente de `warnOnce`/`errorOnce` con key estable (evitar spam)
* Mensajes con contexto mínimo: idioma solicitado, idioma aplicado, asset/ruta faltante, operación (IPC/menu/render)
* Coherencia con política declarada en `electron_log.js` / `public_js_log.js`

## 6) Dos casos de notificación al usuario prioritarios (Fase 2)

1. **Usuario cierra ventana sin elegir idioma**: hoy cae en `applyFallbackLanguageIfUnset` y **sí loguea**; falta decidir mecanismo de notificación.
2. **Usuario elige idioma X, pero queda idioma Y**: hoy esto no se detecta de forma explícita como “inconsistencia”. Se puede dar por:
   * manifest ofrece tags que luego no tienen assets (renderer/menu) y el sistema cae a defaults sin avisar (mantiene idioma cargado o produce idioma base o default o ‘es’),
   * normalización/validación mantiene idioma ya cargado o produce idioma base o default o ‘es’.

Para notificar esto con rigor, primero necesitas que el sistema pueda **observar** “se solicitó X” vs “se aplicó realmente Y” (y que eso emita log/flag).
