# Guía de traducción de toT — baseline ES/EN comentado

Este documento es una guía operativa para traducir y revisar la interfaz de toT. No es JSON válido del repo: usa formato JSONC documental para mostrar el baseline conjunto `es`/`en` y añadir notas de traducción directamente junto a las keys.

La guía no reemplaza los archivos `i18n/<lang>/main.json` ni `i18n/<lang>/renderer.json`. Su función es fijar el canon semántico global, el alcance de los conceptos de la app, las formas protegidas y el propósito de keys no obvias, de modo que las revisiones por idioma no tengan que reconstruir contexto desde cero.

## 1. Uso operativo

Para traducir o revisar un idioma:

1. Lee `es` y `en` juntos. Ninguno de los dos debe tratarse como fuente única ni como traducción auxiliar del otro.
2. Revisa las notas por key cuando existan. Una key sin nota no está incompleta: solo significa que el baseline visible basta para traducirla con seguridad razonable.
3. Usa el glosario para mantener estables los conceptos de app. El glosario define alcance; las guías por idioma deciden la formulación local cuando haya más de una solución legítima.
4. Preserva los elementos marcados como protegidos y los placeholders. Ajusta la gramática alrededor de ellos sin alterar su forma técnica.
5. Documenta decisiones idiomáticas, dudas locales o excepciones en la guía específica del idioma, no en esta guía global.
6. Cuando el contexto visual sea relevante, consulta las capturas de ventanas en `docs/screenshots/windows/` como referencia auxiliar.

## 2. Jerarquía de decisión

Cuando haya tensión entre key, `es`, `en`, traducción literal o preferencia estilística, decide en este orden:

1. Propósito real de la UI/runtime: superficie, acción, estado, restricción de layout y efecto para el usuario.
2. Baseline semántico conjunto `es`/`en`.
3. Glosario de conceptos de la app y notas por key.
4. Tokens protegidos, placeholders, unidades, acrónimos y valores dinámicos.
5. Convenciones de la guía específica del idioma.

No traduzcas solo desde el path de la key. No normalices una aparente inconsistencia sin verificar si responde a una superficie distinta, a una restricción de layout o a una decisión ya documentada.

## 3. Criterios editoriales transversales

Estos criterios aplican a todos los idiomas. Las guías específicas por idioma deben desarrollar soluciones locales, no redefinir estas reglas generales.

### 3.1 Idiomas padre y variantes

Un idioma padre no es una base vaciada, artificialmente neutral o meramente funcional para que sus variantes tengan identidad. Cada idioma padre tiene una voz editorial completa y debe sostener por sí mismo una experiencia de uso estable.

Las variantes funcionan como capas de especialización mediante fallback directo. Sobrescriben keys cuando existe una diferencia lingüística, cultural, terminológica, tonal o experimental justificada. Su existencia no obliga al idioma padre a borrar marcas legítimas de uso, registro o riqueza expresiva.

### 3.2 Comprensibilidad amplia sin neutralización rígida

La localización debe ser comprensible para usuarios nativos o competentes del idioma elegido. Esto no equivale a perseguir neutralidad rígida, a evitar toda marca local ni a reducir términos técnicos a la fórmula más plana posible.

Puede usarse una forma precisa, natural y suficientemente transmisible para la comunidad amplia del idioma aunque no sea la opción más neutra o escolarizada. Una forma que dependa de una variante estrecha, de un registro demasiado local o de una marca que distraiga del propósito de la UI debe reservarse para una guía local, una variante o una decisión explícita.

### 3.3 Baseline semántico y traducibilidad

`es` y `en` funcionan como baseline semántico conjunto, pero ningún idioma debe empobrecerse, deformarse o volverse artificial para facilitar la traducción a otros idiomas. La traducibilidad se resuelve con glosario, notas por key, guías específicas, discusión editorial e inventario vivo.

Si una formulación local es semánticamente más precisa que una traducción literal del baseline, puede preferirse siempre que conserve el propósito de la key y no rompa tokens protegidos, placeholders, layout o contrato runtime.

### 3.4 Préstamos, calcos y términos externos

Los préstamos de otros idiomas, calcos y términos externos no deben aceptarse ni rechazarse por principio. Cada idioma debe decidir si conserva, adapta, traduce o evita esas formas según naturalidad local, claridad, uso técnico, estabilidad terminológica y restricciones de interfaz.

Cuando haya más de una solución legítima, la guía específica del idioma debe registrar el criterio adoptado. La decisión no debe reducirse a purismo, moda técnica ni traducción mecánica.

### 3.5 Superficie, layout y densidad textual

La traducción debe considerar la superficie real de la key: botón, menú, tooltip, label compacto, estado de progreso, alerta, modal explicativo, informe, guía o documento. Esa superficie define cuánto espacio hay para elaborar, qué tan directa debe ser la acción y cuánto peso puede soportar el texto.

En superficies compactas o layout sensible, priorizar claridad operativa, brevedad y estabilidad visual sin forzar literalidad. En textos explicativos, ayudas, disclosures, reportes o documentos, puede admitirse mayor densidad conceptual, precisión terminológica y riqueza expresiva.

### 3.6 Valores dinámicos, género y número

Cuando una key combine texto localizado con placeholders o valores dinámicos, la formulación debe ser robusta frente a género, número, categoría gramatical, dirección de texto y tipo de valor desconocidos.

Preferir estructuras que no dependan de concordancias frágiles con la variable. Evitar fórmulas como `el/la`, `sr(a)`, `archivo(s)` o soluciones equivalentes, salvo que la guía específica del idioma documente una razón fuerte. Son preferibles patrones nominales, impersonales, segmentados o de label + valor cuando reduzcan ambigüedad.

### 3.7 Convenciones formales de escritura

Cada idioma debe definir en su guía específica sus convenciones de escritura: puntuación, mayúsculas, comillas, elipsis, espacios, abreviaturas, tratamiento de siglas, separación de unidades y estilo de títulos o botones.

La guía global no debe imponer esas formas, pero sí exigir consistencia interna. Una diferencia formal solo debe aceptarse cuando responda al idioma, la superficie o una restricción real de interfaz.

### 3.8 Terminología estable y dudas abiertas

Un mismo concepto funcional debe mantener una forma estable dentro de cada idioma, salvo que haya una diferencia real de superficie, acción o estado. La variación estilística no debe introducir ambigüedad entre conceptos de app.

Cuando existan varias soluciones legítimas, la guía específica del idioma debe registrar la opción preferida, alternativas descartadas, excepciones aceptadas o dudas abiertas. La revisión key por key debe permitir discusión lingüística razonada, no aplicar reglas mecánicas sin atender la superficie concreta.

La consistencia interna de un idioma no exige homogeneizar soluciones entre idiomas distintos. No debe normalizarse puntuación, elipsis, espaciado o casing de forma transversal si esa normalización borra una convención local o puede afectar renderizado/script.

## 4. Notas por key

Las notas por key aparecen como comentarios JSONC documentales junto al baseline:

    "key": {
      "es": "...",
      "en": "..."
      // [TAG] comentario
    }

Estas notas no obligan a traducir literalmente desde `es` o `en`. Fijan contexto traductivo cuando el baseline visible no basta para evitar ambigüedad, drift o decisiones inestables.

### Tags estables

`[PROPÓSITO]`  
Aclara el uso funcional de una key cuando ese contexto es necesario para evitar una traducción incorrecta o inestable. No documenta la UI por documentarla, no parafrasea el string y no debe inferirse solo desde el path de la key.

`[CONCEPTO_APP]`  
Marca el concepto canónico de la app activo en una key. No define ni explica el concepto; solo lo identifica para mantener consistencia terminológica con el glosario.

`[PROTEGIDO]`  
Marca formas que deben conservarse o tratarse con especial cuidado: nombres propios, servicios, acrónimos, unidades, tokens, placeholders, símbolos o formas técnicas que no deben normalizarse libremente.

`[NO_CONFUNDIR]`  
Advierte una confusión traductiva concreta y razonable entre conceptos, superficies, rutas o acciones similares de la app. No debe usarse para repetir el glosario ni para advertencias remotas que el contexto ya descarta.

## 5. Glosario de conceptos de la app

Este glosario fija el alcance de los conceptos marcados con `[CONCEPTO_APP]`. Las definiciones describen el uso canónico dentro de la app; no reemplazan el baseline `es`/`en` ni obligan a traducir cada término de forma literal.

| Concepto | Alcance en la app |
|---|---|
| `agregar al texto actual` | Acción `Append`: conserva el texto actual y suma el contenido entrante al final, en vez de reemplazarlo. |
| `archivos de test` | Archivos que alimentan el pool del test; pueden venir incorporados, importarse desde el dispositivo u obtenerse desde una fuente externa. |
| `biblioteca de lecturas` | Biblioteca de filas guardadas reutilizables dentro del Editor de Tareas; no equivale a una tarea completa. |
| `credenciales OAuth OCR` | Credenciales OAuth de Google gestionadas por la app para habilitar la integración OCR. No son el estado de sesión del usuario. |
| `Cronómetro` | Cronómetro de la app usado para medir lectura y calcular velocidad real. Debe estar detenido/restablecido para ciertos flujos. |
| `Cronómetro Flotante` | Ventana flotante del cronómetro; en el test guiado controla el inicio y término de la medición. |
| `Editor de Texto` | Ventana de edición manual donde el usuario puede escribir, pegar, corregir y aplicar texto hacia el texto actual. |
| `etiquetas de snapshot de texto` | Metadatos opcionales de snapshot, como idioma, tipo y dificultad; también pueden configurarse para snapshots creados desde unidades de extracción por lotes. |
| `extracción de texto` | Flujo para obtener texto desde archivos y luego aplicarlo al texto actual o guardarlo según el flujo. Puede pasar por opciones PDF, ruta nativa, OCR o lote. |
| `extensión del navegador` | Superficie informativa de la extensión de Chrome; es una herramienta separada de la app de escritorio y no reemplaza sus funciones de extracción. |
| `extracción por lotes` | Flujo de planificación, ejecución e informe final para extraer texto desde múltiples entradas o desde un PDF completo dividido en partes. |
| `fila de lectura` | Entrada individual de una tarea. Puede nombrarse como `fila` cuando la superficie trata la entrada como estructura de tabla —agregar, mover, eliminar, validar o nombrar filas—, y como `lectura` cuando la superficie la trata como contenido reutilizable o guardado en la biblioteca de lecturas. No equivale a una tarea completa. |
| `Google OCR` | Integración conectada de OCR mediante servicios de Google; requiere activación/autorización y puede usar documentos temporales remotos. |
| `ítem de extracción por lotes` | Entrada individual dentro de una unidad de lote: archivo fuente o parte generada que se procesa y puede fallar, omitirse o completarse. |
| `modo preciso` | Modo de conteo basado en `Intl.Segmenter` para segmentación de palabras y caracteres. |
| `palabras por minuto (WPM)` | Unidad numérica de velocidad de lectura usada en presets, selector, cronómetro y resultados medidos. |
| `PDF completo por partes` | Modo para procesar un PDF pesado completo mediante partes generadas para respetar límites del proveedor OCR. |
| `PDF fuente` | PDF original seleccionado por el usuario antes de generar subconjuntos, partes o artefactos derivados. |
| `PDF generado` | PDF local derivado por la app, por ejemplo desde un rango de páginas o una división por partes, usado como insumo de extracción. |
| `PDF guardado` | PDF generado que el usuario decidió conservar después del procesamiento. |
| `pool del test` | Conjunto local de archivos disponibles para el test, con estado de uso, filtros y opción de restablecimiento. |
| `preset de velocidad de lectura` | Configuración guardada de WPM para estimar tiempo de lectura; puede crearse, editarse, restaurarse o generarse desde un resultado medido. |
| `reemplazar texto actual` | Acción `Replace`: sustituye el contenido del texto actual por el contenido entrante en un flujo que ofrece la alternativa reemplazar/agregar. |
| `repeticiones de pegado` | Cantidad de iteraciones con que se pega el texto del portapapeles en las acciones de reemplazo o agregado. |
| `ruta de extracción` | Camino elegido o resuelto para extraer texto; distingue ruta nativa y OCR. |
| `ruta nativa` | Ruta local/no OCR de extracción de texto desde archivos compatibles o PDFs con texto seleccionable. |
| `ruta OCR` | Ruta de extracción por reconocimiento óptico; se usa para imágenes, PDFs escaneados/aplanados o casos donde la ruta OCR es elegida/requerida. |
| `selección de páginas PDF` | Elección de todas las páginas o de un rango contiguo antes de extraer; puede materializar un PDF generado con páginas seleccionadas. |
| `snapshot de texto` | Guardado/carga de texto actual como archivo de snapshot; puede tener etiquetas, cargarse como texto actual, asociarse a filas o crearse desde extracción por lotes. |
| `tarea` | Plan de lectura del Editor de Tareas; agrupa filas de lectura y puede guardarse, cargarse o validarse como archivo de tarea. |
| `Test de velocidad de lectura` | Flujo guiado para medir velocidad real de lectura con texto del pool o texto actual, preguntas opcionales y posible creación de preset. |
| `tests incorporados` | Archivos iniciales incluidos con la app para el test; pueden mostrarse u ocultarse dentro del pool. |
| `texto actual` | Texto central actualmente cargado en la ventana principal; alimenta el cálculo de tiempo, puede editarse, reemplazarse, ampliarse, guardarse como snapshot o usarse para iniciar el test. |
| `tiempo estimado de lectura` | Duración calculada para leer el texto actual según el conteo y la velocidad configurada. |
| `token local OCR` | Estado local de inicio de sesión/token guardado para Google OCR; puede revocarse o eliminarse al desconectar. |
| `unidad de extracción por lotes` | Contenedor de planificación/ejecución dentro del lote; agrupa uno o más ítems, puede tener nombre, etiquetas y política de fallos, y puede producir snapshot. |
| `velocidad de lectura` | Valor en WPM usado en dos acepciones: velocidad configurada/presupuesta para estimar tiempo de lectura y velocidad real medida por cronómetro o test. |
| `ventanas secundarias` | Ventanas auxiliares abiertas por la app; ciertos flujos exigen cerrarlas para partir desde un estado estable. |

Desambiguaciones puntuales del glosario:

- `biblioteca de lecturas`, `fila de lectura` y `tarea`: la tarea agrupa filas de lectura; la biblioteca guarda esas entradas como lecturas reutilizables; una fila/lectura no es una tarea completa.
- `credenciales OAuth OCR` y `token local OCR`: no son lo mismo; las credenciales habilitan la integración, el token representa estado local de autorización/sesión.
- `PDF fuente`, `PDF generado` y `PDF guardado`: no son intercambiables; el primero es el original, el segundo es un derivado creado por la app y el tercero es un derivado conservado por decisión del usuario.
- `snapshot de texto`: no es captura de pantalla; refiere a texto guardado/cargable por la app.
- `unidad de extracción por lotes` e `ítem de extracción por lotes`: la unidad agrupa; el ítem es la entrada procesada dentro de esa unidad.
- `velocidad de lectura`: distinguir velocidad configurada para estimación de velocidad real medida por cronómetro o test.

## 6. Contenido protegido, placeholders y valores dinámicos

Los elementos marcados como `[PROTEGIDO]` no se traducen ni se normalizan libremente. La frase alrededor puede adaptarse al idioma, pero la forma protegida debe conservarse salvo que una guía específica del idioma documente una excepción aprobada.

Reglas prácticas:

- Preservar exactamente los placeholders `{...}`: nombre, cantidad y función.
- Preservar acrónimos y formatos invariantes como `WPM`, `OCR`, `PDF`, `URL`, `OAuth`, `JSON`, unidades como `MB` y `px`, símbolos como `%`, y controles como `▶`, `⏸`, `⏹`, `📂` cuando estén protegidos.
- Mantener nombres propios y servicios como `toT`, `Cibersino`, `Google OCR`, `Google Drive`, `Chrome Web Store`, `GitHub` y `Ko-fi`.
- No traducir extensiones, rutas, nombres de archivo, URLs ni tokens tipo código.
- Las referencias internas a UI deben coincidir con el texto localizado real que verá el usuario en ese idioma.

## 7. RTL, scripts y valores técnicos

La traducción no debe esconder problemas de display. Si una cadena con tokens latinos, números, rangos, unidades, rutas o nombres de archivo se ve ambigua en RTL u otro script, primero hay que distinguir si el problema es de traducción o de composición/renderizado.

Criterios operativos:

- No usar el orden visual que aparece en un chat como evidencia de bidi. Para afirmar un problema visual se necesita captura de la app, descripción espacial de una captura o evidencia DOM/computed-style.
- No corregir problemas bidi reordenando manualmente traducciones si el problema pertenece a la frontera label/valor.
- Los valores técnicos app-owned deben preferir composición estructurada: label localizado + valor técnico estable/isolateable.
- Los textos libres escritos por el usuario no se tratan igual que valores técnicos de la app. Si contienen `250 WPM` u otros tokens mixtos, no se debe alterar el texto lógico guardado para forzar un orden visual.
- Las caveats de diálogos nativos no deben convertirse automáticamente en cambios de copy; si el host renderiza mal, eso se documenta como caveat o se corrige como problema de UI/display cuando corresponda.

El preflight RTL del issue 286 dejó cerrados los follow-ups renderer-owned detectados antes de esta guía: descripciones de preset, disclosure de activación de Google OCR y valores de tamaño/rango en PDF pesado. La guía debe conservar esas decisiones como criterio, no reabrirlas como traducción de strings.

## 8. Relación con guías específicas por idioma

Esta guía global define el canon semántico y operativo. Las guías específicas por idioma (`i18n/<lang>/LANGUAGE_GUIDE_<lang>.md`) documentan cómo se escribe ese canon en cada idioma.

Debe ir a la guía global:

- concepto de app;
- propósito de keys no obvias;
- tokens protegidos e invariantes;
- riesgos generales de traducción, layout o bidi;
- reglas que aplican a todos los idiomas.

Debe ir a la guía de idioma:

- registro y tono local;
- equivalentes locales de conceptos de app;
- decisiones de préstamo, transliteración o traducción;
- puntuación, casing, comillas, elipsis y espaciado propios del idioma;
- tratamiento local de tokens latinos en scripts no latinos;
- dudas abiertas y nivel de revisión de ese idioma.

`es` y `en` funcionan como baseline semántico conjunto. Sus guías específicas deben registrar decisiones locales, pero no degradar esta guía global a una lista de preferencias de español o inglés.

## 9. Relación con `i18n_language_policy.md`

Esta guía gobierna traducción, terminología, copy y revisión lingüística. `tools_local/coding_rules/i18n_language_policy.md` gobierna política de desarrollo/runtime: propietarios de bundles, fallback, separación main/renderer y uso correcto de helpers i18n.

Al revisar traducciones, tener presentes estas fronteras:

