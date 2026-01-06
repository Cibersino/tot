# Plan “no silence” (idioma) — REPLANTEADO

Este documento ahora tiene **dos objetivos**, en este orden:

0) **Solidificar la cadena de mando del idioma** (reducir fallbacks dispersos y “defaults” locales).  
1) Recién después, ejecutar el plan **“no silence”** (eliminar silencios técnicos y decidir notificaciones al usuario).

La hipótesis es que **muchos “fallbacks” actuales existen porque falta una autoridad única del idioma**, no porque el dominio lo requiera.


## 0) Cadena de mando fundamental (autoridad de arriba hacia abajo)

### 0.1 Definiciones (términos normativos)

* **DEFAULT_LANG**: idioma “de fábrica” (build/instalación).  
  - Debe existir siempre y estar completo en recursos críticos.  
  - Si DEFAULT_LANG no puede cargarse en un subsistema → **falla grave de build/distribución** (no “fallback”).

* **SELECTED_LANG**: idioma elegido por el usuario y persistido en settings.  
  - Debe existir siempre (en runtime) una vez que la app entra a operación normal.
  - En primer arranque, el selector de idioma ocurre antes de que el usuario pueda operar otras ventanas.

* **base(tag)**: versión base del tag (ej.: `es-cl` → `es`).

* **Idioma efectivo por subsistema (EFFECTIVE_LANG[subsystem])**: idioma que el subsistema termina usando para cargar su bundle/config, siguiendo las reglas uniformes de 0.2.

### 0.2 Reglas uniformes por subsistema (bundle vs key)

Regla A — **Carga de bundle** (archivo JSON del subsistema):
1) intentar bundle de `SELECTED_LANG`
2) si falla carga/parse/no existe → intentar `base(SELECTED_LANG)` (si es distinto)
3) si falla → intentar `DEFAULT_LANG`
4) si falla `DEFAULT_LANG` → **fatal (build roto)**

Regla B — **Lookup de keys** (una clave dentro del bundle ya cargado):
1) buscar key en bundle de `EFFECTIVE_LANG[subsystem]`
2) si falta → buscar la misma key en bundle de `DEFAULT_LANG`
3) si falta → usar **hardcoded fallback** (o el “fallback string” ya existente en la llamada)

Nota importante: en lookup de keys **no se cae a base(selected)**. El base se usa solo para resolver “bundle faltante”; para keys faltantes el siguiente escalón es `DEFAULT_LANG`.

### 0.3 Qué significa “fallar” en Nivel 2 (selección inicial)

En esta cadena de mando, “falla” de selección **no significa** “selected incompleto” ni “bundle faltante en subsistemas”.
Significa solo que `SELECTED_LANG` **no coincide** con el tag exacto elegido por el usuario, por dos causas permitidas:

1) **Normalización regional a base**: el usuario eligió `xx-YY`, pero se degrada a `xx` (p.ej. `es-cl` → `es`).  
2) **No selección**: el usuario cierra la ventana sin elegir → `SELECTED_LANG` queda igual al idioma ya vigente (en primer arranque, coincide con DEFAULT_LANG).

En ambos casos, `SELECTED_LANG` existe siempre.

### 0.4 Separación crítica: fallbacks del *selector* vs fallbacks de *idioma*

El selector (ventana + manifest) tiene fallbacks propios (p.ej. lista de idiomas).
Eso **no debe confundirse** con la cadena de mando de idioma (DEFAULT/SELECTED).
El selector solo es el mecanismo para fijar/actualizar `SELECTED_LANG`.


## 1) Distinción “silencioso técnico” vs “silencioso al usuario”

* **Silencioso técnico** = no hay log (warn/error/once) o el log no respeta la política de `log.js`.
* **Silencioso al usuario** = no hay notificación/UI feedback.

Orden de implementación (actualizado):
1) **Fase 0**: alinear el código a la cadena de mando (sección 0) y reducir fallbacks dispersos.
2) **Fase 1**: eliminar silencios técnicos (logs).
3) **Fase 2**: decidir qué casos requieren notificación al usuario.

### 1.1 Default transitorio vs fallback (para evitar ambigüedad)

* **Default transitorio**: valor inicial necesario antes de que exista información (bootstrapping).  
  - Puede loguearse como `info/debug` (o `warnOnce` si se confirma que impacta UX final), pero no necesariamente como `warn`.

