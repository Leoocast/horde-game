# Plan técnico de migración de Hostfall a Electron

Estado: **plan aprobado; migración no iniciada**  
Última revisión: **2026-08-09**  
Alcance inicial: **Windows x64, offline y distribución mediante Steam**

El progreso operativo y la evidencia de cada fase se registran en
[`electron_migration_tracking.md`](electron_migration_tracking.md).

## Dictamen

Hostfall puede migrar a Electron sin reescribir el juego. React, Zustand, el engine, las
animaciones, Three/WebGL y el audio actual son compatibles con Chromium/Electron. La estrategia es
envolver la SPA con una capa de plataforma y una frontera de contenido, no trasladar reglas al
proceso principal ni dar acceso a Node al renderer.

La migración debe preservar, salvo una razón explícita y probada:

- `src/engine/` y su determinismo;
- `src/store/` y el orden observable de sus beats;
- React, Zustand, componentes y animaciones;
- los cuatro decks y sus JSON authored;
- el build web mientras se estabiliza el build desktop;
- Playground como herramienta de desarrollo;
- Card Studio como pipeline de autoría y exportación de cartas.

Los cinco bloqueos principales son:

1. Vite tiene dos configuraciones versionadas y lee primero la generada `vite.config.js`; un cambio
   sólo en el `.ts` podría ignorarse.
2. El build no es completamente offline: carga Google Fonts y Font Awesome remotamente.
3. `file://` no resuelve correctamente las rutas actuales `/assets`, `/cards` y `/fonts`; se necesita
   un protocolo `hostfall://`.
4. El catálogo de decks es eager, global y usa IDs desnudos; todavía no admite contenido dinámico
   de manera segura.
5. Un empaquetado ingenuo desde la raíz podría copiar alrededor de 1.31 GiB por duplicar `dist`,
   `public`, `assets` y `dev`.

## Principios de ejecución

1. Cada fase debe terminar con un producto funcional.
2. Los cambios deben entrar en verticales pequeñas y reversibles.
3. El web build se conserva hasta que la distribución Steam esté estabilizada.
4. El renderer nunca obtiene Node, filesystem o Steamworks arbitrarios.
5. No se cambian los JSON authored ni su schema durante esta migración.
6. No se implementan mods, Workshop, UI de mods, hot reload ni publicación.
7. La preparación para mods termina en una frontera estable y una política de confianza.
8. Card Studio permanece fuera del producto empaquetado, pero sus outputs runtime son parte del
   contrato de release.

---

# Auditoría del repositorio

## Arquitectura y build

| Área | Estado actual | Consecuencia |
| --- | --- | --- |
| Entrada | `src/main.tsx` monta `App` directamente | No existe bootstrap previo para catálogo, saves o plataforma |
| Navegación | `App` conserva la pantalla en estado React local | No hay router ni historial web complejo que migrar |
| Build | `tsc -b && vite build` | Sólo existe un renderer web |
| Vite | Configuración mínima, sin `base` ni outputs separados | No hay main, preload, CSP o packaging Electron |
| Config duplicada | `vite.config.js`, `.d.ts` y `.ts` están versionados | Vite busca `.js` antes que `.ts`; existe doble autoridad |
| Deployment web | Wrangler sirve `dist` como SPA | Debe conservarse como `build:web` durante la transición |
| Dependencias runtime | React, Zustand, Framer Motion, GSAP, Three y Lucide | Son browser-pure y compatibles con Electron |
| Dependencias nativas | Ninguna | La primera migración no necesita rebuild nativo |
| Package manager | Existe lock, pero no `packageManager` ni `engines` | El toolchain todavía no es reproducible por contrato |
| CI | No existe | Faltan gates de Windows y del paquete Electron |

La línea estable de Electron al redactar este plan es 43.x. Al ejecutar la fase de toolchain debe
seleccionarse y fijarse el patch estable exacto; no se usará `electron@latest` en un build de
release.

## Tamaño y estructura de assets

La medición del `dist` observado es aproximada —no es todavía un artefacto reproducible certificado
del commit—:

| Área | Tamaño aproximado | Archivos |
| --- | ---: | ---: |
| `dist` completo | 437.18 MiB | 283 |
| `dist/cards` | 293.19 MiB | 207 |
| `dist/assets` | 143.84 MiB | 68 |
| Fuentes | 0.15 MiB | 6 |

Dentro de `public/cards`:

- hay 61 cartas activas;
- los manifests y datos generados apuntan a 135 referencias `/cards/...`;
- unos 122 archivos únicos son consumidos por runtime;
- aproximadamente 85 archivos y 130.82 MiB no son consumidos por el juego;
- predominan PNG fuente/alternativos y Card Studio;
- `public/cards/hunters` entra en `dist` pese a ser sólo preview;
- `public/.DS_Store` también termina copiado.

Estos archivos no deben borrarse de authoring. El paquete Steam se construirá desde un grafo de
assets runtime, no copiando todo `public`. La estimación inicial es reducir el renderer de unos
437 MiB a unos 306 MiB antes de sumar Electron.

