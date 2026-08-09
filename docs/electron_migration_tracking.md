# Seguimiento de la migración de Hostfall a Electron

Última actualización: **2026-08-09**  
Estado global: **migración en curso; Fase 3 completada, implementación de Fase 4 en validación**
Fase activa: **Fase 4 — Persistencia y lifecycle**
Plan técnico: [`electron_migration_plan.md`](electron_migration_plan.md)

Este documento es el tablero operativo de la migración. El plan técnico explica las decisiones; este
archivo registra qué se hizo, cómo se verificó y qué impide avanzar.

## Reglas de seguimiento

- Una fase sólo puede marcarse `Completada` cuando todos sus criterios de salida están verificados.
- Cada fase debe dejar un web build o desktop build funcional, según corresponda.
- No marcar una tarea por intención: registrar PR/commit y evidencia.
- Las regresiones de engine, Card Studio o decks bloquean la fase.
- Los JSON authored de decks no se cambian como parte de esta migración.
- Los blockers independientes se resuelven en PRs separados.
- Steam Cloud, Steamworks y Workshop no forman parte de las fases 0-6.

Estados permitidos:

- `No iniciada`
- `En curso`
- `Bloqueada`
- `En validación`
- `Completada`

## Resumen

| Fase | Nombre | Dependencias | Estado | PR/commit | Evidencia de cierre |
| --- | --- | --- | --- | --- | --- |
| Preflight | Auditoría y plan | Ninguna | Completada | — | `electron_migration_plan.md` |
| 0 | Baseline y toolchain determinista | Ninguna | Completada | — | Gates automáticos verdes y QA manual de Card Studio aprobada |
| 1 | Renderer offline y release-clean | Fase 0 | Completada | — | Gates automáticos y QA manual aprobados |
| 2 | Frontera de contenido builtin | Fase 1 | Completada | — | Gates automáticos y QA manual aprobados |
| 3 | Vertical Electron segura | Fases 1-2 | Completada | — | Paquete/smoke verdes y QA interactivo aprobada |
| 4 | Persistencia y lifecycle | Fase 3 | En validación | — | Implementación y gates automáticos verdes; QA manual pendiente |
| 5 | Packaging Windows x64 reproducible | Fases 3-4 | No iniciada | — | — |
| 6 | SteamPipe y rama privada | Fase 5 | No iniciada | — | — |

Progreso de implementación: **4/7 fases**.

## Baseline conocido antes de empezar

| Gate | Estado observado | Nota |
| --- | --- | --- |
| Suite Node | Pasa, 307/307 | Baseline verde |
| Deck lint | Pasa | Cuatro decks |
| Card Studio data check | Pasa | Proyecciones vigentes |
| Card assets check | Falla | 61 PNG con fingerprints obsoletos |
| Independence strict | Pasa | Cero blockers; mantiene warning de 61 PNG |
| Packaged-app smoke | No existe | Se crea en Fase 3 |
| CI Windows | No existe | Se crea en Fase 0 |

## Contratos protegidos durante toda la migración

### Gameplay

- [ ] Los cuatro decks siguen presentes y jugables.
- [ ] Los 61 IDs builtin conservan su comportamiento.
- [ ] Las mismas seeds producen resultados equivalentes.
- [ ] Ninguna regla se mueve a componentes o al proceso main.
- [ ] Las animaciones conservan orden e impactos.

### Playground

- [ ] Continúa disponible en desarrollo.
- [ ] Boards/replays conservan sus schemas y namespaces vigentes.
- [ ] No se migra a saves de producción.
- [ ] No entra en el paquete Steam.
- [ ] El build release no puede reactivarlo mediante `?playground`.

### Card Studio

