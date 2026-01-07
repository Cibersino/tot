# Plan "no silence" (idioma) - alineado a map_as_is y TO_BE

Este documento tiene dos objetivos, en este orden:

0) Solidificar la cadena de mando del idioma (reducir fallbacks dispersos y defaults locales).
1) Luego, ejecutar el plan "no silence" (eliminar silencios tecnicos y decidir notificaciones al usuario).

Fuentes de verdad:
- AS-IS: docs/cleanup/map_as_is.md
- TO-BE: docs/cleanup/TO_BE_language_system.md

La hipotesis es que muchos fallbacks actuales existen porque falta una autoridad unica del idioma, no porque el dominio lo requiera.


## 0) Cadena de mando fundamental (autoridad de arriba hacia abajo)

### 0.1 Definiciones (terminos normativos)

* DEFAULT_LANG: idioma "de fabrica" (build/instalacion).
  - Debe existir siempre y estar completo en recursos criticos.
  - Si DEFAULT_LANG no puede cargarse en un subsistema critico -> falla grave de build/distribucion (no "fallback").

* SELECTED_LANG: idioma elegido por el usuario y persistido en settings.
  - TO-BE: nunca queda vacio en operacion normal.
  - AS-IS: puede quedar vacio y luego recibir fallback (ver 0.3).

* normalize(tag) / langTag: normalizacion canonica del tag (casing, separadores).

* langKey (AS-IS: langBase): clave canonica por idioma usada para indexacion
  (presets_by_language, disabled_default_presets, numberFormatting, etc).

* Idioma efectivo por subsistema (effectiveLang[subsystem]): idioma que el subsistema usa
  para cargar bundles y resolver keys, siguiendo Regla A / Regla B.

### 0.2 Reglas uniformes por subsistema (bundle vs key)

Regla A - Carga de bundle (archivo JSON del subsistema):
1) Cargar bundle DEFAULT (obligatorio).
2) Intentar bundle SELECTED; si falla, intentar base/derivado (langKey).
3) Si selected/base falla, usar solo DEFAULT. Si DEFAULT falla -> fatal.

Nota AS-IS: menu_builder.js y public/js/i18n.js iteran candidatos [requested, base, "es"];
si nada carga, se usa {} y luego hardcoded en el consumidor.

Regla B - Lookup de keys (una clave dentro del bundle ya cargado):
1) Resolver key en el mecanismo efectivo (selected/base sobre default).
2) Si falta, usar hardcoded fallback (ultimo recurso).

Nota: en lookup de keys no se cae a base(selected); el base solo aplica en carga de bundle.

### 0.3 Que significa "fallar" en seleccion inicial (AS-IS vs TO-BE)

En AS-IS, "falla" de seleccion aparece en dos casos:
1) Normalizacion regional a base: el usuario elige xx-YY y se degrada a xx (normalizeLangTag/getLangBase).
2) No seleccion: el usuario cierra la ventana sin elegir -> applyFallbackLanguageIfUnset("es") si settings.language estaba vacio.

En TO-BE, SELECTED_LANG nunca queda vacio: no seleccion persiste DEFAULT_LANG y queda registrado.

### 0.4 Separacion critica: fallbacks del selector vs fallbacks de idioma

El selector (ventana + manifest) tiene fallbacks propios (p.ej., lista de idiomas).
Eso no debe confundirse con la cadena de mando del idioma (DEFAULT/SELECTED).
El selector solo fija o actualiza SELECTED_LANG.


## 1) Distincion "silencioso tecnico" vs "silencioso al usuario"

* Silencioso tecnico = no hay log (warn/error/once) o el log no respeta la politica de log.js.
* Silencioso al usuario = no hay notificacion/UI feedback.

Orden de implementacion (actualizado):
1) Fase 0: alinear el codigo a la cadena de mando (seccion 0) y reducir fallbacks dispersos.
2) Fase 1: eliminar silencios tecnicos (logs).
3) Fase 2: decidir que casos requieren notificacion al usuario.

### 1.1 Default transitorio vs fallback (para evitar ambiguedad)