## Offline y rutas

El build actual no es completamente offline:

- `index.html` carga Google Fonts;
- carga Font Awesome desde cdnjs;
- no hay usos `fa-*`, por lo que Font Awesome parece eliminable;
- las seis fuentes necesarias ya viven en `public/fonts`, aunque `styles.css` sólo declara dos.

El output contiene:

- `/assets/...` en `dist/index.html`;
- 21 `url(/...)` en el CSS compilado;
- 61 `imageUrl` y 74 `artUrl` bajo `/cards/...`.

Por ello no se usará `loadFile()` como solución de producción ni se convertirán todos los datos a
rutas `./...`. Un scheme estándar `hostfall://app/` conserva la semántica de rutas, ofrece un origen
estable para storage y permite servir audio mediante streaming.

## Estado y persistencia

- `useGameStore` crea una partida al evaluar el módulo, incluso mientras se muestra el menú.
- El store de juego no usa `persist`; sólo guarda la seed.
- El store de audio usa Zustand `persist` sobre `localStorage`.
- Idioma, nombre, onboarding, modo developer y marcador de precarga usan `localStorage`.
- El inspector guarda columnas.
- Playground guarda boards y replays.
- No hay `sessionStorage`, IndexedDB ni escrituras reales a Cache Storage.
- No existe save de una partida.
- La confirmación de pérdida de progreso sólo existe al volver al menú desde el tablero; cerrar la
  ventana evita ese flujo.

Un save no puede ser un dump de Zustand. El store contiene timers, closures, commits visuales y
secuencias cuyas reglas pueden aplicarse en el impacto de una animación. La unidad persistible debe
ser un checkpoint de dominio seguro tomado después de terminar una acción o beat completo.

## Decks, catálogo y efectos

El catálogo actual es estático:

- `src/data/decks.ts` importa los cuatro JSON y sus manifests;
- `register()` normaliza durante la evaluación del módulo;
- `DECK_REGISTRY` queda materializado de inmediato;
- `deckCatalog.ts`, `cardImages.ts`, Playground y el store derivan snapshots eager;
- `App` asume arrays no vacíos mediante `[0]`;
- algunos lookups usan fallback silencioso al deck default.

La identidad también es global:

- `CardDefinition.id` conserva el ID authored;
- `CardInstance.definitionId` copia ese ID;
- los mapas visuales usan el ID desnudo;
- `EffectResolver` usa `findCardDefinition` global para resolver tokens;
- existen comparaciones bespoke por `definitionId`.

Esto funciona para los cuatro decks actuales, pero una futura fuente externa podría colisionar con
una carta builtin u otro pack.

### Validación actual

Existen bases útiles:

- `EffectResolver` tiene un registro cerrado de handlers;
- `effectVocabulary.ts` mantiene vocabularios explícitos;
- `deckLint.ts` valida los decks actuales y sus efectos normalizados.

Pero el lint actual no es un parser seguro para contenido no confiable:

- `lintDecks()` está acoplado al registro global;
- la validación aislada de schema no valida toda la habilidad;
- `CREATE_TOKEN` usa el lookup global;
- no existen límites de bytes, profundidad, cantidad o tamaño de archivos;
- no valida MIME, extensiones o paths de manifests;
- un schema desconocido puede llegar a normalización;
- un `side` desconocido termina normalizado como player;
- habilidades con `engineSupport` se eliminan silenciosamente;
- efectos desconocidos pueden volverse no-op y condiciones desconocidas pueden comportarse como
  verdaderas.

Para contenido external el orden obligatorio será:

```text
límites de entrada -> parse JSON -> validación completa -> normalización -> catálogo
```

Nunca se normalizará primero contenido no confiable.

## APIs del navegador

| API o sistema | Estado | Acción Electron |
| --- | --- | --- |
| `window`, `document`, medidas DOM, portals y RAF | Uso extensivo | Se conservan en renderer |
| `location` | Gate `?playground` | Eliminar escape hatch en release |
| `fetch`, XHR, WebSocket | No existen en runtime | Producción puede usar `connect-src 'none'` |
| Web Audio | No se usa | Audio actual es `HTMLAudioElement` |
| Workers/service workers | No existen | No necesitan adaptación |
| Drag | Pointer/Framer; DnD real sólo Playground | Compatible; bloquear navegación por file drop |
| Clipboard | Cinco escrituras, ninguna lectura | Probar API web; bridge estrecho sólo si falla |
| Fullscreen | No existe | Capacidad tipada controlada por main |
| Focus/visibility/suspend | Sin política | Definir comportamiento y pruebas |
| Navegación externa | Dos links GitHub con `target=_blank` | Denegar ventanas y abrir sólo URL permitida en el SO |
| Files/Blob/download | Playground y Audio Lab | No empaquetar tooling developer |
| Gamepad | No existe | Steam Deck/Steam Input queda futuro |
| WebGL | Three compartido con context-loss recovery | Mantener aceleración y hacer smoke de GPU |