* **Fallback**: sustitución/degradación causada por dato inválido/ausente/error.  
  - Regla del plan: **ningún fallback puede ser silencioso técnicamente**.

Regla práctica:
* Si el “default” se usa **porque faltó algo o falló algo**, trátalo como fallback (debe loguear).
* Si es **solo un valor de arranque** y luego se reemplaza al cargar settings, puede tratarse como default transitorio (log opcional, idealmente sin ruido).


## 2) Dónde se ven los logs hoy (canales)

* **Main process** (`electron_log.js`): logs por `console.*` del proceso main (en dev se ven en el terminal).
* **Renderer** (`public_js_log.js`): logs por `console.*` del renderer (en DevTools de esa ventana).

Esto importa porque “no silencioso técnico” puede cumplirse, pero igual “no lo ves” si no abres DevTools de esa ventana.


## 3) Reglas operacionales de logging (alineadas a `log.js`)

Objetivo de fase 1: garantizar cobertura de logs sin destruir la señal.

Reglas mínimas:
* **warn**: degradación recuperable (fallback) con pérdida de intención o calidad.
* **error**: falla que rompe intención del usuario o deja el sistema en estado inesperado.
* **warnOnce/errorOnce**: usar cuando el fallback puede dispararse repetidamente (alta frecuencia).  
  - Requisito: **key estable** (determinística) para deduplicar.

### 3.1 Control de ruido (alta frecuencia)

No loguear “por evento” en callsites de alta frecuencia (p.ej. missing translation key).
Preferir:
* `warnOnce` por “subsystem degraded” (una vez por ventana/idioma/subsistema),
* o agregación (contadores y un único warn en un punto natural), si existe ese punto.


## 4) Checklist de conformidad con la cadena de mando (Fase 0)

Esta sección es la que debe “cerrarse” antes de revisar logs/notificaciones.

### 4.1 Autoridad central (DEFAULT_LANG + SELECTED_LANG)

Requisitos:
* Existe un **DEFAULT_LANG** definido y el build garantiza recursos críticos para ese idioma.
* Existe y se persiste un **SELECTED_LANG**:
  - Primer arranque: se fija antes de que el usuario opere el resto.
  - Runtime: se puede sobrescribir desde el selector.

Invariantes:
* Al entrar a operación normal, el sistema puede afirmar:  
  `DEFAULT_LANG` existe y `SELECTED_LANG` existe.

### 4.2 Regla uniforme de bundle por subsistema

Cada subsistema que carga bundle (menu, renderer translations, etc.) debe aplicar exactamente:
`selected → base(selected) → default → fatal si default falla`

### 4.3 Regla uniforme de keys por subsistema

Cada lookup debe aplicar exactamente:
`effective → default → hardcoded`

y evitar:
* “key fallback” hacia `base(selected)` (eso solo aplica en carga de bundle).

### 4.4 Eliminación de “defaults” locales dispersos

Objetivo: que ventanas/módulos no inventen su propio “idioma por defecto” salvo como **fallback explícito al DEFAULT_LANG** (y logueado cuando corresponde).

Esto apunta a reducir el inventario de “fallbacks” a unos pocos puntos controlados.


## 5) Inventario (actual) — reetiquetado para Fase 0 + Fase 1

El inventario se mantiene, pero ahora cada ítem se evalúa en 2 ejes:

* **Modelo (Fase 0)**:
  - **CONFORME**: encaja con la cadena (sección 0).
  - **DRIFT**: es un default/fallback local que debería colapsar hacia el modelo.
  - **ESPECÍFICO (selector)**: pertenece al selector/manifest, no al idioma del sistema.

* **Logging (Fase 1)**:
  - **OK / PARCIAL / SILENCIOSO** como antes.

### Grupo A — Selector de idioma (manifest + ventana)  [ESPECÍFICO selector]

**A1. Manifest IPC fallback (main.js / get-available-languages)**  
* Rol: alimentar selector, no fijar idioma del sistema.  
* Logging: **OK** (warn/error según caso)  
* Modelo: **ESPECÍFICO (selector)**

**A1b. Manifest sanitization (main.js / get-available-languages)**  
* Disparador: entradas inválidas se filtran (degradación parcial).  
* Logging: **SILENCIOSO**  
* Modelo: **ESPECÍFICO (selector)**  
* Nota: decidir `warnOnce` global (“manifest contains invalid entries”), sin spam por entrada.