* Default transitorio: valor inicial necesario antes de que exista informacion (bootstrapping).
  - Puede loguearse como info/debug (o warnOnce si impacta UX final).

* Fallback: sustitucion/degradacion causada por dato invalido/ausente/error.
  - Regla del plan: ningun fallback puede ser silencioso tecnicamente.

Regla practica:
* Si el "default" se usa porque falto algo o fallo algo, tratalo como fallback (debe loguear).
* Si es solo un valor de arranque y luego se reemplaza al cargar settings, puede ser default transitorio.


## 2) Donde se ven los logs hoy (canales)

* Main process (electron/log.js): logs del proceso main (en dev se ven en el terminal).
* Renderer (public/js/log.js): logs del renderer (en DevTools de esa ventana).

Esto importa porque "no silencioso tecnico" puede cumplirse, pero igual "no lo ves"
si no abres DevTools de esa ventana.


## 3) Reglas operacionales de logging (alineadas a log.js)

Objetivo de fase 1: garantizar cobertura de logs sin destruir la senal.

Reglas minimas:
* warn: degradacion recuperable (fallback) con perdida de intencion o calidad.
* error: falla que rompe intencion del usuario o deja el sistema en estado inesperado.
* warnOnce/errorOnce: usar cuando el fallback puede dispararse repetidamente (alta frecuencia).
  - Requisito: key estable (deterministica) para deduplicar.

### 3.1 Control de ruido (alta frecuencia)

No loguear "por evento" en callsites de alta frecuencia (p.ej., missing translation key).
Preferir:
* warnOnce por "subsystem degraded" (una vez por ventana/idioma/subsistema),
* o agregacion (contadores y un unico warn en un punto natural), si existe ese punto.


## 4) Checklist de conformidad con la cadena de mando (Fase 0)

Esta seccion es la que debe "cerrarse" antes de revisar logs/notificaciones.

### 4.1 Autoridad central (DEFAULT_LANG + SELECTED_LANG)

Requisitos:
* Existe un DEFAULT_LANG definido y el build garantiza recursos criticos para ese idioma.
* Existe y se persiste un SELECTED_LANG:
  - Primer arranque: se fija antes de que el usuario opere el resto.
  - Runtime: se puede sobrescribir desde el selector.
* No hay estado paralelo autoritativo (AS-IS: currentLanguage en main y defaults locales).

Invariantes:
* Al entrar a operacion normal, el sistema puede afirmar:
  DEFAULT_LANG existe y SELECTED_LANG existe.

### 4.2 Regla uniforme de bundle por subsistema

Cada subsistema que carga bundle (menu, renderer translations, editor, modales) debe aplicar:
DEFAULT -> selected -> base -> usar DEFAULT si selected/base falla -> fatal si DEFAULT falla.

AS-IS: menu_builder.js y public/js/i18n.js usan "es" literal como ultimo candidato.

### 4.3 Regla uniforme de keys por subsistema

Cada lookup debe aplicar exactamente:
effective (selected/base sobre default) -> hardcoded

Evitar:
* fallback de keys hacia base(selected),
* hardcoded cuando DEFAULT tiene la key.

### 4.4 Eliminacion de "defaults" locales dispersos

Objetivo: que ventanas/modulos no inventen su propio "idioma por defecto" salvo como
fallback explicito a DEFAULT_LANG (y logueado cuando corresponde).

Esto apunta a reducir el inventario de fallbacks a unos pocos puntos controlados.


## 5) Inventario (AS-IS) - reetiquetado para Fase 0 + Fase 1

El inventario se mantiene, pero ahora cada item se evalua en 2 ejes:

* Modelo (Fase 0):
  - CONFORME: encaja con la cadena (seccion 0).
  - DRIFT: es un default/fallback local que deberia colapsar hacia el modelo.
  - ESPECIFICO (selector): pertenece al selector/manifest, no al idioma del sistema.

* Logging (Fase 1):
  - OK / PARCIAL / SILENCIOSO como antes.

### Grupo A - Selector de idioma (manifest + ventana) [ESPECIFICO selector]