- [ ] El servidor local continúa escuchando sólo en `127.0.0.1`.
- [ ] Puede cargar arte y guardarlo en `public/cards/<deck>/art/`.
- [ ] Puede guardar `studio.config.json`.
- [ ] Puede guardar `game-art.config.json`.
- [ ] `battlefieldArtFrame` conserva zoom, X e Y por carta.
- [ ] Regenera `deck-data.generated.js`.
- [ ] Regenera `src/data/cardStudioGameArt.generated.json`.
- [ ] La exportación española actualiza el PNG runtime.
- [ ] La exportación actualiza `src/data/cardRuntimeLayout.generated.json` cuando corresponde.
- [ ] La exportación actualiza `generation-manifest.json`.
- [ ] Cambiar sólo `battlefieldArtFrame` no vuelve obsoleto el PNG.
- [ ] El campo Electron muestra el mismo recorte que el preview `En juego`.
- [ ] Mano, hover, detalles, colección y animadores siguen usando el PNG completo.
- [ ] Card Studio no se incluye en el paquete Steam.

---

# Fase 0 — Baseline y toolchain determinista

Estado: **Completada**

## Implementación

- [x] Eliminar `vite.config.js` y `vite.config.d.ts` como outputs tracked.
- [x] Evitar que TypeScript vuelva a emitir configs junto al source.
- [x] Hacer explícita la config usada por cada script.
- [x] Separar `build:web` del futuro build Electron.
- [x] Declarar `packageManager` y `engines`.
- [x] Fijar Node y pnpm del release toolchain.
- [x] Revisar dependencies frente a devDependencies.
- [x] Crear CI Windows x64 con frozen install.
- [x] Registrar ADR-001 a ADR-014 como aceptadas o reemplazadas.
- [x] Registrar por separado los blockers de assets y auditor.

## Gates

- [x] TypeScript pasa.
- [x] Suite Node pasa sin reducir tests.
- [x] Deck lint pasa.
- [x] `card-studio-data --check` pasa.
- [x] `build:web` pasa.
- [x] Dos builds web tienen el mismo inventario lógico.
- [x] Ningún JSON de deck cambió.
- [x] Card Studio abre, guarda y vuelve a quedar sincronizado.

## Evidencia

- PR/commit: pendiente de commit/PR.
- CI run: workflow creado; pendiente de ejecución remota.
- Comandos: `tsc -b`; suite Node; deck lint; `card-studio-data --check`;
  `audit-independence --strict`; frozen install; dos `build:web` equivalentes.
- Notas: 307/307 tests; 283 archivos con cero diferencias de path, tamaño o SHA-256 entre builds;
  `vite.config.js`/`.d.ts` no reaparecen; cero cambios bajo `src/data/decks/`. El asset checker
  conserva el blocker conocido de 61 PNG. QA manual de Card Studio aprobada por el usuario:
  apertura, guardado y persistencia funcionan correctamente.
- Fecha de cierre: 2026-08-09.

---

# Fase 1 — Renderer offline y release-clean

Estado: **Completada**

## Implementación

- [x] Declarar localmente todas las fuentes utilizadas.
- [x] Eliminar Google Fonts.
- [x] Eliminar Font Awesome remoto.
- [x] Crear un gate compile-time para Playground/Audio Lab.
- [x] Eliminar `?playground` del release.
- [x] Añadir auditor de requests/recursos externos.
- [x] Crear inventario inicial de assets runtime.

## Gates

- [x] Cero requests HTTP/HTTPS durante menú y partida offline.
- [x] Los cuatro decks cargan con red bloqueada.
- [x] Cards, artes, fuentes, música y SFX tienen referencias locales verificables.
- [x] Playground sigue funcionando en desarrollo.
- [x] Playground y Audio Lab no aparecen en chunks release.
- [x] Card Studio sigue funcionando sin cambios de workflow.
- [x] Comparación visual aprobada a 1280×720 y 1920×1080.

## Evidencia

- PR/commit: pendiente de commit/PR.
- Network log: auditor estático verde y smoke runtime con red bloqueada aprobado por el usuario.
- Capturas/QA: aprobada por el usuario; quedan ajustes de tamaños a 1280×720 para trabajo visual
  posterior, no bloqueante.