- Texto de menús y diálogos nativos pertenece a `main.json`.
- Texto de UI renderer pertenece a `renderer.json`.
- La guía de traducción no autoriza hardcoded fallbacks en `.js`.
- La guía de traducción no renombra keys ni cambia arquitectura i18n.
- Si un problema requiere modificar composición de valores técnicos, dirección de un nodo o owner de runtime, debe tratarse como cambio de código/política i18n, no como simple copy polish.

## 10. Validación y estados de revisión

La validación automática protege invariantes objetivos; no certifica calidad lingüística completa.

Hard failures esperables:

- JSON inválido;
- pérdida o corrupción de placeholders;
- corrupción de tokens protegidos;
- corrupción de `WPM`, `OCR`, `PDF` u otros invariantes;
- drift de schema/key shape;
- valores vacíos no justificados;
- incumplimiento de la excepción `renderer.tips`, que existe solo para `es` y `en`.

Soft reports útiles:

- posible residuo de fallback;
- sospecha de idioma equivocado;
- texto demasiado largo para superficies compactas;
- puntuación o casing sospechoso;
- riesgo RTL/CJK/script;
- divergencia semántica frente al baseline `es`/`en`.

Estados de revisión recomendados:

- `canonical baseline`: aplicable a `es` y `en` tras la revisión conjunta.
- `reviewed`: revisado contra esta guía, la guía local y las notas por key.
- `mechanically validated`: pasa invariantes objetivos, pero la calidad lingüística no está garantizada.
- `needs native review`: funcionalmente aceptable, pero requiere revisión idiomática nativa.
- `open question`: conserva una duda concreta que no debe resolverse por inferencia.
- `blocked by UI/display issue`: la traducción no puede cerrarse sin corregir o clasificar un problema de render/layout.

## 11. Baseline documental

- `i18n/es/main.json`
- `i18n/en/main.json`
- `i18n/es/renderer.json`
- `i18n/en/renderer.json`

## main.json

```jsonc
{
  "main": {
    "menu": {
      "como_usar": {
        "es": "¿Cómo usar la app?",
        "en": "How to use"
      },
      "guia_basica": {
        "es": "Guía básica",
        "en": "Basic guide"
      },
      "instrucciones_completas": {
        "es": "Instrucciones completas",
        "en": "Full instructions"
      },
      "faq": {
        "es": "Preguntas frecuentes (FAQ)",
        "en": "Frequently asked questions (FAQ)"
        // [PROTEGIDO] `FAQ`
      },
      "preferencias": {
        "es": "Preferencias",
        "en": "Preferences"
      },
      "idioma": {
        "es": "Idioma",
        "en": "Language"
      },
      "diseno": {
        "es": "Diseño",
        "en": "Design"
      },
      "skins": {
        "es": "Skins",
        "en": "Skins"
      },
      "crono_flotante": {
        "es": "Cronómetro Flotante",
        "en": "Floating Stopwatch"
        // [CONCEPTO_APP] Cronómetro Flotante
      },
      "fuentes": {
        "es": "Fuentes",
        "en": "Fonts"
      },
      "colores": {
        "es": "Colores",
        "en": "Colors"
      },
      "shortcuts": {
        "es": "Atajos del teclado",
        "en": "Shortcuts"
      },
      "presets_por_defecto": {
        "es": "Presets por defecto",
        "en": "Default presets"
        // [CONCEPTO_APP] preset de velocidad de lectura
      },
      "enable_google_ocr": {
        "es": "Activar Google OCR",
        "en": "Enable Google OCR"
        // [PROPÓSITO] Acción de Preferencias que inicia la activación/autorización de Google OCR para poder usar la ruta OCR conectada.
        // [CONCEPTO_APP] Google OCR
        // [PROTEGIDO] `Google OCR`
      },
      "disconnect_google_ocr": {
        "es": "Desconectar Google OCR",
        "en": "Disconnect Google OCR"
        // [PROPÓSITO] Acción de Preferencias que revoca/desconecta el estado local de Google OCR, no una pausa temporal del OCR.
        // [CONCEPTO_APP] Google OCR
        // [PROTEGIDO] `Google OCR`
      },
      "links_interes": {
        "es": "Enlaces de interés",
        "en": "Useful links"
      },
      "ayuda": {
        "es": "?",
        "en": "?"
      },
      "actualizar_version": {
        "es": "Actualizar a la última versión",
        "en": "Update to the latest version"
      },
      "acerca_de": {
        "es": "Acerca de",
        "en": "About"
      },
      "desarrollo": {
        "es": "Desarrollo",
        "en": "Development"
      },
      "recargar": {
        "es": "Recargar",
        "en": "Reload"
      },
      "forcereload": {
        "es": "Forzar recarga",
        "en": "Force reload"
      },
      "toggle_devtools": {
        "es": "Toggle DevTools",
        "en": "Toggle DevTools"
        // [PROTEGIDO] `DevTools`
      },
      "language": {
        "empty": {
          "es": "Sin idiomas disponibles",
          "en": "No languages available"
        },
        "invalid": {
          "es": "Lista de idiomas inválida",
          "en": "Invalid language list"
        }
      }
    },
    "dialog": {
      "ok": {
        "es": "Aceptar",
        "en": "OK"
      },
      "continue_button": {
        "es": "Sí, continuar",
        "en": "Yes, continue"
      },
      "cancel_button": {
        "es": "No, cancelar",
        "en": "No, cancel"
      },
      "snapshot_overwrite_save": {
        "es": "¿Sobrescribir el snapshot existente?",
        "en": "Overwrite existing text snapshot?"
        // [PROPÓSITO] Confirmación al guardar un snapshot de texto sobre un archivo ya existente.
        // [CONCEPTO_APP] snapshot de texto
      },
      "snapshot_overwrite_load": {
        "es": "¿Reemplazar el texto actual con el snapshot seleccionado \"{name}\"?",
        "en": "Replace current text with the selected text snapshot \"{name}\"?"
        // [PROPÓSITO] Confirmación al cargar un snapshot y reemplazar el texto actual de la app.
        // [CONCEPTO_APP] snapshot de texto; texto actual; reemplazar texto actual
      },
      "task_delete_confirm": {
        "es": "¿Eliminar la tarea \"{name}\"?",
        "en": "Delete the task \"{name}\"?"
        // [CONCEPTO_APP] tarea
      },
      "task_discard_changes_confirm": {
        "es": "Hay una tarea abierta con cambios sin guardar. ¿Descartar los cambios?",
        "en": "There is an open task with unsaved changes. Discard changes?"
        // [CONCEPTO_APP] tarea
      },
      "task_library_row_save_overwrite": {
        "es": "Ya existe \"{name}\" en la biblioteca. ¿Sobrescribir?",
        "en": "\"{name}\" already exists in the library. Overwrite?"
        // [PROPÓSITO] Confirmación para sobrescribir una fila guardada en la biblioteca de lecturas del editor de tareas.
        // [CONCEPTO_APP] biblioteca de lecturas; fila de lectura
      },
      "task_library_row_delete": {
        "es": "¿Eliminar \"{name}\" de la biblioteca?",
        "en": "Delete \"{name}\" from the library?"
        // [PROPÓSITO] Confirmación para eliminar una fila guardada en la biblioteca de lecturas, no una tarea completa.
        // [CONCEPTO_APP] biblioteca de lecturas; fila de lectura
      },
      "task_link_confirm": {
        "es": "¿Abrir este enlace?",
        "en": "Open this link?"
      },
      "task_link_trust_host": {
        "es": "Confiar en este host en adelante",
        "en": "Trust this host from now on"
        // [PROPÓSITO] Opción de recordar como confiable el host remoto del enlace de una fila de lectura.
      },
      "task_path_confirm": {
        "es": "¿Abrir este archivo local?",
        "en": "Open this local file?"
        // [PROPÓSITO] Confirmación para abrir una ruta local asociada a una fila de lectura.
      },
      "disconnect_google_ocr_title": {
        "es": "Desconectar Google OCR",
        "en": "Disconnect Google OCR"
        // [CONCEPTO_APP] Google OCR
        // [PROTEGIDO] `Google OCR`
      },
      "disconnect_google_ocr_confirm": {
        "es": "¿Desconectar Google OCR?",
        "en": "Disconnect Google OCR?"
        // [CONCEPTO_APP] Google OCR
        // [PROTEGIDO] `Google OCR`
      },
      "disconnect_google_ocr_detail": {
        "es": "Esto revoca el token guardado de inicio de sesión de Google OCR y elimina el archivo de token local de esta app. Las credenciales OAuth de Google locales gestionadas por la app pueden mantenerse para que OCR pueda reconectarse más adelante.",
        "en": "This revokes the saved Google OCR sign-in token and deletes the local token file from this app. App-managed local Google OAuth credentials may remain so OCR can reconnect later."
        // [PROPÓSITO] Explica que la desconexión afecta el token/estado local de inicio de sesión de Google OCR; las credenciales OAuth gestionadas por la app pueden quedar disponibles para reconectar.
        // [CONCEPTO_APP] Google OCR; token local OCR; credenciales OAuth OCR
        // [PROTEGIDO] `Google OCR`; `OAuth`; `Google`; `OCR`
      },
      "delete_preset_confirm": {
        "es": "¿Eliminar el preset \"{name}\"?",
        "en": "Delete preset \"{name}\"?"
        // [CONCEPTO_APP] preset de velocidad de lectura
      },
      "restore_defaults_confirm": {
        "es": "¿Restaurar presets por defecto (generales y para el idioma \"{lang}\")? Esto revertirá las eliminaciones y los cambios realizados sobre presets por defecto del idioma activo.",
        "en": "Restore default presets (general and language \"{lang}\")? This will restore removed default presets and revert changes to default presets for the active language."
        /// [PROPÓSITO] Confirmación para restaurar presets por defecto generales y del idioma activo, recuperando defaults eliminados o revirtiendo cambios hechos sobre esos presets.
        // [CONCEPTO_APP] preset de velocidad de lectura
      },
      "edit_preset_confirm": {
        "es": "¿Reemplazar \"{name}\" por el preset actual?",
        "en": "Replace \"{name}\" with the current preset?"
        // [PROPÓSITO] Confirmación de reemplazo del preset seleccionado por los valores actualmente editados.
        // [CONCEPTO_APP] preset de velocidad de lectura
      },
      "update_title": {
        "es": "Actualización disponible",
        "en": "Update available"
      },
      "update_message": {
        "es": "Hay una versión nueva {remote}. Actual: {local}. ¿Descargar ahora?",
        "en": "A new version {remote} is available. Current: {local}. Download now?"
        // [PROPÓSITO] Diálogo de actualización: compara versión remota disponible con versión local instalada antes de abrir la descarga.
      },
      "update_download": {
        "es": "Descargar",
        "en": "Download"
      },
      "update_later": {
        "es": "Más tarde",
        "en": "Later"
      },
      "update_up_to_date_title": {
        "es": "Estás al día.",
        "en": "You are up to date."
      },
      "update_up_to_date_message": {
        "es": "Ya tienes la última versión ({local}).",
        "en": "You already have the latest version ({local})."
      },
      "update_failed_title": {
        "es": "La comprobación de actualizaciones falló.",
        "en": "Update check failed."
      },
      "update_failed_message": {
        "es": "Revisa tu conexión y vuelve a intentar.",
        "en": "Check your connection and try again."
      }
    }
  }
}
```

## renderer.json