## Audio

`AudioEngine` usa `new Audio(url)` y los manifests emplean `new URL(..., import.meta.url)`, por lo que
Vite emite archivos locales. El protocolo debe proporcionar:

- MIME correcto;
- `Content-Length`;
- soporte de `Range` y seek;
- streaming;
- decodificación correcta de espacios y paréntesis;
- reproducción tras gesto inicial;
- comportamiento definido al minimizar, suspender y cambiar dispositivo.

No se desactivará aceleración de hardware preventivamente: los VFX dependen de WebGL.

## Verificaciones observadas

- Suite actual: **307/307 tests pasan**.
- Deck lint: los cuatro decks pasan.
- `card-studio-data --check`: pasa.
- `check-card-assets`: falla por fingerprints obsoletos de los 61 PNG.
- `audit-independence --strict`: falla por la palabra `magic` en un comentario de
  `StormBuffAnimator.tsx` y advierte sobre los mismos PNG.
- No hay tests React, browser o packaged-app.
- El runner carga manualmente sus suites; una suite nueva que no se añada al runner no se ejecuta.

Las fallas existentes deben resolverse en un PR separado o registrarse formalmente como baseline.
No se mezclarán reexportaciones masivas de PNG con la arquitectura Electron.

---

# Contrato de Playground y Card Studio

## Respuesta corta

La migración no debería romper Card Studio. No es parte del runtime del juego y no debe convertirse
en una pantalla Electron. Seguirá ejecutándose como herramienta local del repositorio, con su
servidor en `127.0.0.1`, y seguirá escribiendo sus configs, arte y PNG en las mismas ubicaciones de
autoría.

Lo que sí cambia es el packaging: Steam no recibirá Card Studio ni sus fuentes de trabajo. Recibirá
sólo las salidas runtime que Card Studio ya produce y que el juego consume.

## Card Studio no sólo produce PNG

El flujo vigente tiene cuatro familias de datos:

### 1. Arte fuente

Card Studio guarda la imagen cargada en:

```text
public/cards/<deck>/art/<card>.<ext>
```

`studio.config.json` conserva `artCrop` y el encuadre imprimible `artFrame`.

### 2. Carta completa

`export_cards.cjs <deck>` renderiza PNG de 976 x 1360. La exportación española:

- escribe el lote de autoría en `exported-png/`;
- actualiza `public/cards/<deck>/<card>.png` para el juego;
- actualiza `generation-manifest.json`;
- mide y actualiza el layout runtime cuando corresponde.

La exportación inglesa escribe sólo `exported-png/en/` y no reemplaza los PNG runtime.

### 3. Encuadre recortado del campo

Sí: éste es el JSON que recordabas. Cada deck puede tener:

```text
dev/tools/Decks/<deck>/game-art.config.json
```

Contiene por carta:

```json
{
  "battlefieldArtFrame": {
    "zoom": 1,
    "x": 0,
    "y": 0
  }
}
```

Es independiente de `artFrame`: mover la carta impresa no mueve el recorte del campo y viceversa.
Card Studio valida esos valores y el mismo botón de guardado actualiza ambos configs como una sola
operación lógica.

El sidecar se proyecta a:

```text
src/data/cardStudioGameArt.generated.json
```

Esa proyección contiene:

- la URL pública del arte fuente `artCrop`;
- `battlefieldArtFrame`;
- el dato que `cardImages.ts` entrega al campo.

El juego no lee `dev/tools/Decks/.../game-art.config.json` directamente. Consume la proyección
generada, que se incluirá dentro del código/runtime empaquetado.

### 4. Layout runtime de cartas full-art

La exportación española también puede medir posiciones reales del renderer y escribir:

```text
src/data/cardRuntimeLayout.generated.json
```

Actualmente guarda geometría runtime como `statsFrame` para cartas full-art. Este archivo es
distinto de `battlefieldArtFrame`, aunque ambos participan en cómo se ve una carta dentro del juego.

### Flujo protegido

```text
JSON de deck
  + studio.config.json (artCrop, artFrame, fullArt, headerFade, motivo)
  + game-art.config.json (battlefieldArtFrame)
  + arte fuente public/cards/<deck>/art/
        |
        v
card-studio-data.mjs
  -> deck-data.generated.js
  -> cardStudioGameArt.generated.json
        |
        v
export_cards.cjs
  -> PNG completo public/cards/<deck>/
  -> cardRuntimeLayout.generated.json
  -> generation-manifest.json
        |
        v
AssetResolver -> hostfall:// -> juego Electron
```

## Qué se conserva

