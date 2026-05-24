# Capturas de pantalla

Esta carpeta contiene capturas versionadas de la app usadas como referencia visual del proyecto.

Las capturas son material de documentación y desarrollo. No forman parte del runtime de toT y no deben empaquetarse con los builds distribuidos.

## Estructura

- `windows/`: capturas de ventanas y estados visibles de la app.
- `windows/<lang>/`: capturas tomadas con la interfaz configurada en el idioma indicado por el código de carpeta.

## Usos previstos

Estas capturas pueden usarse para desarrollo, documentación interna, revisión de interfaz, QA visual, comparación de cambios, revisión de layout y apoyo a trabajo de i18n/traducción.

Para trabajo de traducción, usar estas capturas solo como referencia visual. Las fuentes normativas siguen siendo:

- `i18n/TRANSLATION_GUIDE.md`
- `i18n/<lang>/main.json`
- `i18n/<lang>/renderer.json`
- guías específicas por idioma, cuando existan
- comportamiento real de la UI/runtime

## Convenciones

- Usar nombres de archivo estables y descriptivos.
- Mantener nombres paralelos entre idiomas cuando las capturas representen la misma ventana, modal o estado.
- Registrar capturas nuevas cuando ayuden a entender una superficie, revisar un cambio o documentar un estado visual relevante.
