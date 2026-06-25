# Íconos funcionales

Esta carpeta contiene los SVG canónicos de los íconos funcionales de toT.

Un ícono funcional representa una acción, estado o affordance de control dentro de la interfaz. Los SVG de esta carpeta son assets de diseño versionados y actúan como fuente canónica de las formas visuales.

## Propósito de la carpeta

`assets/icons/` mantiene las formas visuales canónicas de los íconos funcionales de la app.

La carpeta debe permitir que el proyecto tenga un set coherente, revisable y reproducible de íconos, separado de la lógica de runtime que los aplica en botones, enlaces, menús, modales u otros controles.

Este README documenta las reglas permanentes del set: qué tipo de íconos viven aquí, cómo se nombran, cómo se estructuran, cómo se manejan color y variantes, y qué debe sincronizarse cuando el set cambia.

## Fuente canónica

Los SVG de esta carpeta son la fuente canónica de diseño.

Cuando una forma visual cambia, el cambio debe hacerse en el SVG canónico y luego regenerar `public/js/generated_icons.js` desde `assets/icons/` mediante `npm run generate:icons`.

El artefacto generado no debe editarse a mano.

No deben mantenerse dos versiones editadas a mano de un mismo ícono.

Un artefacto runtime generado desde estos SVGs es derivado. Debe ser reproducible, determinístico y verificable frente a los SVG canónicos.

## Principios

Los íconos funcionales deben ser claros, adaptables y mantenibles.

El sistema permite íconos con color cuando el color mejore reconocimiento, jerarquía visual o significado funcional. El objetivo no es imponer un estilo monocromo, sino evitar que forma, color, estado visual, tema y superficie queden acoplados de manera frágil.

El diseño debe priorizar:

* reconocimiento rápido en superficies compactas;
* coherencia visual entre ventanas y controles;
* compatibilidad con temas, skins y estados CSS;
* bajo riesgo de diferencias entre plataformas;
* SVGs simples de revisar y modificar;
* generación confiable del artefacto runtime;
* una sola fuente canónica para cada forma visual.

## Relación con el runtime

Los SVG canónicos pertenecen a la capa de assets.

La aplicación de íconos en la UI pertenece al helper compartido del renderer. Ese helper debe proveer una ruta común para controles definidos en markup estático y para controles creados dinámicamente desde JavaScript.

El runtime debe consumir íconos por nombre semántico. El código consumidor no debe depender de detalles internos del SVG, como paths, clases internas, orden de nodos, identificadores internos o colores de fallback.

Los estados visuales del control —hover, focus, active, pressed, selected, disabled o tema— pertenecen al CSS y al helper compartido del renderer, no a variantes manuales del SVG canónico.

## Nombres de archivo

Los archivos deben nombrarse por significado funcional.

El nombre debe describir la acción, estado o affordance que representa el ícono. No debe depender solo de una ubicación incidental, de una forma visual transitoria ni de una implementación específica.

Reglas:

* usar `kebab-case`;
* preferir nombres semánticos estables;
* usar prefijos de dominio solo cuando el alcance específico evite ambigüedad real;
* usar sufijos de variante solo cuando la diferencia visual esté aprobada y no pueda resolverse limpiamente con CSS o el helper compartido;
* no crear variantes para hover, focus, active, pressed, selected, disabled, tema o skin.

Un nombre es correcto si sigue siendo válido cuando el ícono se reutiliza en otra superficie de la app con la misma semántica funcional.

## Reutilización y especificidad

Los íconos deben reutilizarse cuando el significado funcional coincida.

La reutilización no debe basarse solo en parecido visual. Dos controles visualmente similares pueden requerir íconos distintos si comunican acciones distintas.

También es válido que existan nombres con alcance más específico cuando un nombre genérico induciría a error o colapsaría semánticas distintas.

Ejemplos de fronteras semánticas:

* `close.svg` comunica cerrar o descartar una superficie. No comunica eliminar un recurso ni quitar una asociación.
* `trash.svg` comunica eliminación, vaciado o limpieza cuando la acción debe leerse como borrado.
* `unlink.svg` comunica quitar una asociación o vínculo sin eliminar el recurso asociado.
* `text-snapshot-load.svg` comunica carga general de snapshot de texto.
* `task-text-snapshot-load.svg` comunica una carga contextual de snapshot de texto asociado a una fila de tarea.
* `arrow-up.svg` / `arrow-down.svg` y `arrow-up-strong.svg` / `arrow-down-strong.svg` son variantes visuales con pesos distintos para superficies de densidad distinta.

La existencia de un uso inicial no convierte al ícono en exclusivo de esa superficie. Un SVG puede reutilizarse en otra parte de la app si su significado funcional sigue siendo correcto.

## Inventario actual

El set actual contiene 32 SVGs canónicos.

