# Guía de traducción de toT

## 1. Propósito y jerarquía de decisión

Esta guía define el canon global de traducción de toT. Su objetivo es mantener consistencia semántica, terminológica y tipográfica entre idiomas en strings de UI, mensajes de estado, modales, alertas, tooltips, etiquetas ARIA y textos explicativos.

Las traducciones deben basarse en el significado real de la interfaz. No se debe traducir solo desde el nombre de la key ni desde una lectura literal de un único idioma fuente.

Para resolver dudas, `es` y `en` deben usarse juntos como baseline semántico. Las dos versiones deben compararse antes de traducir o revisar otros idiomas.

Cuando el nombre de una key, el texto `es`, el texto `en` o una traducción literal entren en tensión, debe prevalecer el propósito UI/runtime de la string: dónde aparece, qué acción o estado representa, qué tan compacta debe ser y qué información necesita entregar al usuario.

Las reglas globales de esta guía aplican a todos los idiomas. Las decisiones idiomáticas locales deben documentarse en la guía específica del idioma correspondiente.

## 2. Contenido protegido

El contenido protegido no debe traducirse libremente ni alterarse por preferencia estilística. Antes de modificarlo, hay que distinguir si se trata de un nombre propio, un acrónimo invariante, un valor dinámico, una unidad, una referencia interna de UI o un token interpretado por la app.

Deben preservarse como forma estable los nombres de producto, proyecto, servicios, proveedores, plataformas y APIs cuando funcionen como nombres propios.

Los acrónimos, formatos y unidades definidos como invariantes deben mantenerse sin traducir. La traducción puede adaptar la frase alrededor de ellos, pero no debe traducirlos, separarlos de sus valores asociados ni corromper su forma.

También deben preservarse las extensiones de archivo, rutas de archivo, URLs, atajos, emoji, símbolos de UI, nombres de placeholders y otros tokens tipo código.

Las referencias internas a la UI no son traducción libre. Menús, botones, labels, títulos, secciones, checkboxes, opciones y acciones visibles deben coincidir con el texto localizado real que el usuario encontrará en ese idioma. Los nombres protegidos dentro de esas referencias se mantienen invariantes.

### Inventario abierto

Este inventario no es exhaustivo. Debe ampliarse cuando aparezcan nuevos tokens protegidos o casos recurrentes durante la revisión.

- Producto/proyecto: `toT`, `Cibersino`.
- Servicios, proveedores y plataformas: `Google OCR`, `Google Drive`, `Google OAuth`, `GitHub`, `GitHub Issues`, `Chrome`, `Chrome Web Store`, `Ko-fi`, `Windows`, `Linux`, `Mac`.
- APIs y superficies técnicas nombradas: `DevTools`, `Intl.Segmenter`.
- Términos técnicos y marcadores provisionales: `Pull request`, `WIP`.
- Acrónimos y formatos invariantes: `WPM`, `OCR`, `PDF`, `URL`, `OAuth`, `JSON`, `FAQ`.
- Unidades y valores compactos: `MB`, `px`, `%`, contadores `{index}/{count}`, rangos `{fromPage}-{toPage}`, tiempos transcurridos.
- Atajos y símbolos de UI: expresiones de atajo como `Ctrl + A`, `Ctrl + F`, `Ctrl + H`, `Command(⌘) + A`, `⌘ + F`, `⌘ + ⌥ + F`, y símbolos como `▶`, `⏸`, `⏹`, `📂`.
- Tokens tipo código o ruta: `reading_speed_test_pool`.
- Tokens de interpolación: `{name}`, `{lang}`, `{remote}`, `{local}`, `{n}`, `{totalPages}`, `{providerLimitMb}`, `{value}`, `{remaining}`, `{index}`, `{count}`, `{fromPage}`, `{toPage}`, `{filename}`, `{code}`, `{percentage}`, `{correct}`, `{total}`, `{number}`, `{prompt}`, `{imported}`, `{skippedDuplicates}`, `{failedValidation}`, `{failedArchiveEntries}`, `{failedWrites}`, `{min}`, `{max}`.

## 3. Metodología para construir el glosario de conceptos y términos frontera

La sección de glosario no se redactará desde una lista intuitiva ni desde una poda acumulativa. Debe reconstruirse desde evidencia de `es` y `en`, con un inventario conservador y clasificación explícita por destino antes de redactar entradas finales.

### 3.1 Inventario filtrado conservador de keys

Primero se revisan directamente:

- `i18n/es/main.json`
- `i18n/en/main.json`
- `i18n/es/renderer.json`
- `i18n/en/renderer.json`

Y, si hace falta para contexto:

- `tools_local/issues/issue_286_i18n_translations.md`
- `tools_local/issues/issue_286_i18n_translations_rtl_preflight.md`

