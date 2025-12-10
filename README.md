### toT — Reading Meter ###
**Versión:** 0.0.920 (2025/12/09)

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

**0.0.7** (2025/12/02)

* Mejoras principales
  - Limita el tamaño máximo del texto vigente a MAX_TEXT_CHARS = 10_000_000 y mejora la robustez del flujo de edición entre la ventana principal y el modal editor.

* Cambios en main.js
  - Añadido MAX_TEXT_CHARS = 10_000_000 y truncado automático al cargar current_text.json.
  - Exposición de MAX_TEXT_CHARS a través de get-app-config (IPC) como fuente de verdad para UI y modal.
  - set-current-text ahora acepta objetos { text, meta } y devuelve { ok, truncated, length, text }. El truncado se registra en consola y se comunica en la respuesta.
  - manual-init-text y manual-text-updated ahora envían payloads { text, meta } para que el editor modal aplique actualizaciones diferenciales cuando corresponda (preservando undo/redo).
  - Compatibilidad hacia atrás: set-current-text sigue aceptando strings para no romper integraciones existentes.

* Cambios en renderer.js
  - UI principal envía setCurrentText con { text, meta } y consume la respuesta { ok, truncated, length, text } para sincronizar preview y avisos.
  - btnAppendClipboardNewLine corta el texto añadido a la capacidad restante para evitar exceder el límite.
  - Mejor interoperabilidad con el editor modal gracias a metadata (source, action) en los payloads.

* Cambios en manual.js
  - Introduce showNotice para mensajes no bloqueantes en el editor.
  - Inserciones pequeñas por paste/drop usan técnicas nativas (execCommand / setRangeText) para mantener undo/redo cuando sea posible.
  - Estandariza setCurrentText como { text, meta } con metadata source/action.
  - Lógica applyExternalUpdate mejorada para manejar append_newline, init, overwrite y differential inserts.
  - Truncado y feedback sincronizado: paste/drop/input se truncarán localmente y se notificará al usuario; el main confirma truncado via respuesta.

**0.0.8** (2025/12/03)
Nueva funcionalidad: Modo de conteo de texto
(y avance en soporte multilenguaje)

* Modo preciso vs. modo simple

- Se añadió un toggle visual (switch) “Modo preciso” en la sección de **Resultados del conteo**.
- Switch activado → modo de conteo **preciso**. Switch desactivado → modo de conteo **simple**.
- Cambiar el modo recalcula automáticamente el texto vigente.
- La preferencia se guarda de forma persistente en `user_settings.json`.
- La configuración se aplica al inicio de la app, garantizando coherencia.

* Funciones de conteo

- `contarTextoSimple(texto)`
  - Basado en regex y `length`.
  - Bajo costo computacional.
  - Compatible con todos los entornos.
  - Mantiene el comportamiento histórico.

- `contarTextoPreciso(texto, language)`
  - Basado en `Intl.Segmenter`.
  - Segmentación real de grafemas y palabras.
  - Compatible con Unicode extendido (emojis, alfabetos no latinos, ligaduras).
  - Fallback si `Intl.Segmenter` no existe:
    - Grafemas con spread.
    - Palabras por `\b` / `\s+`.

- Variable global `modoConteo` selecciona el método apropiado.

- Ambas funciones retornan un objeto uniforme:

```js
{
  conEspacios: Number,
  sinEspacios: Number,
  palabras: Number
}
```
- Esto permite cambiar de modo sin afectar el resto del renderer.

* Soporte multilenguaje

- Variable global `idiomaActual` cargada desde `settingsCache.language`.
- Función `setIdiomaActual(nuevoIdioma)` permite cambios dinámicos de idioma.
- `Intl.Segmenter` utiliza el idioma correcto.
- La app puede cambiar idioma dinámicamente y el conteo se adapta sin reinicio.

* Persistencia y sincronización

- `modeConteo` agregado a `user_settings.json`.

- Cambios emitidos vía IPC (`settings-updated`) al renderer para refrescar UI.

- Handlers que modifican `user_settings.json` emiten `settings-updated` automáticamente:
  - `set-language`
  - `create-preset`
  - `edit-preset`
  - `request-delete-preset`
  - `request-restore-defaults`

- Esto garantiza sincronización inmediata entre **main** y **renderer**.

* Funciones auxiliares

```js
function setModoConteo(nuevoModo) {
  if (nuevoModo === "simple" || nuevoModo === "preciso") {
    modoConteo = nuevoModo;
  }
}

function setIdiomaActual(nuevoIdioma) {
  if (typeof nuevoIdioma === "string" && nuevoIdioma.length > 0) {
    idiomaActual = nuevoIdioma;
  }
}
```
- Preparadas para uso desde Menú o cualquier otra parte de la app.

* Interfaz de usuario

- Switch “Modo preciso” integrado en **Resultados del conteo**:

  - Ahora alineado a la derecha, junto a la etiqueta.
  - Palabras, caracteres con/sin espacio permanecen en la misma línea.
- Diseño refinado y consistente con la sección de resultados.
- Preparada para ajustes estéticos (tamaño del switch, espaciado).

* Resumen de la base técnica

- Dos sistemas de conteo coexistentes.
- Modo preciso profesional y Unicode-aware.
- Persistencia y sincronización automáticas.
- Arquitectura lista para soporte multilenguaje.
- Código optimizado para velocidad (no se leen repetidamente los settings).