La columna “semántica” describe el significado funcional del asset. No es una lista cerrada de consumidores.

| Archivo | Semántica |
|---|---|
| `abort-extraction.svg` | Abortar o cancelar un flujo de extracción de texto en curso. |
| `arrow-down-strong.svg` | Movimiento descendente con mayor peso visual. |
| `arrow-down.svg` | Movimiento descendente compacto. |
| `arrow-up-strong.svg` | Movimiento ascendente con mayor peso visual. |
| `arrow-up.svg` | Movimiento ascendente compacto. |
| `clipboard-append.svg` | Agregar contenido desde el portapapeles. |
| `clipboard-overwrite.svg` | Reemplazar contenido desde el portapapeles. |
| `close.svg` | Cerrar, descartar o salir de una superficie sin comunicar eliminación. |
| `collapse.svg` | Contraer una sección o bloque expandible. |
| `expand.svg` | Expandir una sección o bloque contraíble. |
| `folder.svg` | Carpeta. Seleccionar un archivo local desde un picker del sistema. |
| `floating-stopwatch.svg` | Representar el Cronómetro Flotante. |
| `open-target.svg` | Abrir o revelar un destino asociado, como una URL, ruta local o salida generada. |
| `pause.svg` | Pausar una medición o estado en curso. |
| `play.svg` | Iniciar o reanudar una medición o estado. |
| `preset-edit.svg` | Editar un preset de velocidad de lectura. |
| `preset-new.svg` | Crear un preset de velocidad de lectura. |
| `reading-speed-test.svg` | Representar el Test de velocidad de lectura. |
| `reset.svg` | Restablecer, restaurar o volver a un estado base. |
| `stop.svg` | Detener una medición o estado de cronómetro. |
| `task-comment.svg` | Representar comentario y snapshot asociado de una fila de tarea. |
| `task-load.svg` | Cargar una tarea. |
| `task-new.svg` | Crear una tarea. |
| `task-row-load.svg` | Cargar una fila guardada desde la biblioteca de lecturas. |
| `task-row-save.svg` | Guardar una fila de tarea en la biblioteca de lecturas. |
| `task-text-snapshot-load.svg` | Cargar el snapshot asociado a una fila de tarea. |
| `text-editor.svg` | Representar el Editor de Texto. |
| `text-extraction-wide.svg` | Representar extracción de texto. Es una variante de mayor amplitud visual. |
| `text-snapshot-load.svg` | Cargar un snapshot de texto. |
| `text-snapshot-save.svg` | Guardar un snapshot de texto. |
| `trash.svg` | Eliminar, vaciar o limpiar cuando la acción debe leerse como borrado. |
| `unlink.svg` | Quitar una asociación o vínculo sin eliminar el recurso asociado. |

Este inventario debe actualizarse en el mismo cambio que agregue, retire o renombre un SVG canónico.

## Formato base

Los SVG deben ser pequeños, editables y compatibles con generación automática.

Reglas generales:

* usar una grilla común basada en `viewBox="0 0 24 24"`;
* no fijar tamaño final en el SVG canónico;
* evitar texto embebido;
* evitar dependencia de fuentes;
* evitar imágenes raster embebidas;
* evitar referencias externas;
* evitar filtros complejos salvo decisión explícita;
* evitar geometría oculta o fuera del área visible;
* preferir estructuras simples y legibles.

Los identificadores internos deben evitarse salvo cuando sean necesarios para una estructura SVG concreta, por ejemplo `title`, `mask`, `clipPath`, gradientes u otro recurso referenciado internamente. Cuando existan, deben ser estables y acotados.

Los íconos pueden usar trazos, rellenos o una combinación de ambos cuando eso mejore la lectura visual. El grosor, la alineación y el peso visual deben ser coherentes con el resto del set y legibles en tamaños compactos.

## Color

Los íconos funcionales pueden usar color.

El color debe estar gobernado por roles visuales estables, no por decisiones locales improvisadas en cada SVG ni por duplicación de variantes por estado.

El sistema debe distinguir entre:

* color estructural del ícono;
* color de acento;
* color semántico;
* color de estado del control;
* color de tema o skin.

Los SVG canónicos pueden definir zonas visuales diferenciadas cuando el diseño lo requiera. Esas zonas deben ser simples de mapear al artefacto runtime y al CSS del sistema.

Los SVG canónicos pueden usar propiedades CSS personalizadas con colores literales de fallback, por ejemplo:

```svg
fill="var(--tot-icon-preset-new, #22a65a)"
```

Estos fallbacks están permitidos cuando cumplen una función de portabilidad o revisión:

* mantener el SVG legible cuando se abre directamente fuera del runtime de la app;
* conservar una previsualización útil en revisiones de diseño, documentación o visores del repositorio;
* declarar el valor visual por defecto de un rol antes de que el runtime o el CSS lo sobrescriban.

