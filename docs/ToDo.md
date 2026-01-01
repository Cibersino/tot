### TO DO Y PLAN GENERAL ###

# ÍTEM ACTUAL #

* Revisión y depuración del código *

- Mejorar idioma para admitir variantes regionales.
- Presets `.js` a presets `.json`
- Ordenar/limpiar archivo por archivo
  - Revisar avisos logs, de acuerdo a la política en los `log.js`.
  - Comments coherentes y útiles, tomando a `main.js` como modelo.

# Más adelante #

* Nuevas funciones *

- Guardar y cargar current texts
  - Agregar botones cargar y guardar en el Selector de texto de la ventana principal
  - Al guardar, se guarda el texto vigente actual en alguna carpeta.
  - Al cargar, se reemplaza el texto vigente por el seleccionado.
  - Se guardan y cargan desde una carpeta del usuario (puede ser una subcarpeta de config).

- Extractores de caracteres y palabras en:
  - Archivos de imagen:
    - Ejemplo: foto de una página común de un libro
    - Esto permitiría hacer una función que estime el total del libro tras:
      - Que el usuario confirme si la extracción fue exitosa
      - Preguntar cantidad de páginas totales del libro
      - Copiar el texto extraido al portapapeles
      - Usar función "Pegar portapapeles nueva línea" la misma cantidad de iteraciones que las páginas del libro.
    - posibilidad de sacar una foto mediante la camara del dispositivo
  - archivos de texto:
    - formatos simples (txt, doc, docx, rtf, etc)
    - formatos complejos como pdf:
      - con texto seleccionable
      - sin texto seleccionable:
        - hechos de imagenes
        - protegido
  - (Averiguar sistema OCR como extractor de palabras)

- Selector de Tareas:
  - Objetivo: sumar el tiempo estimado de varios textos "vigentes".
  - Modo: 
    - Hay un selector de tareas en la ventana principal. 
      - Se pueden crear, guardar y cargar tareas (a partir de un selector). Muy similar al selector de presets.
      - Al crear una Tarea, se abre una tabla editable, botones cargar y guardar al lado de cada fila, y un cuadro al comienzo con el "Tiempo total":
      - Las columans de cada tabla de tarea: Texto; Tiempo; %C; Falta; Tipo; Enlace; Comentario.
        - Texto: el nombre del texto. El usuario pone lo que quiera.
        - Tiempo: el tiempo estimado. El usuario debe ponerlo, bajo un formato estricto.
        - %C: El porcentaje de completado. El usuario debe ponerlo, bajo formato estricto. Por defecto: 0%.
        - Falta: El tiempo faltante. Es el tiempo * 100-"%C". 
        - Tipo: puede ser "web", "doc", "pdf", etc. Lo pone el usuario. Se le proponen opciones, pero puede poner lo que quiera.
        - Enlace: un ícono que contiene la pagina o el path del archivo. Al seleccionarlo, abre.
        - Comentario: Es un ícono con tooltip hoover editable (para reducir espacio).
      - El "Tiempo total": la suma de la columna falta.  
      - Botones guardar y cargar. Guardan o cargan la fila desde una tabla general ordenada alfabéticamente. 
        - "Guardar" guarda la fila seleccionada en una tabla interna de la app (todas las columnas menos "%C" y "Falta"). Pregunta si guarda o no el comentario antes de guardar.
        - "Cargar" abre la tabla interna y permite seleccionar una fila y cargarla o eliminarla. Al cargarla se agrega a la tabla de tareas.
  - Cada tablas de tarea y la tabla general, se localizan dentro de una subcarpeta de config.

