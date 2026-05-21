# Guía general i18n — baseline ES/EN

Este documento es JSONC documental, no JSON válido del repo.
Conserva la estructura de `main.json` y `renderer.json`, pero cada key muestra el baseline conjunto `es`/`en`.

Este borrador contiene una primera capa de notas por key centrada en `[PROPÓSITO]`; también admite `[PENDIENTE]` cuando haya decisiones transitorias abiertas.

## Notas por key

Este documento puede incluir comentarios por key en formato JSONC documental. Ejemplo:

    "key": {
      "es": "...",
      "en": "..."
      // [TAG] comentario
    }

Las notas no reemplazan el baseline `es`/`en` ni obligan a traducir literalmente desde uno de esos idiomas. Su función es fijar contexto traductivo cuando el baseline visible no basta para evitar ambigüedad, drift o decisiones inestables.

Una key sin nota no está incompleta: solo significa que, para esa key, el baseline `es`/`en` se considera suficiente.

### Tags

`[PROPÓSITO]`  
Aclara el uso funcional de una key cuando ese contexto es necesario para evitar una traducción incorrecta o inestable. No documenta la UI por documentarla, no parafrasea el string y no debe inferirse solo desde el path de la key.

`[CONCEPTO_APP]`  
Marca el concepto canónico de la app activo en una key. No define ni explica el concepto; solo lo identifica para mantener consistencia terminológica.

`[PROTEGIDO]`  
Marca formas que deben conservarse o tratarse con especial cuidado: nombres propios, servicios, acrónimos, unidades, tokens, placeholders, símbolos o formas técnicas que no deben normalizarse libremente.

`[NO_CONFUNDIR]`  
Advierte una confusión traductiva concreta entre conceptos, superficies, rutas o acciones similares de la app.

### Tags transitorios (sección temporal)

`[PENDIENTE]`  
Marca una decisión o verificación abierta cuando hay riesgo real de mala traducción, drift o ambigüedad, pero falta evidencia o decisión suficiente para fijar un criterio estable. No se usa para dudas genéricas. Este tag es transitorio y no debe quedar en la guía definitiva.

`[DRIFT]`  
Marca una inconsistencia real y temporal entre baseline, UI, documentación o comportamiento esperado. Este tag es transitorio y no debe quedar en la guía definitiva.