El inventario inicial no debe incluir todas las keys indiscriminadamente, pero el filtro debe favorecer que sobren antes que falten.

Una key entra al inventario si contiene o podría contener:

- concepto de app;
- término repetido;
- término frontera;
- préstamo o posible préstamo;
- label breve o ambiguo;
- botón o confirmación sensible;
- referencia a UI localizada;
- placeholder, unidad o valor dinámico;
- token protegido;
- posible drift entre `es` y `en`;
- posible problema de layout, RTL, CJK o script;
- término técnico;
- acción cuyo sentido dependa del objeto;
- superficie sensible: modal, alerta, menú, tooltip, ARIA, estado, reporte o botón nativo.

Una key solo se excluye si es claramente trivial y no aporta ninguna decisión de traducción. Si hay duda, entra.

Formato del inventario:

```md
| key path | es | en | señal inicial |
|---|---|---|---|
```

La columna `señal inicial` no decide el destino. Solo registra por qué la key entró.

### 3.2 No agrupar antes de inventariar

En la etapa de inventario no se inventan familias como “texto”, “PDF”, “batch” o “editor”. La tabla sigue plana.

Las agrupaciones solo pueden aparecer después, cuando las keys muestren patrones verificables, por ejemplo:

- mismo prefijo de key;
- misma superficie;
- mismo término repetido;
- misma tensión `es` / `en`;
- mismos placeholders;
- labels breves similares;
- conceptos que aparecen en varias superficies.

### 3.3 Clasificación por destino

Una vez hecho el inventario inicial (primer filtro), se procede a la clasificación mediante rondas de trabajo (ver 3.9). Cada hallazgo del inventario debe clasificarse en un destino explícito:

- Sección 2 — contenido protegido.
- Sección 3 — glosario conceptual / términos frontera.
- Sección 4 — placeholders y valores dinámicos.
- Sección 5 — convenciones de escritura, puntuación, botones y layout.
- Sección 7 — key-purpose notes.
- Nota temporal de drift.
- Congelado hasta evidencia técnica.
- Eliminar sin seguimiento.

Regla central: sacar algo de la sección 3 no significa borrarlo del trabajo.

### 3.4 Criterios para entrar al glosario

Una entrada va al glosario conceptual / términos frontera solo si cumple al menos uno de estos criterios:

- Es un concepto propio de la app.
- Aparece en varias superficies y necesita estabilidad terminológica.
- Tiene tensión entre préstamo, traducción o solución mixta.
- Puede confundirse con otro concepto de la app.
- Necesita una definición breve para evitar drift.
- Funciona como matriz que cubre varias keys sin depender de una key puntual.

El glosario no debe absorber todo lo difícil. Debe contener solo lo que realmente funciona como concepto de app o término frontera.

### 3.5 Criterios para key-purpose notes

Una entrada va a key-purpose notes si:

- Es un label breve cuyo sentido depende de la superficie.
- Es una acción ambigua sin objeto suficiente.
- Es un texto de botón que puede traducirse mal sin saber qué hace.
- Es un estado compacto de tabla o reporte.
- Es una key cuyo nombre no basta para traducirla bien.

Estos casos no necesariamente son glosario, pero sí importan para traducir keys.

### 3.6 Criterios para convenciones de escritura y layout

Van a convenciones de escritura, botones o layout las decisiones que no son conceptos, sino forma de escribir:

- botones nativos;
- fórmulas `Sí, ...` / `No, ...`;
- puntuación;
- mayúsculas;
- longitud de botones;
- uso de slash;
- compactación de labels;
- consistencia de ellipsis;
- problemas de layout por texto largo.

### 3.7 Criterios para drift temporal

Va a nota temporal de drift todo lo que parece una inconsistencia actual, no un concepto que deba canonizarse.

El drift no se mete al glosario como concepto. Se registra para corregirlo después.

### 3.8 Criterios para congelar hasta evidencia técnica

Algunos términos no deben definirse solo desde los JSON si el JSON no muestra el flujo suficiente.

Quedan congelados hasta revisar issue, código o evidencia técnica suficiente los términos técnicos cuya relación funcional no esté clara, por ejemplo:

- `batch`
- `unit`
- `input`
- `generated input`
- `generated artifact`
- `artifact`
- `output unit`
- `processing input`

Reglas:

- No definir por intuición.
- No colapsar por parecido verbal.
- No traducir antes de entender el flujo.
- No crear matrices sin evidencia.

### 3.9 Formato de trabajo por ronda

Cada ronda debe trabajar un subconjunto pequeño del inventario inicial (3.1).

Formato:

```md
## Inventario parcial

| key path | es | en | señal inicial |
|---|---|---|---|

## Clasificación propuesta

### Sección 3
...

### Key-purpose notes
...

### Convenciones / layout
...

### Drift temporal
...

### Contenido protegido
...

### Congelado hasta evidencia
...

### Eliminar sin seguimiento
...
```