- Card Studio check: suite, `card-studio-data --check` y smoke manual aprobados.
- Build: 278 archivos, 458343707 bytes; inventario completo en
  `runtime_asset_inventory.json`. Cero chunks/markers de Playground y Audio Lab.
- Tests: 308/308; deck lint, independence strict y frozen install pasan.
- Fecha de cierre: 2026-08-09.

---

# Fase 2 — Frontera de contenido builtin

Estado: **Completada**

## Implementación

- [x] Extraer contratos authored/manifest/presentación sin ciclos runtime.
- [x] Crear `ContentOrigin` y `ContentPackDescriptor`.
- [x] Crear `BuiltinContentSource`.
- [x] Crear `ContentCatalog` inmutable.
- [x] Mantener `DECK_REGISTRY` como fachada temporal.
- [x] Crear bootstrap de contenido previo al store/App.
- [x] Hacer explícitos los decks default.
- [x] Rechazar lookups faltantes donde el fallback sería peligroso.
- [x] Crear `AssetResolver` con adapter web y desktop.
- [x] Interpretar `/cards/...` como path lógico del pack builtin.
- [x] Separar validación candidate/policy del lint global.
- [x] Añadir fixtures external en memoria; no scanner ni carpeta de mods.
- [x] Registrar `packKey`, `origin` y `revision` en metadata runtime.
- [x] Documentar el futuro ID `packId/deckId/cardId` sin migrar JSON.

## Gates

- [x] Continúan exactamente 4 decks y 61 IDs builtin.
- [x] Defaults, orden y proyecciones son equivalentes al baseline.
- [x] Determinismo por seed no cambia.
- [x] No existe ninguna fuente local/Workshop activa.
- [x] El renderer no recibe rutas filesystem.
- [x] External fixtures con handler, marker, remote URL o traversal se rechazan.
- [x] Los JSON authored e image manifests no cambiaron.
- [x] `cardStudioGameArt.generated.json` sigue resolviendo todo arte del campo.
- [x] `cardRuntimeLayout.generated.json` sigue aplicándose a cartas full-art.
- [x] El preview `En juego` y el web runtime coinciden.

## Evidencia

- PR/commit: pendiente de commit/PR.
- Snapshot catálogo: `tests/contentCatalog.test.js`; 1 pack builtin, 4 decks, 61 identidades,
  revision `builtin.hostfall.core@0.0.2-beta.0`.
- Determinism test: suite completa 316/316; el test de seed y los tests de engine existentes pasan.
- Card Studio regression: proyección vigente; URLs web idénticas; arte de campo y full-art
  verificados. Hashes SHA-256 fijados en `electron_phase2_json_baseline.json`.
- Build/gates: typecheck, deck lint, `card-studio-data --check`, independence strict, dos builds,
  auditor offline e inventario reproducible verdes. Build: 278 archivos, 458349850 bytes.
- QA manual: juego, Playground y Card Studio aprobados por el usuario.
- Fecha de cierre: 2026-08-09.

---

# Fase 3 — Vertical Electron segura

Estado: **Completada**

## Implementación

- [x] Fijar versiones exactas de Electron, Forge y plugins.
- [x] Aprobar postinstall de Electron en pnpm.
- [x] Crear Vite main/renderer/preload configs.
- [x] Generar preload sandboxed CJS.
- [x] Crear `BrowserWindow` seguro.
- [x] Registrar `hostfall://` antes de `ready`.
- [x] Implementar hosts `app` y `content`.
- [x] Implementar MIME y Range.
- [x] Añadir CSP de dev y producción.
- [x] Denegar permisos, navegación, ventanas y downloads.
- [x] Abrir créditos mediante ID simbólico.
- [x] Configurar fuses e integridad ASAR.
- [x] Añadir Error Boundary y logs locales rotados.
- [x] Probar y registrar decisión de `backgroundThrottling`.

## Gates

