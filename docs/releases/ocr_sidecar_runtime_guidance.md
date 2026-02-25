# OCR sidecar runtime guidance (MVP)

Guía operativa para releases que distribuyen OCR local con sidecars (`tesseract` + `pdftoppm`).

## Alcance

* Aplica a artefactos empaquetados que incluyen `resources/ocr/<platform>-<arch>/...`.
* No requiere firma/notarización pagada para MVP.
* Advertencias del sistema operativo son esperables y deben estar documentadas en release notes.

## Qué verá el usuario

La app ejecuta OCR local con binarios de terceros incluidos en el paquete portable.
En algunos equipos el sistema puede mostrar advertencias de confianza antes de permitir la ejecución.

## Windows (SmartScreen)

Posibles mensajes:

* `Windows protected your PC`.
* `Unknown publisher`.

Flujo recomendado:

1. Verificar que el `.zip` proviene del release oficial.
2. Verificar hash SHA256 del artefacto publicado.
3. En SmartScreen: `More info` -> `Run anyway`.
4. Mantener Windows Defender activo; no desactivar protecciones globales.

## macOS (Gatekeeper)

Posibles mensajes:

* `toT can't be opened because the developer cannot be verified`.

Flujo recomendado:

1. Verificar origen del artefacto (release oficial) y hash publicado.
2. Intentar abrir la app.
3. Si Gatekeeper bloquea: clic derecho `Open` o `System Settings -> Privacy & Security -> Open Anyway`.

## Linux

Posibles bloqueos:

* Falta de bit ejecutable en sidecars.
* Restricciones del entorno (sandbox/SELinux/AppArmor/política corporativa).

Flujo recomendado:

1. Verificar origen del artefacto y hash.
2. Confirmar permisos de ejecución para sidecars del target.
3. Si la política local bloquea ejecución, aplicar excepción local controlada para el artefacto oficial.

## Principios de seguridad de ejecución (app)

* OCR usa solo sidecars empaquetados para el target actual.
* No se usa `PATH` del sistema para localizar binarios OCR/raster.
* Fallos de sidecar son explícitos (sin fallback silencioso), por ejemplo:
  * `OCR_BINARY_MISSING`
  * `OCR_UNAVAILABLE_PLATFORM`
  * `OCR_EXEC_FAILED`
  * `OCR_RASTER_FAILED`

## Checklist mínimo para release notes

* Incluir nota corta sobre posibles advertencias de Windows/macOS.
* Incluir enlace a esta guía.
* Incluir hash SHA256 del artefacto final.
* Incluir enlace a `THIRD_PARTY_NOTICES.md`.