- Los HTML, CSS, JavaScript y servidor de Card Studio permanecen en `dev/tools/Decks/`.
- Se conserva `studio.config.json`.
- Se conserva `game-art.config.json`.
- Se conserva el arte fuente bajo `public/cards/<deck>/art/`.
- Se conserva la exportación PNG.
- Se conservan `cardStudioGameArt.generated.json` y `cardRuntimeLayout.generated.json`.
- El botón Guardar sigue actualizando configs y proyecciones.
- La herramienta puede usar Chrome/Edge/Playwright para medir y exportar, independientemente del
  runtime Electron.

## Qué cambia

- `public/` deja de copiarse entero al paquete Steam.
- Un manifest de staging selecciona los PNG y artes realmente consumidos.
- `AssetResolver` transforma paths lógicos `/cards/...` en URLs `hostfall://...`.
- Los JSON generated que el runtime importa quedan dentro del build de código.
- El paquete no contiene el servidor, HTML del estudio, `exported-png`, Hunters, configs de autoría
  ni imágenes fuente no referenciadas.

## Gates obligatorios para no romper Card Studio

Cada fase que toque datos o assets debe demostrar:

1. `card-studio-data.mjs --check` pasa.
2. `check-card-assets.mjs` no introduce fallas nuevas.
3. El save del estudio actualiza `studio.config.json`, `game-art.config.json` y sus proyecciones.
4. Cambiar sólo `battlefieldArtFrame` no invalida los PNG imprimibles.
5. El preview `En juego` coincide con el recorte del campo bajo `hostfall://`.
6. Mano, hover, detalles y animadores siguen usando el PNG completo.
7. El staging contiene todo arte fuente realmente usado por el campo y ningún source innecesario.

## Playground

Playground también se conserva, pero únicamente como herramienta de desarrollo:

- permanece en `src/playground/`;
- sus boards/replays continúan en sus namespaces actuales;
- no se migran a saves de producción ni a Steam Cloud;
- debe seguir disponible en `dev`, incluido el entorno Electron de desarrollo si resulta útil;
- no debe emitirse ni activarse en el paquete Steam;
- la desaparición de `?playground` afecta sólo al escape hatch de producción, no al workflow local.

---

# Arquitectura objetivo

```text
BuiltinContentSource (única fuente activa)
  -> ContentValidator
  -> ContentCatalog inmutable
  -> React / Zustand / engine

ContentCatalog
  -> AssetResolver
  -> hostfall:// protocol
  -> índice de roots y archivos controlado por main

Futuro:
LocalContentSource ---------^
WorkshopContentSource ------^   (ambas no confiables; no se implementan ahora)
```

El renderer conserva el juego. Main posee filesystem, lifecycle, protocolo, saves y futuro
Steamworks. Preload sólo expone capacidades concretas.

Contrato conceptual mínimo:

```ts
type ContentOrigin = "builtin" | "local" | "workshop";

type ContentPackDescriptor = {
  packKey: string;
  packId: string;
  origin: ContentOrigin;
  revision: string;
};

interface ContentSource {
  loadCandidates(): Promise<ContentPackCandidate[]>;
}

interface ContentCatalog {
  readonly revision: string;
  findDeck(key: string): ValidatedDeck | undefined;
  findDefinition(key: string): CardDefinition | undefined;
}

interface AssetResolver {
  resolve(ref: { packKey: string; path: string }): string;
}
```

Durante la migración sólo se implementa `BuiltinContentSource`. Un descriptor nunca contiene una
ruta absoluta visible al renderer.

---

# Architecture Decision Records

Estado al cerrar la implementación técnica de Fase 0 (2026-08-09): **ADR-001 a ADR-014
aceptadas como baseline de la migración**. Si una fase posterior necesita reemplazar alguna, debe
registrar explícitamente la nueva decisión y su motivo en este documento y en el tracker.