- [x] `forge start` funciona.
- [x] El paquete Windows x64 arranca desde una ruta con espacios.
- [x] Funciona con red bloqueada.
- [x] `/assets`, `/cards` y `/fonts` resuelven.
- [x] PNG completos cargan.
- [x] Arte fuente recortado carga.
- [x] `battlefieldArtFrame` coincide con Card Studio.
- [x] `statsFrame` full-art coincide con el layout generado.
- [x] Música y SFX reproducen, pausan y hacen seek.
- [x] WebGL y context-loss recovery funcionan.
- [x] Renderer no tiene Node, filesystem o raw IPC.
- [x] CSP no tiene violaciones inesperadas.
- [x] Traversal y hosts desconocidos se rechazan.
- [x] Links no crean BrowserWindows.
- [x] Fuses se verifican en el binario.
- [x] `build:web` continúa funcionando.

## Evidencia

- PR/commit: cambios locales en rama `electron`; sin commit solicitado.
- Package path/hash final de cierre: `out/Electron Packages/Hostfall-win32-x64` (288 archivos;
  822,572,322 bytes); SHA-256 `Hostfall.exe`
  `EF95B7788D6A5615929EB3AB5ED19251CD2E60053820217C3B597EB964C1EF2A`; SHA-256 `app.asar`
  `88566743F68CA33511799A0D66580E8C195FACB0D241D542F18ED87B0FBC6E16`.
- Playwright smoke: `scripts/electron-smoke.mjs` pasa contra el `app.asar` real; PNG 976×1360,
  arte 600×842, fuente local, MP3 de 186.35 s con seek, WebGL/context loss, cero HTTP y frontera sin
  Node. Un boot probe separado confirma el `Hostfall.exe` endurecido real porque el fuse
  `nodeCliInspect` impide que Playwright se conecte directamente al ejecutable de release.
- Security audit al cierre: 333/333 tests; corpus adversarial de protocolo, MIME/Range, CSP, ventana externa,
  `scripts/verify-electron-package.mjs`, ASAR allowlist y los nueve fuses verificados.
- Audio/Card Studio QA: smoke automático de carga/seek verde y QA visual del usuario aprobada. El
  tirón del primer VFX detectado durante QA se corrigió precalentando contexto, framebuffer y shaders
  durante loading; el ajuste 1280×720 queda diferido por decisión del usuario.
- Toolchain: Electron `43.3.0`; Forge/plugin Vite/plugin fuses/maker ZIP `7.11.2`;
  `@electron/fuses` `2.1.3`; Playwright Core `1.62.1`. Electron 43 ya no declara postinstall:
  `install-electron` realiza la descarga con checksums y `pnpm-workspace.yaml` mantiene la
  autorización explícita.
- Fecha de cierre: 2026-08-09.

---

# Fase 4 — Persistencia y lifecycle

Estado: **En validación**

## Implementación

- [x] Fijar `productName`, `appId` y ruta estable de datos.
- [x] Crear `preferences-v1.json`.
- [x] Crear `window-state-v1.json` local-only.
- [x] Crear `saves/resume-v1.json`.
- [x] Definir envelope y validación.
- [x] Implementar escritura atómica y backup.
- [x] Crear snapshot/restore puros.
- [x] Definir checkpoint seguro.
- [x] Añadir pantalla/acción Continuar.
- [x] Añadir recuperación de save corrupto.
- [x] Migrar preferencias legacy una vez.
- [x] Añadir single-instance lock.
- [x] Definir close, minimize, focus, suspend y audio.
- [x] Excluir Playground y window state de datos cloud-worthy.
- [x] Añadir Pantalla completa en ambos menús y F11.

## Gates

- [x] Preferencias sobreviven reinicio.
- [ ] Una partida continúa desde el último checkpoint.
- [ ] Cerrar durante Burn restaura estado estable.
- [ ] Cerrar durante combate de Hueste restaura estado estable.
- [ ] Cerrar durante una selección manual restaura estado estable.
- [x] Save corrupto usa backup o presenta recuperación.
- [x] Schema desconocido se rechaza limpiamente.
- [x] Contenido faltante no hace fallback a otro deck.
- [x] Dos instancias no escriben simultáneamente.
- [x] Web build conserva localStorage adapter.
- [x] Playground storage no se migra ni aparece en saves.

