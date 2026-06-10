# Capturas de pantalla

Esta carpeta contiene capturas versionadas de la app usadas como referencia visual del proyecto.

Las capturas son material de documentación y desarrollo. No forman parte del runtime de toT y no deben empaquetarse con los builds distribuidos.

## Inventario actual

### Windows (`windows/`)

#### Capturas comunes

| Archivo                          | Superficie                 |
| -------------------------------- | -------------------------- |
| `windows/language_selector.png`  | Selector inicial de idioma |
| `windows/floating_stopwatch.png` | Cronómetro Flotante        |

#### Por idioma (`windows/<lang>/`)

* Por el momento solo `en` y `es`.

| Archivo                               | Superficie / estado                                              |
| ------------------------------------- | ---------------------------------------------------------------- |
| `<lang>_main_empty.png`               | Ventana principal sin texto cargado                              |
| `<lang>_main_non-empty.png`           | Ventana principal con texto cargado                              |
| `<lang>_ocr_activation.png`           | Disclosure de activación de Google OCR                           |
| `<lang>_apply_text.png`               | Modal para aplicar texto extraído al texto actual                |
| `<lang>_snapshot_save.png`            | Modal de etiquetas al guardar snapshot de texto                  |
| `<lang>_pdf_routes.png`               | Modal de selección de ruta de extracción PDF                     |
| `<lang>_pdf_options.png`              | Modal de opciones de páginas PDF                                 |
| `<lang>_pdf_heavy_all-pages.png`      | Modal de PDF pesado con opción de todas las páginas              |
| `<lang>_pdf_heavy_range.png`          | Modal de PDF pesado con rango de páginas                         |
| `<lang>_batch_plan_1.png`             | Planificador de extracción por lotes parte 1 de 4                |
| `<lang>_batch_plan_2.png`             | Planificador de extracción por lotes parte 2 de 4                |
| `<lang>_batch_plan_3.png`             | Planificador de extracción por lotes parte 3 de 4                |
| `<lang>_batch_plan_4.png`             | Planificador de extracción por lotes parte 4 de 4                |
| `<lang>_batch_processing.png`         | Progreso de extracción por lotes                                 |
| `<lang>_batch_final_1.png`            | Reporte final de extracción por lotes parte 1 de 2               |
| `<lang>_batch_final_2.png`            | Reporte final de extracción por lotes parte 2 de 2               |
| `<lang>_preset.png`                   | Creación de preset de velocidad de lectura                       |
| `<lang>_editor_maximized.png`         | Editor de Texto maximizado                                       |
| `<lang>_editor_reduced.png`           | Editor de Texto en tamaño reducido                               |
| `<lang>_task.png`                     | Editor de Tareas                                                 |
| `<lang>_task_library.png`             | Biblioteca de lecturas del Editor de Tareas                      |
| `<lang>_task_comment_modal.png`       | Modal de comentario del Editor de Tareas                         |
| `<lang>_task_confirm_comment.png`     | Confirmación para guardar fila de lectura con el comentario      |
| `<lang>_test_choose.png`              | Configuración inicial del Test de velocidad de lectura           |
| `<lang>_test_choose_instructions.png` | Instrucciones del Test de velocidad de lectura                   |
| `<lang>_test_start.png`               | Test de velocidad de lectura en ejecución                        |
| `<lang>_test_result.png`              | Resultado del Test de velocidad de lectura                       |
| `<lang>_test_questions_1.png`         | Preguntas de comprensión lectora parte 1 de 2                    |
| `<lang>_test_questions_2.png`         | Preguntas de comprensión lectora parte 2 de 2                    |

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
