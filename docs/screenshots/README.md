# Capturas de pantalla

Esta carpeta contiene capturas versionadas de la app usadas como referencia visual del proyecto.

Las capturas son material de documentación y desarrollo. No forman parte del runtime de toT y no deben empaquetarse con los builds distribuidos.

## Estructura

* `windows/`: capturas de ventanas y estados visibles de la app en Windows.
* `windows/<lang>/`: capturas tomadas con la interfaz configurada en el idioma indicado por el código de carpeta.
* `windows/language_selector.png`: captura común del selector inicial de idioma, previa a una interfaz localizada concreta.

## Inventario actual

### Captura común

| Archivo                         | Superficie                 |
| ------------------------------- | -------------------------- |
| `windows/language_selector.png` | Selector inicial de idioma |

### Español (`windows/es/`)

| Archivo                           | Superficie / estado                                    |
| --------------------------------- | ------------------------------------------------------ |
| `es_main_empty.png`               | Ventana principal sin texto cargado                    |
| `es_main_non-empty.png`           | Ventana principal con texto cargado                    |
| `es_editor_maximized.png`         | Editor de Texto maximizado                             |
| `es_editor_reduced.png`           | Editor de Texto en tamaño reducido                     |
| `es_task.png`                     | Editor de Tareas                                       |
| `es_task_library.png`             | Biblioteca de lecturas del Editor de Tareas            |
| `es_test_start.png`               | Test de velocidad de lectura en ejecución              |
| `es_test_choose.png`              | Configuración inicial del Test de velocidad de lectura |
| `es_test_choose_instructions.png` | Instrucciones del Test de velocidad de lectura         |
| `es_test_questions_1.png`         | Preguntas de comprensión lectora                       |
| `es_test_questions_2.png`         | Resultado parcial de preguntas y línea de azar         |
| `es_test_result.png`              | Resultado de velocidad de lectura                      |
| `es_preset.png`                   | Creación de preset                                     |

### Inglés (`windows/en/`)

| Archivo                           | Superficie / estado                         |
| --------------------------------- | ------------------------------------------- |
| `en_main_empty.png`               | Main window with no current text            |
| `en_main_non-empty.png`           | Main window with current text               |
| `en_editor_maximized.png`         | Text Editor maximized                       |
| `en_editor_reduced.png`           | Text Editor in reduced size                 |
| `en_task.png`                     | Task Editor                                 |
| `en_task_library.png`             | Task Editor reading library                 |
| `en_test_start.png`               | Reading speed test in progress              |
| `en_test_choose.png`              | Reading speed test initial setup            |
| `en_test_choose_instructions.png` | Reading speed test instructions             |
| `en_test_questions_1.png`         | Reading comprehension questions             |
| `en_test_questions_2.png`         | Partial question result and random baseline |
| `en_test_result.png`              | Reading speed result                        |
| `en_preset.png`                   | Preset creation                             |

## Usos previstos

Estas capturas pueden usarse para desarrollo, documentación interna, revisión de interfaz, QA visual, comparación de cambios, revisión de layout y apoyo a trabajo de i18n/traducción.

Para trabajo de traducción, usar estas capturas solo como referencia visual. Las fuentes normativas siguen siendo:

* `i18n/TRANSLATION_GUIDE.md`
* `i18n/<lang>/main.json`
* `i18n/<lang>/renderer.json`
* guías específicas por idioma
* comportamiento real de la UI/runtime

## Convenciones

* Usar nombres de archivo estables y descriptivos.
* Mantener nombres paralelos entre idiomas cuando las capturas representen la misma ventana, modal o estado.
* Ubicar capturas comunes fuera de las carpetas de idioma cuando la superficie no pertenezca a un idioma específico.
* Registrar capturas nuevas cuando ayuden a entender una superficie, revisar un cambio o documentar un estado visual relevante.
* Actualizar el inventario cuando se agreguen, eliminen o renombren capturas versionadas.