**0.0.9** (2025/12/05)
Implementación Ventana Flotante del Cronómetro 
+ migración del cronómetro al main process

* Resumen ejecutivo 
Se implementó una ventana flotante (VF) funcional y controlable que requirió mover la autoría del cronómetro al main process; el resultado es un cronómetro fiable y sincronizado entre ventana principal y VF, con UX y recursos optimizados.

* Resultado final

- Cronómetro ahora autoritativo en `main`; `renderer` y `flotante` son clientes (comandos → `main`, `crono-state` desde `main` → clientes).
- VF (ventana flotante) implementada como `BrowserWindow` minimalista, movible, siempre-on-top, semitransparente, con controles ▶ / ⏸ / ⏹ y sin mostrar velocidad.
- Interacción inmediata desde VF: comandos aplican en `main` y estado se difunde a ambas vistas.
- Comportamiento y UX replican la versión anterior (antes en renderer) pero robusto frente a throttling/background.

* Archivos afectados

- `main.js` — añadido cronómetro central (`crono`), handlers `crono-toggle`, `crono-reset`, `crono-set-elapsed`, broadcast (`crono-state`) y `createFloatingWindow()` actualizado (posicionamiento).
- `preload.js` — exposiciones IPC nuevas: `sendCronoToggle`, `sendCronoReset`, `setCronoElapsed`, `getCronoState`, `onCronoState`, `openFloatingWindow`, `closeFloatingWindow`.
- `renderer.js` — adaptado para espejo (`elapsed`, `running`), `onCronoState` handler, `timerEditing` logic, reemplazo de VF button por switch, WPM logic y `updatePreviewAndResults()` gatillando `resetTimer()`.
- `flotante_preload.js` / `flotante.js` — listeners y envíos de comandos (`flotante-command`) a `main`; render minimalista (timer + toggle + reset).
- `index.html` / `style.css` — reemplazo del botón VF por el `switch` y reutilización de estilos existentes `.switch` / `.slider`; estilos de cronómetro y timer-controls limpios.

* Bugs abiertos y prioridad

- VF desaparece al hacer clic sobre ella cuando hay otra aplicación en fullscreen (ej: slideshow, juego) — prioridad baja.
- Observación: comportamiento dependiente del SO/gestor de ventanas; por diseño se permitió que la VF ceda topmost en fullscreen (requisito inicial). Queda por investigar si preferimos forzar visibilidad (posibles conflictos en UX/OS).

* Notas técnicas y decisión clave

- Decisión arquitectural: mantener la lógica de timekeeping en `main` (Date.now + interval) es la pieza esencial que resolvió el problema de sincronización y throttling.
- Se priorizó fiabilidad y consistencia por sobre una implementación que dejara el cronómetro en renderer.

**0.0.901** (2025/12/06)

- Unificación de botones informativos Guía básica, Instrucciones completas y Preguntas frecuentes (FAQ) en un solo html.
- Cada uno lleva a su sección específica.
- Mejoramiento en el diseño del infomodal (compartido también con readme y acerca de).
- Cambio de fuente de letra (Bakersvville) en preview y ventana de texto vigente.
- Ajustes de diseño ventana principal para nueva fuente.

**0.0.910** (2025/12/07)

* Internacionalización

- Implementación de arquitectura multi-lenguaje.

- UI principal y modales traducidos (renderer/main), incluyendo tooltips y alertas persistentes.

- Páginas de info (acerca_de, readme, instrucciones) ahora cargan textos vía i18n con data-i18n; JSON específicos por idioma.

- Defaults numberFormat por idioma cargados desde i18n; respeta overrides de usuario.

- Fixes y detalles menores.

**0.0.920** (2025/12/09)

Depuración y orden del código

* Modularización de renderer.

- Nuevo constants.js, centraliza las constantes
- Nuevo count.js, centraliza calculos de conteo
- Nuevo format.js, centraliza formato numérico
- Nuevo timer.js, centraliza cronómetro (con process en main, necesario para funcionamiento de VF)
- Nuevo presets.js, centraliza el selector de presets y sus botones
- Nuevo notify.js, centraliza avisos y alertas
- Nuevo i18n.js
- Nuevo CONTRACTS.md
- Limpieza de duplicados, vestigios y fallbacks innecesarios
- Solución de bugs.
- Fixes menores.

* i18n unificado

- i18n unificado en modales: preset_modal.js y manual.js ahora dependen de RendererI18n (via js/i18n.js en los HTML), eliminando cargadores y cachés propios.
- Modal de presets: una sola aplicación de traducciones al recibir preset-init, respetando el modo (new/edit) y el idioma del usuario obtenido en ese momento; removida la doble llamada que pisaba títulos.
- Dependencias explícitas en renderer: renderer.js exige RendererI18n y CountUtils sin fallback, evitando duplicación de conteo.
- Limpieza de diagnóstico: eliminados logs temporales y la apertura automática de DevTools; fuera el console.debug de open-preset-modal en electron/main.js.
- Corrección de idioma en presets: el modal lee language de settings al abrir, por lo que ya muestra inglés/español según la preferencia actual.

## Autor y Créditos ##

* Librerías / Frameworks: Electron, Node.js.

Desarrollador: Cibersino

* Agradecimientos: ...

## Licencia ##

MIT — ver [`LICENSE`](LICENSE) para detalles.