**A1. Manifest IPC fallback (main.js / get-available-languages)**
* Rol: alimentar selector, no fijar idioma del sistema.
* Disparador: error de lectura/parse, manifest invalido o vacio.
* Logging: OK (warn/error segun caso).
* Modelo: ESPECIFICO (selector).
* Nota: fallback a FALLBACK_LANGUAGES.

**A1b. Manifest sanitization (main.js / get-available-languages)**
* Disparador: entradas invalidas se filtran en reduce().
* Logging: PARCIAL (sin log por entrada; warn solo si queda vacio).
* Modelo: ESPECIFICO (selector).

**A2. Picker fallback (language_window.html / loadLanguages)**
* Disparador: IPC falla/throw o retorno vacio/invalid sin throw.
* Logging: PARCIAL (OK en throw; SILENCIOSO en "vacio sin throw").
* Modelo: ESPECIFICO (selector).

### Grupo B - Autoridad de idioma (DEFAULT/SELECTED) [Fase 0 central]

**B1. setCurrentLanguage invalido/vacio (main.js)**
* Logging: OK (warnOnce).
* Modelo: DRIFT si fuerza "es" literal en vez de DEFAULT_LANG.

**B2. defaults tempranos currentLanguage = "es" y settings.language || "es" (main.js)**
* Logging: SILENCIOSO.
* Modelo: DRIFT (hardcode y ambiguedad default transitorio vs fallback).

**B3. Cierre de ventana de idioma sin seleccionar (settings.js / applyFallbackLanguageIfUnset)**
* Logging: OK (warnOnce).
* Modelo: DRIFT si el fallback usa literal "es" en vez de DEFAULT_LANG.

**B4. get-settings IPC fallback (settings.js)**
* Logging: OK (errorOnce).
* Modelo: DRIFT si retorna language "es" literal.

**B5. set-language: menuLang fallback (settings.js)**
* Logging: SILENCIOSO.
* Modelo: DRIFT (fallback degradante sin rastro; hardcode a "es").

**B6. normalizeSettings: langBase fallback a "es" (settings.js)**
* Logging: SILENCIOSO.
* Modelo: DRIFT si hardcodea "es" en vez de DEFAULT_LANG/base(DEFAULT_LANG).

### Grupo C - Subsistema menu (menu_builder.js) [Reglas 0.2]

**C1. JSON vacio/parse error (menu_builder.js)**
* Logging: OK (warnOnce).
* Modelo: PARCIAL/DRIFT hasta alinear Regla A con DEFAULT_LANG.

**C2. "archivo no existe" en candidato (menu_builder.js)**
* Logging: SILENCIOSO.
* Modelo: PARCIAL/DRIFT si no observa missing asset.

**C3. lang invalido -> "es" (menu_builder.js)**
* Logging: SILENCIOSO.
* Modelo: DRIFT (debe resolver contra DEFAULT_LANG).

**C4. effectiveLang fallback a "es" (menu_builder.js)**
* Logging: SILENCIOSO.
* Modelo: DRIFT si no usa DEFAULT_LANG.

**C5. Key missing -> hardcoded labels (menu_builder.js)**
* Logging: SILENCIOSO.
* Modelo: PARCIAL: deberia ser effective -> default -> hardcoded, con control de ruido.

### Grupo D - Subsistema renderer translations (i18n.js / notify.js) [Reglas 0.2]

**D1. Excepcion fetch/parse (i18n.js)**
* Logging: OK (warn).
* Modelo: PARCIAL hasta alinear Regla A con DEFAULT_LANG.

**D2. 404/no ok (i18n.js)**
* Logging: SILENCIOSO.
* Modelo: DRIFT/PARCIAL (missing asset no observado; chain usa "es" literal).

**D2b. lang invalido -> "es" (i18n.js)**
* Logging: SILENCIOSO.
* Modelo: DRIFT (debe caer a DEFAULT_LANG).

**D3/D4. tRenderer/msgRenderer fallback (i18n.js)**
* Logging: SILENCIOSO.
* Modelo: PARCIAL: deberia ser effective -> default -> hardcoded, con control de ruido.