El fallback debe seguir ligado al rol funcional del color. No debe usarse para codificar estados de hover, focus, active, pressed, selected, disabled, tema o skin. Esos estados pertenecen al CSS y al helper compartido del renderer.

Los colores de hover, focus, active, pressed, selected, disabled, tema y skin no deben quedar duplicados como variantes manuales del mismo ícono. Esos estados pertenecen al CSS y al helper compartido del renderer.

Cuando un color sea parte del significado funcional del ícono, debe quedar claro en la decisión de diseño del ícono y no depender de una interpretación local del consumidor.

## Temas y estados visuales

Un mismo ícono debe poder adaptarse a distintos contextos visuales sin duplicación innecesaria.

El diseño debe permitir que el runtime o el CSS ajusten contraste, intensidad, estado disabled, hover, active, foco visible, tema claro u oscuro, y skins actuales o futuras.

Las formas canónicas no deben forzar un resultado que impida esa adaptación.

## Tamaño y legibilidad

Los íconos deben diseñarse para superficies compactas.

Un ícono debe seguir siendo reconocible en los tamaños reales usados por la app, no solo cuando se inspecciona ampliado. El diseño debe conservar una silueta clara y un peso visual estable en botones y controles pequeños.

La complejidad visual debe mantenerse bajo control. Un detalle que no aporta reconocimiento en tamaño compacto debe eliminarse.

## Geometría y alineación

Todos los íconos comparten una grilla conceptual común.

La forma debe estar ópticamente centrada. La simetría matemática no basta si el resultado se ve desplazado dentro del botón.

No usar transformaciones como parche habitual de alineación. Cuando un ícono requiere correcciones repetidas para verse centrado, debe revisarse la geometría de origen.

Preferir primitivas simples cuando expresen bien la forma. Evitar paths opacos exportados desde herramientas externas cuando una estructura más simple sea suficiente.

## Nivel de detalle

Los íconos funcionales no son ilustraciones.

Cada ícono debe comunicar una acción o estado principal. La forma debe ser reconocible, sobria y compatible con controles densos.

Preferir:

* una idea visual dominante;
* pocas formas;
* peso visual consistente;
* color usado con intención funcional;
* convenciones UI reconocibles;
* geometría fácil de revisar.

Evitar:

* detalle ornamental;
* complejidad que desaparece a tamaño compacto;
* colores que solo decoran y no ayudan a reconocer;
* variaciones locales que rompan la coherencia del set.

## Accesibilidad

Los SVG canónicos son formas visuales.

El nombre accesible pertenece al control consumidor. Debe provenir de texto visible, `aria-label`, `title` u otra fuente de UI/i18n definida por el código consumidor.

Los SVG de esta carpeta no deben depender de `<title>` o `<desc>` como mecanismo principal para nombrar botones o controles. Si un SVG incluye `<title>` o `<desc>`, ese contenido debe tratarse como metadato del asset, no como contrato accesible del control runtime.

La semántica del control sigue perteneciendo al botón, input, enlace o componente que consume el ícono.

## Variantes

Las variantes deben ser escasas y explícitas.

Una variante es aceptable cuando representa una diferencia funcional o de lectura visual que no puede resolverse con CSS común, roles de color o configuración del helper compartido.

No crear variantes para resolver ajustes normales de hover, disabled, active, foco o tema. Esos casos pertenecen al CSS y al helper.

Toda variante debe tener un nombre que explique su diferencia semántica o visual sin depender de un consumidor único.

## Cambios al set

Todo cambio al set canónico debe mantener sincronizados:

* el SVG canónico en `assets/icons/`;
* este README cuando cambie el inventario o una regla del sistema;
* `tools/generate_renderer_icons.js` si cambia el contrato de generación;
* el artefacto runtime generado;
* las pruebas o verificaciones que protejan el contrato de generación y consumo.

Al agregar un ícono, debe quedar claro si se trata de una nueva semántica funcional o de una variante aprobada de una semántica existente.

Al retirar o renombrar un ícono, debe actualizarse cualquier referencia semántica del runtime y de la documentación que corresponda.

## Referencias visuales

Las capturas de la app pueden usarse como contexto de diseño.

Sirven para entender densidad real de controles, tamaño de botones, relación con íconos vecinos, contraste, restricciones de layout y necesidades de simplificación.

Las capturas no sustituyen la decisión de diseño del ícono. La forma final debe responder al significado funcional del control y a las reglas de esta carpeta.

## Excepciones

Una excepción debe estar documentada y tener una razón funcional.

Pueden existir casos donde un elemento visual no pertenezca a este sistema, por ejemplo logos, branding, ilustraciones, capturas, imágenes de instrucciones, elementos decorativos, contenido textual o assets de terceros tratados como recursos separados.

Un ícono funcional de control debe usar este sistema salvo decisión documentada en sentido contrario.