| ADR | Alternativas | Recomendación | Consecuencias | Dificultad de cambiar después |
| --- | --- | --- | --- | --- |
| ADR-001 Toolchain | Forge; electron-vite + builder; Packager manual | Electron Forge + plugin Vite oficial con versiones exactas | Integración oficial de packaging/fuses; el plugin Vite sigue experimental y exige pins y smoke | Media |
| ADR-002 Topología Vite | Config única; configs separadas; abandonar Vite | Renderer, main y preload separados; conservar `build:web` | Evita mezclar DOM con Node | Baja al inicio, alta tras release |
| ADR-003 Origen | `file://`; localhost embebido; custom scheme | `hostfall://app/`, estándar, seguro y streaming | Rutas root, storage estable y audio; no `bypassCSP` | Alta |
| ADR-004 Frontera Electron | Node en renderer; preload genérico; capacidades tipadas | Sandbox, context isolation y preload mínimo | Más código de plataforma, pero una XSS no obtiene filesystem | Muy alta |
| ADR-005 ASAR | Todo loose; todo ASAR; división | Código en ASAR; media/cards/fonts como `extraResources` | Integridad para código y mejores deltas Steam | Media |
| ADR-006 Datos | `localStorage`; instalación; `userData` | Archivos versionados bajo un subdirectorio estable de `userData` | La instalación queda read-only; Cloud sincroniza archivos exactos | Alta |
| ADR-007 Save | Dump store; event log; snapshot | Envelope versionado y checkpoint seguro | Se reanuda el último estado estable, no el frame exacto | Alta |
| ADR-008 Catálogo | Registro global; mutable; snapshot | Catálogo inmutable por boot/partida | Updates de contenido sólo en menú o próximo arranque | Media |
| ADR-009 IDs | Globales; cambiar JSON; IDs runtime | Canonical futuro `packId/deckId/cardId` sin tocar authored JSON | Builtins conservan aliases; external bloqueado hasta completar bridge | Muy alta |
| ADR-010 Validación | Un lint; schema abierto; políticas | Builtin compatible y external estricta | External rechaza handlers, markers, paths remotos y vocabulario privado | Media |
| ADR-011 Lifecycle | Timers siempre; pausa total; checkpoints | Probar throttling y usar checkpoints como garantía | Puede requerir compatibilidad temporal; sleep no depende sólo de timers | Media |
| ADR-012 Steam | Binding nativo inicial; SteamPipe separado | SteamPipe primero; futuro `SteamService` sólo en main/utility | Menos riesgo ABI; el juego funciona sin Steam | Baja |
| ADR-013 Updates | Auto-updater Electron; SteamPipe | SteamPipe como único updater de la build Steam | No Squirrel/autoUpdater en ese canal | Alta |
| ADR-014 Identidad app | Valores ad hoc; identidad fija | Fijar productName, appId, executableName y fuente de versión | Determina rutas, firma, save location y launch option | Alta |

---

# Frontera de seguridad Electron

## BrowserWindow

Producción debe usar:

```text
nodeIntegration: false
nodeIntegrationInWorker: false
contextIsolation: true
sandbox: true
webSecurity: true
allowRunningInsecureContent: false
experimentalFeatures: false
webviewTag: false
```

Además:

- `app.enableSandbox()` antes de `ready`;
- sin `remote`, `webview` o Node globals;
- preload empaquetado como bundle único CommonJS `.cjs`;
- DevTools, reload y force-reload bloqueados en release;
- single-instance lock;
- aceleración de hardware activa salvo fallo reproducible.

## Preload e IPC

Capacidades posibles:

```text
getBootstrap()
readResumeSave()
writeCheckpoint(snapshot)
setFullscreen(enabled)
getWindowState()
openExternalLink("credits")
clearAssetCache()
copyText(text)  // sólo si Clipboard web falla
```

Nunca se expondrán `ipcRenderer`, canales arbitrarios, `fs`, `path`, `shell`, `process`, rutas de
saves/contenido o `openExternal(url)` con una URL recibida.

Cada handler valida payload, tamaño, enum, schema, `senderFrame`, `webContents` y origen exacto.

## Navegación

- `will-navigate`: cancelar toda navegación no interna.
- `setWindowOpenHandler`: devolver siempre `deny`.
- Los créditos usan un ID simbólico que main traduce a una URL HTTPS exacta.
- Bloquear navegación `file://` por drag/drop.
- Denegar downloads y permisos salvo flujo explícito.

## CSP de producción

Punto de partida:

```text
default-src 'none';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' hostfall: data:;
media-src 'self' hostfall:;
font-src 'self' hostfall:;
connect-src 'none';
worker-src 'none';
object-src 'none';
base-uri 'none';
form-action 'none';
frame-ancestors 'none';
```

Desarrollo tiene una CSP separada para HMR.

## Protocolo

Registrar antes de `ready`:

- `standard: true`;
- `secure: true`;
- `stream: true`;
- `codeCache: true` si el pipeline lo soporta;
- `bypassCSP: false`;
- service workers deshabilitados;
- `supportFetchAPI` sólo si aparece un caso interno real.

Hosts previstos:

- `hostfall://app/...` para HTML, JS, CSS y recursos internos;
- `hostfall://content/<packKey>/...` para assets de packs validados.

El handler debe validar host, decodificar una vez, rechazar NUL, `..`, backslashes, rutas UNC,
drive letters, esquemas embebidos y separadores codificados. Sólo resuelve contra roots registrados
por main, comprueba `realpath`, rechaza symlinks/junctions fuera del root, sirve archivos indexados y
asigna MIME y Range explícitos.

## Contenido externo futuro

External podrá contener únicamente JSON declarativo validado e imágenes raster locales permitidas.
Se rechazarán JavaScript, TypeScript, HTML, CSS, SVG, ejecutables, DLL, WASM, URLs remotas,
`customHandler`, `engineSupport`, vocabulario no público, paths fuera del pack y entradas por encima
de límites definidos.

Workshop/local no pueden autodeclararse builtin: el `origin` lo asigna la fuente confiable que
descubrió la carpeta.

---

# Plan por fases

## Fase 0 — Baseline y toolchain determinista

**Dependencias:** ninguna.

**Objetivo:** eliminar ambigüedades de build y fijar ADRs antes de introducir Electron.