**A2. Picker fallback (language_window.html / loadLanguages)**  
* Disparador: IPC falla/throw o retorno vacío/invalid sin throw.  
* Logging: **PARCIAL** (OK en throw; SILENCIOSO en “vacío sin throw”)  
* Modelo: **ESPECÍFICO (selector)**  
* Nota: el selector debería loguear también cuando cae a fallback por retorno vacío/invalid sin throw.

### Grupo B — Autoridad de idioma (DEFAULT/SELECTED)  [Fase 0 central]

**B1. setCurrentLanguage inválido/vacío (main.js)**  
* Logging: **OK** (warnOnce)  
* Modelo: **DRIFT** si “fuerza 'es'” está hardcoded en vez de depender de DEFAULT_LANG.  
  - Objetivo Fase 0: que el fallback sea a DEFAULT_LANG (no a literal).

**B2. default temprano `currentLanguage='es'` y `settings.language || 'es'` (main.js)**  
* Logging: **SILENCIOSO**  
* Modelo: **DRIFT** (hardcode y ambigüedad default transitorio vs fallback).  
  - Objetivo Fase 0: expresar explícitamente DEFAULT_LANG y distinguir bootstrapping vs fallback.

**B3. Cierre de ventana de idioma sin seleccionar (settings.js / applyFallbackLanguageIfUnset)**  
* Logging: **OK**  
* Modelo: **CONFORME** si aplica “no selección ⇒ selected queda como estaba (en primer arranque: default)”.  
  - Revisar que el comportamiento sea exactamente ese (y que el fallback sea a DEFAULT_LANG, no literal).

**B4. get-settings IPC fallback (settings.js)**  
* Logging: **OK**  
* Modelo: **DRIFT** si retorna language `'es'` literal; debería referenciar DEFAULT_LANG.

**B5. set-language: menuLang fallback (settings.js)**  
* Logging: **SILENCIOSO**  
* Modelo: **DRIFT** (fallback degradante sin rastro; además suele estar hardcoded a 'es').

**B6. normalizeSettings: langBase fallback a 'es' (settings.js)**  
* Logging: **SILENCIOSO**  
* Modelo: **DRIFT** si hardcodea 'es' en vez de DEFAULT_LANG/base(DEFAULT_LANG).

### Grupo C — Subsistema menú (menu_builder)  [Reglas 0.2]

**C1. JSON vacío/parse error (menu_builder.js)**  
* Logging: **OK**  
* Modelo: **PARCIAL/DRIFT** hasta confirmar que el chain es `selected → base → default` (y no otros defaults dispersos).

**C2. “archivo no existe” en candidato (menu_builder.js)**  
* Logging: **PARCIAL**  
* Modelo: **DRIFT** si el chain no coincide exactamente con 0.2 o si “missing asset” no está observado.

**C3. lang inválido → 'es' (loader) (menu_builder.js)**  
* Logging: **SILENCIOSO**  
* Modelo: **DRIFT** (debe resolverse contra DEFAULT_LANG).

**C4. effectiveLang fallback a 'es' (menu_builder.js)**  
* Logging: **SILENCIOSO**  
* Modelo: **DRIFT** si no usa DEFAULT_LANG.

**C5. Key missing → hardcoded labels (menu_builder.js)**  
* Logging: **SILENCIOSO**  
* Modelo: **PARCIAL**: debería ser `effective → default → hardcoded` con control de ruido (warnOnce agregado), no por key.

### Grupo D — Subsistema renderer translations (i18n.js / notify.js)  [Reglas 0.2]

**D1. excepción fetch/parse (i18n.js)**  
* Logging: **OK**  
* Modelo: **PARCIAL** hasta confirmar chain `selected → base → default`.

**D2. 404/no ok (i18n.js)**  
* Logging: **PARCIAL**  
* Modelo: **DRIFT/PARCIAL** (falta observabilidad de “missing asset”, y chain debe alinearse a 0.2).

**D2b. lang inválido → 'es' (i18n.js)**  
* Logging: **SILENCIOSO**  
* Modelo: **DRIFT** (debe caer a DEFAULT_LANG).

