# Contrato TO-BE del subsistema de idioma (Language System) — Especificación conceptual

**Estado:** Normativo (TO-BE)  
**Propósito:** fijar un contrato conceptual único para no volver a perder contexto y para guiar cambios por capas sin introducir legacy.

---

## 1) Alcance

Este contrato define el comportamiento deseado (TO-BE) para:

1. Selección y persistencia de idioma (primer arranque + runtime) y su fallback.
2. Resolución de traducciones UI:
   - Menú (main process) — bundle `main.json`.
   - UI principal y otras UIs renderer — bundle `renderer.json` (u otros bundles equivalentes por subsistema).
3. Formato numérico dependiente de idioma (`numberFormat.json` / `numberFormatting`).
4. Propagación multi-ventana de cambios de settings que afecten idioma (push/pull + suscripción).
5. Presets **solo** en lo que sea:
   - indexación por idioma,
   - defaults por idioma,
   - persistencia de “preset seleccionado” por idioma,
   - refresh y canales de evento asociados.
6. `modeConteo` en lo que afecta **representación dependiente de idioma** (sin acoplar presets).

**Fuera de alcance:**
- Cronómetro/flotante como feature en sí (salvo si muestra strings/formatos dependientes de idioma).
- Clipboard, current-text, y comportamiento UI genérico no relacionado con idioma.
- Reglas de cálculo internas no vinculadas a representación (salvo interacción con `modeConteo` en la sección 7).

---

## 2) Objetivo de alto nivel

Garantizar que **toda decisión dependiente de idioma** (strings, formato numérico, presets por idioma, selección de preset por idioma, representación de resultados) responda a un **contrato uniforme**, con:

- cadena de mando clara (DEFAULT vs SELECTED),
- una clave canónica única para indexación por idioma (`langKey`),
- reglas consistentes para carga de bundles y lookup de keys (Regla A / Regla B),
- propagación runtime verificable (sin “push fantasma”),
- ausencia de “silencios técnicos” en fallbacks relevantes,
- persistencia compatible con el comportamiento actual (sin pérdida de datos del usuario).

---

## 3) Definiciones normativas

### 3.1 Idiomas

- **DEFAULT_LANG**  
  Idioma garantizado por el build/distribución. Debe poder cargarse siempre.  
  Si DEFAULT_LANG no puede cargarse (bundle obligatorio no disponible/ilegible), es **falla fatal** de distribución/build (no es un fallback “normal”).

- **SELECTED_LANG**  
  Idioma persistido por el usuario en settings. En operación normal **nunca** debe estar vacío.

- **normalize(tag)**  
  Normalización canónica de tags (p.ej., casing, separadores). Retorna un tag válido o una señal de invalidez.

- **langTag**  
  Tag normalizado que representa el idioma efectivo elegido (derivado desde SELECTED_LANG).

- **langKey (clave canónica por idioma)**  
  Clave única usada para indexación “por idioma” en settings y recursos (equivalente funcional de `langBase` actual, pero el nombre y la implementación pueden cambiar).  
  **Regla:** `langKey` se deriva por una función única y centralizada; ningún subsistema recomputa su propia variante.

> Nota: El contrato permite que `langKey` sea equivalente a “base(tag)” hoy, pero no obliga a conservar el nombre `langBase`. Lo que se exige es **equivalencia funcional**, **centralización** y **compatibilidad con datos persistidos existentes** (sección 4.4).

---

## 4) Cadena de mando (autoridad) — invariantes

### 4.1 Autoridad única de idioma
- La fuente de verdad del idioma en runtime es **SELECTED_LANG persistido** (settings).
- No debe existir un estado paralelo que pueda divergir (p.ej. `currentLanguage` no autoritativo fuera de settings).

### 4.2 SELECTED_LANG nunca vacío
- Primer arranque: si el usuario no elige idioma, el sistema persiste `SELECTED_LANG = DEFAULT_LANG`.
- Runtime: si el usuario intenta setear un idioma inválido, `SELECTED_LANG` no se degrada a vacío; se mantiene el valor anterior o se aplica un fallback controlado (sin silencios técnicos).

### 4.3 Derivación única de `langKey`
- Toda indexación por idioma (presets, formato numérico, selección de preset, etc.) usa `langKey` derivado de SELECTED_LANG mediante una función/contrato único.