Después se discute la clasificación. Solo cuando una clasificación queda aprobada se redacta el fragmento correspondiente.

### 3.10 Redacción final del glosario

El glosario final se redactará al final, desde las entradas clasificadas como glosario.

Formato preferido:

```md
- Término español / English term.
  Definición breve si hay riesgo de confusión.
```

No todas las entradas necesitan definición. Solo las ambiguas o técnicamente relevantes.

### 3.11 Reglas de control

- No se redacta sección final antes de clasificar.
- No se agrupa antes del inventario.
- No se elimina una key sin decidir si debe ir a otro destino.
- No se definen conceptos técnicos sin evidencia.
- No se edita este documento salvo instrucción explícita.
- En caso de duda, se conserva en inventario y se clasifica después.

Resumen del método:

```md
Inventario filtrado conservador → clasificación por destino → agrupación evidenciada → redacción mínima → aprobación → inserción en el documento.
```

## 4. Placeholders y valores dinámicos

- Preservar exactamente los nombres de placeholders.
- Preservar cantidad y significado de placeholders.
- No traducir identificadores de interpolación.
- Adaptar la gramática alrededor de los placeholders.
- Casos especiales: nombres de archivo, rutas, códigos de error, conteos, rangos, porcentajes, unidades.

## 5. Convenciones de escritura

- Registro según tipo de string: botón, ítem de menú, título de modal, cuerpo de texto, alerta, tooltip, etiqueta ARIA, texto de estado, tip.
- Tipografía y puntuación.
- Uso de mayúsculas/minúsculas.
- Espaciado alrededor de números, símbolos, acrónimos y tokens en escritura latina.

## 6. Notas sensibles a script y layout

- Guía RTL para tokens latinos incrustados.
- Guía CJK para acrónimos, extensiones de archivo y espaciado.
- Scripts no latinos y nombres protegidos de servicios.
- Cuándo marcar un problema de display/UI en vez de reescribir el string.

## 7. Notas de propósito de keys

- Qué es una nota de propósito de key.
- Cuándo una key necesita una.
- Formato mínimo de nota.
- Superficies que probablemente necesitan notas primero.

## 8. Estados de revisión

- `canonical baseline`
- `reviewed`
- `mechanically validated`
- `needs native review`
- `open question`
- `blocked by UI/display issue`

## 9. Relación con guías de idioma

- Qué queda en la guía global.
- Qué pertenece a `i18n/es/LANGUAGE_GUIDE_es.md`.
- Qué pertenece a `i18n/en/LANGUAGE_GUIDE_en.md`.
- Qué pertenece a otros archivos `LANGUAGE_GUIDE_<lang>.md`.



---

## Nota temporal — drifts detectados

Estos casos no deben canonizarse sin revisión posterior:

- `texto analizado` / `analyzed text` parece drift de `texto actual` / `current text`.
- `texto vigente` parece drift de `texto actual`.
- `texto de trabajo` podría ser drift de `texto actual`.
- `importar texto desde archivo` parece drift de `extraer texto desde archivo`.
- `Mostrar PDF guardado` parece drift de `Mostrar PDF generado`.
- Las referencias internas de UI en `es` que conservan segmentos ingleses como `Preferences > Enable Google OCR` o `Preferences > Disconnect Google OCR` son drift de localización.
- `importar` / `import` y `extraer` / `extract` parecen estar usados a veces como sinónimos para la misma función. Normalizar hacia `extraer` / `extract` cuando se refiera a extracción de texto desde archivo.
- Revisar usos de `reiniciar` / `reset` / `restart`: podría estar reemplazando indebidamente a `detener` / `stop` en algunos contextos.
- Revisar strings que hablen de `PDF generado`, `PDF de páginas seleccionadas`, `PDF generado de páginas seleccionadas`, `PDF guardado`, `archivo generado` o variantes similares: normalizar cuando corresponda hacia `PDF generado` / `generated PDF` para los PDFs producidos por la app desde selección de páginas o split automático.
- Evitar que `archivo generado` absorba el concepto de `PDF generado`: `archivo generado` es demasiado amplio y puede incluir otros outputs, mientras que `PDF generado` tiene una función específica en extracción PDF.
- Revisar usos de `PDF guardado`: puede ser drift de `PDF generado` cuando se refiere al PDF producido por selección/split y conservado por decisión del usuario.
- Revisar acciones asociadas a `PDF generado`: `conservar`, `mostrar` y `limpiar` deben referirse al PDF producido por la app, no al archivo fuente.
- Revisar menciones de selección/rango/split para asegurar que no creen un tercer concepto innecesario entre archivo fuente y PDF generado.