**Motivación:** agregar configs Electron sobre la doble autoridad Vite permitiría usar
silenciosamente configuración stale.

**Trabajo:**

- eliminar outputs Vite generados versionados;
- impedir que typecheck emita configs junto al source;
- hacer explícitos `build:web`, tests y gates;
- declarar Node/pnpm y frozen install;
- mantener tooling en `devDependencies`;
- crear CI Windows x64;
- aprobar el postinstall de Electron cuando se agregue;
- fijar ADRs;
- separar los blockers de fingerprints, auditor y provenance.

**Criterios de aceptación:**

- una sola config efectiva por target;
- checkout limpio instalable con lock frozen;
- typecheck, 307 tests, deck lint y Card Studio data check pasan;
- gates rojos actuales corregidos aparte o documentados con owner;
- `build:web` sigue funcional;
- ningún JSON de deck cambia.

**Tests:** typecheck, suite, deck lint, Card Studio checks, dos inventarios de `build:web` y CI limpio.

**Riesgos:** romper tooling al reorganizar tsconfigs o mezclar deuda de assets con Electron.

**Estado final:** beta web intacta con build inequívoco.

## Fase 1 — Renderer offline y release-clean

**Dependencias:** Fase 0.

**Objetivo:** eliminar dependencias de red y separar tooling developer del juego distribuible.

**Trabajo:**

- declarar todas las fuentes locales;
- eliminar Google Fonts y Font Awesome remoto;
- hacer compile-time el gate de Playground/Audio Lab en release;
- auditar recursos HTTP/HTTPS;
- generar inventario runtime inicial.

**Criterios de aceptación:**

- build funcional con red bloqueada;
- cero requests HTTP/HTTPS durante una partida;
- los cuatro decks, fuentes, cards, arte y audio cargan localmente;
- Playground/Audio Lab no están en release, pero siguen funcionando en desarrollo;
- Card Studio y sus servidores/scripts no cambian.

**Tests:** auditor estático, smoke offline y comparación visual multi-resolución.

**Riesgos:** métricas tipográficas distintas o tooling dev eliminado por error.

**Estado final:** beta web completamente offline.

## Fase 2 — Frontera de contenido builtin

**Dependencias:** Fase 1.

**Objetivo:** introducir catálogo y resolver de assets sin cargar mods ni tocar JSON authored.

**Trabajo:**

- extraer tipos sin ciclos runtime;
- crear `BuiltinContentSource` y catálogo inmutable;
- mantener `DECK_REGISTRY` como fachada temporal;
- hacer explícitos defaults y errores de lookup;
- añadir bootstrap previo al store;
- resolver paths authored como refs lógicas;
- añadir `{packKey, packId, origin, revision}` a metadata runtime;
- separar validador candidate/policy del lint global;
- probar política external sólo con fixtures en memoria;
- conservar IDs builtin actuales y registrar el futuro canonical.

**Criterios de aceptación:**

- siguen existiendo los mismos 4 decks y 61 IDs;
- orden, defaults, texto, imágenes, normalización y gameplay no cambian;
- ninguna fuente local/Workshop está registrada;
- el renderer no conoce rutas absolutas;
- fixtures external adversariales se rechazan;
- Card Studio sigue generando la misma proyección y el resolver carga sus URLs;
- JSON authored e image JSON permanecen byte por byte iguales.

**Tests:** snapshot de catálogo, equivalencia, determinismo, resolver, fixtures y todos los gates Card
Studio.

**Riesgos:** ciclos de módulos, cambio de defaults o rotura de IDs bespoke.

**Estado final:** misma beta detrás de una frontera de contenido estable.

## Fase 3 — Vertical Electron segura

**Dependencias:** Fases 1 y 2.

**Objetivo:** ejecutar el juego en un `BrowserWindow` seguro, en desarrollo y empaquetado.

**Trabajo:**

- fijar Electron/Forge exactos;
- configs Vite separadas;
- main ESM y preload CJS sandboxed;
- `BrowserWindow` seguro;
- `hostfall://`, CSP, permisos y navegación;
- abrir créditos por allowlist;
- fuses de seguridad e integridad ASAR;
- logs locales y Error Boundary;
- mantener `build:web`;
- decidir throttling mediante prueba.

**Criterios de aceptación:**

- `forge start` y paquete Windows x64 muestran el juego;
- arranca desde ruta con espacios y sin red;
- `/assets`, `/cards` y `/fonts` resuelven;
- PNG completo, arte recortado y `battlefieldArtFrame` coinciden con web/Card Studio;
- MP3/WAV reproducen y hacen seek;
- WebGL funciona;
- renderer no tiene Node/filesystem/IPC arbitrario;
- CSP, navegación y protocolo pasan pruebas adversariales;
- el web build continúa.

**Tests:** unitarios de resolver/IPC, integración de protocolo, Playwright Electron, auditor de
seguridad y smoke manual de interacción, audio, GPU y Card Studio-to-runtime.

