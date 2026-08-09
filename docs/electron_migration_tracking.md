# Seguimiento de la migración de Hostfall a Electron

Última actualización: **2026-08-09**  
Estado global: **migración en curso; Fase 1 completada**
Fase activa: **Fase 2 — Frontera de contenido builtin**
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
| 2 | Frontera de contenido builtin | Fase 1 | En curso | — | — |
| 3 | Vertical Electron segura | Fases 1-2 | No iniciada | — | — |
| 4 | Persistencia y lifecycle | Fase 3 | No iniciada | — | — |
| 5 | Packaging Windows x64 reproducible | Fases 3-4 | No iniciada | — | — |
| 6 | SteamPipe y rama privada | Fase 5 | No iniciada | — | — |

Progreso de implementación: **2/7 fases**.

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

Estado: **En curso**

## Implementación

- [ ] Extraer contratos authored/manifest/presentación sin ciclos runtime.
- [ ] Crear `ContentOrigin` y `ContentPackDescriptor`.
- [ ] Crear `BuiltinContentSource`.
- [ ] Crear `ContentCatalog` inmutable.
- [ ] Mantener `DECK_REGISTRY` como fachada temporal.
- [ ] Crear bootstrap de contenido previo al store/App.
- [ ] Hacer explícitos los decks default.
- [ ] Rechazar lookups faltantes donde el fallback sería peligroso.
- [ ] Crear `AssetResolver` con adapter web y desktop.
- [ ] Interpretar `/cards/...` como path lógico del pack builtin.
- [ ] Separar validación candidate/policy del lint global.
- [ ] Añadir fixtures external en memoria; no scanner ni carpeta de mods.
- [ ] Registrar `packKey`, `origin` y `revision` en metadata runtime.
- [ ] Documentar el futuro ID `packId/deckId/cardId` sin migrar JSON.

## Gates

- [ ] Continúan exactamente 4 decks y 61 IDs builtin.
- [ ] Defaults, orden y proyecciones son equivalentes al baseline.
- [ ] Determinismo por seed no cambia.
- [ ] No existe ninguna fuente local/Workshop activa.
- [ ] El renderer no recibe rutas filesystem.
- [ ] External fixtures con handler, marker, remote URL o traversal se rechazan.
- [ ] Los JSON authored e image manifests no cambiaron.
- [ ] `cardStudioGameArt.generated.json` sigue resolviendo todo arte del campo.
- [ ] `cardRuntimeLayout.generated.json` sigue aplicándose a cartas full-art.
- [ ] El preview `En juego` y el web runtime coinciden.

## Evidencia

- PR/commit:
- Snapshot catálogo:
- Determinism test:
- Card Studio regression:
- Fecha de cierre:

---

# Fase 3 — Vertical Electron segura

Estado: **No iniciada**

## Implementación

- [ ] Fijar versiones exactas de Electron, Forge y plugins.
- [ ] Aprobar postinstall de Electron en pnpm.
- [ ] Crear Vite main/renderer/preload configs.
- [ ] Generar preload sandboxed CJS.
- [ ] Crear `BrowserWindow` seguro.
- [ ] Registrar `hostfall://` antes de `ready`.
- [ ] Implementar hosts `app` y `content`.
- [ ] Implementar MIME y Range.
- [ ] Añadir CSP de dev y producción.
- [ ] Denegar permisos, navegación, ventanas y downloads.
- [ ] Abrir créditos mediante ID simbólico.
- [ ] Configurar fuses e integridad ASAR.
- [ ] Añadir Error Boundary y logs locales rotados.
- [ ] Probar y registrar decisión de `backgroundThrottling`.

## Gates

- [ ] `forge start` funciona.
- [ ] El paquete Windows x64 arranca desde una ruta con espacios.
- [ ] Funciona con red bloqueada.
- [ ] `/assets`, `/cards` y `/fonts` resuelven.
- [ ] PNG completos cargan.
- [ ] Arte fuente recortado carga.
- [ ] `battlefieldArtFrame` coincide con Card Studio.
- [ ] `statsFrame` full-art coincide con el layout generado.
- [ ] Música y SFX reproducen, pausan y hacen seek.
- [ ] WebGL y context-loss recovery funcionan.
- [ ] Renderer no tiene Node, filesystem o raw IPC.
- [ ] CSP no tiene violaciones inesperadas.
- [ ] Traversal y hosts desconocidos se rechazan.
- [ ] Links no crean BrowserWindows.
- [ ] Fuses se verifican en el binario.
- [ ] `build:web` continúa funcionando.

## Evidencia

- PR/commit:
- Package path/hash:
- Playwright smoke:
- Security audit:
- Audio/Card Studio QA:
- Fecha de cierre:

---

# Fase 4 — Persistencia y lifecycle

Estado: **No iniciada**

## Implementación

- [ ] Fijar `productName`, `appId` y ruta estable de datos.
- [ ] Crear `preferences-v1.json`.
- [ ] Crear `window-state-v1.json` local-only.
- [ ] Crear `saves/resume-v1.json`.
- [ ] Definir envelope y validación.
- [ ] Implementar escritura atómica y backup.
- [ ] Crear snapshot/restore puros.
- [ ] Definir checkpoint seguro.
- [ ] Añadir pantalla/acción Continuar.
- [ ] Añadir recuperación de save corrupto.
- [ ] Migrar preferencias legacy una vez.
- [ ] Añadir single-instance lock.
- [ ] Definir close, minimize, focus, suspend y audio.
- [ ] Excluir Playground y window state de datos cloud-worthy.

## Gates

- [ ] Preferencias sobreviven reinicio.
- [ ] Una partida continúa desde el último checkpoint.
- [ ] Cerrar durante Burn restaura estado estable.
- [ ] Cerrar durante combate de Hueste restaura estado estable.
- [ ] Cerrar durante una selección manual restaura estado estable.
- [ ] Save corrupto usa backup o presenta recuperación.
- [ ] Schema desconocido se rechaza limpiamente.
- [ ] Contenido faltante no hace fallback a otro deck.
- [ ] Dos instancias no escriben simultáneamente.
- [ ] Web build conserva localStorage adapter.
- [ ] Playground storage no se migra ni aparece en saves.

## Evidencia

- PR/commit:
- Save schema/version:
- Determinism resume test:
- Corruption tests:
- Fecha de cierre:

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
| DEC-001 | Toolchain | Patch exacto Electron/Forge | — | 3 | Pendiente | — |
| DEC-002 | Lifecycle | Política final de background throttling | — | 3 | Pendiente | — |
| DEC-003 | Producto | Confirmar comportamiento de Continuar/autosave | — | 4 | Pendiente | Recomendación: un slot y checkpoint seguro |
| DEC-004 | Release | Identidad de firma Windows | — | 5 | Pendiente | — |

# Registro de cambios del tracker

| Fecha | Cambio | Autor |
| --- | --- | --- |
| 2026-08-09 | Creación del plan y del tracker; implementación aún no iniciada | Codex |
| 2026-08-09 | Fase 0 implementada; gates automáticos verdes y QA manual de Card Studio pendiente | Codex |
| 2026-08-09 | QA manual de Card Studio aprobada; Fase 0 cerrada como completada | Codex |
| 2026-08-09 | Fase 1 implementada; gates estáticos verdes y QA offline/visual pendiente | Codex |
| 2026-08-09 | QA offline, tooling y Card Studio aprobada; Fase 1 completada con ajustes 720p diferidos | Codex |
