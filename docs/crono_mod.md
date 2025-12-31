## Documento: crono-state — flujo real y decisiones de código

### Contexto verificable (sin suposiciones)

A partir de tu `rg -F "crono-state" .\public .\electron`:

* **El emisor** de `crono-state` está en `electron/main.js` y actualmente hace `webContents.send('crono-state', state)` a:

  * `mainWin`
  * `flotanteWin`
  * `editorWin`

* **Los receptores / suscripciones** explícitas existen en:

  * `electron/preload.js` (expone un `onCronoState` para el renderer principal)
  * `electron/flotante_preload.js` (expone un `onCronoState` para la ventana flotante)
  * `public/renderer.js` (maneja `crono-state`)

* **No aparece suscripción en `editor_preload.js`** (y, con `contextIsolation: true` + `nodeIntegration: false`, el editor **no puede** escuchar `ipcRenderer.on(...)` desde el DOM sin un bridge en preload).

**Conclusión factual:** hoy, el “broadcast” **sí** es parte del mecanismo por el cual el **renderer principal** recibe y muestra el estado del cronómetro (no “directamente” sin broadcast). Y hoy **no hay evidencia** de que el editor pueda consumir `crono-state`.

---

## Punto 1 — `broadcastCronoState()`: ¿a quién debe enviar realmente?

### Lo que el código hace hoy

Envia a `mainWin`, `flotanteWin` y `editorWin`.

### Lo que el repo muestra hoy (según lo encontrado)

* `mainWin`: **sí** tiene canal para recibirlo (preload + renderer).
* `flotanteWin`: **sí** tiene canal para recibirlo (flotante_preload + flotante renderer).
* `editorWin`: **no** hay canal visible para recibirlo (no aparece en `editor_preload.js`).

### Decisión recomendada

**Eliminar el envío a `editorWin`**, salvo que explícitamente quieras que el editor muestre el crono.

**Motivo técnico fuerte (no opinión):** con la configuración de seguridad que usas, si `editor_preload.js` no expone `onCronoState`, el editor no puede escuchar ese evento; por lo tanto ese `send` es **código inefectivo** (y potencial fuente de ruido de logs en carreras).

### Alternativa (si quisieras crono en editor)

Solo si decides “el editor debe mostrar crono”:

* Agregar `onCronoState` a `editor_preload.js`.
* Agregar handler en `public/editor.js` (o el script del editor) para actualizar UI.

Si tu postura es “editor no tiene relación con crono”, entonces la alternativa no aplica.

---

## Punto 2 — `ensureCronoInterval()`: ¿qué condición debe gobernar el intervalo?

### Hecho: qué es ese intervalo

Ese `setInterval` existe para **re-broadcast periódico** del estado del crono (tick cada 1s) mientras el tiempo corre.

### Problema actual (de lógica, no de estilo)

El intervalo:

* se crea cuando parte el crono (`startCrono()` llama `ensureCronoInterval()`),
* pero **no se detiene** cuando el crono se pausa/stop,
* porque tu condición de apagado depende de `!mainWin && !flotanteWin && !editorWin`.

En la práctica:

* normalmente `mainWin` existe durante toda la vida de la app,
* por lo que el intervalo puede quedar vivo **incluso con el crono detenido**, emitiendo “updates” redundantes.

### Decisión recomendada (simple y correcta)

**El intervalo debe existir solo mientras `crono.running === true`.**

Regla operativa:

* Si el crono está corriendo: mantener intervalo.
* Si el crono se detiene o resetea: **clearInterval** (y dejar broadcasts solo en eventos de cambio: start/stop/reset/set).

Esto mantiene el comportamiento funcional (la UI igual se actualiza cuando cambia el estado) y elimina trabajo periódico inútil.

### Implementación mínima sugerida

Sin re-arquitectura, solo control de lifecycle:

* `startCrono()`:

  * mantiene `ensureCronoInterval()` como está.

* `stopCrono()`, `resetCrono()`, `setCronoElapsed()`:

  * después de `broadcastCronoState()`, agregar una función tipo:

```js
function stopCronoIntervalIfIdle() {
  if (cronoInterval && !crono.running) {
    clearInterval(cronoInterval);
    cronoInterval = null;
  }
}
```

y llamarla en esos tres flujos.

* Dentro del tick del intervalo ya no necesitas lógica “si no hay ventanas…”, porque la condición de vida pasa a ser el propio `crono.running`.

### Nota importante sobre tu premisa (“solo flotante necesita broadcast”)

Aunque conceptualmente “flotante es display remoto”, **tu implementación actual** usa `crono-state` también para la UI principal (porque hay listener en `preload.js` y handler en `public/renderer.js`). Si quieres que la UI principal no dependa de broadcast, eso sería **un cambio de arquitectura** (no un ajuste menor).

---

## Resultado esperado si aplicas estas dos decisiones

1. `broadcastCronoState()` envía solo a:

* `mainWin` (necesario hoy)
* `flotanteWin` (necesario)

2. El intervalo:

* corre solo cuando el crono corre,
* se apaga al parar/reset/setear,
* reduce ruido y complejidad de “ventanas relevantes”.