**Riesgos:** Forge Vite experimental, preload mal empaquetado, CSP, Range de audio y drivers.

**Estado final:** ejecutable Electron seguro y offline, todavía sin save desktop.

## Fase 4 — Persistencia y lifecycle

**Dependencias:** Fase 3.

**Objetivo:** settings desktop y un save reanudable por checkpoints seguros.

**Trabajo:**

- fijar identidad y ruta `userData`;
- separar preferences, window state y resume save;
- envelope con format/app/content revision, timestamp, deck keys y `setupTurns`;
- escritura atómica y backup;
- snapshot/restore puros;
- guardar sólo checkpoints seguros;
- añadir Continuar y recuperación;
- migración de preferencias legacy;
- single-instance lock;
- política de close/minimize/focus/suspend y audio;
- excluir Playground de saves/Cloud.

**Criterios de aceptación:**

- preferencias y partida sobreviven al reinicio;
- cerrar durante una animación restaura el checkpoint anterior;
- saves corruptos/versiones desconocidas no crashean ni hacen fallback de deck;
- dos instancias no escriben a la vez;
- window state no se sincroniza;
- web conserva su adapter localStorage.

**Tests:** round-trip, corrupción, backup, migraciones, prohibición de UI fields, continuación
determinista, close durante beats y sleep/resume.

**Riesgos:** snapshot intermedio, reemplazo de archivos en Windows y saves incompatibles.

**Estado final:** aplicación desktop con settings durables y Continuar.

## Fase 5 — Packaging Windows x64 reproducible

**Dependencias:** Fases 3 y 4.

**Objetivo:** producir un directorio final mínimo, auditable y apropiado para SteamPipe.

**Trabajo:**

- staging allowlist desde Vite, decks, Card Studio generated data, audio y fuentes;
- excluir source, tests, dev, tmp, Hunters, exported-png y assets no usados;
- código en ASAR y media/cards/fonts como `extraResources`;
- manifest de paths, tamaños y SHA-256;
- icono, metadata Windows y executable name;
- no Squirrel/autoUpdater;
- comparar builds unsigned y firmar después;
- resolver NOTICE, provenance y SFX pendientes;
- medir tamaño y delta de un asset.

**Criterios de aceptación:**

- sólo contiene allowlist;
- no incluye Card Studio, pero sí todos sus outputs runtime necesarios;
- código/main/preload están en ASAR con integridad;
- cartas y audio grandes están como archivos individuales;
- builds unsigned tienen inventario/hashes reproducibles;
- arranca en Windows limpio sin Node;
- rights/notices están resueltos.

**Tests:** inspección ASAR, allowlist/denylist, hashes, ruta con espacios, firma, offline smoke y delta
de un asset.

**Riesgos:** duplicar el repo, omitir arte recortado, ASAR gigante o provenance incompleta.

**Estado final:** candidato Windows x64 listo para depot.

## Fase 6 — SteamPipe y rama privada

**Dependencias:** Fase 5.

**Objetivo:** distribuir mediante Steam sin Steamworks runtime, Cloud o Workshop.

**Trabajo:**

- templates VDF sin credenciales;
- un depot Windows inicial;
- `ContentRoot` exclusivo del staging;
- launch option x64;
- Preview y rama beta privada;
- excluir `steam_appid.txt`;
- probar install, update, rollback, Offline Mode y overlay;
- documentar path futuro de Auto-Cloud;
- no añadir binding Steamworks.

**Criterios de aceptación:**

- Steam instala sólo el paquete final;
- launch option abre el ejecutable correcto;
- funciona en Offline Mode;
- saves sobreviven update y reinstalación según política;
- cambiar un asset no descarga un pack masivo;
- rollback funciona;
- SDK, credenciales y `steam_appid.txt` no están en depot.

**Tests:** SteamPipe Preview, install/verify/launch, Offline Mode, update/rollback, save, overlay y
multi-monitor.

**Riesgos:** ContentRoot incorrecto, IDs equivocados, SDK filtrado o update destructivo.

**Estado final:** beta privada instalable y actualizable desde Steam.

---

# Deuda que no debe mezclarse

## Necesaria para la migración

- autoridad Vite única;
- offline real;
- gate release de herramientas dev;
- protocolo, CSP, preload e IPC;
- frontera builtin de contenido/assets;
- persistencia/checkpoints;
- staging y ASAR dividido;
- smoke packaged-app y SteamPipe.

## Conveniente durante la migración

- fuente única de versión;
- build tooling en `devDependencies`;
- Error Boundary y logs;
- corregir la semántica de limpiar cache;
- eliminar `.DS_Store` versionados;
- NOTICE/SBOM;
- reducir assets runtime sin borrar authoring.

## Deuda independiente

- 61 fingerprints PNG obsoletos;
- falso positivo `magic`;
- provenance pendiente;
- once sonidos `_NEED_REVIEW`;
- `window.prompt` para coste X;
- precarga que puede marcar éxito tras ocultar errores;
- Three antiguo;
- ausencia general de tests DOM/UI;
- CSS grande y Card Studio acoplado a paths del repo.