```jsonc
{
  "renderer": {
    "main": {
      "selector_title": {
        "es": "Primera y última parte del texto actual:",
        "en": "First and last part of the current text:"
        // [PROPÓSITO] Encabezado del preview compacto del texto actual; muestra inicio y final, no el texto completo.
        // [CONCEPTO_APP] texto actual
      },
      "selector_empty": {
        "es": "(vacío)",
        "en": "(empty)"
        // [PROPÓSITO] El preview compacto del texto actual no tiene texto que mostrar. En otras palabras, no hay texto actual cargado en la app.
        // [CONCEPTO_APP] texto actual
      },
      "reading_tools": {
        "reading_speed_test": {
          "es": "Test de velocidad de lectura",
          "en": "Reading speed test"
          // [PROPÓSITO] Botón de la ventana principal que inicia el flujo guiado del test de velocidad de lectura. Layout estrecho.
          // [CONCEPTO_APP] Test de velocidad de lectura
        },
        "preview_spoiler": {
          "es": "Spoiler",
          "en": "Spoiler"
          // [PROPÓSITO] Control para ocultar el segmento final del preview del texto actual y evitar revelar contenido. Layout estrecho.
          // [CONCEPTO_APP] texto actual
        }
      },
      "tooltips": {
        "text_extraction": {
          "es": "Extraer texto de archivos",
          "en": "Extract text from files"
          // [PROPÓSITO] Acción de entrada a la extracción de texto desde archivos; puede derivar en ruta nativa, OCR, opciones PDF o lote.
          // [CONCEPTO_APP] extracción de texto
        },
        "text_extraction_abort": {
          "es": "Abortar extracción",
          "en": "Abort extraction"
          // [CONCEPTO_APP] extracción de texto
        },
        "overwrite_clipboard": {
          "es": "Reemplazar el texto actual con el texto del portapapeles",
          "en": "Replace the current text with clipboard text"
          // [CONCEPTO_APP] texto actual; reemplazar texto actual
        },
        "append_clipboard": {
          "es": "Agregar el texto del portapapeles al final del texto actual",
          "en": "Append clipboard text to the end of the current text"
          // [PROPÓSITO] Agrega el texto del portapapeles al final del texto actual desde un nuevo párrafo.
          // [CONCEPTO_APP] texto actual; agregar al texto actual
        },
        "clipboard_repeat_count": {
          "es": "Repeticiones de pegado",
          "en": "Paste repetitions"
          // [PROPÓSITO] Número de iteraciones en que se pega el texto del portapapeles en el texto actual, reemplazándolo o agregándolo al final, dependiendo de la acción elegida por el usuario.
          // [CONCEPTO_APP] texto actual; repeticiones de pegado
        },
        "edit": {
          "es": "Abrir Editor de Texto",
          "en": "Open Text Editor"
          // [CONCEPTO_APP] Editor de Texto
        },
        "clear": {
          "es": "Vaciar texto actual",
          "en": "Clear current text"
          // [PROPÓSITO] Borrar todo el texto actual
          // [CONCEPTO_APP] texto actual
        },
        "snapshot_load": {
          "es": "Cargar snapshot de texto",
          "en": "Load text snapshot"
          // [PROPÓSITO] Acción para cargar un snapshot de texto guardado y convertirlo en texto actual.
          // [CONCEPTO_APP] snapshot de texto; texto actual
        },
        "snapshot_save": {
          "es": "Guardar el texto actual en un snapshot",
          "en": "Save current text to a text snapshot"
          // [PROPÓSITO] Acción para guardar el texto actual como snapshot de texto.
          // [CONCEPTO_APP] snapshot de texto; texto actual
        },
        "task_new": {
          "es": "Nueva tarea",
          "en": "New task"
          // [CONCEPTO_APP] tarea
        },
        "task_load": {
          "es": "Cargar tarea",
          "en": "Load task"
          // [CONCEPTO_APP] tarea
        },
        "browser_extension": {
          "es": "Extensión del navegador",
          "en": "Browser extension"
          // [PROPÓSITO] Abre la ventana informativa de la extensión de navegador, no una función de extracción de la app de escritorio.
          // [CONCEPTO_APP] extensión del navegador
        },
        "cibersino_website": {
          "es": "Sitio de Cibersino",
          "en": "Cibersino website"
          // [PROTEGIDO] `Cibersino`
        },
        "cibersino_kofi": {
          "es": "Apóyame en Ko-fi",
          "en": "Support me on Ko-fi"
          // [PROTEGIDO] `Ko-fi`
        },
        "new_preset": {
          "es": "Crear un nuevo preset",
          "en": "Create a new preset"
          // [CONCEPTO_APP] preset de velocidad de lectura
        },
        "edit_preset": {
          "es": "Editar preset seleccionado",
          "en": "Edit selected preset"
          // [CONCEPTO_APP] preset de velocidad de lectura
        },
        "delete_preset": {
          "es": "Eliminar preset seleccionado",
          "en": "Delete selected preset"
          // [CONCEPTO_APP] preset de velocidad de lectura
        },
        "reset_presets": {
          "es": "Restaurar presets por defecto",
          "en": "Restore default presets"
          // [CONCEPTO_APP] preset de velocidad de lectura
        },
        "help_button": {
          "es": "Mostrar consejo útil",
          "en": "Show a useful tip"
          // [PROPÓSITO] Muestra un toast en el idioma por defecto de la app: consejos, información, citas relacionadas con la app, datos curiosos relacionados.
        },
        "flotante_window": {
          "es": "Cronómetro Flotante",
          "en": "Floating Stopwatch"
          // [CONCEPTO_APP] Cronómetro Flotante
        }
      },
      "aria": {
        "text_extraction": {
          "es": "Seleccionar archivos para extraer texto",
          "en": "Select files to extract text from"
          // [CONCEPTO_APP] extracción de texto
        },
        "text_extraction_abort": {
          "es": "Abortar extracción",
          "en": "Abort extraction"
          // [CONCEPTO_APP] extracción de texto
        },
        "browser_extension": {
          "es": "Abrir ventana de extensión del navegador",
          "en": "Open browser extension window"
          // [PROPÓSITO] Etiqueta accesible para abrir la ventana informativa de la extensión de navegador.
          // [CONCEPTO_APP] extensión del navegador
        },
        "clipboard_repeat_count": {
          "es": "Repeticiones de pegado",
          "en": "Paste repetitions"
          // [PROPÓSITO] Número de iteraciones en que se pega el texto del portapapeles en el texto actual, reemplazándolo o agregándolo al final, dependiendo de la acción elegida por el usuario.
          // [CONCEPTO_APP] texto actual; repeticiones de pegado
        },
        "wpm_input": {
          "es": "Palabras por minuto",
          "en": "Words per minute"
          // [CONCEPTO_APP] palabras por minuto (WPM)
        },
        "wpm_slider": {
          "es": "Deslizador de palabras por minuto",
          "en": "Words per minute slider"
          // [PROPÓSITO] Señalar un control: la barra con un botón que se arrastra.
          // [CONCEPTO_APP] palabras por minuto (WPM)
        },
        "speed_presets": {
          "es": "Presets de velocidad",
          "en": "Speed presets"
          // [PROPÓSITO] Etiqueta accesible del selector de presets de WPM/velocidad de lectura.
          // [CONCEPTO_APP] preset de velocidad de lectura
        },
        "precise_mode_toggle": {
          "es": "Activar/desactivar el modo preciso",
          "en": "Precise mode toggle"
          // [PROPÓSITO] Label accesible de toggle del modo preciso.
          // [CONCEPTO_APP] modo preciso
        },
        "crono_controls": {
          "es": "Controles del cronómetro",
          "en": "Stopwatch controls"
          // [CONCEPTO_APP] Cronómetro
        },
        "crono_display": {
          "es": "Indicador del cronómetro",
          "en": "Stopwatch display"
          // [PROPÓSITO] Visualización del cronómetro.
          // [CONCEPTO_APP] Cronómetro
        },
        "crono_toggle": {
          "es": "Iniciar o pausar cronómetro",
          "en": "Start or pause stopwatch"
          // [CONCEPTO_APP] Cronómetro
        },
        "crono_reset": {
          "es": "Detener y restablecer cronómetro",
          "en": "Stop and reset stopwatch"
          // [PROPÓSITO] El cronómetro se detiene y vuelve a 0.
          // [CONCEPTO_APP] Cronómetro
        },
        "floating_window_toggle": {
          "es": "Cronómetro Flotante",
          "en": "Floating Stopwatch"
          // [CONCEPTO_APP] Cronómetro Flotante
        },
        "floating_window_group": {
          "es": "Controles del Cronómetro Flotante",
          "en": "Floating Stopwatch controls"
          // [CONCEPTO_APP] Cronómetro Flotante
        }
      },
      "speed": {
        "title": {
          "es": "VELOCIDAD DE LECTURA",
          "en": "READING SPEED"
          // [CONCEPTO_APP] velocidad de lectura
        },
        "wpm_label": {
          "es": "palabras por minuto (WPM)",
          "en": "words per minute (WPM)"
          // [CONCEPTO_APP] velocidad de lectura; palabras por minuto (WPM)
          // [PROTEGIDO] `WPM`
        }
      },
      "results": {
        "title": {
          "es": "RESULTADOS DEL CONTEO",
          "en": "COUNT RESULTS"
          // [PROPÓSITO] Título de la sección que muestra el tiempo estimado de lectura y el conteo de palabras y caracteres del texto actual.
        },
        "time_label": {
          "es": "⏱ Tiempo estimado de lectura: ",
          "en": "⏱ Estimated reading time: "
          // [CONCEPTO_APP] tiempo estimado de lectura
          // [PROTEGIDO] `⏱`
        },
        "words": {
          "es": "Palabras: {n}",
          "en": "Words: {n}"
          // [PROPÓSITO] Label de cantidad de palabras del texto actual
          // [CONCEPTO_APP] texto actual
        },
        "chars_no_space": {
          "es": "Caracteres (sin espacios): {n}",
          "en": "Characters (no spaces): {n}"
          // [PROPÓSITO] Label de cantidad de caracteres sin espacio del texto actual
          // [CONCEPTO_APP] texto actual
        },
        "chars": {
          "es": "Caracteres: {n}",
          "en": "Characters: {n}"
          // [PROPÓSITO] Label de cantidad de caracteres del texto actual
          // [CONCEPTO_APP] texto actual
        },
        "value_pending": {
          "es": "pendiente...",
          "en": "pending..."
          // [PROPÓSITO] Valor temporal mostrado mientras los resultados de conteo del texto actual aún no están listos.
          // [CONCEPTO_APP] texto actual
        },
        "value_unavailable": {
          "es": "no disponible",
          "en": "unavailable"
          // [PROPÓSITO] Valor de resguardo cuando un resultado de conteo del texto actual no puede mostrarse.
          // [CONCEPTO_APP] texto actual
        },
        "precise_mode": {
          "es": "Modo preciso",
          "en": "Precise mode"
          // [CONCEPTO_APP] modo preciso
        },
        "precise_tooltip": {
          "es": "Basado en Intl.Segmenter",
          "en": "Based on Intl.Segmenter"
          // [PROPÓSITO] Tooltip técnico del modo preciso de conteo; describe la base de segmentación usada para calcular la cantidad de palabras y caracteres.
          // [CONCEPTO_APP] modo preciso
          // [PROTEGIDO] `Intl.Segmenter`
        }
      },
      "crono": {
        "title": {
          "es": "CRONÓMETRO",
          "en": "STOPWATCH"
          // [CONCEPTO_APP] Cronómetro
        },
        "speed": {
          "es": "Velocidad:",
          "en": "Speed:"
          // [CONCEPTO_APP] Cronómetro; velocidad de lectura
        },
        "controls_label": {
          "es": "Controles del cronómetro",
          "en": "Stopwatch controls"
          // [CONCEPTO_APP] Cronómetro
        }
      },
      "processing": {
        "current_text_waiting": {
          "es": "Actualizando el texto actual...",
          "en": "Updating current text..."
          // [PROPÓSITO] Estado de procesamiento mientras la app aplica o actualiza el texto actual, antes de que la UI vuelva a estar estable.
          // [CONCEPTO_APP] texto actual
          // [NO_CONFUNDIR] No es estado de extracción de texto desde archivo; pertenece al asentamiento del texto actual.
        },
        "current_text_recount_waiting": {
          "es": "Recalculando los resultados del texto actual...",
          "en": "Recalculating current text results..."
          // [PROPÓSITO] Estado de procesamiento mientras se recalculan conteos/resultados del texto actual.
          // [CONCEPTO_APP] texto actual
          // [NO_CONFUNDIR] No indica extracción de texto ni OCR; indica reconteo del texto actual.
        },
        "current_text_waiting_startup": {
          "es": "Asentando el texto actual...",
          "en": "Settling current text..."
          // [PROPÓSITO] Estado de arranque mientras la app estabiliza el texto actual inicial y sus resultados.
          // [CONCEPTO_APP] texto actual
        },
        "current_text_waiting_editor": {
          "es": "Sincronizando cambios del Editor de Texto...",
          "en": "Syncing Text Editor changes..."
          // [PROPÓSITO] Estado de sincronización cuando cambios del Editor de Texto se están aplicando al texto actual.
          // [CONCEPTO_APP] Editor de Texto; texto actual
        },
        "text_extraction_placeholder": {
          "es": "Procesando extracción...",
          "en": "Extracting text..."
          // [CONCEPTO_APP] extracción de texto
        },
        "text_extraction_preparing": {
          "es": "Preparando la ruta de extracción...",
          "en": "Preparing extraction route..."
          // [PROPÓSITO] Estado previo a ejecutar extracción: la app está resolviendo ruta/opciones antes del procesamiento efectivo.
          // [CONCEPTO_APP] extracción de texto; ruta de extracción
        },
        "text_extraction_cancellation_pending": {
          "es": "Cancelación solicitada. Por favor, espera...",
          "en": "Cancellation requested. Please wait..."
        },
        "text_extraction_waiting_native": {
          "es": "Extrayendo texto del archivo...",
          "en": "Extracting text from file..."
          // [PROPÓSITO] Estado de ejecución cuando la extracción usa la ruta nativa/local.
          // [CONCEPTO_APP] extracción de texto; ruta nativa
        },
        "text_extraction_waiting_ocr": {
          "es": "Ejecutando extracción OCR...",
          "en": "Running OCR extraction..."
          // [PROPÓSITO] Estado de ejecución cuando la extracción usa OCR.
          // [CONCEPTO_APP] extracción de texto; OCR
          // [PROTEGIDO] `OCR`
        },
        "text_extraction_waiting_ocr_delayed": {
          "es": "Ejecutando OCR. Algunos archivos tardan más. Por favor espera...",
          "en": "Running OCR. Some files take longer. Please wait..."
          // [PROPÓSITO] Estado prolongado de OCR para indicar espera normal en archivos que tardan más.
          // [CONCEPTO_APP] extracción de texto; OCR
          // [PROTEGIDO] `OCR`
        },
        "text_extraction_unit_progress": {
          "es": "Unidad {index}/{count}",
          "en": "Unit {index}/{count}"
          // [PROPÓSITO] Progreso por unidad de extracción por lotes.
          // [CONCEPTO_APP] extracción por lotes; unidad de extracción por lotes
        },
        "text_extraction_input_progress": {
          "es": "Ítem {index}/{count}",
          "en": "Item {index}/{count}"
          // [PROPÓSITO] Progreso por ítem dentro de una unidad de extracción por lotes.
          // [CONCEPTO_APP] extracción por lotes; ítem de extracción por lotes
        },
        "text_extraction_route_native": {
          "es": "Nativa",
          "en": "Native"
          // [PROPÓSITO] Label corto de ruta de extracción nativa/local en estados de procesamiento.
          // [CONCEPTO_APP] ruta nativa
        },
        "text_extraction_route_ocr": {
          "es": "OCR",
          "en": "OCR"
          // [PROPÓSITO] Label corto de ruta OCR en estados de procesamiento.
          // [CONCEPTO_APP] OCR
          // [PROTEGIDO] `OCR`
        },
        "text_extraction_elapsed": {
          "es": "Transcurrido: ",
          "en": "Elapsed: "
          // [PROPÓSITO] Señala el tiempo transcurrido en vivo en la barra de progreso
        },
        "text_extraction_drop_here": {
          "es": "Suelta aquí para extraer texto",
          "en": "Drop here to extract text"
          // [CONCEPTO_APP] extracción de texto
        }
      }
    },
    "text_extraction": {
      "pdf_options": {
        "title": {
          "es": "Opciones de extracción del PDF",
          "en": "PDF extraction options"
          // [CONCEPTO_APP] extracción de texto; PDF fuente; selección de páginas PDF
          // [PROTEGIDO] `PDF`
        },
        "message": {
          "es": "Elige si quieres procesar todo el PDF o un rango contiguo de páginas antes de la extracción.",
          "en": "Choose whether to process the whole PDF or one contiguous page range before extraction."
          // [PROPÓSITO] Modal previo a la extracción PDF; define si se procesa todo el PDF o un rango contiguo de páginas.
          // [CONCEPTO_APP] PDF fuente; selección de páginas PDF
          // [PROTEGIDO] `PDF`
        },
        "file_label": {
          "es": "Archivo:",
          "en": "File:"
          // [CONCEPTO_APP] PDF fuente
        },
        "total_pages_label": {
          "es": "Páginas totales: ",
          "en": "Total pages: "
          // [CONCEPTO_APP] PDF fuente
        },
        "selection_legend": {
          "es": "Selección de páginas",
          "en": "Page selection"
          // [CONCEPTO_APP] selección de páginas PDF
        },
        "all_pages_label": {
          "es": "Todas las páginas",
          "en": "All pages"
          // [CONCEPTO_APP] selección de páginas PDF
        },
        "range_label": {
          "es": "Rango de páginas",
          "en": "Page range"
          // [CONCEPTO_APP] selección de páginas PDF
        },
        "from_page_label": {
          "es": "Desde la página",
          "en": "From page"
          // [CONCEPTO_APP] selección de páginas PDF
        },
        "to_page_label": {
          "es": "Hasta la página",
          "en": "To page"
          // [CONCEPTO_APP] selección de páginas PDF
        },
        "selected_page_count_label": {
          "es": "Páginas seleccionadas: ",
          "en": "Selected pages: "
          // [CONCEPTO_APP] selección de páginas PDF
        },
        "keep_generated_pdf_label": {
          "es": "Conservar el PDF generado con las páginas seleccionadas después del procesamiento",
          "en": "Keep the generated selected-page PDF after processing"
          // [PROPÓSITO] Checkbox para conservar el PDF generado con páginas seleccionadas después de usarlo como insumo de extracción.
          // [CONCEPTO_APP] PDF generado; PDF guardado; selección de páginas PDF
          // [PROTEGIDO] `PDF`
        },
        "continue_button": {
          "es": "Continuar",
          "en": "Continue"
        },
        "cancel_button": {
          "es": "Cancelar",
          "en": "Cancel"
        },
        "close_aria": {
          "es": "Cerrar ventana de opciones de extracción del PDF",
          "en": "Close PDF extraction options window"
          // [PROTEGIDO] `PDF`
        },
        "invalid_range": {
          "es": "Ingresa un rango contiguo de páginas entre 1 y {totalPages}.",
          "en": "Enter a contiguous page range between 1 and {totalPages}."
          // [PROPÓSITO] Validación del rango contiguo de páginas permitido por el total de páginas del PDF.
          // [CONCEPTO_APP] selección de páginas PDF
        }
      },
      "route_choice": {
        "title": {
          "es": "Elegir ruta de extracción",
          "en": "Choose extraction route"
          // [CONCEPTO_APP] ruta de extracción
        },
        "message": {
          "es": "Este PDF tiene disponibles ambas rutas de extracción. Elige una para continuar.",
          "en": "Both extraction routes are available for this PDF. Choose one to continue."
          // [PROPÓSITO] Ventana modal para PDFs donde están disponibles ruta nativa y OCR; obliga a elegir una ruta antes de continuar.
          // [CONCEPTO_APP] ruta de extracción; ruta nativa; OCR
          // [PROTEGIDO] `PDF`
        },
        "native_button": {
          "es": "Usar nativa",
          "en": "Use native"
          // [PROPÓSITO] Botón que selecciona la ruta nativa/local para continuar la extracción.
          // [CONCEPTO_APP] ruta nativa
        },
        "ocr_button": {
          "es": "Usar OCR",
          "en": "Use OCR"
          // [PROPÓSITO] Botón que selecciona la ruta OCR para continuar la extracción.
          // [CONCEPTO_APP] OCR
          // [PROTEGIDO] `OCR`
        },
        "cancel_button": {
          "es": "Cancelar",
          "en": "Cancel"
        },
        "close_aria": {
          "es": "Cerrar ventana de ruta de extracción",
          "en": "Close extraction route window"
        }
      },
      "ocr_activation_disclosure": {
        "title": {
          "es": "Revisar la activación de Google OCR",
          "en": "Review Google OCR activation"
          // [CONCEPTO_APP] Google OCR
          // [PROTEGIDO] `Google OCR`
        },
        "intro": {
          "es": "toT usa servicios de Google para OCR. Si continúas, se abrirá el navegador para que autorices esta app.",
          "en": "toT uses Google services for OCR. Continuing will open your browser so you can authorize this app."
          // [CONCEPTO_APP] Google OCR
          // [PROTEGIDO] `toT`; `Google`; `OCR`
        },
        "selected_files": {
          "es": "Solo se envían a Google los archivos que eliges para OCR.",
          "en": "Only files you choose for OCR are sent to Google."
          // [CONCEPTO_APP] Google OCR
          // [PROTEGIDO] `Google`; `OCR`
        },
        "local_storage": {
          "es": "Esta app guarda las credenciales OAuth de Google para OCR, gestionadas por la app, y el estado local del token de Google en esta instancia.",
          "en": "This app saves app-managed Google OCR OAuth credentials and the local state of the Google token in this instance."
          // [CONCEPTO_APP] Google OCR; token local OCR; credenciales OAuth OCR
          // [PROTEGIDO] `OAuth`; `Google`; `OCR`
        },
        "remote_cleanup": {
          "es": "Después de exportar, la app intenta eliminar el documento temporal de Google de tu Google Drive.",
          "en": "After export, the app attempts to remove the temporary Google document from your Google Drive."
          // [CONCEPTO_APP] Google OCR
          // [PROTEGIDO] `Google`; `Google Drive`
        },
        "disconnect": {
          "es": "Más tarde puedes desconectar esta conexión desde Preferencias > Desconectar Google OCR.",
          "en": "You can later disconnect via Preferences > Disconnect Google OCR."
          // [CONCEPTO_APP] Google OCR
          // [PROTEGIDO] `Google OCR`
        },
        "proceed_button": {
          "es": "Continuar con Google",
          "en": "Continue to Google"
          // [CONCEPTO_APP] Google OCR
          // [PROTEGIDO] `Google`
        },
        "cancel_button": {
          "es": "Cancelar",
          "en": "Cancel"
        },
        "privacy_link": {
          "es": "Abrir política de privacidad",
          "en": "Open privacy policy"
        },
        "close_aria": {
          "es": "Cerrar ventana de activación de Google OCR",
          "en": "Close OCR activation disclosure window"
          // [PROTEGIDO] `Google OCR`; `OCR`
        }
      },
      "apply_modal": {
        "title": {
          "es": "Aplicar texto extraído",
          "en": "Apply extracted text"
          // [CONCEPTO_APP] extracción de texto; texto actual
        },
        "message": {
          "es": "Elige cómo aplicar el texto extraído.",
          "en": "Choose how to apply the extracted text."
          // [PROPÓSITO] Ventana modal posterior a extracción; decide cómo incorporar el texto extraído al texto actual.
          // [CONCEPTO_APP] extracción de texto; texto actual
        },
        "elapsed": {
          "es": "Tiempo de extracción: ",
          "en": "Extraction time: "
          // [PROPÓSITO] Señala cuánto tardó la extracción de texto
          // [CONCEPTO_APP] extracción de texto
        },
        "repeat_label": {
          "es": "Repeticiones",
          "en": "Repetitions"
          // [PROPÓSITO] Número de iteraciones en que se pega el texto extraído en el texto actual, reemplazándolo o agregándolo al final, dependiendo de la acción elegida por el usuario.
          // [CONCEPTO_APP] texto actual; repeticiones de pegado
        },
        "overwrite_button": {
          "es": "Reemplazar",
          "en": "Replace"
          // [PROPÓSITO] Aplica el texto extraído reemplazando el texto actual.
          // [CONCEPTO_APP] texto actual; reemplazar texto actual
        },
        "append_button": {
          "es": "Agregar",
          "en": "Append"
          // [PROPÓSITO] Aplica el texto extraído agregándolo al texto actual.
          // [CONCEPTO_APP] texto actual; agregar al texto actual
        },
        "cancel_button": {
          "es": "Cancelar",
          "en": "Cancel"
        },
        "close_aria": {
          "es": "Cerrar ventana de aplicación del texto extraído",
          "en": "Close apply extracted text window"
        },
        "saved_pdf_message": {
          "es": "El PDF generado se conservó después de la extracción.",
          "en": "The generated PDF was kept after extraction."
          // [PROPÓSITO] Mensaje posterior a extracción cuando se conservó un PDF generado localmente.
          // [CONCEPTO_APP] extracción de texto; PDF generado; PDF guardado
          // [PROTEGIDO] `PDF`
        },
        "saved_pdf_label": {
          "es": "PDF guardado: ",
          "en": "Saved PDF: "
          // [PROPÓSITO] Label de nombre del PDF generado que quedó guardado.
          // [CONCEPTO_APP] PDF generado; PDF guardado
          // [PROTEGIDO] `PDF`
        },
        "reveal_saved_pdf_button": {
          "es": "Mostrar PDF guardado",
          "en": "Reveal saved PDF"
          // [PROPÓSITO] Acción para abrir en el sistema la carpeta del PDF generado guardado.
          // [CONCEPTO_APP] PDF generado; PDF guardado
          // [PROTEGIDO] `PDF`
          // [NO_CONFUNDIR] `Reveal` significa mostrar en el sistema de archivos, no abrir ni visualizar el PDF.
        }
      },
      "batch_plan": {
        "title": {
          "es": "Planificar extracción por lotes",
          "en": "Plan batch extraction"
          // [PROPÓSITO] Ventana modal donde se organiza la extracción por lotes antes de iniciar el procesamiento.
          // [CONCEPTO_APP] extracción por lotes
        },
        "single_file_title": {
          "es": "Procesar el PDF completo por partes",
          "en": "Process full PDF in parts"
          // [PROPÓSITO] Variante del plan de extracción por lotes cuando el texto de un PDF pesado se extrae completo vía OCR, pero dividido por partes. De esta manera la app sortea el límite de tamaño de subida por archivo que impone el proveedor Google OCR.
          // [CONCEPTO_APP] PDF completo por partes; PDF fuente; OCR
          // [PROTEGIDO] `PDF`
        },
        "pages_all": {
          "es": "Todas las páginas",
          "en": "All pages"
          // [CONCEPTO_APP] selección de páginas PDF
        },
        "tags_none": {
          "es": "Sin etiquetas",
          "en": "No tags"
          // [CONCEPTO_APP] etiquetas de snapshot de texto
        },
        "heavy_pdf_badge": {
          "es": "PDF pesado",
          "en": "Heavy PDF"
          // [CONCEPTO_APP] PDF fuente; OCR
          // [PROTEGIDO] `PDF`
        },
        "generated_inputs_preview": {
          "es": "Partes previstas para la extracción:",
          "en": "Planned parts for extraction:"
          // [PROPÓSITO] Lista de los PDFs locales que la app prevé generar como ítems de extracción del texto del PDF pesado. Son nombres de archivos nuevos que representan rangos de páginas del PDF fuente preparados para subir al proveedor Google OCR.
          // [CONCEPTO_APP] PDF completo por partes; PDF fuente; ítem de extracción por lotes; Google OCR
        },
        "unit_label": {
          "es": "Unidad {index}",
          "en": "Unit {index}"
          // [PROPÓSITO] Nombre por defecto de una unidad de extracción por lotes.
          // [CONCEPTO_APP] unidad de extracción por lotes
        },
        "unit_counter": {
          "es": "Unidad {index}/{count}",
          "en": "Unit {index}/{count}"
          // [PROPÓSITO] Contador de progreso o posición de unidades de extracción por lotes.
          // [CONCEPTO_APP] unidad de extracción por lotes
        },
        "unit_name_placeholder": {
          "es": "Nombre opcional de la unidad",
          "en": "Optional unit name"
          // [PROPÓSITO] Campo opcional para nombrar una unidad de extracción por lotes.
          // [CONCEPTO_APP] unidad de extracción por lotes
        },
        "new_unit_option": {
          "es": "Crear nueva unidad",
          "en": "Create new unit"
          // [CONCEPTO_APP] unidad de extracción por lotes
        },
        "move_up": {
          "es": "Subir",
          "en": "Move up"
        },
        "move_down": {
          "es": "Bajar",
          "en": "Move down"
        },
        "remove_input": {
          "es": "Quitar",
          "en": "Remove"
          // [CONCEPTO_APP] ítem de extracción por lotes
        },
        "keep_generated_pdf": {
          "es": "Conservar PDFs generados",
          "en": "Keep generated PDFs"
          // [PROPÓSITO] Checkbox para conservar PDFs generados durante la extracción por lotes.
          // [CONCEPTO_APP] PDF generado; PDF guardado; extracción por lotes
          // [PROTEGIDO] `PDF`
        },
        "edit_tags": {
          "es": "Etiquetas",
          "en": "Tags"
          // [PROPÓSITO] Acción para editar etiquetas aplicables a snapshots de texto creados desde la unidad.
          // [CONCEPTO_APP] etiquetas de snapshot de texto; unidad de extracción por lotes
        },
        "tags_modal": {
          "title": {
            "es": "Etiquetas de la unidad",
            "en": "Unit tags"
            // [CONCEPTO_APP] etiquetas de snapshot de texto; unidad de extracción por lotes
          },
          "message": {
            "es": "Elige etiquetas opcionales para los snapshots de texto que se creen desde esta unidad durante la extracción por lotes.",
            "en": "Choose optional tags for text snapshots created from this unit during batch extraction."
            // [PROPÓSITO] Las etiquetas se aplican a snapshots de texto creados por la unidad durante la extracción por lotes.
            // [CONCEPTO_APP] etiquetas de snapshot de texto; snapshot de texto; unidad de extracción por lotes; extracción por lotes
          },
          "confirm_button": {
            "es": "Aplicar etiquetas",
            "en": "Apply tags"
            // [CONCEPTO_APP] etiquetas de snapshot de texto
          },
          "close_aria": {
            "es": "Cerrar ventana de etiquetas de la unidad",
            "en": "Close unit tags window"
          }
        },
        "single_unit_no_snapshot": {
          "es": "Una sola unidad: no se creará snapshot de texto automático.",
          "en": "Single unit: no automatic text snapshot will be created."
          // [PROPÓSITO] Aviso de que una extracción de una sola unidad no crea snapshot de texto automático.
          // [CONCEPTO_APP] unidad de extracción por lotes; snapshot de texto
        },
        "preset_all": {
          "es": "Todo junto",
          "en": "All together"
          // [PROPÓSITO] Preset de planificación que agrupa todos los archivos fuente en una misma unidad de extracción.
          // [CONCEPTO_APP] extracción por lotes; unidad de extracción por lotes
        },
        "preset_separate": {
          "es": "Cada archivo por separado",
          "en": "One file per unit"
          // [PROPÓSITO] Preset de planificación que crea una unidad separada por cada archivo fuente.
          // [CONCEPTO_APP] extracción por lotes; unidad de extracción por lotes
        },
        "failure_legend": {
          "es": "Comportamiento ante fallos",
          "en": "Failure behavior"
          // [CONCEPTO_APP] extracción por lotes; ítem de extracción por lotes; unidad de extracción por lotes
        },
        "failure_default": {
          "es": "Finalizar la unidad tras el último ítem exitoso y seguir con la siguiente",
          "en": "End the unit after the last successful item and continue with the next one"
          // [PROPÓSITO] Política de fallo de la extracción de texto que cierra la unidad tras el último ítem exitosamente extraído y continúa con la unidad siguiente.
          // [CONCEPTO_APP] extracción por lotes; ítem de extracción por lotes; unidad de extracción por lotes
        },
        "failure_continue": {
          "es": "Omitir el ítem fallido y seguir dentro de la misma unidad",
          "en": "Omit the failed item and continue inside the same unit"
          // [PROPÓSITO] Política de fallo de la extracción de texto que omite el ítem con extracción fallida y continúa dentro de la misma unidad.
          // [CONCEPTO_APP] extracción por lotes; ítem de extracción por lotes; unidad de extracción por lotes
        },
        "overwrite_confirm": {
          "es": "Esto reemplazará el texto actual cuando comience la extracción. ¿Deseas continuar?",
          "en": "This will replace the current text when extraction starts. Do you want to continue?"
          // [PROPÓSITO] Confirmación previa al inicio de una extracción por lotes que aplicará el resultado reemplazando el texto actual.
          // [CONCEPTO_APP] extracción por lotes; texto actual; reemplazar texto actual
          // [NO_CONFUNDIR] No se refiere a sobrescribir archivos ni snapshots; se refiere al texto actual de la ventana principal.
        },
        "start_button": {
          "es": "Iniciar extracción",
          "en": "Start extraction"
          // [CONCEPTO_APP] extracción por lotes
        },
        "cancel_button": {
          "es": "Cancelar",
          "en": "Cancel"
        },
        "close_aria": {
          "es": "Cerrar planificación de extracción por lotes",
          "en": "Close batch extraction planning"
        }
      },
      "batch_report": {
        "title": {
          "es": "Informe final de la extracción por lotes",
          "en": "Batch extraction final report"
          // [PROPÓSITO] Informe mostrado al terminar una extracción por lotes.
          // [CONCEPTO_APP] extracción por lotes
        },
        "single_file_title": {
          "es": "Informe final de la extracción del PDF pesado",
          "en": "Heavy PDF extraction final report"
          // [PROPÓSITO] Informe mostrado al terminar la extracción de un PDF pesado procesado por partes.
          // [CONCEPTO_APP] PDF completo por partes; PDF fuente
          // [PROTEGIDO] `PDF`
        },
        "omitted": {
          "es": "omitido",
          "en": "omitted"
          // [PROPÓSITO] Estado de ítem cuya extracción fue omitida por la política de fallos.
          // [CONCEPTO_APP] extracción de texto; ítem de extracción por lotes
        },
        "reveal_generated_pdf": {
          "es": "Mostrar PDF guardado",
          "en": "Reveal saved PDF"
          // [PROPÓSITO] Acción para abrir en el sistema la carpeta de un PDF generado que fue conservado.
          // [CONCEPTO_APP] PDF generado; PDF guardado
          // [PROTEGIDO] `PDF`
          // [NO_CONFUNDIR] `Reveal` significa mostrar en el sistema de archivos, no abrir ni visualizar el PDF.
        },
        "current_text_has_output": {
          "es": "El texto actual fue modificado.",
          "en": "Current text was modified."
          // [PROPÓSITO] Resultado final que indica que el texto actual fue modificado por el proceso de extracción.
          // [CONCEPTO_APP] texto actual; extracción por lotes
        },
        "current_text_unchanged": {
          "es": "El texto actual no cambió.",
          "en": "Current text did not change."
          // [PROPÓSITO] Resultado final que indica que el proceso de extracción no modificó el texto actual.
          // [CONCEPTO_APP] texto actual; extracción por lotes
        },
        "snapshot_load_guidance": {
          "es": "Los snapshots de texto creados se pueden cargar desde la ventana principal usando el botón '📂'.",
          "en": "Created text snapshots can be loaded from the main window using the '📂' button."
          // [PROPÓSITO] Guía para cargar los snapshots de texto creados por el proceso de extracción de texto.
          // [CONCEPTO_APP] snapshot de texto; extracción por lotes
          // [PROTEGIDO] `📂`
        },
        "elapsed": {
          "es": "Tiempo total de extracción: ",
          "en": "Total extraction time: "
          // [PROPÓSITO] Señala cuánto tardó la extracción de texto
          // [CONCEPTO_APP] extracción por lotes
        },
        "copy_report": {
          "es": "Copiar informe",
          "en": "Copy report"
        },
        "open_snapshots_folder": {
          "es": "Abrir carpeta de snapshots de texto",
          "en": "Open text snapshots folder"
          // [CONCEPTO_APP] snapshot de texto
        },
        "ok_button": {
          "es": "Aceptar",
          "en": "OK"
        },
        "close_aria": {
          "es": "Cerrar informe final de extracción por lotes",
          "en": "Close batch extraction final report"
        },
        "split_result_label": {
          "es": "Resultado de la división:",
          "en": "Split result:"
          // [PROPÓSITO] Label para resultado no exitoso de procesamiento de un PDF pesado en partes.
          // [CONCEPTO_APP] PDF completo por partes; PDF fuente
        },
        "failed_fallback": {
          "es": "falló",
          "en": "failed"
          // [CONCEPTO_APP] extracción de texto
        },
        "failed_with_code": {
          "es": "falló: {code}",
          "en": "failed: {code}"
          // [CONCEPTO_APP] extracción de texto
        },
        "applied_truncated": {
          "es": "aplicado con truncamiento",
          "en": "applied with truncation"
          // [PROPÓSITO] Estado breve del informe final cuando el texto extraído de un ítem se aplicó al texto actual, pero fue truncado por límite de tamaño.
          // [CONCEPTO_APP] extracción por lotes; texto actual
        },
        "payload_too_large": {
          "es": "demasiado grande para aplicar",
          "en": "too large to apply"
          // [PROPÓSITO] Estado breve del informe final cuando el texto extraído de un ítem es demasiado grande para aplicarse al texto actual.
          // [CONCEPTO_APP] extracción por lotes; texto actual
        },
        "text_limit": {
          "es": "se alcanzó el límite de texto",
          "en": "text limit reached"
          // [PROPÓSITO] Estado breve del informe final cuando la extracción por lotes en una unidad alcanza el límite admitido para el texto actual.
          // [CONCEPTO_APP] extracción por lotes; texto actual
        },
        "cancelled_fallback": {
          "es": "cancelada",
          "en": "cancelled"
          // [CONCEPTO_APP] extracción de texto
        },
        "cancelled_with_code": {
          "es": "cancelada: {code}",
          "en": "cancelled: {code}"
          // [CONCEPTO_APP] extracción de texto
        },
        "snapshot_not_created": {
          "es": "(no se creó snapshot de texto)",
          "en": "(no text snapshot created)"
          // [PROPÓSITO] Estado del informe cuando la unidad no produjo snapshot de texto.
          // [CONCEPTO_APP] snapshot de texto; unidad de extracción por lotes
        },
        "snapshot_created": {
          "es": "{filename} creado",
          "en": "{filename} created"
          // [PROPÓSITO] Estado del informe cuando se creó un snapshot de texto.
          // [CONCEPTO_APP] snapshot de texto; unidad de extracción por lotes
        },
        "snapshot_creation_failed": {
          "es": "(falló la creación del snapshot de texto: {code})",
          "en": "(text snapshot creation failed: {code})"
          // [PROPÓSITO] Estado del informe cuando falló la creación del snapshot de texto.
          // [CONCEPTO_APP] snapshot de texto; unidad de extracción por lotes
        }
      },
      "single_file_heavy": {
        "case_a_title": {
          "es": "PDF completo demasiado grande para OCR",
          "en": "Full PDF too large for OCR"
          // [PROPÓSITO] Caso en que el PDF fuente completo supera el límite OCR y puede procesarse por partes.
          // [CONCEPTO_APP] PDF fuente; PDF completo por partes; OCR
          // [PROTEGIDO] `PDF`; `OCR`
        },
        "case_a_message": {
          "es": "El PDF completo supera el límite del proveedor OCR ({providerLimitMb} MB). Puedes procesarlo automáticamente por partes, conservando el archivo original. Alternativamente, puedes usar la ruta de extracción nativa.",
          "en": "The full PDF exceeds the OCR provider limit ({providerLimitMb} MB). You can process it automatically in parts, keeping the original file. Alternatively, you can use the native extraction route."
          // [PROPÓSITO] Explica que el PDF fuente completo supera el límite del proveedor OCR y ofrece alternativas.
          // [CONCEPTO_APP] PDF fuente; PDF completo por partes; OCR; ruta nativa
          // [PROTEGIDO] `PDF`; `OCR`; `MB`
          // [NO_CONFUNDIR] `procesar su extracción` es intencional: no promete extracción directa inmediata; anticipa el paso hacia el flujo/modal de procesamiento del PDF completo por partes.
        },
        "case_b_title": {
          "es": "PDF generado demasiado grande para OCR",
          "en": "Generated PDF too large for OCR"
          // [PROPÓSITO] Caso en que el PDF generado desde un rango seleccionado supera el límite OCR.
          // [CONCEPTO_APP] PDF generado; OCR
          // [PROTEGIDO] `PDF`; `OCR`
        },
        "case_b_message": {
          "es": "El PDF generado para el rango seleccionado supera el límite del proveedor OCR ({providerLimitMb} MB). No se subió. Puedes volver a la selección de páginas, usar la ruta nativa o procesar el PDF completo por partes.",
          "en": "The generated PDF for the selected range exceeds the OCR provider limit ({providerLimitMb} MB). It was not uploaded. You can return to page selection, use the native route, or process the full PDF in parts."
          // [PROPÓSITO] Explica que el PDF generado para el rango no se subió por exceder el límite OCR y ofrece alternativas.
          // [CONCEPTO_APP] PDF generado; selección de páginas PDF; OCR; ruta nativa; PDF completo por partes
          // [PROTEGIDO] `PDF`; `OCR`; `MB`
        },
        "source_file_label": {
          "es": "PDF fuente:",
          "en": "Source PDF:"
          // [PROPÓSITO] Label del PDF fuente original en la ventana de PDF pesado.
          // [CONCEPTO_APP] PDF fuente
        },
        "selected_range_label": {
          "es": "Rango seleccionado:",
          "en": "Selected range:"
          // [CONCEPTO_APP] selección de páginas PDF
        },
        "generated_pdf_label": {
          "es": "PDF generado:",
          "en": "Generated PDF:"
          // [PROPÓSITO] Label del PDF generado desde selección de páginas en la ventana de PDF pesado.
          // [CONCEPTO_APP] PDF generado
          // [PROTEGIDO] `PDF`
        },
        "generated_pdf_size_label": {
          "es": "Tamaño del PDF generado:",
          "en": "Generated PDF size:"
          // [CONCEPTO_APP] PDF generado
          // [PROTEGIDO] `PDF`
        },
        "source_size_label": {
          "es": "Tamaño del PDF fuente:",
          "en": "Source PDF size:"
          // [CONCEPTO_APP] PDF fuente
        },
        "total_pages_label": {
          "es": "Páginas totales:",
          "en": "Total pages:"
          // [CONCEPTO_APP] PDF fuente
        },
        "split_button": {
          "es": "Procesar el PDF por partes",
          "en": "Process PDF in parts"
          // [PROPÓSITO] Acción para ir a la ventana modal de extracción del PDF completo por partes.
          // [CONCEPTO_APP] PDF completo por partes; PDF fuente
          // [PROTEGIDO] `PDF`
          // [NO_CONFUNDIR] Aunque el botón abre el camino de extracción por partes, su acción inmediata es procesar/planificar el PDF pesado por partes.
        },
        "return_to_pages_button": {
          "es": "Volver a páginas",
          "en": "Back to pages"
          // [PROPÓSITO] Acción para volver a la selección de páginas del PDF.
          // [CONCEPTO_APP] selección de páginas PDF
        },
        "use_native_button": {
          "es": "Usar nativa",
          "en": "Use native"
          // [PROPÓSITO] Acción para usar ruta nativa como alternativa al OCR en este caso.
          // [CONCEPTO_APP] ruta nativa
        },
        "reveal_generated_pdf_button": {
          "es": "Mostrar PDF guardado",
          "en": "Reveal saved PDF"
          // [PROPÓSITO] Acción para mostrar la carpeta del PDF generado guardado, disponible si el usuario eligió conservarlo previamente.
          // [CONCEPTO_APP] PDF generado; PDF guardado
          // [PROTEGIDO] `PDF`
          // [NO_CONFUNDIR] `Reveal` significa mostrar en el sistema de archivos, no abrir ni visualizar el PDF.
        },
        "cancel_button": {
          "es": "Cancelar",
          "en": "Cancel"
        },
        "close_aria": {
          "es": "Cerrar ventana de PDF pesado para OCR",
          "en": "Close heavy PDF for OCR window"
          // [PROTEGIDO] `PDF`; `OCR`
        }
      }
    },
    "editor": {
      "title": {
        "es": "toT — Editor de Texto",
        "en": "toT — Text Editor"
        // [CONCEPTO_APP] Editor de Texto
        // [PROTEGIDO] `toT`
      },
      "placeholder": {
        "es": "Escribe o pega aquí...",
        "en": "Type or paste here..."
        // [CONCEPTO_APP] Editor de Texto
      },
      "calc_button": {
        "es": "Aplicar",
        "en": "Apply"
        // [PROPÓSITO] En el Editor de Texto, guarda o actualiza manualmente el texto editado como texto actual de la app, lo que recalcula el tiempo estimado de lectura. Layout estrecho.
        // [CONCEPTO_APP] Editor de Texto; texto actual
      },
      "calc_while_typing": {
        "es": "Auto",
        "en": "Auto"
        // [PROPÓSITO] Checkbox para activar/desactivar el 'Aplicar' / `Apply` automático mientras se escribe en el Editor de Texto. Layout estrecho.
        // [CONCEPTO_APP] Editor de Texto; texto actual
      },
      "spellcheck": {
        "es": "Ortografía",
        "en": "Spellcheck"
        // [PROPÓSITO] Checkbox para activar/desactivar el corrector ortográfico del Editor de Texto. Layout estrecho.
        // [CONCEPTO_APP] Editor de Texto
      },
      "text_size_label": {
        "es": "Tamaño",
        "en": "Size"
      },
      "decrease_text_size": {
        "es": "Reducir tamaño del texto",
        "en": "Decrease text size"
      },
      "increase_text_size": {
        "es": "Aumentar tamaño del texto",
        "en": "Increase text size"
      },
      "reset_text_size": {
        "es": "Restablecer tamaño del texto",
        "en": "Reset text size"
      },
      "text_size_value": {
        "es": "{value} px",
        "en": "{value} px"
        // [PROTEGIDO] `px`
      },
      "read_progress_label": {
        "es": "Leído",
        "en": "Read"
        // [PROPÓSITO] Label del progreso porcentual de lectura dentro del editor, no una métrica de extracción.
        // [CONCEPTO_APP] Editor de Texto
        // [NO_CONFUNDIR] `Read` aquí es participio/progreso ya leído, no una acción o imperativo de leer.
      },
      "read_progress_aria": {
        "es": "Progreso de lectura: {value}",
        "en": "Read progress: {value}"
        // [PROPÓSITO] Etiqueta accesible del progreso de lectura dentro del editor.
        // [CONCEPTO_APP] Editor de Texto
      },
      "clear_title": {
        "es": "Vaciar",
        "en": "Clear"
        // [PROPÓSITO] Borrar todo el texto del Editor de Texto.
        // [CONCEPTO_APP] Editor de Texto
      }
    },
    "editor_find": {
      "input_placeholder": {
        "es": "Buscar...",
        "en": "Find..."
      },
      "input_aria": {
        "es": "Buscar en el texto",
        "en": "Find in text"
      },
      "expand_title": {
        "es": "Mostrar reemplazo",
        "en": "Show replace controls"
      },
      "collapse_title": {
        "es": "Ocultar reemplazo",
        "en": "Hide replace controls"
      },
      "replace_placeholder": {
        "es": "Reemplazar...",
        "en": "Replace..."
      },
      "replace_aria": {
        "es": "Texto de reemplazo",
        "en": "Replacement text"
      },
      "replace": {
        "es": "Reemplazar",
        "en": "Replace"
        // [NO_CONFUNDIR] Aquí `Replace` pertenece a buscar/reemplazar dentro del Editor de Texto, no a la acción reemplazar/agregar del texto actual.
      },
      "replace_all": {
        "es": "Reemplazar todo",
        "en": "Replace all"
        // [NO_CONFUNDIR] Aquí `Replace all` reemplaza coincidencias de búsqueda dentro del Editor de Texto, no el texto actual completo.
      },
      "prev_title": {
        "es": "Coincidencia anterior",
        "en": "Previous match"
      },
      "next_title": {
        "es": "Coincidencia siguiente",
        "en": "Next match"
      },
      "close_title": {
        "es": "Cerrar barra de búsqueda",
        "en": "Close find bar"
      },
      "replace_title": {
        "es": "Reemplazar coincidencia actual",
        "en": "Replace current match"
      },
      "replace_all_title": {
        "es": "Reemplazar todas las coincidencias",
        "en": "Replace all matches"
      },
      "replace_timeout": {
        "es": "El reemplazo tardó demasiado. Inténtalo de nuevo.",
        "en": "Replace timed out. Try again."
      },
      "status_no_matches": {
        "es": "Sin coincidencias",
        "en": "No matches"
      },
      "status_empty_query": {
        "es": "Escribe para buscar",
        "en": "Type to search"
      }
    },
    "snapshot_save_tags": {
      "title": {
        "es": "Guardar snapshot de texto",
        "en": "Save text snapshot"
        // [CONCEPTO_APP] snapshot de texto; etiquetas de snapshot de texto
      },
      "message": {
        "es": "Puedes etiquetar este snapshot de texto antes de elegir dónde guardarlo.",
        "en": "You can optionally tag this text snapshot before choosing where to save it."
        // [PROPÓSITO] Modal previo a guardar snapshot; permite asignar etiquetas opcionales antes de elegir ubicación.
        // [CONCEPTO_APP] snapshot de texto; etiquetas de snapshot de texto
      },
      "labels": {
        "language": {
          "es": "Idioma",
          "en": "Language"
          // [PROPÓSITO] Etiqueta opcional del snapshot de texto; clasifica el idioma del texto guardado.
          // [CONCEPTO_APP] etiquetas de snapshot de texto
        },
        "type": {
          "es": "Tipo",
          "en": "Type"
          // [PROPÓSITO] Etiqueta opcional del snapshot de texto; clasifica el tipo de texto guardado, como por ejemplo `ficción` o `no-ficción`.
          // [CONCEPTO_APP] etiquetas de snapshot de texto
        },
        "difficulty": {
          "es": "Dificultad",
          "en": "Difficulty"
          // [PROPÓSITO] Etiqueta opcional del snapshot de texto; clasifica la dificultad del texto guardado.
          // [CONCEPTO_APP] etiquetas de snapshot de texto
        }
      },
      "empty": {
        "language": {
          "es": "Sin etiqueta de idioma",
          "en": "No language tag"
          // [CONCEPTO_APP] etiquetas de snapshot de texto
        },
        "type": {
          "es": "Sin etiqueta de tipo",
          "en": "No type tag"
          // [CONCEPTO_APP] etiquetas de snapshot de texto
        },
        "difficulty": {
          "es": "Sin etiqueta de dificultad",
          "en": "No difficulty tag"
          // [CONCEPTO_APP] etiquetas de snapshot de texto
        }
      },
      "buttons": {
        "confirm": {
          "es": "Guardar snapshot de texto",
          "en": "Save text snapshot"
          // [CONCEPTO_APP] snapshot de texto; etiquetas de snapshot de texto
        },
        "cancel": {
          "es": "Cancelar",
          "en": "Cancel"
        }
      },
      "close_aria": {
        "es": "Cerrar ventana de guardado de snapshot de texto",
        "en": "Close save text snapshot window"
      },
      "options": {
        "language": {
          "ar": {
            "es": "Árabe",
            "en": "Arabic"
          },
          "arn": {
            "es": "Mapudungun",
            "en": "Mapudungun"
          },
          "ay": {
            "es": "Aimara",
            "en": "Aymara"
          },
          "bn": {
            "es": "Bengalí",
            "en": "Bengali"
          },
          "ca": {
            "es": "Catalán",
            "en": "Catalan"
          },
          "de": {
            "es": "Alemán",
            "en": "German"
          },
          "en": {
            "es": "Inglés",
            "en": "English"
          },
          "es": {
            "es": "Español",
            "en": "Spanish"
          },
          "eu": {
            "es": "Euskera",
            "en": "Basque"
          },
          "fa": {
            "es": "Persa",
            "en": "Persian"
          },
          "fr": {
            "es": "Francés",
            "en": "French"
          },
          "gn": {
            "es": "Guaraní",
            "en": "Guarani"
          },
          "hi": {
            "es": "Hindi",
            "en": "Hindi"
          },
          "ht": {
            "es": "Criollo haitiano",
            "en": "Haitian Creole"
          },
          "id": {
            "es": "Indonesio",
            "en": "Indonesian"
          },
          "it": {
            "es": "Italiano",
            "en": "Italian"
          },
          "ja": {
            "es": "Japonés",
            "en": "Japanese"
          },
          "ko": {
            "es": "Coreano",
            "en": "Korean"
          },
          "mi": {
            "es": "Maorí",
            "en": "Māori"
          },
          "pcm": {
            "es": "Pidgin de Nigeria",
            "en": "Nigerian Pidgin"
          },
          "pt": {
            "es": "Portugués",
            "en": "Portuguese"
          },
          "qu": {
            "es": "Quechua",
            "en": "Quechua"
          },
          "ru": {
            "es": "Ruso",
            "en": "Russian"
          },
          "sv": {
            "es": "Sueco",
            "en": "Swedish"
          },
          "tr": {
            "es": "Turco",
            "en": "Turkish"
          },
          "ur": {
            "es": "Urdu",
            "en": "Urdu"
          },
          "vi": {
            "es": "Vietnamita",
            "en": "Vietnamese"
          },
          "zh_hans": {
            "es": "Chino simplificado",
            "en": "Chinese (Simplified)"
          },
          "zh_hant": {
            "es": "Chino tradicional",
            "en": "Chinese (Traditional)"
          },
          "zu": {
            "es": "Zulú",
            "en": "Zulu"
          }
        },
        "type": {
          "fiction": {
            "es": "Ficción",
            "en": "Fiction"
          },
          "non_fiction": {
            "es": "No ficción",
            "en": "Non-fiction"
          }
        },
        "difficulty": {
          "easy": {
            "es": "Fácil",
            "en": "Easy"
          },
          "normal": {
            "es": "Normal",
            "en": "Normal"
          },
          "hard": {
            "es": "Difícil",
            "en": "Hard"
          }
        }
      }
    },
    "tasks": {
      "title": {
        "es": "toT — Editor de Tareas",
        "en": "toT — Task Editor"
        // [CONCEPTO_APP] tarea
        // [PROTEGIDO] `toT`
      },
      "labels": {
        "name": {
          "es": "Nombre",
          "en": "Name"
          // [CONCEPTO_APP] tarea
        },
        "summary_total": {
          "es": "Total",
          "en": "Total"
          // [PROPÓSITO] Tiempo total de la tarea. Es la suma del tiempo estimado de cada fila de lectura de la tarea.
          // [CONCEPTO_APP] tarea; fila de lectura
        },
        "summary_left": {
          "es": "Falta",
          "en": "Left"
          // [PROPÓSITO] Tiempo total restante de la tarea. Es la suma del tiempo restante de cada fila/lectura de la tarea.
          // [CONCEPTO_APP] tarea; fila de lectura
          // [NO_CONFUNDIR] `Left` significa restante/faltante, no lado izquierdo.
        },
        "empty": {
          "es": "(vacío)",
          "en": "(empty)"
          // [PROPÓSITO] Biblioteca de lecturas no tiene filas que mostrar, ya sea porque no hay filas guardadas o porque no hay coincidencias de búsqueda.
          // [CONCEPTO_APP] biblioteca de lecturas
        },
        "search": {
          "es": "Buscar",
          "en": "Search"
          // [CONCEPTO_APP] biblioteca de lecturas
        },
        "search_placeholder": {
          "es": "Buscar en la biblioteca...",
          "en": "Search library..."
          // [CONCEPTO_APP] biblioteca de lecturas
        }
      },
      "columns": {
        "texto": {
          "es": "Lectura",
          "en": "Reading"
          // [CONCEPTO_APP] fila de lectura
        },
        "tiempo": {
          "es": "Tiempo",
          "en": "Time"
          // [PROPÓSITO] Columna de tiempo estimado asociado a una fila de lectura.
          // [CONCEPTO_APP] fila de lectura
        },
        "percent": {
          "es": "%",
          "en": "%"
          // [CONCEPTO_APP] fila de lectura
          // [PROTEGIDO] `%`
        },
        "falta": {
          "es": "Falta",
          "en": "Left"
          // [PROPÓSITO] Columna de tiempo restante de una fila de lectura.
          // [CONCEPTO_APP] fila de lectura
          // [NO_CONFUNDIR] `Left` significa restante/faltante, no lado izquierdo.
        },
        "enlace": {
          "es": "Enlace o ruta local",
          "en": "Link or local path"
          // [CONCEPTO_APP] fila de lectura
        },
        "comentario": {
          "es": "",
          "en": ""
          // [PROPÓSITO] Columna estrecha para acciones opcionales de comentario y snapshot asociadas a la fila. ES/EN la dejan sin label visible, pero otros idiomas pueden optar por un label breve si resulta más claro.
          // [CONCEPTO_APP] fila de lectura; snapshot de texto
        },
        "acciones": {
          "es": "Acciones",
          "en": "Actions"
          // [PROPÓSITO] Columna con los botones de cada fila para: subir en la tabla, bajar en la tabla, guardar en biblioteca y eliminar de la tabla.
          // [CONCEPTO_APP] fila de lectura; biblioteca de lecturas
        }
      },
      "buttons": {
        "save": {
          "es": "Guardar",
          "en": "Save"
          // [PROPÓSITO] Guardar fila en la biblioteca de lecturas.
          // [CONCEPTO_APP] fila de lectura; biblioteca de lecturas
        },
        "delete": {
          "es": "Eliminar",
          "en": "Delete"
          // [PROPÓSITO] Eliminar fila de la tabla.
          // [CONCEPTO_APP] fila de lectura
        },
        "add_row": {
          "es": "Agregar fila",
          "en": "Add row"
          // [PROPÓSITO] Agregar una fila nueva a la tabla.
          // [CONCEPTO_APP] fila de lectura
        },
        "open_library": {
          "es": "Abrir biblioteca",
          "en": "Open reading library"
          // [PROPÓSITO] Abrir ventana modal de la biblioteca de lecturas, para seleccionar una fila guardada y agregarla a la tabla.
          // [CONCEPTO_APP] biblioteca de lecturas; fila de lectura
        },
        "select_snapshot": {
          "es": "Seleccionar snapshot",
          "en": "Select text snapshot"
          // [PROPÓSITO] Acción para asociar un snapshot de texto a una fila de lectura.
          // [CONCEPTO_APP] snapshot de texto; fila de lectura
        },
        "cancel": {
          "es": "Cancelar",
          "en": "Cancel"
        },
        "yes": {
          "es": "Sí",
          "en": "Yes"
        },
        "no": {
          "es": "No",
          "en": "No"
        }
      },
      "tooltips": {
        "move_up": {
          "es": "Subir fila",
          "en": "Move up"
          // [CONCEPTO_APP] fila de lectura
        },
        "move_down": {
          "es": "Bajar fila",
          "en": "Move down"
          // [CONCEPTO_APP] fila de lectura
        },
        "delete_row": {
          "es": "Eliminar fila",
          "en": "Delete row"
          // [CONCEPTO_APP] fila de lectura
        },
        "library_row_save": {
          "es": "Guardar lectura en la biblioteca",
          "en": "Save reading to the library"
          // [CONCEPTO_APP] fila de lectura; biblioteca de lecturas
        },
        "library_row_load": {
          "es": "Cargar lectura en la tarea",
          "en": "Load reading to the task"
          // [PROPÓSITO] Agregar una fila guardada a la tabla desde la biblioteca de lecturas.
          // [CONCEPTO_APP] fila de lectura; biblioteca de lecturas
          // [NO_CONFUNDIR] Cargar una fila desde la biblioteca no carga una tarea completa; agrega una fila guardada a la tabla.
        },
        "library_row_delete": {
          "es": "Eliminar lectura de la biblioteca",
          "en": "Delete reading from the library"
          // [CONCEPTO_APP] fila de lectura; biblioteca de lecturas
          // [NO_CONFUNDIR] Eliminar de biblioteca borra la fila guardada reutilizable; no elimina una tarea completa ni necesariamente la fila de la tabla abierta.
        },
        "snapshot_load": {
          "es": "Cargar snapshot como texto actual",
          "en": "Load text snapshot as current text"
          // [PROPÓSITO] Acción para cargar el snapshot de texto asociado a la fila como texto actual de la app.
          // [CONCEPTO_APP] snapshot de texto; texto actual; fila de lectura
        },
        "snapshot_select": {
          "es": "Seleccionar snapshot para esta fila",
          "en": "Select a text snapshot for this row"
          // [PROPÓSITO] Acción para seleccionar un snapshot de texto guardado y asociarlo a la fila.
          // [CONCEPTO_APP] snapshot de texto; fila de lectura
          // [NO_CONFUNDIR] Seleccionar un snapshot para la fila no lo carga como texto actual; solo lo asocia a esa fila.
        },
        "snapshot_clear": {
          "es": "Quitar snapshot seleccionado de esta fila",
          "en": "Remove selected snapshot from this row"
          // [PROPÓSITO] Acción para quitar de la fila la asociación con un snapshot seleccionado.
          // [CONCEPTO_APP] snapshot de texto; fila de lectura
          // [NO_CONFUNDIR] Quitar el snapshot de la fila no elimina el snapshot guardado; elimina solo la asociación con esa fila.
        },
        "link_open": {
          "es": "Abrir enlace o ruta local",
          "en": "Open link or local path"
        },
        "comment": {
          "es": "Agregar o editar comentario",
          "en": "Add or edit comment"
        }
      },
      "modals": {
        "comment_title": {
          "es": "Comentario",
          "en": "Comment"
        },
        "library_title": {
          "es": "Biblioteca de lecturas",
          "en": "Reading library"
          // [CONCEPTO_APP] biblioteca de lecturas
        },
        "library_save_title": {
          "es": "Guardar lectura en la biblioteca",
          "en": "Save reading to the library"
          // [CONCEPTO_APP] biblioteca de lecturas; fila de lectura
        },
        "library_save_question": {
          "es": "¿Incluir comentario?",
          "en": "Include comment?"
          // [PROPÓSITO] Pregunta si el comentario de la fila debe incluirse al guardar en biblioteca.
          // [CONCEPTO_APP] biblioteca de lecturas; fila de lectura
        }
      },
      "alerts": {
        "task_unavailable": {
          "es": "Funcionalidad de tareas no disponible.",
          "en": "Task functionality is unavailable."
          // [CONCEPTO_APP] tarea
        },
        "task_open_error": {
          "es": "No se pudo abrir el Editor de Tareas.",
          "en": "Could not open the Task Editor."
        },
        "task_load_error": {
          "es": "No se pudo cargar la tarea.",
          "en": "Could not load the task."
          // [CONCEPTO_APP] tarea
        },
        "task_save_error": {
          "es": "No se pudo guardar la tarea.",
          "en": "Could not save the task."
          // [CONCEPTO_APP] tarea
        },
        "task_save_success": {
          "es": "Tarea guardada.",
          "en": "Task saved."
          // [CONCEPTO_APP] tarea
        },
        "task_delete_error": {
          "es": "No se pudo eliminar la tarea.",
          "en": "Could not delete the task."
          // [CONCEPTO_APP] tarea
        },
        "task_delete_unavailable": {
          "es": "No hay una tarea guardada para eliminar.",
          "en": "No saved task to delete."
          // [CONCEPTO_APP] tarea
        },
        "task_invalid_file": {
          "es": "Archivo de tarea inválido.",
          "en": "Invalid task file."
          // [CONCEPTO_APP] tarea
        },
        "task_invalid_rows": {
          "es": "Hay filas inválidas en la tarea.",
          "en": "There are invalid rows in the task."
          // [CONCEPTO_APP] tarea; fila de lectura
        },
        "task_path_outside": {
          "es": "El archivo debe estar dentro de la carpeta de tareas.",
          "en": "The file must be inside the tasks folder."
          // [CONCEPTO_APP] tarea
        },
        "name_required": {
          "es": "El nombre de la tarea es obligatorio.",
          "en": "Task name is required."
          // [CONCEPTO_APP] tarea
        },
        "row_text_required": {
          "es": "El nombre de la fila no puede quedar vacío.",
          "en": "Row name cannot be empty."
          // [PROPÓSITO] El `nombre` / `name` de la fila se refiere al texto de la fila en la primera columna `Lectura` / `Reading`.
          // [CONCEPTO_APP] fila de lectura
        },
        "library_load_error": {
          "es": "No se pudo cargar la lectura en la tarea.",
          "en": "Could not load the reading to the task."
          // [CONCEPTO_APP] biblioteca de lecturas
        },
        "library_save_error": {
          "es": "No se pudo guardar la lectura en la biblioteca.",
          "en": "Could not save the reading to the library."
          // [CONCEPTO_APP] biblioteca de lecturas; fila de lectura
        },
        "library_save_success": {
          "es": "Lectura guardada en la biblioteca.",
          "en": "Reading saved to the library."
          // [CONCEPTO_APP] biblioteca de lecturas; fila de lectura
        },
        "library_delete_error": {
          "es": "No se pudo eliminar la lectura de la biblioteca.",
          "en": "Could not delete the reading from the library."
          // [CONCEPTO_APP] biblioteca de lecturas; fila de lectura
        },
        "link_blocked": {
          "es": "Enlace bloqueado.",
          "en": "Link blocked."
        },
        "link_missing": {
          "es": "Archivo no encontrado.",
          "en": "File not found."
        },
        "link_error": {
          "es": "Error al abrir enlace o ruta local.",
          "en": "Error opening link or local path."
        }
      },
      "confirm": {
        "close_unsaved": {
          "es": "Hay cambios sin guardar. ¿Cerrar sin guardar?",
          "en": "There are unsaved changes. Close without saving?"
          // [CONCEPTO_APP] tarea
        }
      }
    },
    "reading_test": {
      "prestart": {
        "reminder": {
          "es": "Pulsa Play (▶) en el Cronómetro Flotante cuando estés listo para empezar. Una vez que el test haya empezado, no pulses Pausa (⏸) hasta terminar de leer: Pausa termina el test; no pone el cronómetro en pausa. Pulsa Detener/Restablecer (⏹) solo para cancelar el test.",
          "en": "Press Play (▶) in the Floating Stopwatch when you're ready to begin. Once the test has started, do not press Pause (⏸) until you finish reading: Pause ends the test; it does not pause the timer. Press Stop/Reset (⏹) only if you want to cancel the test."
          // [PROPÓSITO] Instrucción previa al test: el usuario debe iniciar la medición con Play en el Cronómetro Flotante; Pausa termina el test.
          // [CONCEPTO_APP] Test de velocidad de lectura; Cronómetro Flotante
          // [PROTEGIDO] `▶`; `⏸`; `⏹`
        }
      },
      "entry": {
        "title": {
          "es": "Test de velocidad de lectura",
          "en": "Reading speed test"
          // [CONCEPTO_APP] Test de velocidad de lectura
        },
        "intro": {
          "es": "Este test sirve para estimar tu velocidad real de lectura con una sesión guiada. La app abrirá el texto y esperará a que pulses Play (▶) en el Cronómetro Flotante cuando estés listo para empezar. Una vez que el test haya empezado, no pulses Pausa (⏸) hasta terminar de leer: Pausa termina el test; no pone el cronómetro en pausa. Usa Detener/Restablecer (⏹) solo si quieres cancelar el test. Después podrás revisar preguntas de comprensión si el texto las incluye y, al final, crear un preset con el resultado.\nAntes de empezar, ten en cuenta que estos textos de prueba suelen requerir entre 5 y 15 minutos de concentración continua, sin interrupciones.\nEste pool usa textos breves, así que interpreta el resultado con cautela. No debería extrapolarse directamente a textos largos, donde suelen entrar en juego factores positivos, como la adquisición de fluidez y de contexto, y factores negativos, como la recapitulación mental y la fatiga.",
          "en": "This test is meant to estimate your real reading speed through a guided session. The app will open the text and wait for you to press Play (▶) in the Floating Stopwatch when you're ready to begin. Once the test has started, do not press Pause (⏸) until you finish reading: Pause ends the test; it does not pause the timer. Use Stop/Reset (⏹) only if you want to cancel the test. Afterwards, you may review comprehension questions if the text includes them and, at the end, create a preset from the result.\nBefore you begin, keep in mind that these test texts usually require between 5 and 15 minutes of uninterrupted concentration.\nThis pool uses short texts, so treat the result with caution. It should not be directly extrapolated to long texts, where positive factors such as flow and contextual buildup, and negative factors such as mental recapitulation and fatigue, usually come into play."
          // [PROPÓSITO] Introducción completa del flujo guiado; explica inicio con Cronómetro Flotante, preguntas opcionales y creación posterior de preset.
          // [CONCEPTO_APP] Test de velocidad de lectura; Cronómetro Flotante; pool del test; preset de velocidad de lectura; Editor de Texto
          // [PROTEGIDO] `▶`; `⏸`; `⏹`
        },
        "eligible_count": {
          "es": "Archivos elegibles:",
          "en": "Eligible files:"
          // [PROPÓSITO] Conteo de archivos del pool que cumplen los filtros/estado actual para iniciar el test.
          // [CONCEPTO_APP] pool del test; archivos de test
        },
        "pool_exhausted_message": {
          "es": "No quedan archivos de test sin usar. Restablece el pool o agrega más archivos.",
          "en": "There are no remaining unused test files. Reset the pool or add more files."
          // [PROPÓSITO] Estado en que no quedan archivos de test sin usar en el pool.
          // [CONCEPTO_APP] pool del test; archivos de test
        },
        "visible_empty_bundled_hidden_message": {
          "es": "Los archivos de test incorporados están desactivados y no quedan archivos visibles sin usar. Vuelve a activarlos o importa más archivos para continuar.",
          "en": "The built-in test files are disabled and there are no remaining unused files. Re-enable them or import more files to continue."
          // [PROPÓSITO] Estado en que los tests incorporados están desactivados y no quedan archivos visibles sin usar.
          // [CONCEPTO_APP] pool del test; archivos de test; tests incorporados
        },
        "close_aria": {
          "es": "Cerrar ventana de test de velocidad de lectura",
          "en": "Close reading speed test window"
        },
        "start_random_confirm": {
          "es": "Esto reemplazará el texto actual con un texto aleatorio elegible del pool. ¿Deseas continuar?",
          "en": "This will replace the current text with a random eligible text from the pool. Do you want to continue?"
          // [PROPÓSITO] Confirmación porque iniciar con texto aleatorio reemplaza el texto actual.
          // [CONCEPTO_APP] texto actual; pool del test
          // [NO_CONFUNDIR] Este reemplazo no es la acción `Replace` del par reemplazar/agregar; iniciar con texto aleatorio carga otro texto como texto actual.
        },
        "reset_confirm": {
          "es": "Esto restablecerá todo el pool del test y volverá a marcar todos sus archivos como no usados. ¿Deseas continuar?",
          "en": "This will reset the whole test pool and mark all of its files as unused again. Do you want to continue?"
          // [PROPÓSITO] Confirmación para restablecer el estado de uso de todo el pool del test.
          // [CONCEPTO_APP] pool del test; archivos de test
        },
        "import_summary": {
          "es": "Importación finalizada. Importados: {imported}. Duplicados omitidos: {skippedDuplicates}. Validaciones fallidas: {failedValidation}. Entradas de archivo comprimido fallidas: {failedArchiveEntries}. Escrituras fallidas: {failedWrites}.",
          "en": "Import finished. Imported: {imported}. Skipped duplicates: {skippedDuplicates}. Failed validation: {failedValidation}. Failed archive entries: {failedArchiveEntries}. Failed writes: {failedWrites}."
          // [PROPÓSITO] Resumen posterior a importar archivos de test al pool.
          // [CONCEPTO_APP] pool del test; archivos de test
        },
        "import_conflict": {
          "title": {
            "es": "Importar archivos",
            "en": "Import files"
            // [PROPÓSITO] Título de la ventana modal de importación de archivos cuando hay archivos conflictivos.
            // [CONCEPTO_APP] archivos de test; pool del test
          },
          "message": {
            "es": "Algunos archivos importados ya existen en el pool. ¿Cómo quieres manejar los duplicados?",
            "en": "Some imported files already exist in the pool. How should duplicates be handled?"
            // [PROPÓSITO] Decisión de manejo de duplicados al importar archivos al pool del test.
            // [CONCEPTO_APP] archivos de test; pool del test
          },
          "detail": {
            "es": "El pool ya contiene {count} de los nombres de archivo de destino.",
            "en": "The pool already contains {count} of the destination filenames."
            // [CONCEPTO_APP] archivos de test; pool del test
          },
          "buttons": {
            "skip": {
              "es": "Omitir duplicados",
              "en": "Skip duplicates"
              // [CONCEPTO_APP] archivos de test; pool del test
            },
            "replace": {
              "es": "Reemplazar duplicados",
              "en": "Replace duplicates"
              // [CONCEPTO_APP] archivos de test; pool del test
            },
            "cancel": {
              "es": "Cancelar importación",
              "en": "Cancel import"
              // [CONCEPTO_APP] archivos de test; pool del test
            }
          }
        },
        "buttons": {
          "get_more_files": {
            "es": "Obtener más archivos",
            "en": "Get more files"
            // [PROPÓSITO] Acción para obtener más archivos de test desde la fuente externa configurada. Abre una carpeta de Google Drive en el navegador del sistema.
            // [CONCEPTO_APP] archivos de test; pool del test
          },
          "import_files": {
            "es": "Importar archivos",
            "en": "Import files"
            // [PROPÓSITO] Acción para importar archivos de test desde el dispositivo al pool local.
            // [CONCEPTO_APP] archivos de test; pool del test
          },
          "show_instructions": {
            "es": "Mostrar instrucciones",
            "en": "Show instructions"
            // [CONCEPTO_APP] Test de velocidad de lectura
          },
          "hide_instructions": {
            "es": "Ocultar instrucciones",
            "en": "Hide instructions"
            // [CONCEPTO_APP] Test de velocidad de lectura
          },
          "start_random_text": {
            "es": "Iniciar con texto aleatorio",
            "en": "Start with random text"
            // [PROPÓSITO] Inicia el test reemplazando el texto actual por un texto elegible aleatorio del pool.
            // [CONCEPTO_APP] Test de velocidad de lectura; pool del test; texto actual
          },
          "start_current_text": {
            "es": "Iniciar con texto actual",
            "en": "Start with current text"
            // [PROPÓSITO] Inicia el test usando el texto actual, no un archivo del pool.
            // [CONCEPTO_APP] Test de velocidad de lectura; texto actual
          },
          "show_bundled_entries": {
            "es": "Tests incorporados",
            "en": "Built-in tests"
            // [PROPÓSITO] Control de inclusión de archivos de test iniciales que vienen incorporados en el build de la app.
            // [CONCEPTO_APP] archivos de test; pool del test; tests incorporados
          }
        },
        "tooltips": {
          "show_bundled_entries": {
            "es": "Incluir en el pool los archivos de test iniciales incorporados en la app",
            "en": "Include the app's bundled starter test files in the pool"
            // [CONCEPTO_APP] archivos de test; pool del test; tests incorporados
          },
          "get_more_files": {
            "es": "Obtener más archivos de test desde la carpeta de Google Drive",
            "en": "Get more test files from the Google Drive folder"
            // [CONCEPTO_APP] archivos de test; pool del test
            // [PROTEGIDO] `Google Drive`
          },
          "import_files": {
            "es": "Importar archivos de test desde tu dispositivo",
            "en": "Import test files from your device"
            // [CONCEPTO_APP] archivos de test; pool del test
          },
          "reset_pool": {
            "es": "Restablecer pool del test",
            "en": "Reset test pool"
            // [PROPÓSITO] Acción para restablecer el estado de uso de todos los archivos del pool del test.
            // [CONCEPTO_APP] pool del test; archivos de test
          },
          "start_random_text": {
            "es": "Iniciar el test con un texto aleatorio elegible del pool",
            "en": "Start the test with a random eligible text from the pool"
            // [CONCEPTO_APP] Test de velocidad de lectura; pool del test
          },
          "start_current_text": {
            "es": "Iniciar el test con el texto actual",
            "en": "Start the test with the current text"
            // [CONCEPTO_APP] Test de velocidad de lectura; texto actual
          }
        }
      },
      "questions": {
        "title": {
          "es": "Preguntas de comprensión lectora",
          "en": "Reading comprehension questions"
          // [CONCEPTO_APP] Test de velocidad de lectura
        },
        "intro": {
          "es": "Responder estas preguntas de comprensión lectora es opcional y no afecta tu puntaje final. Solo sirven para ayudarte a evaluar la dificultad del texto y si tu ritmo y estilo de lectura te permitieron alcanzar un nivel básico de comprensión. Tus respuestas no se guardan ni se envían a los desarrolladores ni a ninguna otra persona.",
          "en": "Answering these reading comprehension questions is optional and does not affect your final score. They are only meant to help you assess the text's difficulty and whether your reading pace and style allowed you to reach a basic level of comprehension. Your answers are not saved or sent to the developers or to anyone else."
          // [PROPÓSITO] Explica que las preguntas de comprensión son opcionales, no afectan el WPM y no se guardan/envían.
          // [CONCEPTO_APP] Test de velocidad de lectura
        },
        "random_title": {
          "es": "Línea base de azar",
          "en": "Random guess baseline"
          // [PROPÓSITO] Sección estadística de referencia para comparar el resultado contra azar.
          // [CONCEPTO_APP] Test de velocidad de lectura
        },
        "random_value": {
          "es": "Puntaje esperado al responder al azar: {percentage}",
          "en": "Expected score under random guessing: {percentage}"
          // [PROPÓSITO] Valor esperado si las preguntas se respondieran al azar.
          // [CONCEPTO_APP] Test de velocidad de lectura
        },
        "feedback_title": {
          "es": "Feedback",
          "en": "Feedback"
        },
        "feedback_prefix": {
          "es": "Para reclamos:",
          "en": "For complaints:"
        },
        "question_heading": {
          "es": "{number}. {prompt}",
          "en": "{number}. {prompt}"
        },
        "incomplete_warning": {
          "es": "Debes responder todas las preguntas antes de evaluar.",
          "en": "All questions must be answered before evaluating."
        },
        "result_summary": {
          "es": "{correct} de {total} correctas ({percentage})",
          "en": "{correct} out of {total} correct ({percentage})"
          // [CONCEPTO_APP] Test de velocidad de lectura
        },
        "chance_at_least_observed": {
          "es": "Probabilidad de obtener al menos este puntaje al responder al azar: {percentage}",
          "en": "Chance of getting at least this score by random guessing: {percentage}"
          // [CONCEPTO_APP] Test de velocidad de lectura
        },
        "fatal_invalid": {
          "es": "La carga de preguntas es inválida.",
          "en": "The questions data is invalid."
        },
        "buttons": {
          "check": {
            "es": "Ver resultado",
            "en": "Check result"
          },
          "continue": {
            "es": "Continuar",
            "en": "Continue"
          }
        }
      },
      "result": {
        "title": {
          "es": "Resultado de velocidad de lectura",
          "en": "Reading speed result"
          // [CONCEPTO_APP] Test de velocidad de lectura
        },
        "measured_wpm": {
          "es": "WPM medidos",
          "en": "Measured WPM"
          // [PROPÓSITO] Resultado de velocidad medido por el test, expresado en WPM.
          // [CONCEPTO_APP] Test de velocidad de lectura; velocidad de lectura
          // [PROTEGIDO] `WPM`
        },
        "elapsed_time": {
          "es": "Tiempo",
          "en": "Time"
          // [PROPÓSITO] Label del tiempo que duró el test.
          // [CONCEPTO_APP] Test de velocidad de lectura
        },
        "word_count": {
          "es": "Palabras",
          "en": "Words"
          // [PROPÓSITO] Label de la cantidad de palabras del texto del test.
          // [CONCEPTO_APP] Test de velocidad de lectura
        },
        "buttons": {
          "continue": {
            "es": "Continuar",
            "en": "Continue"
          }
        }
      }
    },
    "modal_preset": {
      "title_new": {
        "es": "Nuevo preset",
        "en": "New preset"
        // [CONCEPTO_APP] preset de velocidad de lectura
      },
      "title_edit": {
        "es": "Editar preset",
        "en": "Edit preset"
        // [CONCEPTO_APP] preset de velocidad de lectura
      },
      "heading_new": {
        "es": "Crear nuevo preset",
        "en": "Create new preset"
        // [CONCEPTO_APP] preset de velocidad de lectura
      },
      "heading_edit": {
        "es": "Editar preset seleccionado",
        "en": "Edit selected preset"
        // [CONCEPTO_APP] preset de velocidad de lectura
      },
      "name": {
        "es": "Nombre:",
        "en": "Name:"
      },
      "wpm": {
        "es": "WPM:",
        "en": "WPM:"
        // [CONCEPTO_APP] preset de velocidad de lectura; velocidad de lectura
        // [PROTEGIDO] `WPM`
      },
      "description": {
        "es": "Descripción:",
        "en": "Description:"
      },
      "placeholder": {
        "es": "Descripción breve...",
        "en": "Short description..."
      },
      "char_count": {
        "es": "Caracteres restantes: {remaining}",
        "en": "Remaining characters: {remaining}"
      },
      "hint": {
        "es": "Los presets personalizados se guardan en la configuración del usuario.",
        "en": "Custom presets are stored in user settings."
      },
      "cancel": {
        "es": "Cancelar",
        "en": "Cancel"
      },
      "save": {
        "es": "Guardar",
        "en": "Save"
      }
    },
    "browser_extension": {
      "title": {
        "es": "Extensión del navegador",
        "en": "Browser extension"
        // [CONCEPTO_APP] extensión del navegador
      },
      "subtitle": {
        "es": "Tiempo de lectura",
        "en": "Reading time"
        // [PROPÓSITO] Nombre de la extensión de navegador dentro de la ventana informativa. En otros idiomas, a menos que se decida lo contrario se debe usar `Tiempo de lectura`, en español.
        // [CONCEPTO_APP] extensión del navegador
      },
      "availability": {
        "es": "Disponible ahora en Chrome. Más navegadores pronto.",
        "en": "Available on Chrome now. More browsers coming soon."
        // [CONCEPTO_APP] extensión del navegador
        // [PROTEGIDO] `Chrome`
      },
      "chrome_store_aria": {
        "es": "Abrir página de Chrome Web Store de la extensión",
        "en": "Open the extension Chrome Web Store page"
        // [CONCEPTO_APP] extensión del navegador
        // [PROTEGIDO] `Chrome Web Store`
      },
      "close_aria": {
        "es": "Cerrar ventana de extensión del navegador",
        "en": "Close browser extension window"
        // [CONCEPTO_APP] extensión del navegador
      }
    },
    "alerts": {
      "clipboard_too_large": {
        "es": "El texto del portapapeles es demasiado grande para usarse. Acórtalo y vuelve a intentarlo.",
        "en": "Clipboard text is too large to use. Shorten it and try again."
        // [PROPÓSITO] Informa que la operación sobre el texto actual no puede comenzar porque el texto tomado desde el portapapeles ya supera el límite de caracteres para usarlo como entrada.
        // [CONCEPTO_APP] texto actual; reemplazar texto actual; agregar al texto actual
      },
      "apply_too_large": {
        "es": "El texto quedaría demasiado grande para aplicarlo. Redúcelo y vuelve a intentarlo.",
        "en": "The text would become too large to apply. Reduce it and try again."
        // [PROPÓSITO] Informa que la operación sobre el texto actual no puede completarse porque, al aplicar el texto, el resultado final superaría el límite del texto actual admitido por la app.
        // [CONCEPTO_APP] texto actual; reemplazar texto actual; agregar al texto actual; repeticiones de pegado; extracción de texto
      },
      "apply_truncated": {
        "es": "El texto fue truncado para ajustarse al límite de la app.",
        "en": "The text was truncated to fit the app limit."
        // [PROPÓSITO] Informa que la operación sobre el texto actual se completó, pero el texto final quedó recortado para ajustarse al límite del texto actual admitido por la app.
        // [CONCEPTO_APP] texto actual; reemplazar texto actual; agregar al texto actual; repeticiones de pegado; extracción de texto
      },
      "append_text_limit": {
        "es": "No se puede agregar el texto: ya se alcanzó el tamaño máximo.",
        "en": "Cannot append the text: maximum size reached."
        // [PROPÓSITO] Informa que no se puede seguir agregando texto porque el texto actual ya alcanzó el límite máximo admitido por la app.
        // [CONCEPTO_APP] texto actual; agregar al texto actual; repeticiones de pegado; extracción de texto
      },
      "overwrite_clipboard_error": {
        "es": "Ocurrió un error al reemplazar el texto actual con el texto del portapapeles.",
        "en": "An error occurred while replacing the current text with the clipboard text."
        // [CONCEPTO_APP] texto actual; reemplazar texto actual; repeticiones de pegado
      },
      "append_clipboard_error": {
        "es": "Ocurrió un error al agregar el texto del portapapeles al texto actual.",
        "en": "An error occurred while appending the clipboard text to the current text."
        // [CONCEPTO_APP] texto actual; agregar al texto actual; repeticiones de pegado
      },
      "clear_error": {
        "es": "Ocurrió un error al vaciar el texto actual.",
        "en": "An error occurred while clearing the current text."
        // [CONCEPTO_APP] texto actual
      },
      "snapshot_save_success": {
        "es": "Snapshot de texto guardado.",
        "en": "Text snapshot saved."
        // [CONCEPTO_APP] snapshot de texto; texto actual
      },
      "snapshot_save_error": {
        "es": "No se pudo guardar el snapshot de texto.",
        "en": "Could not save the text snapshot."
        // [CONCEPTO_APP] snapshot de texto; texto actual
      },
      "snapshot_load_success": {
        "es": "Snapshot de texto cargado.",
        "en": "Text snapshot loaded."
        // [CONCEPTO_APP] snapshot de texto; texto actual
      },
      "snapshot_load_error": {
        "es": "No se pudo cargar el snapshot de texto.",
        "en": "Could not load the text snapshot."
        // [CONCEPTO_APP] snapshot de texto; texto actual
      },
      "snapshot_outside": {
        "es": "El snapshot de texto debe estar dentro de la carpeta de snapshots.",
        "en": "The text snapshot must be inside the snapshots folder."
        // [CONCEPTO_APP] snapshot de texto
      },
      "snapshot_truncated": {
        "es": "El snapshot de texto excedía el tamaño máximo y fue truncado.",
        "en": "Text snapshot exceeded the maximum size and was truncated."
        // [PROPÓSITO] El texto contenido por el snapshot fue aplicado al texto actual, pero fue truncado al superar el límite admitido por la app.
        // [CONCEPTO_APP] snapshot de texto; texto actual
      },
      "snapshot_unavailable": {
        "es": "La función de snapshots de texto no está disponible.",
        "en": "Text snapshot functionality is unavailable."
        // [CONCEPTO_APP] snapshot de texto
      },
      "browser_extension_modal_open_blocked": {
        "es": "La ventana de la extensión del navegador no puede abrirse ahora mismo.",
        "en": "The browser extension window cannot be opened right now."
        // [CONCEPTO_APP] extensión del navegador
      },
      "preset_not_found": {
        "es": "Preset seleccionado no encontrado.",
        "en": "Selected preset not found."
        // [CONCEPTO_APP] preset de velocidad de lectura
      },
      "preset_modal_unavailable": {
        "es": "La ventana de preset no está disponible en esta build de la app.",
        "en": "The preset window is unavailable in this app build."
        // [CONCEPTO_APP] preset de velocidad de lectura
      },
      "preset_modal_open_error": {
        "es": "Ocurrió un error al abrir la ventana de preset.",
        "en": "An error occurred while opening the preset window."
        // [CONCEPTO_APP] preset de velocidad de lectura
      },
      "delete_error": {
        "es": "Ocurrió un error al borrar el preset.",
        "en": "An error occurred while deleting the preset."
        // [CONCEPTO_APP] preset de velocidad de lectura
      },
      "restore_error": {
        "es": "Ocurrió un error al restaurar presets.",
        "en": "An error occurred while restoring presets."
        // [CONCEPTO_APP] preset de velocidad de lectura
      },
      "open_presets_unsupported": {
        "es": "No es posible abrir la carpeta de presets en este entorno.",
        "en": "Cannot open presets folder in this environment."
        // [CONCEPTO_APP] preset de velocidad de lectura
      },
      "open_presets_error": {
        "es": "Ocurrió un error al intentar abrir la carpeta de presets.",
        "en": "An error occurred while trying to open the presets folder."
        // [CONCEPTO_APP] preset de velocidad de lectura
      },
      "open_presets_fail": {
        "es": "No se pudo abrir la carpeta de presets por defecto.",
        "en": "Could not open the default presets folder."
        // [CONCEPTO_APP] preset de velocidad de lectura
      },
      "text_extraction_error": {
        "es": "Ocurrió un error al iniciar la extracción.",
        "en": "An error occurred while starting extraction."
        // [CONCEPTO_APP] extracción de texto
      },
      "text_extraction_precondition_blocked": {
        "es": "Para iniciar la extracción, cierra todas las ventanas secundarias y detén el cronómetro.",
        "en": "To start text extraction, close all secondary windows and stop the stopwatch."
        // [PROPÓSITO] Alerta de bloqueo preventivo antes de iniciar extracción por ventanas secundarias abiertas o cronómetro no restablecido a 0.
        // [CONCEPTO_APP] extracción de texto; Cronómetro; ventanas secundarias
      },
      "text_extraction_precondition_error": {
        "es": "Ocurrió un error al revisar las precondiciones de extracción.",
        "en": "An error occurred while checking text extraction preconditions."
        // [CONCEPTO_APP] extracción de texto; Cronómetro; ventanas secundarias
      },
      "text_extraction_processing_locked": {
        "es": "Hay una extracción en curso. Las interacciones de la ventana principal están bloqueadas hasta que termine la extracción o sea cancelada.",
        "en": "There is an extraction in progress. Main-window interactions are locked until the extraction finishes or is cancelled."
        // [PROPÓSITO] Alerta cuando una extracción en curso bloquea interacciones de la ventana principal.
        // [CONCEPTO_APP] extracción de texto
      },
      "current_text_processing_locked": {
        "es": "El texto actual todavía se está actualizando. Las interacciones de la ventana principal quedan bloqueadas hasta que se asiente el texto más reciente.",
        "en": "Current text is still updating. Main-window interactions are locked until the latest text settles."
        // [PROPÓSITO] Alerta cuando una actualización del texto actual bloquea temporalmente interacciones de la ventana principal.
        // [CONCEPTO_APP] texto actual
        // [NO_CONFUNDIR] No indica una extracción de texto en curso; indica que el texto actual aún no se estabiliza.
      },
      "current_text_recount_locked": {
        "es": "Los resultados del texto actual todavía se están recalculando. Las interacciones de la ventana principal quedan bloqueadas hasta que se asiente el último reconteo.",
        "en": "Current text results are still being recalculated. Main-window interactions are locked until the latest recount settles."
        // [PROPÓSITO] Alerta cuando el reconteo de resultados del texto actual bloquea temporalmente interacciones de la ventana principal.
        // [CONCEPTO_APP] texto actual
        // [NO_CONFUNDIR] No indica extracción, OCR ni aplicación de texto nuevo; indica reconteo pendiente.
      },
      "text_extraction_abort_error": {
        "es": "Ocurrió un error al solicitar la cancelación.",
        "en": "An error occurred while requesting cancellation."
        // [CONCEPTO_APP] extracción de texto
      },
      "text_extraction_cancellation_requested": {
        "es": "Cancelación solicitada. Por favor, espera a que termine.",
        "en": "Cancellation requested. Please wait for it to finish."
        // [CONCEPTO_APP] extracción de texto
      },
      "text_extraction_cancellation_complete": {
        "es": "La cancelación terminó.",
        "en": "Cancellation finished."
        // [CONCEPTO_APP] extracción de texto
      },
      "text_extraction_drop_invalid_file": {
        "es": "El elemento soltado no es un archivo local válido.",
        "en": "Dropped item is not a valid local file."
        // [CONCEPTO_APP] extracción de texto
      },
      "text_extraction_pdf_unreadable_or_corrupt": {
        "es": "Este PDF es ilegible o está corrupto. Revisa el archivo y vuelve a intentarlo.",
        "en": "This PDF is unreadable or corrupt. Check the file and try again."
        // [CONCEPTO_APP] PDF fuente
        // [PROTEGIDO] `PDF`
      },
      "text_extraction_pdf_encrypted_or_password_protected": {
        "es": "Este PDF está cifrado o protegido por contraseña. Desbloquéalo y vuelve a intentarlo.",
        "en": "This PDF is encrypted or password-protected. Unlock it and try again."
        // [CONCEPTO_APP] PDF fuente
        // [PROTEGIDO] `PDF`
      },
      "text_extraction_pdf_page_count_unavailable": {
        "es": "No fue posible determinar el número de páginas de este PDF.",
        "en": "Could not determine the number of pages in this PDF."
        // [CONCEPTO_APP] PDF fuente
        // [PROTEGIDO] `PDF`
      },
      "text_extraction_pdf_page_selection_invalid": {
        "es": "El rango de páginas seleccionado para el PDF es inválido. Ajusta el rango y vuelve a intentarlo.",
        "en": "The selected PDF page range is invalid. Adjust the range and try again."
        // [PROPÓSITO] Alerta cuando la selección de páginas PDF no es válida para continuar.
        // [CONCEPTO_APP] selección de páginas PDF
        // [PROTEGIDO] `PDF`
      },
      "text_extraction_pdf_subset_creation_failed": {
        "es": "No fue posible crear el PDF de páginas seleccionadas para la extracción. Revisa el archivo y vuelve a intentarlo.",
        "en": "The selected-page PDF could not be created for extraction. Check the file and try again."
        // [PROPÓSITO] Alerta cuando falla la creación del PDF generado de páginas seleccionadas.
        // [CONCEPTO_APP] PDF generado; selección de páginas PDF
        // [PROTEGIDO] `PDF`
      },
      "text_extraction_generated_pdf_cleanup_warning": {
        "es": "La extracción terminó, pero no fue posible limpiar automáticamente un PDF local generado.",
        "en": "Extraction finished, but a generated local PDF could not be cleaned up automatically."
        // [PROPÓSITO] Advertencia de limpieza local fallida de un PDF generado después de completar extracción.
        // [CONCEPTO_APP] PDF generado
        // [PROTEGIDO] `PDF`
      },
      "text_extraction_route_choice_error": {
        "es": "Ocurrió un error al elegir la ruta de extracción.",
        "en": "An error occurred while choosing the extraction route."
        // [PROPÓSITO] Alerta de fallo en el paso crítico de elección de ruta de extracción.
        // [CONCEPTO_APP] ruta de extracción
      },
      "text_extraction_generated_pdf_reveal_failed": {
        "es": "No se pudo mostrar el PDF guardado. Revisa si el archivo sigue existiendo.",
        "en": "The saved PDF could not be revealed. Check whether the file still exists."
        // [PROPÓSITO] Alerta cuando no se puede mostrar la carpeta de un PDF generado guardado.
        // [CONCEPTO_APP] PDF generado; PDF guardado
        // [PROTEGIDO] `PDF`
      },
      "text_extraction_apply_error": {
        "es": "Ocurrió un error al aplicar el texto extraído.",
        "en": "An error occurred while applying extracted text."
        // [CONCEPTO_APP] extracción de texto; texto actual
      },
      "text_extraction_prepare_invalid": {
        "es": "La solicitud preparada de extracción ya no es válida. Inicia el flujo nuevamente.",
        "en": "The prepared extraction request is no longer valid. Start the flow again."
        // [PROPÓSITO] Informa que el estado preparado para ejecutar la extracción ya no es válido o ya no coincide con el archivo fuente, por lo que el flujo debe iniciarse de nuevo.
        // [CONCEPTO_APP] extracción de texto; PDF fuente
      },
      "text_extraction_batch_ocr_activation_required": {
        "es": "Este lote incluye ítems con OCR, pero Google OCR no está activado. Usa Preferencias > Activar Google OCR y luego vuelve a iniciar la extracción.",
        "en": "This batch includes OCR items, but Google OCR is not enabled. Use Preferences > Enable Google OCR, then start the extraction again."
        // [PROPÓSITO] Alerta previa a lote con ítems OCR cuando Google OCR no está activado.
        // [CONCEPTO_APP] extracción por lotes; ítem de extracción por lotes; OCR; Google OCR; token local OCR
        // [PROTEGIDO] `OCR`; `Google OCR`
      },
      "text_extraction_batch_ocr_token_state_invalid": {
        "es": "Este lote incluye ítems con OCR, pero el estado guardado de inicio de sesión de Google OCR no es válido. Usa Preferencias > Activar Google OCR de nuevo y luego vuelve a iniciar la extracción.",
        "en": "This batch includes OCR items, but the saved Google OCR sign-in state is invalid. Use Preferences > Enable Google OCR again, then start the extraction again."
        // [PROPÓSITO] Alerta previa a lote con OCR cuando el estado guardado de inicio de sesión no es válido.
        // [CONCEPTO_APP] extracción por lotes; OCR; Google OCR; token local OCR
        // [PROTEGIDO] `OCR`; `Google OCR`
      },
      "text_extraction_batch_ocr_connectivity_failed": {
        "es": "Este lote incluye ítems con OCR, pero OCR requiere conexión a internet. Revisa tu conexión y vuelve a intentarlo antes de iniciar la extracción.",
        "en": "This batch includes OCR items, but OCR requires an internet connection. Check your connection and try again before starting the extraction."
        // [CONCEPTO_APP] extracción por lotes; OCR; Google OCR
        // [PROTEGIDO] `OCR`
      },
      "text_extraction_batch_ocr_quota_or_rate_limited": {
        "es": "Este lote incluye ítems con OCR, pero OCR está bloqueado temporalmente por cuota/límite de uso. Espera y vuelve a intentarlo antes de iniciar la extracción.",
        "en": "This batch includes OCR items, but OCR is temporarily blocked by quota/rate limits. Wait and try again before starting the extraction."
        // [CONCEPTO_APP] extracción por lotes; OCR; Google OCR
        // [PROTEGIDO] `OCR`
      },
      "text_extraction_batch_ocr_unavailable": {
        "es": "Este lote incluye ítems con OCR, pero Google OCR no está disponible ahora mismo. Si todavía no está activado, usa Preferencias > Activar Google OCR. Si ya estaba activado, revisa el estado/configuración de OCR y vuelve a intentarlo antes de iniciar la extracción.",
        "en": "This batch includes OCR items, but Google OCR is not available right now. If OCR is not enabled yet, use Preferences > Enable Google OCR. Otherwise, check the OCR setup/status and try again before starting the extraction."
        // [PROPÓSITO] Alerta previa a lote cuando OCR no está disponible para ítems que lo requieren.
        // [CONCEPTO_APP] extracción por lotes; OCR; Google OCR; token local OCR
        // [PROTEGIDO] `OCR`; `Google OCR`
      },
      "text_extraction_ocr_unavailable": {
        "es": "OCR no está disponible. Revisa la configuración/autenticación y vuelve a intentarlo.",
        "en": "OCR is unavailable. Check setup/auth status and try again."
        // [CONCEPTO_APP] OCR; Google OCR; token local OCR
        // [PROTEGIDO] `OCR`
      },
      "text_extraction_ocr_activation_required": {
        "es": "Se requiere activar OCR. Inicia sesión en Google OCR y vuelve a intentarlo.",
        "en": "OCR activation is required. Sign in to Google OCR and try again."
        // [PROPÓSITO] Alerta durante extracción individual cuando OCR requiere activación/autenticación antes de continuar.
        // [CONCEPTO_APP] OCR; Google OCR; token local OCR
        // [PROTEGIDO] `OCR`; `Google OCR`
      },
      "text_extraction_ocr_activation_success": {
        "es": "Activación OCR completada. Reintentando extracción.",
        "en": "OCR activation completed. Retrying extraction."
        // [PROPÓSITO] Alerta de activación OCR completada con reintento automático de extracción.
        // [CONCEPTO_APP] OCR; Google OCR; token local OCR
        // [PROTEGIDO] `OCR`
      },
      "text_extraction_ocr_activation_cancelled": {
        "es": "La activación OCR fue cancelada. La extracción no continuó.",
        "en": "OCR activation was cancelled. Extraction did not continue."
        // [CONCEPTO_APP] OCR; Google OCR; token local OCR
        // [PROTEGIDO] `OCR`
      },
      "text_extraction_ocr_token_state_invalid": {
        "es": "El estado guardado de inicio de sesión de Google OCR es inválido. Reconecta Google OCR y vuelve a intentarlo.",
        "en": "Saved Google OCR sign-in state is invalid. Reconnect Google OCR and try again."
        // [CONCEPTO_APP] OCR; Google OCR; token local OCR
        // [PROTEGIDO] `Google OCR`
      },
      "text_extraction_ocr_activation_failed": {
        "es": "La activación OCR falló. Revisa la configuración/autenticación y vuelve a intentarlo.",
        "en": "OCR activation failed. Check setup/auth status and try again."
        // [CONCEPTO_APP] OCR; Google OCR; token local OCR; credenciales OAuth OCR
        // [PROTEGIDO] `OCR`
      },
      "text_extraction_ocr_enable_success": {
        "es": "Google OCR quedó activado.",
        "en": "Google OCR is now enabled."
        // [PROPÓSITO] Alerta de activación manual de Google OCR desde Preferencias.
        // [CONCEPTO_APP] Google OCR; token local OCR
        // [PROTEGIDO] `Google OCR`
      },
      "text_extraction_ocr_enable_cancelled": {
        "es": "La activación de Google OCR fue cancelada.",
        "en": "Google OCR activation was cancelled."
        // [CONCEPTO_APP] Google OCR; token local OCR
        // [PROTEGIDO] `Google OCR`
      },
      "text_extraction_ocr_enable_failed": {
        "es": "No se pudo activar Google OCR. Revisa la configuración/autenticación y vuelve a intentarlo.",
        "en": "Google OCR could not be enabled. Check setup/auth status and try again."
        // [CONCEPTO_APP] Google OCR; token local OCR; credenciales OAuth OCR
        // [PROTEGIDO] `Google OCR`
      },
      "text_extraction_ocr_disconnect_success": {
        "es": "Google OCR fue desconectado. El token guardado de Google fue revocado y se eliminó el estado local de inicio de sesión.",
        "en": "Google OCR was disconnected. The saved Google token was revoked and the local sign-in state was removed."
        // [PROPÓSITO] Alerta de desconexión manual de Google OCR con revocación/eliminación del estado local.
        // [CONCEPTO_APP] Google OCR; token local OCR
        // [PROTEGIDO] `Google OCR`; `Google`
      },
      "text_extraction_ocr_disconnect_not_connected": {
        "es": "Google OCR no está conectado actualmente en esta instancia de la app.",
        "en": "Google OCR is not currently connected in this app instance."
        // [CONCEPTO_APP] Google OCR; token local OCR
        // [PROTEGIDO] `Google OCR`
      },
      "text_extraction_ocr_disconnect_failed": {
        "es": "La desconexión de Google OCR falló. El estado guardado de inicio de sesión no fue eliminado.",
        "en": "Google OCR disconnect failed. The saved sign-in state was not removed."
        // [CONCEPTO_APP] Google OCR; token local OCR
        // [PROTEGIDO] `Google OCR`
      },
      "text_extraction_ocr_connectivity_failed": {
        "es": "OCR requiere conexión a internet. Revisa tu conexión y vuelve a intentarlo.",
        "en": "OCR requires an internet connection. Check your connection and try again."
        // [CONCEPTO_APP] OCR; Google OCR
        // [PROTEGIDO] `OCR`
      },
      "text_extraction_ocr_setup_missing_credentials": {
        "es": "OCR no está disponible en este build de la app porque faltan las credenciales OAuth de Google incluidas con la app.",
        "en": "OCR is unavailable in this app build because the bundled Google OAuth credentials are missing."
        // [CONCEPTO_APP] OCR; Google OCR; credenciales OAuth OCR
        // [PROTEGIDO] `OCR`; `OAuth`; `Google`
      },
      "text_extraction_ocr_setup_invalid_credentials": {
        "es": "OCR no está disponible en este build de la app porque las credenciales OAuth de Google incluidas con la app son inválidas.",
        "en": "OCR is unavailable in this app build because the bundled Google OAuth credentials are invalid."
        // [CONCEPTO_APP] OCR; Google OCR; credenciales OAuth OCR
        // [PROTEGIDO] `OCR`; `OAuth`; `Google`
      },
      "text_extraction_ocr_quota_or_rate_limited": {
        "es": "OCR está bloqueado temporalmente por cuota/límite de uso. Espera y vuelve a intentarlo.",
        "en": "OCR is temporarily blocked by quota/rate limits. Wait and try again."
        // [CONCEPTO_APP] OCR; Google OCR
        // [PROTEGIDO] `OCR`
      },
      "text_extraction_ocr_runtime_error": {
        "es": "Ocurrió un error de ejecución de OCR durante la extracción.",
        "en": "An OCR runtime error occurred during extraction."
        // [CONCEPTO_APP] OCR; extracción de texto
        // [PROTEGIDO] `OCR`
      },
      "text_extraction_ocr_cancelled": {
        "es": "La extracción OCR fue cancelada.",
        "en": "OCR text extraction was cancelled."
        // [CONCEPTO_APP] OCR; extracción de texto
        // [PROTEGIDO] `OCR`
      },
      "text_extraction_ocr_cleanup_warning": {
        "es": "OCR terminó, pero falló la limpieza temporal remota del archivo. Revisa tu carpeta de Google Drive.",
        "en": "OCR finished, but temporary remote file cleanup failed. Check your Google Drive folder."
        // [PROPÓSITO] Advertencia de limpieza remota fallida del documento temporal usado por OCR.
        // [CONCEPTO_APP] OCR; Google OCR; extracción de texto
        // [PROTEGIDO] `OCR`; `Google Drive`
      },
      "text_extraction_native_runtime_error": {
        "es": "Ocurrió un error en la ejecución de la extracción nativa.",
        "en": "A native extraction runtime error occurred."
        // [CONCEPTO_APP] ruta nativa; extracción de texto
      },
      "text_extraction_native_unreadable_or_corrupt": {
        "es": "El archivo seleccionado es ilegible o está corrupto para extracción nativa.",
        "en": "The selected file is unreadable or corrupt for native extraction."
        // [CONCEPTO_APP] ruta nativa; extracción de texto
      },
      "text_extraction_native_encrypted_or_password_protected": {
        "es": "El PDF seleccionado está cifrado o protegido por contraseña y no puede extraerse por ruta nativa.",
        "en": "The selected PDF is encrypted or password-protected and cannot be extracted natively."
        // [PROPÓSITO] Alerta específica de PDF cifrado/protegido cuando la ruta nativa no puede extraerlo.
        // [CONCEPTO_APP] ruta nativa; PDF fuente; extracción de texto
        // [PROTEGIDO] `PDF`
      },
      "text_extraction_native_cancelled": {
        "es": "La extracción nativa fue cancelada.",
        "en": "Native extraction was cancelled."
        // [CONCEPTO_APP] ruta nativa; extracción de texto
      },
      "text_extraction_unsupported_format": {
        "es": "La extracción de texto no admite este formato de archivo.",
        "en": "Text extraction does not support this file format."
        // [CONCEPTO_APP] extracción de texto
      },
      "wip_diseno_skins": {
        "es": "WIP: Aquí se abrirá el selector de skins en una futura versión.",
        "en": "WIP: The skins selector will open here in a future version."
        // [PROTEGIDO] `WIP`
      },
      "wip_diseno_crono": {
        "es": "WIP: Aquí se abrirá la configuración del Cronómetro Flotante en una futura versión.",
        "en": "WIP: Floating Stopwatch settings will open here in a future version."
        // [CONCEPTO_APP] Cronómetro Flotante
        // [PROTEGIDO] `WIP`
      },
      "wip_diseno_fuentes": {
        "es": "WIP: Aquí se abrirá el selector de fuentes en una futura versión.",
        "en": "WIP: The fonts selector will open here in a future version."
        // [PROTEGIDO] `WIP`
      },
      "wip_diseno_colores": {
        "es": "WIP: Aquí se abrirá el selector de colores en una futura versión.",
        "en": "WIP: The colors selector will open here in a future version."
        // [PROTEGIDO] `WIP`
      },
      "wip_shortcuts": {
        "es": "WIP: Aquí se abrirá el selector de atajos del teclado en una futura versión.",
        "en": "WIP: The keyboard shortcuts selector will open here in a future version."
        // [PROTEGIDO] `WIP`
      },
      "reading_test_unavailable": {
        "es": "La funcionalidad del test de velocidad de lectura no está disponible.",
        "en": "The reading speed test feature is unavailable."
        // [CONCEPTO_APP] Test de velocidad de lectura
      },
      "reading_test_precondition_blocked": {
        "es": "El test de velocidad de lectura solo puede iniciarse desde un estado estable de la app. Cierra las ventanas secundarias y asegúrate de que el cronómetro esté detenido.",
        "en": "The reading speed test can only start from a steady app state. Close secondary windows and make sure the stopwatch is stopped."
        // [PROPÓSITO] Alerta de bloqueo preventivo del test por estado no estable de la app.
        // [CONCEPTO_APP] Test de velocidad de lectura; Cronómetro; ventanas secundarias
      },
      "reading_test_pool_error": {
        "es": "Ocurrió un error al revisar el pool del test de velocidad de lectura.",
        "en": "An error occurred while checking the reading speed test pool."
        // [CONCEPTO_APP] pool del test
      },
      "reading_test_no_matching_files": {
        "es": "No quedan archivos de test sin usar que coincidan con la selección actual.",
        "en": "There are no remaining unused test files that match the current selection."
        // [CONCEPTO_APP] pool del test; archivos de test
      },
      "reading_test_visible_empty_bundled_hidden": {
        "es": "Los archivos de test incorporados están desactivados y no quedan archivos visibles sin usar. Vuelve a activarlos o importa más archivos para continuar.",
        "en": "The built-in test files are disabled and there are no remaining unused files. Re-enable them or import more files to continue."
        // [PROPÓSITO] Alerta de resguardo para un estado anómalo; parece duplicar una alerta normal, pero cubre un camino excepcional distinto.
        // [CONCEPTO_APP] pool del test; archivos de test; tests incorporados
      },
      "reading_test_current_text_empty": {
        "es": "El texto actual está vacío. Carga o escribe un texto antes de iniciar el test con texto actual.",
        "en": "The current text is empty. Load or type text before starting the test with current text."
        // [PROPÓSITO] Alerta específica de inicio del test con texto actual vacío.
        // [CONCEPTO_APP] Test de velocidad de lectura; texto actual
      },
      "reading_test_result_invalid": {
        "es": "El resultado del test no pudo convertirse en un WPM válido. El flujo terminó sin abrir la ventana de preset.",
        "en": "The test result could not be converted into a valid WPM. The flow ended without opening the preset window."
        // [PROPÓSITO] Alerta cuando el resultado del test no puede convertirse en un WPM válido y la ventana modal para creación de un preset de velocidad se deja sin abrir.
        // [CONCEPTO_APP] Test de velocidad de lectura; preset de velocidad de lectura
        // [PROTEGIDO] `WPM`
      },
      "reading_test_result_unavailable": {
        "es": "No se pudo mostrar el resultado de velocidad de lectura. El flujo continuó.",
        "en": "The reading speed result could not be shown. The flow continued."
        // [CONCEPTO_APP] Test de velocidad de lectura
      },
      "reading_test_preset_unavailable": {
        "es": "No se pudo abrir la ventana de preset después del test.",
        "en": "The preset window could not be opened after the test."
        // [CONCEPTO_APP] Test de velocidad de lectura; preset de velocidad de lectura
      },
      "reading_test_questions_unavailable": {
        "es": "No se pudo abrir la ventana de preguntas de comprensión. El flujo terminó antes de crear el preset.",
        "en": "The comprehension questions window could not be opened. The flow ended before preset creation."
        // [PROPÓSITO] Alerta cuando no puede abrirse la ventana de preguntas y el flujo termina antes de crear preset de velocidad.
        // [CONCEPTO_APP] Test de velocidad de lectura; preset de velocidad de lectura
      },
      "reading_test_pool_import_failed": {
        "es": "No se pudieron importar los archivos del test de velocidad de lectura.",
        "en": "The reading speed test files could not be imported."
        // [CONCEPTO_APP] pool del test; archivos de test
      },
      "reading_test_start_failed": {
        "es": "No se pudo iniciar el test de velocidad de lectura.",
        "en": "The reading speed test could not be started."
        // [CONCEPTO_APP] Test de velocidad de lectura
      },
      "text_editor_start_failed": {
        "es": "No se pudo iniciar el Editor de Texto.",
        "en": "The Text Editor could not be started."
        // [CONCEPTO_APP] Editor de Texto
      },
      "text_editor_start_timeout": {
        "es": "El Editor de Texto tardó demasiado en iniciar y fue cerrado.",
        "en": "The Text Editor took too long to start and was closed."
        // [CONCEPTO_APP] Editor de Texto
      },
      "reading_test_cancelled": {
        "es": "El test de velocidad de lectura fue cancelado.",
        "en": "The reading speed test was cancelled."
        // [CONCEPTO_APP] Test de velocidad de lectura
      },
      "reading_test_cancelled_window_closed": {
        "es": "El test de velocidad de lectura fue cancelado porque una de sus ventanas de sesión se cerró.",
        "en": "The reading speed test was cancelled because one of its session windows closed."
        // [PROPÓSITO] Alerta de cancelación del test causada por cierre de una ventana de sesión.
        // [CONCEPTO_APP] Test de velocidad de lectura
      }
    },
    "editor_alerts": {
      "paste_too_big": {
        "es": "Texto demasiado grande para pegar directamente. Usa los botones de la ventana principal.",
        "en": "Text too large to paste directly. Use the main window buttons."
        // [CONCEPTO_APP] Editor de Texto
      },
      "drop_too_big": {
        "es": "Texto arrastrado demasiado grande. Usa los botones de la ventana principal.",
        "en": "Dropped text is too large. Use the main window buttons to add large text."
        // [CONCEPTO_APP] Editor de Texto
      },
      "paste_no_text": {
        "es": "El portapapeles no contiene texto plano.",
        "en": "Clipboard does not contain plain text."
        // [CONCEPTO_APP] Editor de Texto
      },
      "drop_no_text": {
        "es": "Arrastrar y soltar: no se detectó texto plano.",
        "en": "Drag and drop: no plain text detected."
        // [CONCEPTO_APP] Editor de Texto
      },
      "type_limit": {
        "es": "No es posible escribir más texto: ya se alcanzó el tamaño máximo permitido.",
        "en": "Cannot type more text: maximum size reached."
        // [CONCEPTO_APP] Editor de Texto
      },
      "paste_limit": {
        "es": "No es posible pegar más texto: ya se alcanzó el tamaño máximo permitido.",
        "en": "Cannot paste more text: maximum size reached."
        // [CONCEPTO_APP] Editor de Texto
      },
      "drop_limit": {
        "es": "No es posible soltar más texto: ya se alcanzó el tamaño máximo permitido.",
        "en": "Cannot drop more text: maximum size reached."
        // [CONCEPTO_APP] Editor de Texto
      },
      "paste_truncated": {
        "es": "El texto pegado se ha truncado para no exceder el máximo permitido.",
        "en": "Pasted text was truncated to avoid exceeding the maximum."
        // [CONCEPTO_APP] Editor de Texto
      },
      "drop_truncated": {
        "es": "El texto arrastrado excedía el espacio disponible y fue truncado.",
        "en": "Dragged text exceeded the available space and was truncated."
        // [CONCEPTO_APP] Editor de Texto
      },
      "text_truncated": {
        "es": "El texto fue truncado para ajustarse al límite máximo de la app.",
        "en": "Text was truncated to fit the app limit."
        // [PROPÓSITO] Alerta de resguardo para un estado anómalo; parece duplicar una alerta normal, pero cubre un camino excepcional distinto.
        // [CONCEPTO_APP] Editor de Texto; texto actual
      },
      "calc_error": {
        "es": "Ocurrió un error al guardar el texto como texto actual.",
        "en": "An error occurred while saving the text as the current text."
        // [PROPÓSITO] Alerta de fallo al guardar desde el Editor de Texto hacia el texto actual con `Aplicar` o auto-aplicar.
        // [CONCEPTO_APP] Editor de Texto; texto actual
      }
    },
    "preset_alerts": {
      "name_empty": {
        "es": "El nombre no puede estar vacío.",
        "en": "Name cannot be empty."
        // [CONCEPTO_APP] preset de velocidad de lectura
      },
      "wpm_invalid": {
        "es": "WPM debe ser un número entre {min} y {max}.",
        "en": "WPM must be a number between {min} and {max}."
        // [CONCEPTO_APP] preset de velocidad de lectura; velocidad de lectura
        // [PROTEGIDO] `WPM`
      },
      "create_error": {
        "es": "Ocurrió un error al crear el preset.",
        "en": "An error occurred while creating the preset."
        // [CONCEPTO_APP] preset de velocidad de lectura
      },
      "edit_error": {
        "es": "Ocurrió un error al editar el preset.",
        "en": "An error occurred while editing the preset."
        // [CONCEPTO_APP] preset de velocidad de lectura
      },
      "process_error": {
        "es": "Ocurrió un error al procesar el preset.",
        "en": "An error occurred while processing the preset."
        // [CONCEPTO_APP] preset de velocidad de lectura
      }
    },
    "info": {
      "loading": {
        "es": "Cargando...",
        "en": "Loading..."
      },
      "missing_content": {
        "es": "No hay contenido disponible para \"{name}\".",
        "en": "No content is available for \"{name}\"."
      },
      "external": {
        "blocked": {
          "es": "Enlace bloqueado",
          "en": "Link blocked"
          // [PROPÓSITO] Bloquea cuando se intenta abrir un enlace externo no admitido por la app. No debería suceder normalmente.
        },
        "error": {
          "es": "Error al abrir enlace",
          "en": "Error opening link"
        }
      },
      "appdoc": {
        "blocked": {
          "es": "Documento bloqueado",
          "en": "Document blocked"
          // [PROPÓSITO] Bloquea cuando se intenta abrir un documento en una ruta local no admitida por la app. No debería suceder normalmente.
        },
        "missing": {
          "es": "Documento no encontrado",
          "en": "Document not found"
          // [PROPÓSITO] Informa cuando se intenta abrir un documento en una ruta local y no la encuentra.
        },
        "error": {
          "es": "Error al abrir documento",
          "en": "Error opening document"
        }
      },
      "acerca_de": {
        "title": {
          "es": "Acerca de",
          "en": "About"
        },
        "version": {
          "unavailable": {
            "es": "No disponible",
            "en": "Unavailable"
          }
        },
        "env": {
          "unavailable": {
            "es": "No disponible",
            "en": "Unavailable"
          }
        }
      },
      "instrucciones": {
        "title": {
          "es": "¿Cómo usar la app?",
          "en": "How to use"
        }
      },
      "links_interes": {
        "title": {
          "es": "Enlaces de interés",
          "en": "Useful links"
        },
        "section_biblio_label": {
          "es": "Referencias bibliográficas",
          "en": "Bibliographic references"
        }
      }
    }
  }
}
```