## Evidencia

- PR/commit: cambios locales en rama `electron`; sin commit solicitado.
- Save schema/version: `hostfall-resume` v1; `hostfall-preferences` v1; window state v1.
- Rutas: `profile/preferences-v1.json`, `profile/saves/resume-v1.json` y
  `local/window-state-v1.json`; contrato en `docs/electron_persistence.md`.
- Determinism resume test: JSON round-trip del `GameState`, restore puro, claves calificadas y
  revisión exacta; suite 333/333.
- Corruption tests: primario inválido recupera backup; dos candidatos inválidos presentan borrado;
  schema/contenido/deck desconocidos se rechazan sin fallback.
- Smoke: fullscreen on/off, archivos tras cierre, segunda instancia, bridge cerrado, assets/audio,
  WebGL y boot del ejecutable fusionado verdes.
- QA manual pendiente: Continuar tras reinicio y cierres reales durante Burn, combate de Hueste y
  selección manual; minimize/alt-tab/suspend-resume con audio real.
- Fecha de cierre: pendiente de QA manual.

---

# Fase 5 — Packaging Windows x64 reproducible

Estado: **No iniciada**

## Implementación

- [ ] Crear staging allowlist desde manifests y outputs generados.
- [ ] Incluir código, HTML y preload en ASAR.
- [ ] Incluir cards/audio/fonts como `extraResources` individuales.
- [ ] Excluir `src`, tests, dev, tmp y documentación privada.
- [ ] Excluir Card Studio, su servidor e HTML.
- [ ] Excluir Hunters y `exported-png`.
- [ ] Excluir artes fuente no referenciados.
- [ ] Incluir todos los artes fuente referenciados por `cardStudioGameArt.generated.json`.
- [ ] Incluir todos los PNG referenciados por manifests.
- [ ] Incluir `cardRuntimeLayout.generated.json` dentro del bundle de código.
- [ ] Generar manifest de paths, tamaños y SHA-256.
- [ ] Añadir icono y metadata Windows.
- [ ] Comparar dos builds unsigned.
- [ ] Configurar firma después de la comparación.
- [ ] Resolver NOTICE, provenance y SFX pendientes.
- [ ] Medir delta de modificar una carta.

## Gates

- [ ] El paquete sólo contiene allowlist.
- [ ] Card Studio no está en el paquete.
- [ ] Todos sus outputs runtime necesarios sí están.
- [ ] Los cuatro decks muestran PNG completo y recorte correcto.
- [ ] Código/main/preload tienen integridad ASAR.
- [ ] Media grande está fuera de ASAR.
- [ ] Dos builds unsigned tienen inventario/hashes equivalentes.
- [ ] Arranca en Windows limpio sin Node/pnpm.
- [ ] Firma e icono son válidos.
- [ ] Rights/notices están resueltos.

## Evidencia

- PR/commit:
- Artifact manifest:
- Tamaño final:
- ASAR inspection:
- Card Studio asset graph:
- Firma:
- Fecha de cierre:

---

# Fase 6 — SteamPipe y rama privada

Estado: **No iniciada**

## Implementación

- [ ] Crear templates VDF sin credenciales.
- [ ] Crear un depot Windows inicial.
- [ ] Apuntar `ContentRoot` sólo al staging final.
- [ ] Mantener `BuildOutput` fuera del depot.
- [ ] Definir launch option x64.
- [ ] Ejecutar SteamPipe Preview.
- [ ] Subir a beta branch privada.
- [ ] Excluir `steam_appid.txt` del depot.
- [ ] Probar install, update y rollback.
- [ ] Probar Steam Offline Mode.
- [ ] Probar launch sin Steam.
- [ ] Probar overlay/focus/audio.
- [ ] Documentar path futuro de Auto-Cloud.
- [ ] Confirmar que no existe binding Steamworks runtime.

## Gates