**D5. notify fallback a key (notify.js)**
* Logging: SILENCIOSO.
* Modelo: PARCIAL (sin observabilidad).

### Grupo E - Formato numerico [deberia alinearse a DEFAULT/SELECTED]

**E1. numberFormat defaults (settings.js)**
* Logging: OK (warnOnce).
* Modelo: PARCIAL (langBase fallback usa "es"; DEFAULT_LANG debe ser explicito).

**E2. renderer number formatting fallback (format.js)**
* Logging: SILENCIOSO.
* Modelo: DRIFT si usa separadores hardcoded fuera de DEFAULT_LANG.

### Grupo F - Conteo/segmentacion [deberia confiar en SELECTED + DEFAULT]

**F1. count: idioma default "es" (count.js)**
* Logging: SILENCIOSO.
* Modelo: DRIFT si hardcodea "es" en vez de DEFAULT_LANG.

**F2. falta Intl.Segmenter (count.js)**
* Logging: SILENCIOSO.
* Modelo: NO-IDIOMA (fallback de plataforma, pero impacta comportamiento linguistico).

### Grupo G - Ventanas/consumidores (renderer/editor/preset_modal/presets)

Estos items suelen ser sintomas de falta de autoridad central (defaults locales).

**G1/G2/G3. renderer: idiomaActual = "es" por default (renderer.js)**
* Logging: SILENCIOSO.
* Modelo: DRIFT (deberia depender de SELECTED/DEFAULT provistos por settings).

**G4. editor: defaults a "es" (editor.js)**
* Logging: SILENCIOSO.
* Modelo: DRIFT.

**G5. preset_modal: default "es" + getSettings failure (preset_modal.js)**
* Logging: OK para el fallo, pero default "es" sigue SILENCIOSO.
* Modelo: DRIFT si hardcodea.

**G6/G6b. presets: base fallback + safe defaults (presets.js)**
* Logging: SILENCIOSO.
* Modelo: DRIFT si la seguridad depende de literales "es" en vez de DEFAULT_LANG.

**G7. presets_main: fallbacks de textos "FALLBACK: ..."**
* Logging: SILENCIOSO.
* Modelo: PARCIAL (hardcoded valido, pero debe alinearse a effective -> default -> hardcoded).

**G8. settings-updated solo llega a mainWin (otras ventanas sin suscripcion)**
* Logging: N/A.
* Modelo: DRIFT (TO-BE requiere suscripcion en ventanas relevantes).
* Nota: editor/preset/flotante/language solo hacen pull inicial (get-settings).


## 6) Plan de ejecucion (reordenado)

### 6.0 Fase 0 - Solidificar cadena de mando (antes de logs)

Meta: reducir dispersion y alinear subsistemas a la regla uniforme (TO-BE).

Entregables:
* Definir/centralizar DEFAULT_LANG (sin literales "es" dispersos como autoridad).
* Garantizar existencia de SELECTED_LANG (primer arranque + runtime).
* Implementar por subsistema:
  - resolver bundle: DEFAULT -> selected -> base -> usar DEFAULT -> fatal si DEFAULT falla
  - resolver keys: effective -> hardcoded
* Colapsar defaults locales (renderer/editor/modal/presets) hacia la autoridad central.
* Asegurar transporte runtime: suscripcion en ventanas relevantes (settings-updated).

### 6.1 Fase 1 - Logs (no silencios tecnicos)

Tu propuesta original se mantiene, pero solo despues de Fase 0:
1) agregar logs faltantes,
2) evaluar/corregir logs existentes.

Regla de operacion:
* Usar Codex para implementar cambios con cobertura y sin olvidos.
* Despues de cada operacion: revision humana + actualizar este documento (estado Modelo + estado Logging).

### 6.2 Fase 2 - Notificaciones al usuario

Se decide despues de:
* tener la cadena de mando estable,
* y tener observabilidad tecnica completa.

Casos prioritarios (se mantienen):
1) Usuario cierra ventana sin elegir idioma.
2) Usuario elige idioma X pero queda idioma Y (requiere observar "requested X vs effective Y").
