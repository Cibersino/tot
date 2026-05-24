# Guía específica de idioma — Español (`es`)

Esta guía específica se lee junto con [`../TRANSLATION_GUIDE.md`](../TRANSLATION_GUIDE.md). Solo registra decisiones editoriales propias del español padre de toT.

## 1. Modelo editorial del español padre

`es` usa un español editorial panhispánico, no neutralizado. No toma como molde el “español latinoamericano neutro” de plataforma ni eleva una variante regional única a estándar por defecto.

El español padre de toT no se concibe solo como capa instrumental de interfaz. Dado que la app trabaja con lectura, textos y medición de prácticas lectoras, su español también puede funcionar como una decisión editorial sobre el propio uso del idioma: preciso, vivo, no empobrecido y capaz de estimular una relación más atenta con el lenguaje.

La decisión editorial admite una composición deliberada de recursos del español. Puede mezclar formas léxicas, sintácticas o de registro asociadas a distintas zonas —incluidas formas peninsulares y latinoamericanas— aunque esa combinación no corresponda naturalmente a una variedad hablada generalizada en ningún territorio. Esa mezcla solo se justifica cuando enriquece la formulación, mantiene comprensión amplia y funciona en la superficie concreta de la app.

El objetivo no es producir color dialectal ni exhibir variedad por sí misma. Es evitar que la búsqueda de neutralidad empobrezca el idioma padre. En la revisión de `es`, una forma marcada por región, tradición editorial o registro puede aceptarse si mejora precisión, naturalidad, ritmo o fuerza expresiva del string concreto. Si solo añade color sin aportar a la formulación, queda para discusión posterior o para una variante.

## 2. Tratamiento al usuario

El español de la app usa una jerarquía de tratamiento según superficie:

| Superficie | Tratamiento preferido |
|---|---|
| Botones, menús, comandos y controles compactos | Infinitivo, sustantivo o forma nominal breve: `Guardar`, `Cargar tarea`, `Extraer texto`, `Preferencias`. |
| Estados, errores y bloqueos | Fórmulas impersonales o descriptivas: `No se pudo cargar la tarea.`, `Hay una extracción en curso.` |
| Instrucciones directas | Segunda persona singular informal cuando sea natural: `Elige un archivo`, `Revisa tu conexión`, `Vuelve a intentarlo`. |
| Textos largos de ayuda o disclosure | Mezcla controlada de segunda persona, impersonal y formas nominales según claridad y ritmo. |

No usar `usted` como régimen general de la app. Puede evaluarse solo si una superficie concreta lo justificara, pero no es la voz editorial base.

La segunda persona plural no es régimen normal de UI. Cuando una superficie concreta justifique usarla, debe emplearse la variante peninsular: `vosotros`, `pulsad`, `elegid`, `revisad`, etc.; no `ustedes`.

Evitar mezclar tratamientos dentro de una misma superficie si no hay una razón funcional.

## 3. Léxico funcional

Estas formas rigen conceptos frecuentes del español de toT.

| Concepto | Forma preferida en `es` | Notas / alternativas |
|---|---|---|
| `texto actual` | `texto actual` | Concepto estable. No alternar con `texto vigente`, `texto corriente` o `texto en curso` sin razón fuerte. |
| `reemplazar texto actual` | `reemplazar` / `reemplazar texto actual` | Concepto estable para sustituir el texto actual por contenido entrante. No usar `sobreescribir` como nombre del concepto, aunque pueda explicarse que la acción sobrescribe el contenido anterior. Diferenciar de `reemplazar` dentro de búsqueda del Editor de Texto cuando el contexto lo requiera. |
| `agregar al texto actual` | `agregar` / `agregar al texto actual` | Concepto estable para sumar contenido al final del texto actual. No usar `añadir` como nombre del concepto, aunque pueda explicarse que la acción añade contenido. |
| `extracción de texto` | `extracción de texto` | Nombre del flujo para obtener texto desde archivos. No sustituir por `importación` como concepto estable de la app. La operación puede importar, cargar o procesar contenido según el caso, pero el flujo se nombra como extracción. |
| `ruta de extracción` | `ruta de extracción` | Usar para la elección nativa/OCR. |
| `ruta nativa` | `ruta nativa` / `nativa` | Usar `ruta nativa` cuando haga falta explicitar el concepto. Admitir `nativa` en labels compactos o contextos donde la contraposición con OCR sea clara. Evitar `método nativo` salvo necesidad contextual. |
| `OCR` | `OCR` | Usar como sigla técnica. |
| `Google OCR` | `Google OCR` | Usar como forma protegida. |
| `PDF fuente` | `PDF fuente` | Usar para el archivo original seleccionado. |
| `PDF generado` | `PDF generado` | Usar para derivados locales creados por la app. |
| `PDF guardado` | `PDF guardado` | Usar para derivados conservados por decisión del usuario. |
| `extracción por lotes` | `extracción por lotes` | Evitar alternar con `extracción masiva` o `extracción en bloque` sin decisión documentada. |
| `unidad` | `unidad` | Usar para contenedores del lote. |
| `ítem` | `ítem` | Usar cuando refiera a la entrada individual dentro de una unidad de extracción por lotes. No alternar con `elemento` para ese concepto. Esto no prohíbe usar `elemento` en otros contextos. |
| `test de velocidad de lectura` | `test de velocidad de lectura` | `Test` es el término privilegiado para el flujo. En superficies que ya lo nombran o donde la repetición resulte pesada, puede usarse `prueba` por naturalidad si no introduce ambigüedad. |
| `cronómetro` | `cronómetro` | Forma estable para la medición de tiempo de lectura. |
| `Cronómetro Flotante` | `Cronómetro Flotante` | Nombre de superficie. |
| `Editor de Texto` | `Editor de Texto` | Nombre de ventana/superficie. |
| `Editor de Tareas` | `Editor de Tareas` | Nombre de ventana/superficie. |
| `fila de lectura` | `fila de lectura` | No reducir a `lectura` cuando se habla de la entrada de tabla. |
| `biblioteca de lecturas` | `biblioteca de lecturas` | Usar para filas reutilizables, no para tareas completas. |