### 4.4 Persistencia y rol de `config/*.json` (mantener AS-IS adaptado)

#### 4.4.1 Raíz de persistencia (carpeta `config/`)
- La persistencia de la app vive en archivos JSON bajo una carpeta de configuración (p.ej. `config/`).
- Este contrato trata la persistencia de idioma **como parte del archivo de settings del usuario** (p.ej. `user_settings.json`), sin imponer cambios de arquitectura en el resto de archivos JSON.

#### 4.4.2 Autoridad y “default transitorio” vs “persistencia”
- Los valores default usados para arrancar UI antes de leer settings son **transitorios** (no autoritativos).
- Un fallback que forme parte del contrato (p.ej. “si no hay idioma persistido, persistir DEFAULT”) **sí** debe materializarse en el archivo de settings para eliminar ambigüedad futura (SELECTED_LANG nunca vacío).
- “DEFAULT_LANG” es una garantía del build (no depende de config). El config solo persiste el **SELECTED_LANG** del usuario.

#### 4.4.3 Claves de settings que participan en el subsistema de idioma
Para mantener el comportamiento actual, el contrato exige preservar (o migrar sin pérdida) las claves existentes que modelan:

- **Idioma seleccionado**
  - Una clave persistida para `SELECTED_LANG` (tag) en el archivo de settings.
  - La normalización/validación se aplica al leer/escribir; el valor persistido no debe quedar vacío.

- **Indexación por idioma (colecciones y selecciones por idioma)**
  - Presets de usuario por `langKey`.
  - Defaults por `langKey` (aunque su fuente pueda no vivir en settings; su *selección* sí depende de idioma).
  - Preset seleccionado por `langKey` (persistido por idioma).
  - Cualquier lista “disabled_default_presets” (si existe en el comportamiento actual) también por `langKey`.

- **Formato numérico**
  - `numberFormatting` (o estructura equivalente) indexada por `langKey`.

- **`modeConteo`**
  - Persistido en settings como una preferencia independiente del idioma, pero su representación (números/strings) debe respetar el idioma vigente.

> Regla: el contrato fija **semántica**. El nombre exacto de cada clave puede mantenerse tal cual exista hoy. Si una clave cambia de nombre/estructura, debe existir migración (sección 4.4.4) sin pérdida de datos.

#### 4.4.4 Compatibilidad hacia atrás y migración de datos (obligatorio si cambia `langKey`/esquema)
- La adopción de `langKey` centralizado no puede “desconectar” datos persistidos existentes indexados por el esquema anterior.
- Para mantener el comportamiento actual:
  - O bien `langKey` produce exactamente las mismas claves que el esquema actual para los idiomas existentes del usuario,
  - O bien se implementa una migración determinista que re-mapea los buckets por idioma al nuevo `langKey` (presets, selección, disabled, numberFormatting).
- Lectura robusta:
  - claves ausentes se inicializan explícitamente con defaults coherentes,
  - claves desconocidas no se destruyen (preservación forward-compat),
  - normalización de tipos/shape al cargar settings es obligatoria para evitar “estado medio válido” silencioso.

---

## 5) Reglas uniformes de traducción: Regla A y Regla B

### 5.1 Regla A — Carga de bundle (por subsistema)
Para cada subsistema de traducción (p.ej., menú, renderer principal, editor, modal, etc.):

1) Cargar **bundle DEFAULT** (obligatorio).  
2) Intentar bundle **SELECTED**; si no existe/fracasa, intentar **equivalente base** del seleccionado (vía la lógica centralizada); si falla, usar overlay vacío.  
3) Establecer un mecanismo de resolución efectivo (por merge/overlay o por doble lookup centralizado) que mantenga la prioridad:
   - overlay (selected/base) sobre default.

### 5.2 Regla B — Lookup de keys (por subsistema)
Para resolver una key:

1) Buscar key en el mecanismo efectivo (selected/base sobre default).  
2) Si falta incluso ahí, usar fallback hardcoded (último recurso).

**Invariante:** una key faltante en selected/base **no** debe producir hardcoded si esa key existe en DEFAULT.

---

## 6) Propagación runtime (transport) — invariantes

### 6.1 Semántica de actualización
Ante cualquier cambio de settings que afecte idioma (p.ej. cambio de SELECTED_LANG):