**D3/D4. tRenderer/msgRenderer fallback (i18n.js)**  
* Logging: **SILENCIOSO**  
* Modelo: **PARCIAL**: el lookup debería ser `effective → default → hardcoded`, con control de ruido (warnOnce agregado), no por llamada.

**D5. notify fallback a key (notify.js)**  
* Logging: **SILENCIOSO**  
* Modelo: **PARCIAL**: debería emitir `warnOnce` cuando detecta “i18n missing/degraded”, sin spam.

### Grupo E — Formato numérico  [debería alinearse a DEFAULT/SELECTED]

**E1. numberFormat defaults (settings.js)**  
* Logging: **OK**  
* Modelo: **PARCIAL** (confirmar que el fallback final sea DEFAULT_LANG/base(DEFAULT_LANG)).

**E2. renderer number formatting fallback (format.js)**  
* Logging: **SILENCIOSO**  
* Modelo: **DRIFT** si hardcodea 'es' o separadores sin referenciar DEFAULT_LANG.

### Grupo F — Conteo/segmentación  [debería confiar en SELECTED + DEFAULT]

**F1. count: idioma default 'es' (count.js)**  
* Logging: **SILENCIOSO**  
* Modelo: **DRIFT** si hardcodea 'es' en vez de DEFAULT_LANG o de un idioma efectivo del sistema.

**F2. falta Intl.Segmenter (count.js)**  
* Logging: **SILENCIOSO**  
* Modelo: **NO-IDIOMA** (esto es fallback de plataforma, no de idioma; se mantiene en el inventario porque impacta comportamiento lingüístico).

### Grupo G — Ventanas/consumidores (renderer/editor/preset_modal/presets)

Estos ítems suelen ser **síntomas** de falta de autoridad central (defaults locales).

**G1/G2/G3. renderer: idiomaActual = 'es' por default (renderer.js)**  
* Logging: **SILENCIOSO**  
* Modelo: **DRIFT** (debería depender de SELECTED/DEFAULT provistos por settings; si falla IPC → DEFAULT_LANG explícito).

**G4. editor: defaults a 'es' (editor.js)**  
* Logging: **SILENCIOSO**  
* Modelo: **DRIFT**

**G5. preset_modal: default 'es' + getSettings failure (preset_modal.js)**  
* Logging: **OK** para el fallo, pero default ‘es’ sigue **SILENCIOSO**  
* Modelo: **DRIFT** si hardcodea.

**G6/G6b. presets: base fallback + safe defaults (presets.js)**  
* Logging: **SILENCIOSO**  
* Modelo: **DRIFT** si la seguridad depende de literales 'es' en vez de DEFAULT_LANG.

**G7. presets_main: fallbacks de textos “FALLBACK: …”**  
* Logging: **SILENCIOSO**  
* Modelo: **PARCIAL**: son hardcoded fallbacks válidos, pero deben alinearse a `effective → default → hardcoded` y dejar rastro técnico (sin spam).


## 6) Plan de ejecución (reordenado)

### 6.0 Fase 0 — Solidificar cadena de mando (antes de logs)

Meta: reducir dispersión y alinear subsistemas a la regla uniforme.

Entregables:
* Definir/centralizar DEFAULT_LANG (sin literales “es” dispersos como autoridad).
* Garantizar existencia de SELECTED_LANG (primer arranque + runtime).
* Implementar por subsistema:
  - resolver bundle: `selected → base → default → fatal`
  - resolver keys: `effective → default → hardcoded`
* Colapsar defaults locales (renderer/editor/modal/presets) hacia la autoridad central.

### 6.1 Fase 1 — Logs (no silencios técnicos)

Tu propuesta original se mantiene, pero solo después de Fase 0:
1) agregar logs faltantes,
2) evaluar/corregir logs existentes.

Regla de operación:
* Usar Codex para implementar cambios con cobertura y sin olvidos.
* Después de cada operación: revisión humana + actualizar este documento (estado Modelo + estado Logging).

### 6.2 Fase 2 — Notificaciones al usuario

Se decide después de:
* tener la cadena de mando estable,
* y tener observabilidad técnica completa.

Casos prioritarios (se mantienen):
1) Usuario cierra ventana sin elegir idioma.
2) Usuario elige idioma X pero queda idioma Y (requiere observar “requested X vs effective Y”).

