# OCR cross-target smoke matrix (MVP)

Propósito: validar de forma trazable la ejecución OCR por target/plataforma para un release, con foco en:

* resolución de sidecars por target,
* flujos OCR clave (éxito/cancelación/fallo explícito),
* ausencia de fallback silencioso.

## Reglas de uso

* Fuente de verdad de targets OCR soportados: `electron/import_ocr/platform/profile_registry.js`.
* Para cada release, esta matriz se completa sobre **artefactos empaquetados reales**.
* El scope de validación por release lo define `docs/releases/release_checklist.md` en el campo `Plataformas objetivo del release (scope)`.
* No se asume que todos los releases sean cross-platform: validar solo los targets declarados para ese release.
* Cada target declarado y distribuido en el release debe quedar en `PASS`.
* Cada `FAIL` debe enlazar Issue y bloquear publicación hasta resolución/reclasificación formal.

## Targets OCR registrados (actual)

* `win32-x64`
* `linux-x64`
* `darwin-arm64`
* `darwin-x64`

## Escenarios mínimos por target distribuido

### OCR-MX-01 Runtime sidecar listo al arranque

Objetivo: validar que el runtime OCR para el target existe y no cae en `OCR_BINARY_MISSING` al inicio.

Esperado:

* App arranca sin error fatal.
* No aparece error de runtime sidecar faltante para el target validado.

### OCR-MX-02 OCR imagen: éxito + apply

Objetivo: correr OCR de imagen y aplicar resultado.

Esperado:

* Flujo completa con `import-finished.ok = true`.
* Usuario puede aplicar (`Overwrite` o `Append`) y texto actual se actualiza.
* Si hay truncación, se notifica explícitamente.

### OCR-MX-03 OCR imagen: cancelación

Objetivo: cancelar OCR en progreso.

Esperado:

* Cancelación retorna código explícito (`OCR_CANCELED` o ruta de cancelación equivalente).
* No hay mutación de texto actual tras cancelar.

### OCR-MX-04 PDF sin text-layer: fallback OCR éxito

Objetivo: validar ruta `pdftoppm -> tesseract` cuando el PDF no tiene capa de texto seleccionable.

Esperado:

* Se ofrece fallback OCR.
* Flujo OCR completa en `ok` y permite apply.
* Progreso visible (`rasterizing`/`ocr`/`finalizing`) y cancel disponible.

### OCR-MX-05 Falla explícita de sidecar (sin fallback silencioso)

Objetivo: confirmar error tipado cuando falta binario/dato OCR del target.

Esperado:

* Falla explícita (`OCR_BINARY_MISSING`, `OCR_EXEC_FAILED` o `OCR_RASTER_FAILED`, según caso).
* Mensaje visible al usuario.
* Texto actual no se modifica.

## Plantilla de ejecución por release

Completar un bloque por target declarado en el scope del release (usar `docs/releases/<X.Y.Z>/` para evidencia versionada).

Plantilla (copiar/pegar por target):

```text
Release: <X.Y.Z>
Fecha: <YYYY-MM-DD>
Target: <win32-x64|linux-x64|darwin-arm64|darwin-x64>
Distribuido en este release: <Yes|No>
Artefacto: <nombre artefacto o N/A>
SHA256: <sha256 o N/A>

OCR-MX-01 Runtime sidecar listo al arranque: <PASS|FAIL|N/A>
OCR-MX-01 evidencia: <link/issue/log/captura>

OCR-MX-02 OCR imagen (éxito + apply): <PASS|FAIL|N/A>
OCR-MX-02 evidencia: <link/issue/log/captura>

OCR-MX-03 OCR imagen (cancelación): <PASS|FAIL|N/A>
OCR-MX-03 evidencia: <link/issue/log/captura>

OCR-MX-04 PDF sin text-layer (fallback OCR): <PASS|FAIL|N/A>
OCR-MX-04 evidencia: <link/issue/log/captura>

OCR-MX-05 Falla explícita de sidecar: <PASS|FAIL|N/A>
OCR-MX-05 evidencia: <link/issue/log/captura>

Veredicto target: <PASS|FAIL|N/A>
Notas: <texto breve>
```

## Regla de cierre

Solo marcar el ítem de Issue 53 como completado cuando:

* todos los targets distribuidos por el release estén en `PASS`,
* no queden `FAIL` abiertos sin Issue asociado,
* y el release checklist referencie esta matriz con evidencia concreta.