- settings se actualiza/persiste (archivo de settings en `config/`),
- se emite un evento de actualización (p.ej., `settings-updated`),
- y las ventanas relevantes deben **estar suscritas** para ejecutar su rutina de “aplicar settings”.

### 6.2 Pull inicial + suscripción
Cada ventana relevante cumple:

- **Pull inicial:** al abrir/crear, obtiene settings y deriva `langTag/langKey` aplicables.
- **Suscripción runtime:** escucha cambios de settings para re-aplicar idioma/recursos sin requerir reinicio.

### 6.3 Qué “re-aplicar” significa (mínimo)
Cuando una ventana aplica idioma (por startup o update):

1) Re-cargar traducciones del subsistema (Regla A/B).
2) Re-aplicar strings en el DOM/menú según corresponda.
3) Re-evaluar formato numérico (separadores) en función de `langKey` y settings.
4) Si la ventana muestra presets, refrescar la vista de presets según `langKey`.
5) Re-renderizar resultados cuya **representación** depende de idioma/formatos.

---

## 7) `modeConteo` — interacción con idioma (sin acoplar presets)

### 7.1 Independencia estructural
- Ningún preset depende de `modeConteo` como “configuración por preset”.
- `modeConteo` solo influye en el cálculo del resultado, no en la estructura/selección de presets.

### 7.2 Requisitos de representación
- Cambios de idioma deben actualizar:
  - strings,
  - formato numérico,
  - representación de resultados (si cambia separador decimal/miles u otros aspectos de formato).
- Cambios de `modeConteo` deben actualizar el resultado, y su representación debe respetar el formato vigente del idioma.

---

## 8) Presets — contrato TO-BE cerrado (mantener AS-IS adaptado)

### 8.1 Presets de usuario por idioma
- Los presets de usuario se almacenan/organizan por `langKey` (persistencia en settings).
- Cambiar idioma cambia el conjunto de presets de usuario visibles/operativos para esa ventana.

### 8.2 Defaults por idioma
- Los “default presets” se obtienen por idioma (`langKey`) y constituyen el baseline por idioma.
- Si existe una estructura de “defaults deshabilitados” persistida (AS-IS), debe permanecer indexada por `langKey`.

### 8.3 Preset seleccionado por idioma
- El “preset seleccionado” se persiste por `langKey` en el archivo de settings, manteniendo el comportamiento actual.
- Cambiar idioma cambia el preset activo al correspondiente a ese `langKey`.

### 8.4 Refresh y eventos
- Los eventos relacionados con presets (crear/editar/borrar/restaurar defaults) disparan refresh **solo** en ventanas que muestran/controlan presets.
- Si el preset seleccionado para un `langKey` deja de existir (delete/restore), se aplica una política de fallback explícita y observable (p.ej., seleccionar un default) evitando estado “sin selección” en silencio.

---

## 9) Formato numérico — contrato TO-BE

### 9.1 Fuente y fallback
- El formato numérico efectivo debe derivarse de `langKey` (y, si corresponde, de DEFAULT_LANG como fallback).
- No deben existir fallbacks silenciosos “locales” en múltiples puntos; el comportamiento y el logging deben ser coherentes con la política “no silencios técnicos”.

### 9.2 Consistencia multi-ventana
- Toda ventana que muestra números debe usar el mismo criterio de formato (mismo origen lógico: settings + `langKey`).
- Cambios de idioma deben provocar que la ventana re-derive separadores y re-renderice representaciones numéricas.

---

## 10) Observabilidad y política “no silencios” (principio)

### 10.1 Silencio técnico vs silencio al usuario
- Primero se elimina el silencio técnico: fallbacks relevantes deben ser trazables (log/telemetría local) donde corresponda.
- Las decisiones de notificación al usuario se aplican después y solo donde agreguen valor.

### 10.2 Falla fatal
- Falla al cargar recursos obligatorios de DEFAULT_LANG (bundles requeridos) es una falla fatal de distribución/build, no un fallback normal.

---

## 11) Criterios de aceptación (comportamiento observable)

Se considera “cumplido” el contrato cuando, como mínimo:

1) **SELECTED_LANG nunca queda vacío** (primer arranque y runtime) y queda persistido en settings.
2) Cambiar idioma en runtime actualiza **sin reinicio**:
   - menú,
   - UI principal,
   - ventanas secundarias relevantes (al menos: editor/modal/flotante si muestran strings/formatos).