- [ ] Steam instala únicamente el paquete final.
- [ ] Launch option abre el ejecutable correcto.
- [ ] El juego funciona en Offline Mode.
- [ ] Saves sobreviven update.
- [ ] Política de saves tras uninstall/reinstall está verificada.
- [ ] Delta de un asset no descarga un pack masivo.
- [ ] Rollback funciona.
- [ ] SDK, credenciales y `steam_appid.txt` no están en el depot.
- [ ] Smoke completado en al menos dos PCs.

## Evidencia

- Steam Build ID:
- Depot ID:
- Beta branch:
- Preview output:
- Matriz de PCs:
- Fecha de cierre:

---

# Blockers y decisiones abiertas

| ID | Tipo | Descripción | Owner | Fase límite | Estado | Resolución |
| --- | --- | --- | --- | --- | --- | --- |
| BLK-001 | Asset gate | 61 PNG tienen fingerprints obsoletos | — | 5 | Abierto | — |
| BLK-002 | Auditor | `magic` en comentario producía un blocker falso | Codex | 0 | Resuelto | Comentario neutralizado; strict pasa con cero blockers |
| BLK-003 | Derechos | Provenance contiene verificaciones pendientes | — | 5 | Abierto | — |
| BLK-004 | Audio | Once SFX mantienen `_NEED_REVIEW` | — | 5 | Abierto | — |
| BLK-005 | Audio runtime | Faltaban `Other/Battle_1.mp3` y `Other/Climax_1.mp3`; Vite dejaba las URLs sin resolver | Codex | 1 | Resuelto | Colección inexistente retirada del manifest y audio mix; build sin referencias faltantes |
| DEC-001 | Toolchain | Patch exacto Electron/Forge | Codex | 3 | Resuelto | Electron 43.3.0, Forge 7.11.2 y plugins exactos; `@electron/fuses` 2.1.3 cubre los nueve fuses de Electron 43 |
| DEC-002 | Lifecycle | Política final de background throttling | Codex/usuario | 3 | Resuelto | `backgroundThrottling: true`; audio responde a blur/minimize/suspend y los checkpoints, no los timers de fondo, garantizan restore estable |
| DEC-003 | Producto | Confirmar comportamiento de Continuar/autosave | Codex | 4 | Resuelto | Un slot `resume-v1`, autosave sólo en checkpoint seguro, backup y recuperación explícita |
| DEC-004 | Release | Identidad de firma Windows | — | 5 | Pendiente | — |

# Registro de cambios del tracker

| Fecha | Cambio | Autor |
| --- | --- | --- |
| 2026-08-09 | Creación del plan y del tracker; implementación aún no iniciada | Codex |
| 2026-08-09 | Fase 0 implementada; gates automáticos verdes y QA manual de Card Studio pendiente | Codex |
| 2026-08-09 | QA manual de Card Studio aprobada; Fase 0 cerrada como completada | Codex |
| 2026-08-09 | Fase 1 implementada; gates estáticos verdes y QA offline/visual pendiente | Codex |
| 2026-08-09 | QA offline, tooling y Card Studio aprobada; Fase 1 completada con ajustes 720p diferidos | Codex |
| 2026-08-09 | Fase 2 implementada; catálogo builtin, asset boundary y política external pasan gates automáticos; QA visual pendiente | Codex |
| 2026-08-09 | QA manual aprobada; Fase 2 completada y Fase 3 iniciada | Codex |
| 2026-08-09 | Vertical Electron segura empaquetada; gates automáticos, smoke y fuses verdes; QA manual de Fase 3 pendiente | Codex |
| 2026-08-09 | Baseline JSON recapturado sólo para reconocer el ajuste intencional de encuadre de Maela producido por Card Studio | Codex |
| 2026-08-09 | QA manual de Fase 3 aprobada; precalentamiento VFX corrige el tirón inicial y Fase 3 queda completada | Codex |
| 2026-08-09 | Fase 4 implementada: fullscreen/F11, preferencias, window state, resume seguro, backup, recovery, single-instance y lifecycle; QA manual pendiente | Codex |
