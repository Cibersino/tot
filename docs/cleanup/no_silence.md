# Plan "no silence"

## 1) Distincion "silencioso tecnico" vs "silencioso al usuario"

* Silencioso tecnico = no hay log (warn/error/once) o el log no respeta la politica de log.js.
* Silencioso al usuario = no hay notificacion/UI feedback.

Orden de implementacion:
1) Fase 1: eliminar silencios tecnicos (logs).
2) Fase 2: decidir que casos requieren notificacion al usuario.


## 2) Donde se ven los logs hoy (canales)

* Main process (electron/log.js): logs del proceso main (en dev se ven en el terminal).
* Renderer (public/js/log.js): logs del renderer (en DevTools de esa ventana).

Esto importa porque "no silencioso tecnico" puede cumplirse, pero igual "no lo ves"
si no abres DevTools de esa ventana.