## 4. Préstamos y términos externos

Estas formas se usan en `es` con el alcance indicado.

| Término | Uso en `es` | Nota |
|---|---|---|
| `snapshot` | Usar como préstamo técnico. | Funciona como tecnicismo de la app y evita confusión con `captura de pantalla`. Usar normalmente como `snapshot de texto`. |
| `preset` | Usar como préstamo técnico. | Distingue una configuración guardada de velocidad de lectura frente a `ajuste`, `perfil` o `configuración`. |
| `app` | Usar como forma normal de producto. | `Aplicación` puede usarse en registros más formales, legales o explicativos si mejora la superficie. |
| `token` | Usar como préstamo técnico. | Especialmente en contextos como `token local OCR`. No traducir por calcos artificiales; puede explicarse como estado local de autorización o sesión cuando la superficie lo requiera. |
| `pool` | Usar como préstamo técnico. | Designa el conjunto local de archivos del test de velocidad de lectura. No reemplazar por `conjunto`, `banco` o `colección` cuando refiera al concepto de app `pool del test`. |
| `feedback` | Usar como rótulo breve en la superficie actual. | No convertirlo en término general automático para nuevas superficies; si aparece en otro contexto, decidir según función concreta. |
| `tooltip` | Evitar en UI de usuario; permitir en documentación técnica si aparece. | En strings visibles, preferir `ayuda`, `descripción`, `etiqueta`, `mensaje` u otra forma contextual. |
| `build` | Reservar para el artefacto o versión técnica de la app. | No traducir mecánicamente como `compilación` si suena artificial en la superficie. |
| `layout` | Evitar en UI de usuario; permitir en documentación técnica. | En copy visible, preferir `diseño`, `disposición` o resolver por contexto. |
| `skins` | Usar `Skins` mientras la sección permanezca WIP. | La terminología definitiva de esa superficie se definirá en la implementación correspondiente, actualmente asociada al Issue #264. |
| `WIP` | Usar solo como token técnico protegido en superficies temporales. | No usar como estilo general de usuario final si la superficie deja de ser temporal. |

## 5. Convenciones formales del español

Estas convenciones rigen la revisión de los strings del bundle `es`.

| Aspecto | Convención |
|---|---|
| Mayúsculas en títulos de secciones visibles | Usar mayúsculas sostenidas solo cuando la superficie funcione como rótulo de sección o el diseño lo exija. No extenderlo como estilo general. |
| Nombres de ventanas/superficies | Usar mayúscula inicial en nombres estabilizados: `Editor de Texto`, `Editor de Tareas`, `Cronómetro Flotante`. |
| Botones y comandos | Preferir oración normal o infinitivo breve, sin `Title Case` artificial. |
| Alertas breves | Pueden cerrar con punto cuando son oración completa: `Tarea guardada.` |
| Labels con dos puntos | Usar dos puntos cuando introducen un valor inmediato: `Archivo:`, `Velocidad:`. |
| Elipsis | Usar `...` en estados de progreso/espera por función visual de proceso. Decidir caso a caso si utilizar `…` o `...` en usos editoriales o de truncamiento. |
| Comillas | Usar comillas dobles rectas en strings con placeholders o nombres dinámicos. En textos documentales largos puede evaluarse otra convención si mejora la superficie. |
| Siglas técnicas | Usar `WPM`, `OCR`, `PDF`, `URL`, `JSON`, `OAuth` según la guía general y el baseline. |
| Unidades | Usar separación y forma técnica existente: `{value} px`, `{providerLimitMb} MB`. |