3) Para cada subsistema de strings:
   - bundle DEFAULT siempre disponible,
   - keys faltantes en selected/base caen a DEFAULT (no a hardcoded).
4) Formato numérico coherente:
   - separadores correctos por idioma,
   - sin divergencias entre ventanas.
5) Presets:
   - listas por idioma (`langKey`) sin pérdida de datos previos,
   - defaults por idioma,
   - preset seleccionado por idioma persistente,
   - refresh correcto ante crear/editar/borrar/restaurar, sin estado inválido silencioso.
6) `modeConteo`:
   - no altera el modelo de presets,
   - recalcula resultados; el render respeta formato vigente del idioma.
7) Compatibilidad de persistencia:
   - ningún cambio de `langKey`/esquema rompe presets existentes, selecciones existentes o `numberFormatting` ya guardado.

---

## 12) Secuencia recomendada de implementación (gates conceptuales, no código)

1) **Mapa AS-IS** completo y evidenciado (artefacto de apoyo).
2) **Autoridad única**: eliminar estados paralelos de idioma; settings manda.
3) **Persistencia compatible**: asegurar que `langKey` centralizado no rompe buckets existentes (o migración).
4) **Transporte runtime**: garantizar suscripción y reaplicación consistente en ventanas.
5) **Strings**: aplicar Regla A/B uniformemente en proveedores (menú + renderer + modales).
6) **Formato numérico**: fuente única + fallback coherente sin silencios técnicos.
7) **Presets por idioma**: adaptar al nuevo modelo (`langKey` central), mantener comportamiento actual.
8) **Purga legacy**: remover cadenas/duplicaciones/fallbacks que queden obsoletos.

---

### 12.1 Estado de implementación (registro mínimo; no modifica el contrato)

- **2026-01-07 — Gate A completado (gates 2 y 3):**
  - (2) **Autoridad única:** removido estado paralelo de idioma en main; menú/updater resuelven idioma desde settings (SELECTED_LANG).
  - (3) **Persistencia compatible / `langKey`:** derivación única centralizada (`deriveLangKey`) equivalente funcional del esquema previo; sin migración ni cambio de buckets.
  - Invariante 4.2 reforzado: `set-language` inválido/vacío **no** degrada SELECTED_LANG a `''` (se conserva el valor previo; se loguea warnOnce).

- **2026-01-07 — Gate B completado (Gate 4: Transporte runtime):**
  - `settings-updated` se difunde (best-effort) a `mainWin`, `editorWin`, `presetWin`, `flotanteWin`.
  - Se agregan suscripciones por ventana (preload + renderer) para re-aplicar strings en runtime al cambiar idioma, sin reinicio.
  - Language picker se mantiene sin suscripción por ser ventana transitoria (decisión explícita).

- **2026-01-07 — Gate C completado (Gates 5–6: Strings + Formato numérico):**
  - Regla A/B aplicada: DEFAULT (`es`) obligatorio + overlay (tag/base) opcional + merge; keys faltantes caen a DEFAULT con `warnOnce`.
  - Formato numérico: `numberFormatting[langKey]` con fallback a bucket DEFAULT antes de hardcoded, con `warnOnce`.
  - Dialogs main-process (presets/updater): keys faltantes logueadas con `warnOnce` (sin fallback silencioso).

- **2026-01-07 — Gate D completado (Gate 7: Presets por idioma / langKey):**
  - Se agrega persistencia del “preset seleccionado” por idioma vía `selected_preset_by_language[langKey]` en settings (sin migración).
  - La selección se aplica en startup y al cambiar idioma en runtime; si falta/no existe el preset, se hace fallback determinista + `warnOnce` y se corrige el estado persistido (sin estado inválido silencioso).
  - Se mantiene intacta la persistencia existente de presets por idioma (`presets_by_language[...]`); no hay renombres de buckets.

- **2026-01-07 - Gate E completado (Gate 8: Purga legacy):**
  - Se eliminaron prefijos "FALLBACK:" en dialogs user-facing (presets/updater), manteniendo `resolveDialogText` + `warnOnce`.
  - Se centralizo DEFAULT_LANG en fallbacks de idioma del sistema (main/settings/renderers/presets/count) sin cambiar buckets.
  - Sin migraciones ni cambios de esquema.

