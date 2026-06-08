# Iconos funcionales

Esta carpeta contiene los SVG canónicos de los iconos funcionales de toT.

Un icono funcional representa una acción, estado o affordance de control dentro de la interfaz. Los SVG de esta carpeta son assets de diseño versionados y actúan como fuente canónica de las formas visuales.

## Principios

Los iconos funcionales deben ser claros, adaptables y mantenibles.

El sistema debe permitir iconos con color cuando el color mejore reconocimiento, jerarquía visual o significado funcional. El objetivo no es imponer un estilo monocromo, sino evitar que forma, color, estado visual, tema y superficie queden acoplados de manera frágil.

El diseño debe priorizar:

* reconocimiento rápido en superficies compactas;
* coherencia visual entre ventanas y controles;
* compatibilidad con temas, skins y estados CSS;
* bajo riesgo de diferencias entre plataformas;
* SVGs simples de revisar y modificar;
* generación confiable del artefacto runtime;
* una sola fuente canónica para cada forma visual.

## Fuente canónica

Los SVG de esta carpeta son la fuente canónica de diseño.

El renderer puede consumir un artefacto runtime generado desde estos SVG. Ese artefacto es derivado y no debe editarse manualmente como una segunda fuente de diseño.

Cuando una forma visual cambia, el cambio debe hacerse en el SVG canónico y luego reflejarse en el artefacto generado mediante la ruta definida por el repo.

No deben mantenerse dos versiones editadas a mano de un mismo icono.

## Relación con el runtime

Los SVG canónicos pertenecen a la capa de assets.

La aplicación de iconos en la UI pertenece al helper compartido del renderer. Ese helper debe proveer una ruta común para controles definidos en markup estático y para controles creados dinámicamente desde JavaScript.

La carpeta de assets no debe acumular soluciones locales por ventana, archivo consumidor o caso puntual. Si un icono necesita una variante real, esa variante debe tener nombre, propósito y reglas de uso.

## Nombres de archivo

Los archivos deben nombrarse por significado funcional.

El nombre debe describir la acción, estado o affordance que representa el icono. No debe depender de una ubicación incidental, de una forma visual transitoria ni de una implementación específica.

Un nombre es correcto si sigue siendo válido cuando el icono se reutiliza en otra superficie de la app.

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
* evitar identificadores internos salvo necesidad justificada;
* evitar geometría oculta o fuera del área visible;
* preferir estructuras simples y legibles.

Los iconos pueden usar trazos, rellenos o una combinación de ambos cuando eso mejore la lectura visual. El grosor, la alineación y el peso visual deben ser coherentes con el resto del set y legibles en tamaños compactos.

## Color

Los iconos funcionales pueden usar color.

El color debe estar gobernado por roles visuales estables, no por decisiones locales improvisadas en cada SVG ni por duplicación de variantes por estado.

El sistema debe distinguir entre:

* color estructural del icono;
* color de acento;
* color semántico;
* color de estado del control;
* color de tema o skin.

Los SVG canónicos pueden definir zonas visuales diferenciadas cuando el diseño lo requiera. Esas zonas deben ser simples de mapear al artefacto runtime y al CSS del sistema.

Los colores de hover, focus, active, pressed, selected, disabled, tema y skin no deben quedar duplicados como variantes manuales del mismo icono. Esos estados pertenecen al CSS y al helper compartido del renderer.

Cuando un color sea parte del significado funcional del icono, debe quedar claro en la decisión de diseño del icono y no depender de una interpretación local del consumidor.

## Temas y estados visuales

Un mismo icono debe poder adaptarse a distintos contextos visuales sin duplicación innecesaria.

El diseño debe permitir que el runtime o el CSS ajusten contraste, intensidad, estado disabled, hover, active, foco visible, tema claro u oscuro, y skins actuales o futuras.

Las formas canónicas no deben forzar un resultado que impida esa adaptación.

## Tamaño y legibilidad

Los iconos deben diseñarse para superficies compactas.

Un icono debe seguir siendo reconocible en los tamaños reales usados por la app, no solo cuando se inspecciona ampliado. El diseño debe conservar una silueta clara y un peso visual estable en botones y controles pequeños.

La complejidad visual debe mantenerse bajo control. Un detalle que no aporta reconocimiento en tamaño compacto debe eliminarse.

## Geometría y alineación

Todos los iconos comparten una grilla conceptual común.

La forma debe estar ópticamente centrada. La simetría matemática no basta si el resultado se ve desplazado dentro del botón.

No usar transformaciones como parche habitual de alineación. Cuando un icono requiere correcciones repetidas para verse centrado, debe revisarse la geometría de origen.

Preferir primitivas simples cuando expresen bien la forma. Evitar paths opacos exportados desde herramientas externas cuando una estructura más simple sea suficiente.

## Nivel de detalle

Los iconos funcionales no son ilustraciones.

Cada icono debe comunicar una acción o estado principal. La forma debe ser reconocible, sobria y compatible con controles densos.

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

Los SVG de esta carpeta no deben depender de `<title>` o `<desc>` como mecanismo principal para nombrar botones o controles.

La semántica del control sigue perteneciendo al botón, input, enlace o componente que consume el icono.

## Variantes

Las variantes deben ser escasas y explícitas.

Una variante es aceptable cuando representa una diferencia funcional o de lectura visual que no puede resolverse con CSS común, roles de color o configuración del helper compartido.

No crear variantes para resolver ajustes normales de hover, disabled, active, foco o tema. Esos casos pertenecen al CSS y al helper.

## Artefacto generado

El artefacto runtime generado desde estos SVG debe tratarse como salida derivada.

Debe ser reproducible, determinístico, compatible con el helper compartido del renderer y verificable frente a los SVG canónicos.

Cuando la ruta de generación o verificación sea necesaria para mantener la consistencia del sistema, esa ruta debe estar versionada en el repo.

## Referencias visuales

Las capturas de la app pueden usarse como contexto de diseño.

Sirven para entender densidad real de controles, tamaño de botones, relación con iconos vecinos, contraste, restricciones de layout y necesidades de simplificación.

Las capturas no sustituyen la decisión de diseño del icono. La forma final debe responder al significado funcional del control y a las reglas de esta carpeta.

## Excepciones

Una excepción debe estar documentada y tener una razón funcional.

Pueden existir casos donde un elemento visual no pertenezca a este sistema, por ejemplo logos, branding, ilustraciones, capturas, imágenes de instrucciones, elementos decorativos, contenido textual o assets de terceros tratados como recursos separados.

Un icono funcional de control debe usar este sistema salvo decisión documentada en sentido contrario.