- Test de velocidad de lectura:
  - Al abrir este test, primero se informa al usuario en que consiste (avisando que se sobrescribirá el texto vigente, entre otras cosas).
  - Se le ofrece un botón para comenzar. El botón:
    - Abre una ventana con un texto aleatorio (entre un pool de textos) de dificultad normal pensado para que un lector adulto promedio lo lea en 2 minutos.
    - El mismo texto sobrescribe el texto vigente de la app (lo mismo que hace el botón "Sobrescribe con portapapeles" con los textos en portapapeles).
    - Comienza inmediatamente a correr el cronómetro de la app (lo mismo que hace el botón "Start" o play/pause toggle).
  - El usuario al finalizar la lectura puede pulsar un botón de finalizar. El botón:
    - Detiene el cronómetro de la app y calcula (lo mismo que hace el botón "Stop/Calcular" play/pause toggle).
    - Agrega al input WPM de la sección Velocidad de lectura el WPM calculado.
    - Abre el modal de creación de presets (misma acción que el botón "Nuevo") con prerrellenado editable que dice:
      Nombre: Test
      WPM: se deja que sea el mismo que el input, como lo hace el botón Nuevo normalmente.
      Descripción: Velocidad testeada del usuario.
    - El usuario puede modificar, guardar y cerrar el modal, con las mismas consecuencias que tiene toda creación de Nuevo preset.

* Mejorar Readme * 
- listar bugs (o crear un archivo nuevo de bugs)
- mudar changelog a nuevo archivo

* Habilitar botones faltantes del menú *

- Herramientas
  - Cargador de archivo de textos
  - Contador de palabras en imágenes
  - Test de velocidad de lectura
- Preferencias
  - Idioma
  - Diseño
    - Skins
	  - Ventana flotante (seleccionar ubicación y transparencia)
	  - Fuentes (fuente y tamaño letra. general, ventana texto completo, ventana flotante.)
	  - Colores (fondo de cada ventana, etc)
  - Shortcuts (cambiar el del portapapeles por defecto, start/stop cronómetro, activación/desactivación ventana flotante)
  - Presets por defecto (abre carpeta presets)
- Comunidad
  - Discord
  - Avisos y novedades
- Links de interés
- COLABORA ($)
- ?
  - Actualizar a última versión

* Integración a extensiones de navegadores *

* Estilos/skins *

* Revisar seguridad de la aplicación y legalidad *
 - Licencia de la fuente kremlin duma para logo Cibersin
 - Fuentes usadas
 - Apis usadas

* Revisión y depuración del código*

* Atajos del teclado *
- Actualmente tenemos un botón de Short-cuts en el menú que no está funcional.
- Habilitar este botón para que abra una lista de shortcuts del teclado que sea editable por el usuario.
- ¿Atajos del teclado sin focus en la ventana principal?

* Revisión y depuración del código *

* Empaquetado multiplataforma (Windows, macOS y Linux) *
- Reemplazar el ícono de Electron que aparece en las ventanas (en la esquina superior izquierda) por un ícono propio. ¿Es posible?
- Empaquetado para Windows, versión de prueba *
- Construir versión portable

* Conversión para aplicaciones para dispositivos moviles y kindle *

# PLAN GENERAL #

OBJETIVO DE LA APLICACIÓN
- Construir una aplicación de escritorio multiplataforma (Windows, macOS y Linux) que permita:
- Leer texto seleccionado o proveniente del portapapeles.
- Contar caracteres con espacio, sin espacio y palabras.
- Estimar tiempo de lectura usando un parámetro ajustable por el usuario.
- Usar un sistema de presets de velocidad, incluyendo:
  - Presets por defecto (ej. 180–250 WPM).
  - Presets personalizados múltiples, cada uno con nombre definido por el usuario.
  - Poder guardar nuevos presets desde el cronómetro.
- Incluir un cronómetro preciso para estimar velocidad de lectura real.
- Soporte de idiomas seleccionables para la interfaz.
- Interfaz simple, portable y fácil de mantener.

TECNOLOGÍA ELEGIDA (Propuesta original)

Tecnología base
Electron + portable build + sistema de semiauto-update mínimo.

Arquitectura
Electron con main.js, preload.js (IPC seguro) y frontend estático.

COMPONENTES

Frontend
- HTML minimalista.
- CSS simple (o Tailwind opcional).
- renderer.js para toda la lógica del UI y los llamados IPC.

Backend en Electron
- main.js: manejo de ventanas, inicialización y lógica central.
- preload.js: API segura (IPC + portapapeles + configuración).
- Persistencia con JSON.
- (Opcional) updater.js para la lógica del semiauto-update.

Empaquetado
- Portable build para Windows/Linux/macOS.
- Sin instalador.
- Carpeta final: build-output/.

Semiauto-update
- Archivo local VERSION.
- Archivo remoto con versión más reciente.
- Comparación al inicio.
- Si hay actualización: mostrar notificación y link.