## Feature futura

- activar Steam Cloud;
- achievements/stats y binding Steamworks;
- fuentes Local/Workshop;
- UI/publicación/hot reload/dependencias de mods;
- IDs runtime calificados completos;
- Steam Input/gamepad y Steam Deck;
- Linux/SteamOS nativo;
- selección de dispositivo de audio.

---

# Riesgos globales

| Riesgo | Probabilidad | Impacto | Detección | Mitigación | Fase |
| --- | --- | --- | --- | --- | --- |
| Config Vite stale | Alta | Alta | Cambiar `.ts` sin cambio de output | Una autoridad y config explícita | 0 |
| Recursos remotos | Alta | Media | Network log offline | Fuentes locales y egress test | 1 |
| Tooling dev en release | Media | Alta | Query/chunk inspection | Gate compile-time | 1 |
| Colisión de IDs | Alta con mods | Alta | Fixtures repetidos | Canonical calificado; bloquear external | 2/futuro |
| Cambio de determinismo | Media | Alta | Comparación por seed | Catálogo inmutable/defaults explícitos | 2 |
| External invoca handlers | Alta con mods | Alta | Fixtures adversariales | Allowlist pública | 2/futuro |
| RCE por renderer/IPC | Media | Crítico | Security audit | Sandbox, isolation, IPC y fuses | 3 |
| Traversal/junction | Media | Crítico | Corpus malicioso | Índice, realpath y roots main-only | 3 |
| CSP rompe UI | Media | Media | Console/report | Política probada | 3 |
| Audio falla bajo scheme | Media | Alta | canplaythrough/seek | MIME, Length, Range y stream | 3 |
| Throttling rompe beats | Media | Alta | Sleep/minimize | Checkpoints y prueba de policy | 3-4 |
| GPU/WebGL | Media | Media | GPU/VM/context loss | Acceleration y fallback | 3 |
| Save intermedio | Alta sin diseño | Crítico | Cierre durante animaciones | Checkpoint seguro | 4 |
| Save incompatible | Media | Alta | Fuzz/versiones | Envelope, backup y migrations | 4 |
| Dos instancias | Baja | Alta | Lanzar dos procesos | Single-instance lock | 4 |
| Paquete duplica repo | Alta | Alta | Inventario/tamaño | Staging allowlist | 5 |
| Se omite output de Card Studio | Media | Alta | Asset graph y smoke visual | Gate Card Studio-to-runtime | 5 |
| ASAR gigante | Alta | Alta | Delta de una carta | Media individual | 5 |
| Build no reproducible | Media | Alta | Dos builds/hashes | Toolchain exacto | 0/5 |
| Firma/licencias pendientes | Media | Crítico comercial | Audit/SmartScreen | Workstream paralelo | 5 |
| SteamPipe sube root incorrecto | Media | Alta | Preview | ContentRoot aislado | 6 |
| Update destruye save | Baja | Crítico | Update/rollback | Saves fuera de instalación | 6 |
| ABI Steamworks | Alta cuando llegue | Alta | Package smoke | Main-only, rebuild y unpack | Futuro |
| Workshop malicioso | Alta | Crítico | Fuzz/quarantine | Validación local estricta | Futuro |
| Steam Deck sin controles | Alta | Media | Compat review | Steam Input/gamepad separado | Futuro |

---

# Recommended Migration Roadmap

1. Fase 0: limpiar Vite, fijar toolchain, ADRs y baseline.
2. Fase 1: convertir el renderer en una build offline sin tooling developer.
3. Fase 2: introducir catálogo y asset boundary builtin-only.
4. Fase 3: crear el primer paquete Electron seguro con `hostfall://`.
5. Fase 4: implementar preferencias desktop y save por checkpoints.
6. Fase 5: producir staging Windows x64 reproducible y optimizado para SteamPipe.
7. Fase 6: subir mediante Preview y rama privada, sin Steamworks, Cloud o Workshop.
8. Tras estabilizar Steam: activar Auto-Cloud sobre archivos exactos.
9. Proyecto futuro separado: completar IDs calificados, validación external y fuentes Local/Workshop.

## Referencias oficiales

- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron custom protocols](https://www.electronjs.org/docs/latest/api/protocol)
- [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)
- [Electron ASAR](https://www.electronjs.org/docs/latest/tutorial/asar-archives)
- [Electron Forge Vite plugin](https://www.electronforge.io/config/plugins/vite)
- [Steamworks SDK](https://partner.steamgames.com/doc/sdk)
- [SteamPipe](https://partner.steamgames.com/doc/sdk/uploading)
- [Steam Cloud](https://partner.steamgames.com/doc/features/cloud)
- [Steam Workshop implementation](https://partner.steamgames.com/doc/features/workshop/implementation)
- [ISteamUGC](https://partner.steamgames.com/doc/api/ISteamUGC?language=english)