## Fuentes

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
      },
      "enable_google_ocr": {
        "es": "Activar Google OCR",
        "en": "Enable Google OCR"
        // [PROPÓSITO] Acción de Preferencias que inicia la activación/autorización de Google OCR para poder usar la ruta OCR conectada.
      },
      "disconnect_google_ocr": {
        "es": "Desconectar Google OCR",
        "en": "Disconnect Google OCR"
        // [PROPÓSITO] Acción de Preferencias que revoca/desconecta el estado local de Google OCR, no una pausa temporal del OCR.
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
        "es": "Actualizar a última versión",
        "en": "Update to latest version"
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
        "en": "Overwrite existing snapshot file?"
        // [PROPÓSITO] Confirmación al guardar un snapshot de texto sobre un archivo ya existente.
      },
      "snapshot_overwrite_load": {
        "es": "¿Reemplazar el texto actual con el snapshot seleccionado \"{name}\"?",
        "en": "Replace current text with the selected snapshot \"{name}\"?"
        // [PROPÓSITO] Confirmación al cargar un snapshot y reemplazar el texto actual de la app.
      },
      "task_delete_confirm": {
        "es": "¿Eliminar la tarea \"{name}\"?",
        "en": "Delete the task \"{name}\"?"
      },
      "task_library_row_save_overwrite": {
        "es": "Ya existe \"{name}\" en la biblioteca. ¿Sobrescribir?",
        "en": "\"{name}\" already exists in the library. Overwrite?"
        // [PROPÓSITO] Confirmación para sobrescribir una fila guardada en la biblioteca de lecturas del editor de tareas.
      },
      "task_library_row_delete": {
        "es": "¿Eliminar \"{name}\" de la biblioteca?",
        "en": "Delete \"{name}\" from the library?"
        // [PROPÓSITO] Confirmación para eliminar una fila guardada en la biblioteca de lecturas, no una tarea completa.
      },
      "task_link_confirm": {
        "es": "¿Abrir este enlace?",
        "en": "Open this link?"
      },
      "task_link_trust_host": {
        "es": "Confiar en este host en adelante",
        "en": "Trust this host from now on"
        // [PROPÓSITO] Opción de recordar como confiable el host remoto del enlace de una fila de tarea.
      },
      "task_path_confirm": {
        "es": "¿Abrir este archivo local?",
        "en": "Open this local file?"
        // [PROPÓSITO] Confirmación para abrir una ruta local asociada a una fila de tarea.
      },
      "disconnect_google_ocr_title": {
        "es": "Desconectar Google OCR",
        "en": "Disconnect Google OCR"
      },
      "disconnect_google_ocr_confirm": {
        "es": "¿Desconectar Google OCR?",
        "en": "Disconnect Google OCR?"
      },
      "disconnect_google_ocr_detail": {
        "es": "Esto revoca el token guardado de inicio de sesión de Google OCR y elimina el archivo de token local de esta app. Las credenciales OAuth de Google locales gestionadas por la app pueden mantenerse para que OCR pueda reconectarse más adelante.",
        "en": "This revokes the saved Google OCR sign-in token and deletes the local token file from this app. App-managed local Google OAuth credentials may remain so OCR can reconnect later."
        // [PROPÓSITO] Explica que la desconexión afecta el token/estado local de inicio de sesión de Google OCR; las credenciales OAuth gestionadas por la app pueden quedar disponibles para reconectar.
      },
      "delete_preset_confirm": {
        "es": "¿Eliminar el preset \"{name}\"?",
        "en": "Delete preset \"{name}\"?"
      },
      "restore_defaults_confirm": {
        "es": "¿Restaurar presets por defecto (generales y para el idioma \"{lang}\") a su versión original? Esto revertirá las eliminaciones y los cambios realizados sobre presets por defecto del idioma activo.",
        "en": "Restore default presets (general and language \"{lang}\") to original? This will revert removals and changes to default presets for the active language."
        // [PROPÓSITO] Confirmación para restaurar presets por defecto generales y del idioma activo, revirtiendo cambios sobre esos defaults.
      },
      "edit_preset_confirm": {
        "es": "¿Está seguro de reemplazar \"{name}\" por el preset actual?",
        "en": "Are you sure you want to replace \"{name}\" with the current preset?"
        // [PROPÓSITO] Confirmación de reemplazo del preset seleccionado por los valores actualmente editados.
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
      },
      "selector_empty": {
        "es": "(vacío)",
        "en": "(empty)"
        // [PROPÓSITO] El preview compacto del texto actual no tiene texto que mostrar. En otras palabras, no hay texto actual cargado en la app.
      },
      "reading_tools": {
        "reading_speed_test": {
          "es": "Test de velocidad de lectura",
          "en": "Reading speed test"
          // [PROPÓSITO] Botón de la ventana principal que inicia el flujo guiado del test de velocidad de lectura.
        },
        "preview_spoiler": {
          "es": "Spoiler",
          "en": "Spoiler"
          // [PROPÓSITO] Control para ocultar el segmento final del preview del texto actual y evitar revelar contenido.
        }
      },
      "tooltips": {
        "text_extraction": {
          "es": "Extraer texto desde archivo",
          "en": "Extract text from file"
          // [PROPÓSITO] Acción de entrada a la extracción de texto desde archivos; puede derivar en ruta nativa, OCR, opciones PDF o lote.
        },
        "text_extraction_abort": {
          "es": "Abortar extracción",
          "en": "Abort extraction"
        },
        "overwrite_clipboard": {
          "es": "Reemplazar texto actual con el texto del portapapeles",
          "en": "Replace current text with clipboard text"
        },
        "append_clipboard": {
          "es": "Agregar texto del portapapeles al final del texto actual",
          "en": "Append clipboard text at the end of current text"
          // [PROPÓSITO] Agrega el texto del portapapeles al final del texto actual desde un nuevo párrafo.
        },
        "clipboard_repeat_count": {
          "es": "Repeticiones de pegado",
          "en": "Clipboard repetitions"
          // [PROPÓSITO] Número de iteraciones en que se pega el texto del portapapeles en el texto actual, reemplazándolo o agregándolo al final, dependiendo de la acción elegida por el usuario.
        },
        "edit": {
          "es": "Abrir Editor de Texto",
          "en": "Open Text Editor"
        },
        "clear": {
          "es": "Vaciar texto actual",
          "en": "Clear current text"
        },
        "snapshot_load": {
          "es": "Cargar snapshot de texto",
          "en": "Load text snapshot"
          // [PROPÓSITO] Acción para cargar un snapshot de texto guardado y convertirlo en texto actual.
        },
        "snapshot_save": {
          "es": "Guardar el texto actual en un snapshot",
          "en": "Save current text to a snapshot"
          // [PROPÓSITO] Acción para guardar el texto actual como snapshot de texto.
        },
        "task_new": {
          "es": "Nueva tarea",
          "en": "New task"
        },
        "task_load": {
          "es": "Cargar tarea",
          "en": "Load task"
        },
        "browser_extension": {
          "es": "Extensión del navegador",
          "en": "Browser extension"
          // [PROPÓSITO] Abre la ventana informativa de la extensión de navegador, no una función de extracción de la app de escritorio.
        },
        "cibersino_website": {
          "es": "Sitio de Cibersino",
          "en": "Cibersino website"
        },
        "cibersino_kofi": {
          "es": "Apóyame en Ko-fi",
          "en": "Support me on Ko-fi"
        },
        "new_preset": {
          "es": "Crear un nuevo preset",
          "en": "Create a new preset"
        },
        "edit_preset": {
          "es": "Editar preset seleccionado",
          "en": "Edit selected preset"
        },
        "delete_preset": {
          "es": "Eliminar preset seleccionado",
          "en": "Delete selected preset"
        },
        "reset_presets": {
          "es": "Restaurar presets por defecto",
          "en": "Restore default presets"
        },
        "help_button": {
          "es": "Mostrar consejo útil",
          "en": "Show a useful tip"
        },
        "flotante_window": {
          "es": "Cronómetro Flotante",
          "en": "Floating Stopwatch"
        }
      },
      "aria": {
        "text_extraction": {
          "es": "Extraer texto desde archivo",
          "en": "Extract text from file"
        },
        "text_extraction_abort": {
          "es": "Abortar extracción",
          "en": "Abort extraction"
        },
        "browser_extension": {
          "es": "Abrir ventana de extensión del navegador",
          "en": "Open browser extension window"
          // [PROPÓSITO] Etiqueta accesible para abrir la ventana informativa de la extensión de navegador.
        },
        "clipboard_repeat_count": {
          "es": "Repeticiones de pegado",
          "en": "Paste repetitions"
          // [PROPÓSITO] Número de iteraciones en que se pega el texto del portapapeles en el texto actual, reemplazándolo o agregándolo al final, dependiendo de la acción elegida por el usuario.
        },
        "wpm_input": {
          "es": "Palabras por minuto",
          "en": "Words per minute"
        },
        "wpm_slider": {
          "es": "Deslizador de palabras por minuto",
          "en": "Words-per-minute slider"
        },
        "speed_presets": {
          "es": "Presets de velocidad",
          "en": "Speed presets"
          // [PROPÓSITO] Etiqueta accesible del selector de presets de WPM/velocidad de lectura.
        },
        "precise_mode_toggle": {
          "es": "Modo preciso",
          "en": "Precise mode"
        },
        "crono_controls": {
          "es": "Controles del cronómetro",
          "en": "Stopwatch controls"
        },
        "crono_display": {
          "es": "Display del cronómetro",
          "en": "Stopwatch display"
        },
        "crono_toggle": {
          "es": "Iniciar o pausar cronómetro",
          "en": "Start or pause stopwatch"
        },
        "crono_reset": {
          "es": "Detener y restablecer cronómetro",
          "en": "Stop and reset stopwatch"
        },
        "floating_window_toggle": {
          "es": "Cronómetro Flotante",
          "en": "Floating Stopwatch"
        },
        "floating_window_group": {
          "es": "Controles del Cronómetro Flotante",
          "en": "Floating Stopwatch controls"
        }
      },
      "speed": {
        "title": {
          "es": "VELOCIDAD DE LECTURA",
          "en": "READING SPEED"
        },
        "wpm_label": {
          "es": "palabras por minuto (WPM)",
          "en": "words per minute (WPM)"
        }
      },
      "results": {
        "title": {
          "es": "RESULTADOS DEL CONTEO",
          "en": "COUNT RESULTS"
        },
        "time_label": {
          "es": "⏱ Tiempo estimado de lectura: ",
          "en": "⏱ Estimated reading time: "
        },
        "words": {
          "es": "Palabras: {n}",
          "en": "Words: {n}"
        },
        "chars_no_space": {
          "es": "Caracteres (sin espacios): {n}",
          "en": "Characters (no spaces): {n}"
        },
        "chars": {
          "es": "Caracteres: {n}",
          "en": "Characters: {n}"
        },
        "precise_mode": {
          "es": "Modo preciso",
          "en": "Precise mode"
        },
        "precise_tooltip": {
          "es": "Basado en Intl.Segmenter",
          "en": "Based on Intl.Segmenter"
          // [PROPÓSITO] Tooltip técnico del modo preciso de conteo; describe la base de segmentación usada para calcular la cantidad de palabras y caracteres.
        }
      },
      "crono": {
        "title": {
          "es": "CRONÓMETRO",
          "en": "STOPWATCH"
        },
        "speed": {
          "es": "Velocidad:",
          "en": "Speed:"
        },
        "controls_label": {
          "es": "Controles del cronómetro",
          "en": "Stopwatch controls"
        }
      },
      "processing": {
        "text_extraction_placeholder": {
          "es": "Procesando extracción...",
          "en": "Extracting text..."
        },
        "text_extraction_preparing": {
          "es": "Preparando la ruta de extracción...",
          "en": "Preparing extraction route..."
          // [PROPÓSITO] Estado previo a ejecutar extracción: la app está resolviendo ruta/opciones antes del procesamiento efectivo.
        },
        "text_extraction_cancellation_pending": {
          "es": "Cancelación solicitada. Espera...",
          "en": "Cancellation requested. Please wait..."
        },
        "text_extraction_waiting_native": {
          "es": "Extrayendo texto del archivo...",
          "en": "Extracting text from file..."
          // [PROPÓSITO] Estado de ejecución cuando la extracción usa la ruta nativa/local.
        },
        "text_extraction_waiting_ocr": {
          "es": "Ejecutando extracción OCR...",
          "en": "Running OCR extraction..."
          // [PROPÓSITO] Estado de ejecución cuando la extracción usa OCR.
        },
        "text_extraction_waiting_ocr_delayed": {
          "es": "Ejecutando OCR. Algunos archivos tardan más.",
          "en": "Running OCR. Some files take longer."
          // [PROPÓSITO] Estado prolongado de OCR para indicar espera normal en archivos que tardan más.
        },
        "text_extraction_unit_progress": {
          "es": "Unidad {index}/{count}",
          "en": "Unit {index}/{count}"
          // [PROPÓSITO] Progreso por unidad de extracción por lotes.
        },
        "text_extraction_input_progress": {
          "es": "Ítem {index}/{count}",
          "en": "Item {index}/{count}"
          // [PROPÓSITO] Progreso por ítem dentro de una unidad de extracción por lotes.
        },
        "text_extraction_route_native": {
          "es": "Nativa",
          "en": "Native"
          // [PROPÓSITO] Label corto de ruta de extracción nativa/local en estados de procesamiento.
        },
        "text_extraction_route_ocr": {
          "es": "OCR",
          "en": "OCR"
          // [PROPÓSITO] Label corto de ruta OCR en estados de procesamiento.
        },
        "text_extraction_elapsed": {
          "es": "Transcurrido: ",
          "en": "Elapsed: "
        },
        "text_extraction_drop_here": {
          "es": "Suelta aquí para extraer texto",
          "en": "Drop here to extract text"
        }
      }
    },
    "text_extraction": {
      "pdf_options": {
        "title": {
          "es": "Opciones de extracción PDF",
          "en": "PDF extraction options"
        },
        "message": {
          "es": "Elige si quieres procesar todo el PDF o un rango contiguo de páginas antes de la extracción.",
          "en": "Choose whether to process the whole PDF or one contiguous page range before extraction."
          // [PROPÓSITO] Modal previo a la extracción PDF; define si se procesa todo el PDF o un rango contiguo de páginas.
        },
        "file_label": {
          "es": "Archivo:",
          "en": "File:"
        },
        "total_pages_label": {
          "es": "Páginas totales: ",
          "en": "Total pages: "
        },
        "selection_legend": {
          "es": "Selección de páginas",
          "en": "Page selection"
        },
        "all_pages_label": {
          "es": "Todas las páginas",
          "en": "All pages"
        },
        "range_label": {
          "es": "Rango de páginas",
          "en": "Page range"
        },
        "from_page_label": {
          "es": "Desde la página",
          "en": "From page"
        },
        "to_page_label": {
          "es": "Hasta la página",
          "en": "To page"
        },
        "selected_page_count_label": {
          "es": "Páginas seleccionadas: ",
          "en": "Selected pages: "
        },
        "keep_generated_pdf_label": {
          "es": "Conservar el PDF generado de páginas seleccionadas después del procesamiento",
          "en": "Keep the generated selected-page PDF after processing"
          // [PROPÓSITO] Checkbox para conservar el PDF generado con páginas seleccionadas después de usarlo como insumo de extracción.
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
          "es": "Cerrar ventana de opciones de extracción PDF",
          "en": "Close PDF extraction options window"
        },
        "invalid_range": {
          "es": "Ingresa un rango contiguo de páginas entre 1 y {totalPages}.",
          "en": "Enter a contiguous page range between 1 and {totalPages}."
          // [PROPÓSITO] Validación del rango contiguo de páginas permitido por el total de páginas del PDF.
        }
      },
      "route_choice": {
        "title": {
          "es": "Elegir ruta de extracción",
          "en": "Choose extraction route"
        },
        "message": {
          "es": "Este PDF tiene disponibles ambas rutas de extracción. Elige una para continuar.",
          "en": "Both extraction routes are available for this PDF. Choose one to continue."
          // [PROPÓSITO] Ventana modal para PDFs donde están disponibles ruta nativa y OCR; obliga a elegir una ruta antes de continuar.
        },
        "native_button": {
          "es": "Usar nativa",
          "en": "Use native"
          // [PROPÓSITO] Botón que selecciona la ruta nativa/local para continuar la extracción.
        },
        "ocr_button": {
          "es": "Usar OCR",
          "en": "Use OCR"
          // [PROPÓSITO] Botón que selecciona la ruta OCR para continuar la extracción.
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
          "es": "Revisar activación de Google OCR",
          "en": "Review Google OCR activation"
        },
        "intro": {
          "es": "toT usa servicios de Google para OCR. Si continúas, se abrirá el navegador para que autorices esta app.",
          "en": "toT uses Google services for OCR. Continuing will open your browser so you can authorize this app."
        },
        "selected_files": {
          "es": "Solo se envían a Google los archivos que eliges para OCR.",
          "en": "Only files you choose for OCR are sent to Google."
        },
        "local_storage": {
          "es": "Esta app guarda credenciales OAuth de Google para OCR gestionadas por la app y el estado local del token de Google en esta instancia.",
          "en": "This app stores app-managed Google OAuth credentials for OCR and local Google token state in this app instance."
        },
        "remote_cleanup": {
          "es": "Después de exportar, la app intenta eliminar el documento temporal de Google de tu Google Drive.",
          "en": "After export, the app attempts to remove the temporary Google document from your Google Drive."
        },
        "disconnect": {
          "es": "Más tarde puedes desconectar esta conexión desde Preferencias > Desconectar Google OCR.",
          "en": "You can later disconnect via Preferences > Disconnect Google OCR."
        },
        "proceed_button": {
          "es": "Continuar con Google",
          "en": "Continue to Google"
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
        }
      },
      "apply_modal": {
        "title": {
          "es": "Aplicar texto extraído",
          "en": "Apply extracted text"
        },
        "message": {
          "es": "Elige cómo aplicar el texto extraído.",
          "en": "Choose how to apply the extracted text."
          // [PROPÓSITO] Ventana modal posterior a extracción; decide cómo incorporar el texto extraído al texto actual.
        },
        "elapsed": {
          "es": "Tiempo de extracción: ",
          "en": "Extraction time: "
        },
        "repeat_label": {
          "es": "Repeticiones",
          "en": "Repetitions"
          // [PROPÓSITO] Número de iteraciones en que se pega el texto extraído en el texto actual, reemplazándolo o agregándolo al final, dependiendo de la acción elegida por el usuario.
        },
        "overwrite_button": {
          "es": "Reemplazar",
          "en": "Replace"
          // [PROPÓSITO] Aplica el texto extraído reemplazando el texto actual.
        },
        "append_button": {
          "es": "Agregar",
          "en": "Append"
          // [PROPÓSITO] Aplica el texto extraído agregándolo al texto actual.
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
        },
        "saved_pdf_label": {
          "es": "PDF guardado: ",
          "en": "Saved PDF: "
          // [PROPÓSITO] Label de nombre del PDF generado que quedó guardado.
        },
        "reveal_saved_pdf_button": {
          "es": "Mostrar PDF guardado",
          "en": "Reveal saved PDF"
          // [PROPÓSITO] Acción para abrir en el sistema la carpeta del PDF generado guardado.
        }
      },
      "batch_plan": {
        "title": {
          "es": "Planificar extracción por lotes",
          "en": "Plan batch extraction"
          // [PROPÓSITO] Ventana modal donde se organiza la extracción por lotes antes de iniciar el procesamiento.
        },
        "single_file_title": {
          "es": "Procesar el PDF completo por partes",
          "en": "Process full PDF in parts"
          // [PROPÓSITO] Variante del plan de extracción por lotes cuando el texto de un PDF pesado se extrae completo vía OCR, pero dividido por partes. De esta manera la app sortea el límite de tamaño de subida por archivo que impone el proveedor Google OCR.
        },
        "pages_all": {
          "es": "Todas las páginas",
          "en": "All pages"
        },
        "tags_none": {
          "es": "Sin etiquetas",
          "en": "No tags"
        },
        "heavy_pdf_badge": {
          "es": "PDF pesado",
          "en": "Heavy PDF"
        },
        "generated_inputs_preview": {
          "es": "Partes previstas para extracción:",
          "en": "Planned parts for extraction:"
          // [PROPÓSITO] Lista de los PDFs locales que la app prevé generar como ítems de extracción del texto del PDF pesado. Son nombres de archivos nuevos que representan rangos de páginas del PDF fuente preparados para subir al proveedor Google OCR.
        },
        "unit_label": {
          "es": "Unidad {index}",
          "en": "Unit {index}"
          // [PROPÓSITO] Nombre por defecto de una unidad de extracción por lotes.
        },
        "unit_counter": {
          "es": "Unidad {index}/{count}",
          "en": "Unit {index}/{count}"
          // [PROPÓSITO] Contador de progreso o posición de unidades de extracción por lotes.
        },
        "unit_name_placeholder": {
          "es": "Nombre opcional de la unidad",
          "en": "Optional unit name"
          // [PROPÓSITO] Campo opcional para nombrar una unidad de extracción por lotes.
        },
        "new_unit_option": {
          "es": "Crear nueva unidad",
          "en": "Create new unit"
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
        },
        "keep_generated_pdf": {
          "es": "Conservar PDF generado",
          "en": "Keep generated PDF"
          // [PROPÓSITO] Checkbox para conservar PDFs generados durante la extracción por lotes.
        },
        "edit_tags": {
          "es": "Etiquetas",
          "en": "Tags"
          // [PROPÓSITO] Acción para editar etiquetas aplicables a snapshots de texto creados desde la unidad.
        },
        "tags_modal": {
          "title": {
            "es": "Etiquetas de la unidad",
            "en": "Unit tags"
          },
          "message": {
            "es": "Elige etiquetas opcionales para los snapshots de texto que se creen desde esta unidad durante la extracción por lotes.",
            "en": "Choose optional tags for text snapshots created from this unit during batch extraction."
            // [PROPÓSITO] Las etiquetas se aplican a snapshots de texto creados por la unidad durante la extracción por lotes.
          },
          "confirm_button": {
            "es": "Aplicar etiquetas",
            "en": "Apply tags"
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
        },
        "preset_all": {
          "es": "Todo junto",
          "en": "All together"
          // [PROPÓSITO] Preset de planificación que agrupa todos los archivos fuente en una misma unidad de extracción.
        },
        "preset_separate": {
          "es": "Cada archivo por separado",
          "en": "One file per unit"
          // [PROPÓSITO] Preset de planificación que crea una unidad separada por cada archivo fuente.
        },
        "failure_legend": {
          "es": "Comportamiento ante fallos",
          "en": "Failure behavior"
        },
        "failure_default": {
          "es": "Finalizar la unidad tras el último éxito y seguir con la siguiente",
          "en": "Finalize the unit after the last success and continue with the next unit"
          // [PROPÓSITO] Política de fallo de la extracción de texto que cierra la unidad tras el último ítem exitosamente extraído y continúa con la unidad siguiente.
        },
        "failure_continue": {
          "es": "Omitir el ítem fallido y seguir dentro de la misma unidad",
          "en": "Omit the failed item and continue inside the same unit"
          // [PROPÓSITO] Política de fallo de la extracción de texto que omite el ítem con extracción fallida y continúa dentro de la misma unidad.
        },
        "start_button": {
          "es": "Iniciar extracción",
          "en": "Start extraction"
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
        },
        "single_file_title": {
          "es": "Informe final de la extracción del PDF pesado",
          "en": "Heavy PDF extraction final report"
          // [PROPÓSITO] Informe mostrado al terminar la extracción de un PDF pesado procesado por partes.
        },
        "omitted": {
          "es": "omitido",
          "en": "omitted"
          // [PROPÓSITO] Estado de ítem cuya extracción fue omitida por la política de fallos.
        },
        "reveal_generated_pdf": {
          "es": "Mostrar PDF guardado",
          "en": "Reveal saved PDF"
          // [PROPÓSITO] Acción para abrir en el sistema la carpeta de un PDF generado que fue conservado.
        },
        "current_text_has_output": {
          "es": "El texto actual fue modificado.",
          "en": "Current text was modified."
          // [PROPÓSITO] Resultado final que indica que el texto actual fue modificado por el proceso de extracción.
        },
        "current_text_unchanged": {
          "es": "El texto actual no cambió.",
          "en": "Current text did not change."
          // [PROPÓSITO] Resultado final que indica que el proceso de extracción no modificó el texto actual.
        },
        "snapshot_load_guidance": {
          "es": "Los snapshots de texto creados se pueden cargar desde la ventana principal usando el botón '📂'.",
          "en": "Created text snapshots can be loaded from the main window using the '📂' button."
          // [PROPÓSITO] Guía para cargar los snapshots de texto creados por el proceso de extracción de texto.
        },
        "elapsed": {
          "es": "Tiempo total de extracción: ",
          "en": "Total extraction time: "
        },
        "copy_report": {
          "es": "Copiar informe",
          "en": "Copy report"
        },
        "open_snapshots_folder": {
          "es": "Abrir carpeta de snapshots de texto",
          "en": "Open text snapshots folder"
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
        },
        "failed_fallback": {
          "es": "falló",
          "en": "failed"
        },
        "failed_with_code": {
          "es": "falló: {code}",
          "en": "failed: {code}"
        },
        "cancelled_fallback": {
          "es": "cancelada",
          "en": "cancelled"
        },
        "cancelled_with_code": {
          "es": "cancelada: {code}",
          "en": "cancelled: {code}"
        },
        "snapshot_not_created": {
          "es": "(no se creó snapshot de texto)",
          "en": "(no text snapshot created)"
          // [PROPÓSITO] Estado del informe cuando la unidad no produjo snapshot de texto.
        },
        "snapshot_created": {
          "es": "{filename} creado",
          "en": "{filename} created"
          // [PROPÓSITO] Estado del informe cuando se creó un snapshot de texto.
        },
        "snapshot_creation_failed": {
          "es": "(falló la creación del snapshot de texto: {code})",
          "en": "(text snapshot creation failed: {code})"
          // [PROPÓSITO] Estado del informe cuando falló la creación del snapshot de texto.
        }
      },
      "single_file_heavy": {
        "case_a_title": {
          "es": "PDF completo demasiado grande para OCR",
          "en": "Full PDF too large for OCR"
          // [PROPÓSITO] Caso en que el PDF fuente completo supera el límite OCR y puede procesarse por partes.
        },
        "case_a_message": {
          "es": "El PDF completo supera el límite del proveedor OCR ({providerLimitMb} MB). Puedes procesar su extracción automáticamente por partes, conservando el archivo original. Alternativamente, puedes usar la ruta de extracción nativa.",
          "en": "The full PDF exceeds the OCR provider limit ({providerLimitMb} MB). You can process its extraction automatically in parts, keeping the original file. Alternatively, you can use the native extraction route."
          // [PROPÓSITO] Explica que el PDF fuente completo supera el límite del proveedor OCR y ofrece alternativas.
        },
        "case_b_title": {
          "es": "PDF generado demasiado grande para OCR",
          "en": "Generated PDF too large for OCR"
          // [PROPÓSITO] Caso en que el PDF generado desde un rango seleccionado supera el límite OCR.
        },
        "case_b_message": {
          "es": "El PDF generado para el rango seleccionado supera el límite del proveedor OCR ({providerLimitMb} MB). No se subió. Puedes volver a páginas, usar ruta nativa o procesar el PDF completo por partes.",
          "en": "The generated PDF for the selected range exceeds the OCR provider limit ({providerLimitMb} MB). It was not uploaded. You can return to page selection, use native route, or process the full PDF in parts."
          // [PROPÓSITO] Explica que el PDF generado para el rango no se subió por exceder el límite OCR y ofrece alternativas.
        },
        "source_file_label": {
          "es": "Archivo fuente:",
          "en": "Source file:"
          // [PROPÓSITO] Label del PDF fuente original en la ventana de PDF pesado.
        },
        "selected_range_label": {
          "es": "Rango seleccionado:",
          "en": "Selected range:"
        },
        "generated_pdf_label": {
          "es": "PDF generado:",
          "en": "Generated PDF:"
          // [PROPÓSITO] Label del PDF generado desde selección de páginas en la ventana de PDF pesado.
        },
        "generated_pdf_size_label": {
          "es": "Tamaño del PDF generado:",
          "en": "Generated PDF size:"
        },
        "source_size_label": {
          "es": "Tamaño del archivo fuente:",
          "en": "Source file size:"
        },
        "total_pages_label": {
          "es": "Páginas totales:",
          "en": "Total pages:"
        },
        "split_button": {
          "es": "Procesar el PDF completo por partes",
          "en": "Process the full PDF in parts"
          // [PROPÓSITO] Acción para ir a la ventana modal de extracción del PDF completo por partes.
        },
        "return_to_pages_button": {
          "es": "Volver a páginas",
          "en": "Back to pages"
          // [PROPÓSITO] Acción para volver a la selección de páginas del PDF.
        },
        "use_native_button": {
          "es": "Usar nativa",
          "en": "Use native"
          // [PROPÓSITO] Acción para usar ruta nativa como alternativa al OCR en este caso.
        },
        "reveal_generated_pdf_button": {
          "es": "Mostrar PDF guardado",
          "en": "Reveal saved PDF"
          // [PROPÓSITO] Acción para mostrar la carpeta del PDF generado guardado, disponible si el usuario eligió conservarlo previamente.
        },
        "cancel_button": {
          "es": "Cancelar",
          "en": "Cancel"
        },
        "close_aria": {
          "es": "Cerrar ventana de PDF pesado para OCR",
          "en": "Close heavy PDF for OCR window"
        }
      }
    },
    "editor": {
      "title": {
        "es": "toT — Editor de Texto",
        "en": "toT — Text Editor"
      },
      "placeholder": {
        "es": "Escribe o pega aquí...",
        "en": "Type or paste here..."
      },
      "calc_button": {
        "es": "Aplicar",
        "en": "Apply"
        // [PROPÓSITO] En el Editor de Texto, guarda o actualiza manualmente el texto editado como texto actual de la app, lo que recalcula el tiempo estimado de lectura.
      },
      "calc_while_typing": {
        "es": "Auto",
        "en": "Auto"
        // [PROPÓSITO] Checkbox para activar/desactivar el 'Aplicar' / `Apply` automático mientras se escribe en el Editor de Texto.
      },
      "spellcheck": {
        "es": "Ortografía",
        "en": "Spellcheck"
        // [PROPÓSITO] Checkbox para activar/desactivar el corrector ortográfico del Editor de Texto.
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
      },
      "read_progress_label": {
        "es": "Leído",
        "en": "Read"
        // [PROPÓSITO] Label del progreso porcentual de lectura dentro del editor, no una métrica de extracción.
      },
      "read_progress_aria": {
        "es": "Progreso de lectura: {value}",
        "en": "Read progress: {value}"
        // [PROPÓSITO] Etiqueta accesible del progreso de lectura dentro del editor.
      },
      "clear_title": {
        "es": "Vaciar",
        "en": "Clear"
        // [PROPÓSITO] Borrar todo el texto del Editor de Texto.
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
      },
      "replace_all": {
        "es": "Reemplazar todo",
        "en": "Replace all"
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
      },
      "message": {
        "es": "Etiqueta opcionalmente este snapshot de texto antes de elegir dónde guardarlo.",
        "en": "Optionally tag this text snapshot before choosing where to save it."
        // [PROPÓSITO] Modal previo a guardar snapshot; permite asignar etiquetas opcionales antes de elegir ubicación.
      },
      "labels": {
        "language": {
          "es": "Idioma",
          "en": "Language"
          // [PROPÓSITO] Etiqueta opcional del snapshot de texto; clasifica el idioma del texto guardado.
        },
        "type": {
          "es": "Tipo",
          "en": "Type"
          // [PROPÓSITO] Etiqueta opcional del snapshot de texto; clasifica el tipo de texto guardado, como por ejemplo `ficción` o `no-ficción`.
        },
        "difficulty": {
          "es": "Dificultad",
          "en": "Difficulty"
          // [PROPÓSITO] Etiqueta opcional del snapshot de texto; clasifica la dificultad del texto guardado.
        }
      },
      "empty": {
        "language": {
          "es": "Sin etiqueta de idioma",
          "en": "No language tag"
        },
        "type": {
          "es": "Sin etiqueta de tipo",
          "en": "No type tag"
        },
        "difficulty": {
          "es": "Sin etiqueta de dificultad",
          "en": "No difficulty tag"
        }
      },
      "buttons": {
        "confirm": {
          "es": "Guardar snapshot de texto",
          "en": "Save text snapshot"
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
      },
      "labels": {
        "name": {
          "es": "Nombre",
          "en": "Name"
        },
        "summary_total": {
          "es": "Total",
          "en": "Total"
          // [PROPÓSITO] Tiempo total de la tarea. Es la suma del tiempo estimado de cada fila/lectura de la tarea.
        },
        "summary_left": {
          "es": "Falta",
          "en": "Left"
          // [PROPÓSITO] Tiempo total restante de la tarea. Es la suma del tiempo restante de cada fila/lectura de la tarea.
        },
        "empty": {
          "es": "(vacío)",
          "en": "(empty)"
          // [PROPÓSITO] Biblioteca de lecturas no tiene filas que mostrar, ya sea porque no hay filas guardadas o porque no hay coincidencias de búsqueda.
        },
        "search": {
          "es": "Buscar",
          "en": "Search"
        },
        "search_placeholder": {
          "es": "Buscar en biblioteca...",
          "en": "Search library..."
        }
      },
      "columns": {
        "texto": {
          "es": "Lectura",
          "en": "Reading"
        },
        "tiempo": {
          "es": "Tiempo",
          "en": "Time"
          // [PROPÓSITO] Columna de tiempo estimado asociado a una fila de lectura.
        },
        "percent": {
          "es": "%",
          "en": "%"
        },
        "falta": {
          "es": "Falta",
          "en": "Left"
          // [PROPÓSITO] Columna de tiempo restante de una fila de lectura.
        },
        "enlace": {
          "es": "Enlace o ruta local",
          "en": "Link or local path"
        },
        "comentario": {
          "es": "",
          "en": ""
          // [PROPÓSITO] Columna estrecha para acciones opcionales de comentario y snapshot asociadas a la fila. ES/EN la dejan sin label visible, pero otros idiomas pueden optar por un label breve si resulta más claro.
        },
        "acciones": {
          "es": "Acciones",
          "en": "Actions"
          // [PROPÓSITO] Columna con los botones de cada fila para: subir en la tabla, bajar en la tabla, guardar en biblioteca y eliminar de la tabla.
        }
      },
      "buttons": {
        "save": {
          "es": "Guardar",
          "en": "Save"
          // [PROPÓSITO] Guardar fila en la biblioteca de lecturas.
        },
        "delete": {
          "es": "Eliminar",
          "en": "Delete"
          // [PROPÓSITO] Eliminar fila de la tabla.
        },
        "add_row": {
          "es": "Agregar fila",
          "en": "Add row"
          // [PROPÓSITO] Agregar una fila nueva a la tabla.
        },
        "open_library": {
          "es": "Abrir biblioteca",
          "en": "Open library"
          // [PROPÓSITO] Abrir ventana modal de la biblioteca de lecturas, para seleccionar una fila guardada y agregarla a la tabla.
        },
        "select_snapshot": {
          "es": "Seleccionar snapshot",
          "en": "Select snapshot"
          // [PROPÓSITO] Acción para asociar un snapshot de texto a una fila de tarea.
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
        },
        "move_down": {
          "es": "Bajar fila",
          "en": "Move down"
        },
        "delete_row": {
          "es": "Eliminar fila",
          "en": "Delete row"
        },
        "library_row_save": {
          "es": "Guardar en biblioteca",
          "en": "Save to library"
        },
        "library_row_load": {
          "es": "Cargar fila",
          "en": "Load row"
          // [PROPÓSITO] Agregar una fila guardada a la tabla desde la biblioteca de lecturas.
        },
        "library_row_delete": {
          "es": "Eliminar de biblioteca",
          "en": "Delete from library"
        },
        "snapshot_load": {
          "es": "Cargar snapshot en texto actual",
          "en": "Load snapshot to current text"
          // [PROPÓSITO] Acción para cargar el snapshot de texto asociado a la fila como texto actual de la app.
        },
        "snapshot_select": {
          "es": "Seleccionar snapshot para esta fila",
          "en": "Select a text snapshot for this row"
          // [PROPÓSITO] Acción para seleccionar un snapshot de texto guardado y asociarlo a la fila.
        },
        "snapshot_clear": {
          "es": "Quitar snapshot seleccionado de esta fila",
          "en": "Remove selected snapshot from this row"
          // [PROPÓSITO] Acción para quitar de la fila la asociación con un snapshot seleccionado.
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
          "es": "Biblioteca",
          "en": "Library"
        },
        "library_save_title": {
          "es": "Guardar en biblioteca",
          "en": "Save to library"
        },
        "library_save_question": {
          "es": "¿Incluir comentario?",
          "en": "Include comment?"
          // [PROPÓSITO] Pregunta si el comentario de la fila debe incluirse al guardar en biblioteca.
        }
      },
      "alerts": {
        "task_unavailable": {
          "es": "Funcionalidad de tareas no disponible.",
          "en": "Task functionality is unavailable."
        },
        "task_open_error": {
          "es": "No se pudo abrir el Editor de Tareas.",
          "en": "Could not open the Task Editor."
        },
        "task_load_error": {
          "es": "No se pudo cargar la tarea.",
          "en": "Could not load the task."
        },
        "task_save_error": {
          "es": "No se pudo guardar la tarea.",
          "en": "Could not save the task."
        },
        "task_save_success": {
          "es": "Tarea guardada.",
          "en": "Task saved."
        },
        "task_delete_error": {
          "es": "No se pudo eliminar la tarea.",
          "en": "Could not delete the task."
        },
        "task_delete_unavailable": {
          "es": "No hay una tarea guardada para eliminar.",
          "en": "No saved task to delete."
        },
        "task_invalid_file": {
          "es": "Archivo de tareas inválido.",
          "en": "Invalid task file."
        },
        "task_invalid_rows": {
          "es": "Hay filas inválidas en la tarea.",
          "en": "There are invalid rows in the task."
        },
        "task_path_outside": {
          "es": "El archivo debe estar dentro de la carpeta de tareas.",
          "en": "The file must be inside the tasks folder."
        },
        "name_required": {
          "es": "El nombre de la tarea es obligatorio.",
          "en": "Task name is required."
        },
        "row_text_required": {
          "es": "El nombre de la fila no puede quedar vacío.",
          "en": "Row name cannot be empty."
          // [PROPÓSITO] El `nombre` / `name` de la fila se refiere al texto de la fila en la primera columna `Lectura` / `Reading`.
        },
        "library_load_error": {
          "es": "No se pudo cargar la biblioteca.",
          "en": "Could not load the library."
        },
        "library_save_error": {
          "es": "No se pudo guardar en la biblioteca.",
          "en": "Could not save to the library."
        },
        "library_save_success": {
          "es": "Fila guardada en la biblioteca.",
          "en": "Row saved to the library."
        },
        "library_delete_error": {
          "es": "No se pudo eliminar de la biblioteca.",
          "en": "Could not delete from the library."
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
        "discard_changes": {
          "es": "Hay cambios sin guardar. ¿Desea descartarlos?",
          "en": "There are unsaved changes. Discard them?"
          // [PROPÓSITO] Mensaje que aparece cuando se abre una tarea mientras ya hay una tarea abierta con cambios no guardados.
        },
        "close_unsaved": {
          "es": "Hay cambios sin guardar. ¿Cerrar sin guardar?",
          "en": "There are unsaved changes. Close without saving?"
        }
      }
    },
    "reading_test": {
      "prestart": {
        "reminder": {
          "es": "Pulsa Play (▶) en el Cronómetro Flotante cuando estés listo para empezar. Una vez que el test haya empezado, no pulses Pausa (⏸) hasta terminar de leer: Pausa termina el test; no pone el cronómetro en pausa. Pulsa Detener/Restablecer (⏹) solo para cancelar el test.",
          "en": "Press Play (▶) in the Floating Stopwatch when you're ready to begin. Once the test has started, do not press Pause (⏸) until you finish reading: Pause ends the test; it does not pause the timer. Press Stop/Reset (⏹) only if you want to cancel the test."
          // [PROPÓSITO] Instrucción previa al test: el usuario debe iniciar la medición con Play en el Cronómetro Flotante; Pausa termina el test.
        }
      },
      "entry": {
        "title": {
          "es": "Test de velocidad de lectura",
          "en": "Reading speed test"
        },
        "intro": {
          "es": "Este test sirve para estimar tu velocidad real de lectura con una sesión guiada. La app abrirá el texto y esperará a que pulses Play (▶) en el Cronómetro Flotante cuando estés listo para empezar. Una vez que el test haya empezado, no pulses Pausa (⏸) hasta terminar de leer: Pausa termina el test; no pone el cronómetro en pausa. Usa Detener/Restablecer (⏹) solo si quieres cancelar el test. Después podrás revisar preguntas de comprensión si el texto las incluye y, al final, crear un preset con el resultado.\nAntes de empezar, ten en cuenta que estos textos de prueba suelen requerir entre 5 y 15 minutos de concentración continua, sin interrupciones.\nEste pool usa textos breves, así que interpreta el resultado con cautela. No debería extrapolarse directamente a textos largos, donde suelen entrar en juego factores positivos, como la adquisición de fluidez y de contexto, y factores negativos, como la recapitulación mental y la fatiga.",
          "en": "This test is meant to estimate your real reading speed through a guided session. The app will open the text and wait for you to press Play (▶) in the Floating Stopwatch when you're ready to begin. Once the test has started, do not press Pause (⏸) until you finish reading: Pause ends the test; it does not pause the timer. Use Stop/Reset (⏹) only if you want to cancel the test. Afterwards, you may review comprehension questions if the text includes them and, at the end, create a preset from the result.\nBefore you begin, keep in mind that these test texts usually require between 5 and 15 minutes of uninterrupted concentration.\nThis pool uses short texts, so treat the result with caution. It should not be directly extrapolated to long texts, where positive factors such as flow and contextual buildup, and negative factors such as mental recapitulation and fatigue, usually come into play."
          // [PROPÓSITO] Introducción completa del flujo guiado; explica inicio con Cronómetro Flotante, preguntas opcionales y creación posterior de preset.
        },
        "eligible_count": {
          "es": "Archivos elegibles:",
          "en": "Eligible files:"
          // [PROPÓSITO] Conteo de archivos del pool que cumplen los filtros/estado actual para iniciar el test.
        },
        "pool_exhausted_message": {
          "es": "No quedan archivos de test sin usar. Restablece el pool o agrega más archivos.",
          "en": "There are no remaining unused test files. Reset the pool or add more files."
          // [PROPÓSITO] Estado en que no quedan archivos de test sin usar en el pool.
        },
        "visible_empty_bundled_hidden_message": {
          "es": "Los archivos de test incorporados están desactivados y no hay archivos disponibles sin usar. Vuelve a activarlos o importa más archivos para continuar.",
          "en": "The built-in test files are disabled and there are no remaining unused files. Re-enable them or import more files to continue."
          // [PROPÓSITO] Estado en que los tests incorporados están desactivados y no quedan archivos disponibles sin usar.
        },
        "close_aria": {
          "es": "Cerrar ventana de test de velocidad de lectura",
          "en": "Close reading speed test window"
        },
        "start_random_confirm": {
          "es": "Esto reemplazará el texto actual con un texto aleatorio elegible del pool. ¿Deseas continuar?",
          "en": "This will replace the current text with a random eligible text from the pool. Do you want to continue?"
          // [PROPÓSITO] Confirmación porque iniciar con texto aleatorio reemplaza el texto actual.
        },
        "reset_confirm": {
          "es": "Esto restablecerá todo el pool del test y volverá a marcar todos sus archivos como no usados. ¿Deseas continuar?",
          "en": "This will reset the whole test pool and mark all of its files as unused again. Do you want to continue?"
          // [PROPÓSITO] Confirmación para restablecer el estado de uso de todo el pool del test.
        },
        "import_summary": {
          "es": "Importación finalizada. Importados: {imported}. Duplicados omitidos: {skippedDuplicates}. Validaciones fallidas: {failedValidation}. Entradas de archivo comprimido fallidas: {failedArchiveEntries}. Escrituras fallidas: {failedWrites}.",
          "en": "Import finished. Imported: {imported}. Skipped duplicates: {skippedDuplicates}. Failed validation: {failedValidation}. Failed archive entries: {failedArchiveEntries}. Failed writes: {failedWrites}."
          // [PROPÓSITO] Resumen posterior a importar archivos de test al pool.
        },
        "import_conflict": {
          "title": {
            "es": "Importar archivos",
            "en": "Import files"
            // [PROPÓSITO] Título de la ventana modal de importación de archivos cuando hay archivos conflictivos.
          },
          "message": {
            "es": "Algunos archivos importados ya existen en el pool. ¿Cómo quieres manejar los duplicados?",
            "en": "Some imported files already exist in the pool. How should duplicates be handled?"
            // [PROPÓSITO] Decisión de manejo de duplicados al importar archivos al pool del test.
          },
          "detail": {
            "es": "El pool ya contiene {count} de los nombres de archivo de destino.",
            "en": "The pool already contains {count} of the destination file names."
          },
          "buttons": {
            "skip": {
              "es": "Omitir duplicados",
              "en": "Skip duplicates"
            },
            "replace": {
              "es": "Reemplazar duplicados",
              "en": "Replace duplicates"
            },
            "cancel": {
              "es": "Cancelar importación",
              "en": "Cancel import"
            }
          }
        },
        "buttons": {
          "get_more_files": {
            "es": "Obtener más archivos",
            "en": "Get more files"
            // [PROPÓSITO] Acción para obtener más archivos de test desde la fuente externa configurada. Abre una carpeta de Google Drive en el navegador del sistema.
          },
          "import_files": {
            "es": "Importar archivos",
            "en": "Import files"
            // [PROPÓSITO] Acción para importar archivos de test desde el dispositivo al pool local.
          },
          "show_instructions": {
            "es": "Mostrar instrucciones",
            "en": "Show instructions"
          },
          "hide_instructions": {
            "es": "Ocultar instrucciones",
            "en": "Hide instructions"
          },
          "start_random_text": {
            "es": "Iniciar con texto aleatorio",
            "en": "Start with random text"
            // [PROPÓSITO] Inicia el test reemplazando el texto actual por un texto elegible aleatorio del pool.
          },
          "start_current_text": {
            "es": "Iniciar con texto actual",
            "en": "Start with current text"
            // [PROPÓSITO] Inicia el test usando el texto actual, no un archivo del pool.
          },
          "show_bundled_entries": {
            "es": "Tests incorporados",
            "en": "Built-in tests"
            // [PROPÓSITO] Control de inclusión de archivos de test iniciales que vienen incorporados en el build de la app.
          }
        },
        "tooltips": {
          "show_bundled_entries": {
            "es": "Incluir en el pool los archivos de test iniciales incorporados en la app",
            "en": "Include the app's bundled starter test files in the pool"
          },
          "get_more_files": {
            "es": "Obtener más archivos de test desde la carpeta de Google Drive",
            "en": "Get more test files from the Google Drive folder"
          },
          "import_files": {
            "es": "Importar archivos de test desde tu dispositivo",
            "en": "Import test files from your device"
          },
          "reset_pool": {
            "es": "Restablecer pool del test",
            "en": "Reset test pool"
            // [PROPÓSITO] Acción para restablecer el estado de uso de todos los archivos del pool del test.
          },
          "start_random_text": {
            "es": "Iniciar el test con un texto aleatorio elegible del pool",
            "en": "Start the test with a random eligible text from the pool"
          },
          "start_current_text": {
            "es": "Iniciar el test con el texto actual",
            "en": "Start the test with the current text"
          }
        }
      },
      "questions": {
        "title": {
          "es": "Preguntas de comprensión lectora",
          "en": "Reading comprehension questions"
        },
        "intro": {
          "es": "Responder estas preguntas de comprensión lectora es opcional y no afecta tu puntaje final. Solo sirven para ayudarte a evaluar la dificultad del texto y si tu ritmo y estilo de lectura te permitieron alcanzar un nivel básico de comprensión. Tus respuestas no se guardan ni se envían a los desarrolladores ni a ninguna otra persona.",
          "en": "Answering these reading comprehension questions is optional and does not affect your final score. They are only meant to help you assess the text's difficulty and whether your reading pace and style allowed you to reach a basic level of comprehension. Your answers are not saved or sent to the developers or to anyone else."
          // [PROPÓSITO] Explica que las preguntas de comprensión son opcionales, no afectan el WPM y no se guardan/envían.
        },
        "random_title": {
          "es": "Línea base de azar",
          "en": "Random guess baseline"
          // [PROPÓSITO] Sección estadística de referencia para comparar el resultado contra azar.
        },
        "random_value": {
          "es": "Puntaje esperado al responder al azar: {percentage}",
          "en": "Expected score under random guessing: {percentage}"
          // [PROPÓSITO] Valor esperado si las preguntas se respondieran al azar.
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
        },
        "chance_at_least_observed": {
          "es": "Probabilidad de obtener al menos este puntaje al responder al azar: {percentage}",
          "en": "Chance of getting at least this score by random guessing: {percentage}"
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
        },
        "measured_wpm": {
          "es": "WPM medidos",
          "en": "Measured WPM"
          // [PROPÓSITO] Resultado de velocidad medido por el test, expresado en WPM.
        },
        "elapsed_time": {
          "es": "Tiempo",
          "en": "Time"
          // [PROPÓSITO] Label del tiempo que duró el test.
        },
        "word_count": {
          "es": "Palabras",
          "en": "Words"
          // [PROPÓSITO] Label de la cantidad de palabras del texto del test.
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
      },
      "title_edit": {
        "es": "Editar preset",
        "en": "Edit preset"
      },
      "heading_new": {
        "es": "Crear nuevo preset",
        "en": "Create new preset"
      },
      "heading_edit": {
        "es": "Editar preset seleccionado",
        "en": "Edit selected preset"
      },
      "name": {
        "es": "Nombre:",
        "en": "Name:"
      },
      "wpm": {
        "es": "WPM:",
        "en": "WPM:"
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
        "es": "{remaining} caracteres restantes",
        "en": "{remaining} characters left"
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
      },
      "subtitle": {
        "es": "Tiempo de lectura",
        "en": "Reading time"
        // [PROPÓSITO] Subtítulo/nombre visible de la extensión de navegador dentro de la ventana informativa.
      },
      "availability": {
        "es": "Disponible ahora en Chrome. Más navegadores pronto.",
        "en": "Available on Chrome now. More browsers coming soon."
      },
      "chrome_store_aria": {
        "es": "Abrir página de Chrome Web Store de la extensión",
        "en": "Open the extension Chrome Web Store page"
      },
      "close_aria": {
        "es": "Cerrar ventana de extensión del navegador",
        "en": "Close browser extension window"
      }
    },
    "alerts": {
      "clipboard_too_large": {
        "es": "El texto del portapapeles es demasiado grande para usarse. Acórtalo y vuelve a intentarlo.",
        "en": "Clipboard text is too large to use. Shorten it and try again."
        // [PROPÓSITO] Informa que la operación sobre el texto actual no puede comenzar porque el texto tomado desde el portapapeles ya supera el límite de caracteres para usarlo como entrada.
      },
      "apply_too_large": {
        "es": "El texto quedaría demasiado grande para aplicarlo. Redúcelo y vuelve a intentarlo.",
        "en": "The text would become too large to apply. Reduce it and try again."
        // [PROPÓSITO] Informa que la operación sobre el texto actual no puede completarse porque, al aplicar el texto, el resultado final superaría el límite del texto actual admitido por la app.
      },
      "applytruncated_": {
        "es": "El texto fue truncado para ajustarse al límite de la aplicación.",
        "en": "The text was truncated to fit the application limit."
        // [PROPÓSITO] Informa que la operación sobre el texto actual se completó, pero el texto final quedó recortado para ajustarse al límite del texto actual admitido por la app.
      },
      "append_text_limit": {
        "es": "No se puede agregar el texto: ya se alcanzó el tamaño máximo.",
        "en": "Cannot append the text: maximum size reached."
        // [PROPÓSITO] Informa que no se puede seguir agregando texto porque el texto actual ya alcanzó el límite máximo admitido por la app.
      },
      "overwrite_clipboard_error": {
        "es": "Ocurrió un error al reemplazar texto desde el portapapeles.",
        "en": "An error occurred while replacing text from the clipboard."
      },
      "append_clipboard_error": {
        "es": "Ocurrió un error al agregar texto desde el portapapeles.",
        "en": "An error occurred while appending text from the clipboard."
      },
      "clear_error": {
        "es": "Ocurrió un error al vaciar el texto.",
        "en": "An error occurred while clearing text."
      },
      "snapshot_save_success": {
        "es": "Snapshot de texto guardado.",
        "en": "Text snapshot saved."
      },
      "snapshot_save_error": {
        "es": "No se pudo guardar el snapshot de texto.",
        "en": "Could not save the text snapshot."
      },
      "snapshot_load_success": {
        "es": "Snapshot de texto cargado.",
        "en": "Text snapshot loaded."
      },
      "snapshot_load_error": {
        "es": "No se pudo cargar el snapshot de texto.",
        "en": "Could not load the text snapshot."
      },
      "snapshot_outside": {
        "es": "El snapshot de texto debe estar dentro de la carpeta de snapshots.",
        "en": "The text snapshot must be inside the snapshots folder."
      },
      "snapshot_truncated": {
        "es": "El snapshot de texto excede el tamaño máximo y fue truncado.",
        "en": "Text snapshot exceeds the maximum size and was truncated."
        // [PROPÓSITO] El texto contenido por el snapshot fue aplicado al texto actual, pero fue truncado al superar el límite admitido por la app.
      },
      "snapshot_unavailable": {
        "es": "La función de snapshots de texto no está disponible.",
        "en": "Text snapshot functionality is unavailable."
      },
      "browser_extension_modal_open_blocked": {
        "es": "La ventana de la extensión del navegador no puede abrirse ahora mismo.",
        "en": "The browser extension window cannot be opened right now."
      },
      "preset_not_found": {
        "es": "Preset seleccionado no encontrado.",
        "en": "Selected preset not found."
      },
      "preset_modal_unavailable": {
        "es": "La ventana de preset no está disponible en esta build de la app.",
        "en": "The preset window is unavailable in this app build."
      },
      "preset_modal_open_error": {
        "es": "Ocurrió un error al abrir la ventana de preset.",
        "en": "An error occurred while opening the preset window."
      },
      "delete_error": {
        "es": "Ocurrió un error al borrar el preset.",
        "en": "An error occurred while deleting the preset."
      },
      "restore_error": {
        "es": "Ocurrió un error al restaurar presets.",
        "en": "An error occurred while restoring presets."
      },
      "open_presets_unsupported": {
        "es": "No es posible abrir la carpeta de presets en este entorno.",
        "en": "Cannot open presets folder in this environment."
      },
      "open_presets_error": {
        "es": "Ocurrió un error al intentar abrir la carpeta de presets.",
        "en": "An error occurred while trying to open the presets folder."
      },
      "open_presets_fail": {
        "es": "No se pudo abrir la carpeta de presets por defecto.",
        "en": "Could not open the default presets folder."
      },
      "text_extraction_error": {
        "es": "Ocurrió un error al iniciar la extracción.",
        "en": "An error occurred while starting extraction."
      },
      "text_extraction_precondition_blocked": {
        "es": "Para iniciar la extracción, cierra todas las ventanas secundarias y detén el cronómetro.",
        "en": "To start text extraction, close all secondary windows and stop the stopwatch."
        // [PROPÓSITO] Alerta de bloqueo preventivo antes de iniciar extracción por ventanas secundarias abiertas o cronómetro no restablecido a 0.
      },
      "text_extraction_precondition_error": {
        "es": "Ocurrió un error al revisar las precondiciones de extracción.",
        "en": "An error occurred while checking text extraction preconditions."
      },
      "text_extraction_processing_locked": {
        "es": "Hay una extracción en curso. Las interacciones de la ventana principal están bloqueadas hasta que termine la extracción o sea cancelada.",
        "en": "There is an extraction in progress. Main-window interactions are locked until the extraction finishes or is cancelled."
        // [PROPÓSITO] Alerta cuando una extracción en curso bloquea interacciones de la ventana principal.
      },
      "text_extraction_abort_error": {
        "es": "Ocurrió un error al solicitar el aborto de extracción.",
        "en": "An error occurred while requesting text extraction abort."
      },
      "text_extraction_cancellation_requested": {
        "es": "Cancelación solicitada. Espera a que termine la extracción actual.",
        "en": "Cancellation requested. Please wait until the current extraction finishes."
      },
      "text_extraction_cancellation_complete": {
        "es": "La cancelación terminó.",
        "en": "Cancellation finished."
      },
      "text_extraction_drop_invalid_file": {
        "es": "El elemento soltado no es un archivo local válido.",
        "en": "Dropped item is not a valid local file."
      },
      "text_extraction_pdf_unreadable_or_corrupt": {
        "es": "Este PDF es ilegible o está corrupto. Revisa el archivo y vuelve a intentarlo.",
        "en": "This PDF is unreadable or corrupt. Check the file and try again."
      },
      "text_extraction_pdf_encrypted_or_password_protected": {
        "es": "Este PDF está cifrado o protegido por contraseña. Desbloquéalo y vuelve a intentarlo.",
        "en": "This PDF is encrypted or password-protected. Unlock it and try again."
      },
      "text_extraction_pdf_page_count_unavailable": {
        "es": "No fue posible determinar el número de páginas de este PDF.",
        "en": "Could not determine the number of pages in this PDF."
      },
      "text_extraction_pdf_page_selection_invalid": {
        "es": "El rango de páginas seleccionado para el PDF es inválido. Ajusta el rango y vuelve a intentarlo.",
        "en": "The selected PDF page range is invalid. Adjust the range and try again."
        // [PROPÓSITO] Alerta cuando la selección de páginas PDF no es válida para continuar.
      },
      "text_extraction_pdf_subset_creation_failed": {
        "es": "No fue posible crear el PDF de páginas seleccionadas para la extracción. Revisa el archivo y vuelve a intentarlo.",
        "en": "The selected-page PDF could not be created for extraction. Check the file and try again."
        // [PROPÓSITO] Alerta cuando falla la creación del PDF generado de páginas seleccionadas.
      },
      "text_extraction_generated_pdf_cleanup_warning": {
        "es": "La extracción terminó, pero no fue posible limpiar automáticamente un PDF local generado.",
        "en": "Extraction finished, but a generated local PDF could not be cleaned up automatically."
        // [PROPÓSITO] Advertencia de limpieza local fallida de un PDF generado después de completar extracción.
      },
      "text_extraction_route_choice_error": {
        "es": "Ocurrió un error al elegir la ruta de extracción.",
        "en": "An error occurred while choosing the extraction route."
        // [PROPÓSITO] Alerta de fallo en el paso crítico de elección de ruta de extracción.
      },
      "text_extraction_generated_pdf_reveal_failed": {
        "es": "No se pudo mostrar el PDF guardado. Revisa si el archivo sigue existiendo.",
        "en": "The saved PDF could not be revealed. Check whether the file still exists."
        // [PROPÓSITO] Alerta cuando no se puede mostrar la carpeta de un PDF generado guardado.
      },
      "text_extraction_apply_error": {
        "es": "Ocurrió un error al aplicar el texto extraído.",
        "en": "An error occurred while applying extracted text."
      },
      "text_extraction_prepare_invalid": {
        "es": "La solicitud preparada de extracción ya no es válida. Inicia el flujo nuevamente.",
        "en": "The prepared extraction request is no longer valid. Start the flow again."
        // [PROPÓSITO] Informa que el estado preparado para ejecutar la extracción ya no es válido o ya no coincide con el archivo fuente, por lo que el flujo debe iniciarse de nuevo.
      },
      "text_extraction_batch_ocr_activation_required": {
        "es": "Este lote incluye ítems con OCR, pero Google OCR no está activado. Usa Preferencias > Activar Google OCR y luego vuelve a iniciar la extracción.",
        "en": "This batch includes OCR items, but Google OCR is not enabled. Use Preferences > Enable Google OCR, then start the extraction again."
        // [PROPÓSITO] Alerta previa a lote con ítems OCR cuando Google OCR no está activado.
      },
      "text_extraction_batch_ocr_token_state_invalid": {
        "es": "Este lote incluye ítems con OCR, pero el estado guardado de inicio de sesión de Google OCR no es válido. Usa Preferencias > Activar Google OCR de nuevo y luego vuelve a iniciar la extracción.",
        "en": "This batch includes OCR items, but the saved Google OCR sign-in state is invalid. Use Preferences > Enable Google OCR again, then start the extraction again."
        // [PROPÓSITO] Alerta previa a lote con OCR cuando el estado guardado de inicio de sesión no es válido.
      },
      "text_extraction_batch_ocr_connectivity_failed": {
        "es": "Este lote incluye ítems con OCR, pero OCR requiere conexión a internet. Revisa tu conexión y vuelve a intentarlo antes de iniciar la extracción.",
        "en": "This batch includes OCR items, but OCR requires an internet connection. Check your connection and try again before starting the extraction."
      },
      "text_extraction_batch_ocr_quota_or_rate_limited": {
        "es": "Este lote incluye ítems con OCR, pero OCR está bloqueado temporalmente por cuota/límite de uso. Espera y vuelve a intentarlo antes de iniciar la extracción.",
        "en": "This batch includes OCR items, but OCR is temporarily blocked by quota/rate limits. Wait and try again before starting the extraction."
      },
      "text_extraction_batch_ocr_unavailable": {
        "es": "Este lote incluye ítems con OCR, pero Google OCR no está disponible ahora mismo. Si todavía no está activado, usa Preferencias > Activar Google OCR. Si ya estaba activado, revisa el estado/configuración de OCR y vuelve a intentarlo antes de iniciar la extracción.",
        "en": "This batch includes OCR items, but Google OCR is not available right now. If OCR is not enabled yet, use Preferences > Enable Google OCR. Otherwise check the OCR setup/status and try again before starting the extraction."
        // [PROPÓSITO] Alerta previa a lote cuando OCR no está disponible para ítems que lo requieren.
      },
      "text_extraction_ocr_unavailable": {
        "es": "OCR no está disponible. Revisa la configuración/autenticación y vuelve a intentarlo.",
        "en": "OCR is unavailable. Check setup/auth status and try again."
      },
      "text_extraction_ocr_activation_required": {
        "es": "Se requiere activar OCR. Inicia sesión en Google OCR y vuelve a intentarlo.",
        "en": "OCR activation is required. Sign in to Google OCR and try again."
        // [PROPÓSITO] Alerta durante extracción individual cuando OCR requiere activación/autenticación antes de continuar.
      },
      "text_extraction_ocr_activation_success": {
        "es": "Activación OCR completada. Reintentando extracción.",
        "en": "OCR activation completed. Retrying extraction."
        // [PROPÓSITO] Alerta de activación OCR completada con reintento automático de extracción.
      },
      "text_extraction_ocr_activation_cancelled": {
        "es": "La activación OCR fue cancelada. La extracción no continuó.",
        "en": "OCR activation was cancelled. Extraction did not continue."
      },
      "text_extraction_ocr_token_state_invalid": {
        "es": "El estado guardado de inicio de sesión de Google OCR es inválido. Reconecta Google OCR y vuelve a intentarlo.",
        "en": "Saved Google OCR sign-in state is invalid. Reconnect Google OCR and try again."
      },
      "text_extraction_ocr_activation_failed": {
        "es": "La activación OCR falló. Revisa la configuración/autenticación y vuelve a intentarlo.",
        "en": "OCR activation failed. Check setup/auth status and try again."
      },
      "text_extraction_ocr_enable_success": {
        "es": "Google OCR quedó activado.",
        "en": "Google OCR is now enabled."
        // [PROPÓSITO] Alerta de activación manual de Google OCR desde Preferencias.
      },
      "text_extraction_ocr_enable_cancelled": {
        "es": "La activación de Google OCR fue cancelada.",
        "en": "Google OCR activation was cancelled."
      },
      "text_extraction_ocr_enable_failed": {
        "es": "No se pudo activar Google OCR. Revisa la configuración/autenticación y vuelve a intentarlo.",
        "en": "Google OCR could not be enabled. Check setup/auth status and try again."
      },
      "text_extraction_ocr_disconnect_success": {
        "es": "Google OCR fue desconectado. El token guardado de Google fue revocado y se eliminó el estado local de inicio de sesión.",
        "en": "Google OCR was disconnected. The saved Google token was revoked and the local sign-in state was removed."
        // [PROPÓSITO] Alerta de desconexión manual de Google OCR con revocación/eliminación del estado local.
      },
      "text_extraction_ocr_disconnect_not_connected": {
        "es": "Google OCR no está conectado actualmente en esta instancia de la app.",
        "en": "Google OCR is not currently connected in this app instance."
      },
      "text_extraction_ocr_disconnect_failed": {
        "es": "La desconexión de Google OCR falló. El estado guardado de inicio de sesión no fue eliminado.",
        "en": "Google OCR disconnect failed. The saved sign-in state was not removed."
      },
      "text_extraction_ocr_connectivity_failed": {
        "es": "OCR requiere conexión a internet. Revisa tu conexión y reintenta.",
        "en": "OCR requires an internet connection. Check your connection and try again."
      },
      "text_extraction_ocr_setup_missing_credentials": {
        "es": "OCR no está disponible en este build de la app porque faltan las credenciales OAuth de Google incluidas con la app.",
        "en": "OCR is unavailable in this app build because the bundled Google OAuth credentials are missing."
      },
      "text_extraction_ocr_setup_invalid_credentials": {
        "es": "OCR no está disponible en este build de la app porque las credenciales OAuth de Google incluidas con la app son inválidas.",
        "en": "OCR is unavailable in this app build because the bundled Google OAuth credentials are invalid."
      },
      "text_extraction_ocr_quota_or_rate_limited": {
        "es": "OCR está bloqueado temporalmente por cuota/límite de uso. Espera y reintenta.",
        "en": "OCR is temporarily blocked by quota/rate limits. Wait and retry."
      },
      "text_extraction_ocr_runtime_error": {
        "es": "Ocurrió un error de ejecución OCR durante la extracción.",
        "en": "An OCR runtime error occurred during extraction."
      },
      "text_extraction_ocr_cancelled": {
        "es": "La extracción OCR fue cancelada.",
        "en": "OCR text extraction was cancelled."
      },
      "text_extraction_ocr_cleanup_warning": {
        "es": "OCR terminó, pero falló la limpieza temporal remota del archivo. Revisa tu carpeta de Google Drive.",
        "en": "OCR finished, but temporary remote file cleanup failed. Check your Google Drive folder."
        // [PROPÓSITO] Advertencia de limpieza remota fallida del documento temporal usado por OCR.
      },
      "text_extraction_native_runtime_error": {
        "es": "Ocurrió un error en la ejecución de la extracción nativa.",
        "en": "A native extraction runtime error occurred."
      },
      "text_extraction_native_unreadable_or_corrupt": {
        "es": "El archivo seleccionado es ilegible o está corrupto para extracción nativa.",
        "en": "The selected file is unreadable or corrupt for native extraction."
      },
      "text_extraction_native_encrypted_or_password_protected": {
        "es": "El PDF seleccionado está cifrado o protegido por contraseña y no puede extraerse por ruta nativa.",
        "en": "The selected PDF is encrypted or password-protected and cannot be extracted natively."
        // [PROPÓSITO] Alerta específica de PDF cifrado/protegido cuando la ruta nativa no puede extraerlo.
      },
      "text_extraction_native_cancelled": {
        "es": "La extracción nativa fue cancelada.",
        "en": "Native extraction was cancelled."
      },
      "text_extraction_unsupported_format": {
        "es": "Este formato de archivo no está soportado para la extracción de texto.",
        "en": "This file format is not supported for text extraction."
      },
      "wip_diseno_skins": {
        "es": "WIP: Aquí se abrirá el selector de skins en una futura versión.",
        "en": "WIP: The skins selector will open here in a future version."
      },
      "wip_diseno_crono": {
        "es": "WIP: Aquí se abrirá la configuración del Cronómetro Flotante en una futura versión.",
        "en": "WIP: Floating Stopwatch settings will open here in a future version."
      },
      "wip_diseno_fuentes": {
        "es": "WIP: Aquí se abrirá el selector de fuentes en una futura versión.",
        "en": "WIP: The fonts selector will open here in a future version."
      },
      "wip_diseno_colores": {
        "es": "WIP: Aquí se abrirá el selector de colores en una futura versión.",
        "en": "WIP: The colors selector will open here in a future version."
      },
      "wip_shortcuts": {
        "es": "WIP: Aquí se abrirá el selector de atajos del teclado en una futura versión.",
        "en": "WIP: The keyboard shortcuts selector will open here in a future version."
      },
      "reading_test_unavailable": {
        "es": "La funcionalidad del test de velocidad de lectura no está disponible.",
        "en": "The reading speed test feature is unavailable."
      },
      "reading_test_precondition_blocked": {
        "es": "El test de velocidad de lectura solo puede iniciarse desde un estado estable de la app. Cierra las ventanas secundarias y asegúrate de que el cronómetro esté detenido.",
        "en": "The reading speed test can only start from a steady app state. Close secondary windows and make sure the stopwatch is stopped."
        // [PROPÓSITO] Alerta de bloqueo preventivo del test por estado no estable de la app.
      },
      "reading_test_pool_error": {
        "es": "Ocurrió un error al revisar el pool del test de velocidad de lectura.",
        "en": "An error occurred while checking the reading speed test pool."
      },
      "reading_test_no_matching_files": {
        "es": "No quedan archivos de test sin usar que coincidan con la selección actual.",
        "en": "There are no remaining unused test files that match the current selection."
      },
      "reading_test_visible_empty_bundled_hidden": {
        "es": "Los archivos de test incorporados están desactivados y no hay archivos disponibles sin usar. Vuelve a activarlos o importa más archivos para continuar.",
        "en": "The built-in test files are disabled and there are no remaining unused files. Re-enable them or import more files to continue."
        // [PROPÓSITO] Alerta de resguardo para un estado anómalo; parece duplicar una alerta normal, pero cubre un camino excepcional distinto.
      },
      "reading_test_current_text_empty": {
        "es": "El texto actual está vacío. Carga o escribe un texto antes de iniciar el test con texto actual.",
        "en": "The current text is empty. Load or type a text before starting the test with current text."
        // [PROPÓSITO] Alerta específica de inicio del test con texto actual vacío.
      },
      "reading_test_result_invalid": {
        "es": "El resultado del test no pudo convertirse en un WPM válido. El flujo terminó sin abrir la ventana de preset.",
        "en": "The test result could not be converted into a valid WPM. The flow ended without opening the preset window."
        // [PROPÓSITO] Alerta cuando el resultado del test no puede convertirse en un WPM válido y la ventana modal para creación de un preset de velocidad se deja sin abrir.
      },
      "reading_test_result_unavailable": {
        "es": "No se pudo mostrar el resultado de velocidad de lectura. El flujo continuó.",
        "en": "The reading speed result could not be shown. The flow continued."
      },
      "reading_test_preset_unavailable": {
        "es": "No se pudo abrir la ventana de preset después del test.",
        "en": "The preset window could not be opened after the test."
      },
      "reading_test_questions_unavailable": {
        "es": "No se pudo abrir la ventana de preguntas de comprensión. El flujo terminó antes de crear el preset.",
        "en": "The comprehension questions window could not be opened. The flow ended before preset creation."
        // [PROPÓSITO] Alerta cuando no puede abrirse la ventana de preguntas y el flujo termina antes de crear preset de velocidad.
      },
      "reading_test_pool_import_failed": {
        "es": "No se pudieron importar los archivos del test de velocidad de lectura.",
        "en": "The reading speed test files could not be imported."
      },
      "reading_test_start_failed": {
        "es": "No se pudo iniciar el test de velocidad de lectura.",
        "en": "The reading speed test could not be started."
      },
      "reading_test_cancelled": {
        "es": "El test de velocidad de lectura fue cancelado.",
        "en": "The reading speed test was cancelled."
      },
      "reading_test_cancelled_window_closed": {
        "es": "El test de velocidad de lectura fue cancelado porque una de sus ventanas de sesión se cerró.",
        "en": "The reading speed test was cancelled because one of its session windows closed."
        // [PROPÓSITO] Alerta de cancelación del test causada por cierre de una ventana de sesión.
      }
    },
    "editor_alerts": {
      "paste_too_big": {
        "es": "Texto demasiado grande para pegar directamente. Usa los botones de la ventana principal.",
        "en": "Text too large to paste directly. Use the main window buttons."
      },
      "drop_too_big": {
        "es": "Texto arrastrado demasiado grande. Usa los botones de la ventana principal.",
        "en": "Dropped text is too large. Use the main window buttons to add large text."
      },
      "paste_no_text": {
        "es": "El portapapeles no contiene texto plano.",
        "en": "Clipboard does not contain plain text."
      },
      "drop_no_text": {
        "es": "Arrastrar y soltar: no se detectó texto plano.",
        "en": "Drag and drop: no plain text detected."
      },
      "type_limit": {
        "es": "No es posible escribir más texto: ya se alcanzó el tamaño máximo permitido.",
        "en": "Cannot type more text: maximum size reached."
      },
      "paste_limit": {
        "es": "No es posible pegar más texto: ya se alcanzó el tamaño máximo permitido.",
        "en": "Cannot paste more text: maximum size reached."
      },
      "drop_limit": {
        "es": "No es posible soltar más texto: ya se alcanzó el tamaño máximo permitido.",
        "en": "Cannot drop more text: maximum size reached."
      },
      "paste_truncated": {
        "es": "El texto pegado se ha truncado para no exceder el máximo permitido.",
        "en": "Pasted text was truncated to avoid exceeding the maximum."
      },
      "drop_truncated": {
        "es": "El texto arrastrado excedía el espacio disponible y fue truncado.",
        "en": "Dragged text exceeded the available space and was truncated."
      },
      "text_truncated": {
        "es": "El texto fue truncado para ajustarse al límite máximo de la aplicación.",
        "en": "Text was truncated to fit the application limit."
        // [PROPÓSITO] Alerta de resguardo para un estado anómalo; parece duplicar una alerta normal, pero cubre un camino excepcional distinto.
      },
      "calc_error": {
        "es": "Ocurrió un error al guardar el texto como texto actual.",
        "en": "An error occurred while saving the text as the current text."
        // [PROPÓSITO] Alerta de fallo al guardar desde el Editor de Texto hacia el texto actual con `Aplicar` o auto-aplicar.
      }
    },
    "preset_alerts": {
      "name_empty": {
        "es": "El nombre no puede estar vacío.",
        "en": "Name cannot be empty."
      },
      "wpm_invalid": {
        "es": "WPM debe ser un número entre {min} y {max}.",
        "en": "WPM must be a number between {min} and {max}."
      },
      "create_error": {
        "es": "Ocurrió un error al crear el preset.",
        "en": "An error occurred while creating the preset."
      },
      "edit_error": {
        "es": "Ocurrió un error al editar el preset.",
        "en": "An error occurred while editing the preset."
      },
      "process_error": {
        "es": "Ocurrió un error al procesar el preset.",
        "en": "An error occurred while processing the preset."
      }
    },
    "info": {
      "loading": {
        "es": "Cargando...",
        "en": "Loading..."
      },
      "missing_content": {
        "es": "No hay contenido disponible para '{name}'.",
        "en": "No content is available for '{name}'."
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
