### toT — Reading Meter ###
**Versión:** 0.0.6 (2025/11/28)  

Aplicación de escritorio (Electron) para contar palabras y caracteres, estimar tiempos de lectura, cronometrar lecturas y gestionar presets de velocidad (WPM).

## Características ##

* Conteo de texto: palabras y caracteres (con/sin espacios).
* Estimación de tiempo de lectura configurable por WPM.
* Cronómetro con cálculo de WPM real; ventana flotante opcional.
* Editor de texto completo con cálculo manual y automático.
* Gestión de presets WPM: nuevo, editar, borrar, restaurar, y reemplazo de presets por defecto.

## Instalación y ejecución ##

git clone https://github.com/Cibersino/tot-readingmeter.git
cd tot-readingmeter*
npm install
npm start

## Requerimientos ##

*  Requiere Node.js 18+ y un sistema compatible con Electron.

## Archivos importantes ##

* `electron/main.js` — lógica principal de la app y manejo de IPC.
* `public/renderer.js` — scripts de la interfaz principal.
* `public/preset_modal.js` — scripts para el modal de presets (Nuevo/Editar).
* `config/user_settings.json` — guarda presets personalizados y configuración de usuario.
* `config/current_text.json` — almacena el texto actual al cerrar la app.
* `public/manual.js` — scripts del editor de texto completo.
* `public/js/menu.js` — router interno de acciones del menú.
* `public/style.css` y `public/manual.css` — estilos para la pantalla principal y editor.
* `public/index.html`, `public/manual.html`, `public/preset_modal.html` — vistas principales y modales.

## Changelog ##

**0.0.3** (2025/11/22)

* Implementación del botón **Editar** con confirmación nativa.
* Consolidación de flujos de presets: Nuevo, Borrar, Restaurar y handlers IPC asociados.
* Funcionalidad estable y retrocompatible de editor y cronómetro.

**0.0.4** (2025/11/24)

* Renovación completa del diseño visual de la pantalla principal, la ventana de texto completo y los modales de presets.
  * Sustitución del layout basado en grilla por uno completamente flexible.
  * Reorganización y estandarización de elementos en todas las secciones.
  * Inclusión del nuevo logotipo.
  * Varias mejoras visuales y de consistencia.
* Incorporación de nuevos botones:
  * Selector de texto:
    * “Pegar cortapapeles nueva línea” (nueva funcionalidad).
	* “Vaciar” (equivalente al de la ventana de texto completo).
  * Resultados:
	* “?” (solo ubicación). Futuro acceso a documentación del método de cálculo y otras informaciones relevantes.
  * Cronómetro:
    * “VF” (solo ubicación). Activará ventana flotante para cronometrar sin la pantalla principal.
  * Ventana de edición de texto completo.
    * “Calcular” (nuevo cálculo manual).
	* Interruptor del cálculo automático (antes siempre activo).
* Limpieza parcial (muy parcial) del código fuente.

**0.0.5** (2025/11/27)

* Nuevo Menu / barra superior
- Se habilitó la barra superior, reemplazando la barra por defecto de Electron.
- Se crearon (visualmente) los botones de la barra superior:
  - ¿Cómo usar la app?
    - Guía básica 
    - Instrucciones completas
    - Preguntas frecuentes (FAQ)
  - Herramientas
    - Cargador de archivo de textos
    - Contador de palabras en imágenes
    - Test de velocidad de lectura
  - Preferencias
    - Idioma
    - Diseño
      - Skins
	    - Ventana flotante
	    - Fuentes
	    - Colores
    - Shortcuts
    - Presets por defecto
  - Comunidad
    - Discord
    - Avisos y novedades
  - Links de interés
  - COLABORA ($)
  - ?
    - Actualizar a última versión
    - Readme
    - Acerca de

- Código: Se habilitó un sistema de flujo para la barra superior. Por ahora sin funciones reales.
- Flujo claro: main → preload → menu.js → renderer (acciones).
  - Lógica de ventanas de main.js:
    - Captura clicks reales de la barra superior.
    - Envia un evento único "menu-click" con el id correspondiente.
  - Seguridad y encapsulación en preload.js:
    - Se creó un listener único y estable para los botones del menú.
  - Enrutamiento del menú con menu.js:
    - Nuevo módulo public/js/menu.js
    - Implementa un router interno de acciones (menuActions).
    - Recibe todos los eventos menu-click desde preload.js.
    - Reenvía el actionId a las funciones registradas.
    - Incluye manejo explícito para acciones no registradas (warning en consola).
  - Ajustes en renderer.js. 
    - Se implementaron acciones temporales (avisos WIP) para los nuevos botones.
- Ajustes en index.html. Se agregó <script src="./js/menu.js"></script> antes de renderer.js, garantizando el registro previo del router.

* Nuevo selector de idioma primer arranque.

* Optimización del código de sistema de presets, manteniendo la misma funcionalidad.
  - Se eliminó la inclusión de preset_modal.js en index.html; ahora se carga únicamente en preset_modal.html.
  - Se envolvió la lógica del modal en DOMContentLoaded y se añadieron chequeos de existencia de elementos para evitar errores.

* Calibración del rango del WMP de 100-500 a 50-500.

* Logos nuevos
  - Mejora de logo toT
  - Inserción de logo Cibersin

**0.0.6** (2025/11/28)

* Menú

- Habilitados funcionalmente botones del menú / barra superior:

  - Informativos: Guía básica, Instrucciones completas, FAQ, Readme y Acerca de.
    - Todos usan un infomodal compartido que carga su HTML correspondiente.
    - Si no se encuentra el HTML, muestra un aviso: "No hay contenido disponible para ...".
    - Archivos agregados: guia_basica.html, instrucciones.html, faq.html, readme.html, acerca_de.html
    
    NOTAS: 
    - Por el momento HMLS solo tienen un texto de prueba.
      - Al editarlos hay que verificar que ningún HTML dentro de public/info/ incluya scripts inline para cumplir CSP, aunque con el setup actual no genera problemas.

    - Botón Presets por defecto.
      - Abre la carpeta config/presets_defaults en el explorador del sistema operativo.
        - El usuario puede modificar o eliminar los archivos .json con seguridad, sin romper la app.
          - Si modifica un archivo, al próximo arranque la app considerará nuevos presets por defecto para las operaciones normales en la ventana principal. (Ejemplo: Al presionar el botón "R" en la sección de Selector de velocidad de lectura, se restauran los presets por defecto según los archivos de esa carpeta, modificados o no).
          - Si el usuario elimina un archivo desde la carpeta (no desde la ventana principal), al próximo arranque la app restaurará el archivo de instalación.

Nota técnica:
- Usamos shell.openPath(...) (expuesto por shell en electron) para abrir la carpeta en el explorador nativo. En entornos empaquetados (asar), shell.openPath funciona si la ruta apuntada está fuera del asar (la carpeta config/ está fuera), por lo que no debería presentar problemas.

* Modificaciones menores de diseño para ajustar el layout.

* El preset default general cambió su wpm de 240 a 250 y tiene nueva descripción.

## Autor y Créditos ##

* Librerías / Frameworks: Electron, Node.js.
* Herramientas utilizadas: OpenAI ChatGPT.

Desarrollador: Cibersino

* Agradecimientos: ...

## Licencia ##

MIT — ver [`LICENSE`](LICENSE) para detalles.