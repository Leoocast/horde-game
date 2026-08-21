# Plan por fases — historial de Semillas del Destino para la demo

Estado: **Fases 1, 2, 2.5 y 3 completadas; siguiente fase: 4**.

Última actualización: **2026-08-21**.

## Objetivo

Convertir la maqueta **Semillas del Destino** en un historial factual de partidas normales que:

- conserve victorias, derrotas e intentos interrumpidos;
- permita regresar al origen exacto de un Futuro, incluso después de cerrar la aplicación o sufrir
  un corte eléctrico;
- genere para cada partida standard normal una Canon Seed `HF1` autocontenida y haga que **Copiar
  identidad** copie ese código reproducible, no la entropía interna del RNG;
- no permita continuar una partida a mitad durante la demo;
- conserve intacta la infraestructura de resume para activarla en Early Access;
- pueda mostrar, de forma opcional, un breve relato del Cronista si el prototipo demuestra que
  realmente aporta valor.

El historial y el relato son responsabilidades diferentes. El historial es dato de producto; el
relato es una proyección opcional de hechos estructurados. Ninguno debe depender de analizar los
strings de `game.log`.

Este documento ordena el trabajo. No autoriza implementar varias fases en bloque: se empieza por la
Fase 1 y la decisión creativa de esa fase se registra antes de construir el historial.

## Decisiones de producto ya cerradas

### Demo

- **Continuar** no se muestra en el menú de la demo.
- La demo no crea ni restaura checkpoints jugables de resume. El código vigente de resume, backup,
  recuperación y **Continuar** se conserva detrás de una capability de producto para Early Access.
- Salir de una partida no permite retomarla en el punto abandonado.
- Una partida abandonada o cortada por cierre, crash o corte eléctrico conserva un intento
  **interrumpido**. Nunca se registra como derrota.
- Desde el historial, un intento interrumpido puede **reescribir el mismo Futuro**: comienza otra vez
  desde su origen exacto, no desde un checkpoint.
- Tutoriales, la sesión ficticia inicial, `developer`, `devwin`, `devlost`, Playground, Seed Explorer
  y Chaos no escriben historial de producto. Chaos permanece deprecated y no recibe features nuevas.
- La partida normal que nace después del handoff de **Aprender a jugar** sí escribe historial desde
  el momento en que deja de ser tutorial.
- Toda partida standard autogenerada para jugadores nace con una Canon Seed `HF1`. Sólo sus cinco
  caracteres de entropía llegan al RNG; el código público conserva además decks, dificultad y
  Preparación derivada.
- **Copiar identidad** copia el `canonCode` en Preparación, Board, Reescribir, resultado y biblioteca.
  El código cosmético `Futuro NNN·NNN` también se deriva del `canonCode`, no de `game.seed`.
- Una seed libre permanece como opción avanzada/legacy explícita. Puede reescribirse desde el
  historial porque éste guarda su configuración, pero no se presenta como identidad pública
  autocontenida ni se convierte silenciosamente a HF1. Sus superficies de Board/resultado ocultan
  **Copiar identidad**; una herramienta dev puede copiar `rngSeed` bajo otro nombre técnico.

### Historial y relato

- El historial se implementará aunque el relato del Cronista sea rechazado.
- El historial conserva hechos y parámetros; no guarda párrafos localizados ni copia el log.
- El relato sólo usa acontecimientos directos y verificables. No intenta explicar cadenas causales
  complejas ni juzgar por qué perdió el jugador.
- Si no existe un acontecimiento suficientemente claro, la UI muestra únicamente un resumen factual.
- Cambiar de idioma vuelve a renderizar los textos desde claves y parámetros estructurados.

## Definiciones

### Identidad exacta de un Futuro

`Futuro NNN·NNN` es sólo una identidad cosmética y puede colisionar. Antes de este plan, el menú
normal generaba seeds opacas `hostfall-...`; desde la Fase 2.5 la ruta standard autogenerada es
Canon y conserva una ruta avanzada explícita para seeds libres. Por eso el agrupamiento y la
reescritura usan una identidad compuesta:

```ts
type SharedFutureFieldsV1 = Readonly<{
  playerDeckKey: string;
  hostDeckKey: string;
  difficulty: "easy" | "normal" | "hard";
  gameMode: "standard";
  setupTurns: number;
}>;

type CanonFutureIdentityV1 = SharedFutureFieldsV1 & Readonly<{
  seedKind: "canon";
  format: "HF1";
  canonCode: string;
  rngSeed: string;
}>;

type OpaqueFutureIdentityV1 = SharedFutureFieldsV1 & Readonly<{
  seedKind: "opaque";
  rngSeed: string;
  contentRevision: string;
  rulesetVersion: number;
}>;

type FutureIdentityV1 = CanonFutureIdentityV1 | OpaqueFutureIdentityV1;
```

La UI puede seguir mostrando el código compacto, pero nunca lo usa como clave. La Crónica, la
Hueste, la dificultad, el modo y la revisión determinista guardados son los que se vuelven a cargar
al reescribir. `rngSeed` conserva exactamente el string que recibió el engine. En Canon contiene
sólo la entropía y `canonCode` contiene la identidad compartible completa. `seedKind` nunca se
infiere por el patrón del texto: una cadena con forma `HF1-...` escrita en el campo libre sigue
siendo opaca hasta que el jugador activa el importador Canon explícito. Ese importador decodifica el
código, usa su entropía como `rngSeed` y fija decks/dificultad/Preparación. Las seeds opacas conservan
sus campos independientes y no sufren normalización incidental.

En Canon, `canonCode` y su prefijo de formato son la identidad: dos builds certificadas como HF1
compatibles agrupan el mismo Futuro aunque tengan versiones de aplicación distintas. La revisión de
contenido observada se conserva como provenance del intento, no fragmenta el grupo. En opaque, una
revisión diferente de contenido o reglas sí crea otra identidad reproducible. El historial viejo
permanece legible, pero su CTA queda deshabilitado salvo que el registro de compatibilidad certifique
ese origen. No se usa `appVersion` como sustituto de compatibilidad determinista.

### Qué cuenta como intento

Un intento empieza cuando una partida normal queda creada desde **Jugar** o desde **Reescribir este
futuro**. Incluye la Mano inicial y el mulligan: si la aplicación se cierra allí, también debe poder
reencontrarse la seed.

Una única matriz de elegibilidad gobierna el lifecycle:

| Ruta | ¿Crea intento? | Nota |
| --- | --- | --- |
| **Jugar** una partida normal | Sí | Después del `reset` comprometido. |
| Replay desde la biblioteca | Sí | Nuevo `attemptId`, misma identidad y `rngSeed`. |
| **Reescribir** dentro de una partida normal | Sí | Cierra primero el intento anterior. |
| Handoff de Aprender a jugar a una partida normal | Sí | Sólo después de abandonar el session kind del tutorial. |
| Resume de Early Access | No en la demo | En el futuro continuará el mismo `attemptId`; no crea otro. |
| Tutorial, sesión inicial, Playground o Seed Explorer | No | Aunque creen un `GameState`. |
| Chaos o seed técnica | No | Compatibilidad/dev, no producto. |

La integración se invoca explícitamente desde `App` sobre un coordinador puro: no nace dentro de
`GameStore.reset`, un subscriber global ni un efecto basado sólo en `screen === "game"`. Así evita
registrar el estado ficticio de arranque o sesiones que también reutilizan el store.

Estados persistidos:

| Estado | Significado | Acción en la demo |
| --- | --- | --- |
| `active` | Marcador interno de una partida actualmente abierta. Nunca se muestra tras un arranque limpio. | Ninguna. |
| `victory` | El engine confirmó `winner: "player"`. | Reescribir desde el origen. |
| `defeat` | El engine confirmó `winner: "host"`. | Reescribir desde el origen. |
| `interrupted` | El jugador salió sin resultado o una nueva apertura encontró un intento todavía `active`. | Reescribir desde el origen. |

Reglas de cierre:

1. `game.winner` cierra el intento antes del desenlace visual, para que un corte durante la
   constelación, el vidrio o el vórtice no pierda el resultado.
2. Volver al menú, Reescribir o Contemplar otro Futuro sin ganador cierra el intento como
   `interrupted` antes de navegar.
3. En la demo, al arrancar la aplicación, todo `active` perteneciente a una ejecución anterior se
   cierra una sola vez como `interrupted`. El preset de Early Access no aplica esta regla hasta
   enlazar resume e historial.
4. Cerrar dos veces el mismo `attemptId` es un no-op. Un callback viejo nunca puede modificar el
   intento de otra `gameSessionId`.
5. El historial no hace autosave de gameplay. En una salida explícita puede guardar el turno actual;
   tras un corte inesperado basta con mostrar **Sin desenlace** y conservar el origen exacto.

Estado agregado de una Semilla:

- si cualquiera de sus intentos terminó en victoria: **Destino preservado**;
- si no hay victoria pero existe una derrota: **Futuro perdido**;
- si sólo existen intentos interrumpidos: **Historia interrumpida**.

Una interrupción posterior no borra una victoria previa.

## Auditoría del estado actual

| Necesidad | Qué existe | Brecha |
| --- | --- | --- |
| Identidad de Futuro | `MatchOrigin` separa la identidad pública de `GameState.seed`; Setup, Header, Reescribir y resultado usan `canonCode`. | La biblioteca real todavía no consume esta identidad porque sigue siendo maqueta. |
| Canon Seed reproducible | El producto normal y Seed Explorer decodifican HF1 y entregan sólo su entropía a `createInitialGame`. | La reescritura desde historial se conecta en la Fase 6. |
| Reiniciar el mismo origen | `reset` y `DestinyRewriteTransition` ya conservan seed y configuración de la sesión viva. | La pantalla de historial no puede entregar todavía una identidad persistida a `App`. |
| Detectar resultado | `GameState.winner`, `triggerEndGame` y la señal `game.ended`. | Ningún consumidor crea un registro de intento. |
| Observar hitos | `gameplaySignalStream` observa también partidas normales y emite turnos, robos, Oleadas, atacantes, Vida y Archivo. | Es efímero, conserva sólo 256 señales y no cubre aún todos los hitos candidatos. |
| Log | `GameState.log` conserva strings y `GameLog` los clasifica mediante expresiones regulares. | No es un contrato estable ni una fuente aceptable para historial o relato. |
| Resume desktop | `resume-v1`, checkpoints seguros, backup, recuperación e IPC explícito. | Es un snapshot jugable, no historial. En la UI actual **Continuar** puede aparecer deshabilitado. |
| Escritura durable | `DesktopJsonStore` serializa escrituras y usa temporal, `fsync`, rename y `.bak`, con límite de 5 MiB. | Falta una ruta y canales explícitos para historial. |
| Web | Preferencias y progreso guiado tienen adapters `localStorage`. | No existe namespace de historial. |
| Pantalla | `SeedsOfDestinyScreen` ya tiene índice, duelo, intentos y acción de reescritura. | Consume `SEEDS_OF_DESTINY_FIXTURE`; no tiene estado vacío ni estado interrumpido. |

Conclusión: no existe ningún historial parcial que deba migrarse. Sí existen las costuras correctas
para resultado, identidad, observabilidad y persistencia atómica.

## Arquitectura objetivo

### Registro factual

El archivo no replica `GameState`. Conserva registros compactos e independientes del resume:

```ts
type AttemptRecordV1 = Readonly<{
  attemptId: string;
  sequence: number;
  future: FutureIdentityV1;
  appVersion: string;
  observedContentRevision: string;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  status: "active" | "victory" | "defeat" | "interrupted";
  endReason?: "outcome" | "menu" | "rewrite" | "contemplate" | "startup-recovery";
  turnNumber?: number;
  hostTurnNumber?: number;
  finalFacts?: Readonly<{
    playerLife: number;
    hostArchiveRemaining: number;
  }>;
  milestones?: readonly AttemptMilestoneV1[];
}>;
```

`milestones` sólo se habilita si la Fase 1 termina en **Relato aprobado** o **Hitos factuales**. El
historial básico no depende de ese campo.
`sequence` es monotónica y única dentro del envelope: resuelve empates o retrocesos del reloj y
mantiene estable el ordinal de cada reescritura.

### Persistencia

- Desktop: `profile/seed-history-v1.json` y `profile/seed-history-v1.json.bak`.
- Web: `hostfall-history:v1` en `localStorage`.
- Desktop usa canales preload/main explícitos de lectura, escritura y borrado; nunca recibe rutas ni
  un IPC genérico.
- `seed-history-v1.json` es candidato futuro a Steam Auto-Cloud, igual que preferencias y resume.
- El parser estructural valida versión, límites, invariantes cruzados, fechas, enums, secuencias e
  IDs únicos sin consultar el catálogo actual. Un resolver separado decide si una identidad todavía
  puede reescribirse y valida la coherencia interna sólo cuando `seedKind === "canon"`.
- `victory`/`defeat` exigen cierre por resultado, turno y hechos finales; `active` no admite datos de
  cierre; `interrupted` no admite `outcome`; turnos y conteos respetan rangos; y las fechas cumplen
  `startedAt <= updatedAt <= endedAt` cuando existe.
- `seedKind: "canon"` exige formato soportado y que `decodeCanonSeed(canonCode)` coincida con
  `rngSeed`, `playerDeckKey`, `hostDeckKey`, `difficulty`, `setupTurns` y `gameMode`; esos campos
  redundantes nunca pueden contradecir el código. `opaque` no admite formato/`canonCode` y nunca se
  decodifica sólo porque su texto coincida con el patrón HF1. `observedContentRevision` es
  provenance, no parte de la clave Canon.
- Un primario inválido usa el backup; nunca interpreta silenciosamente otra versión. Una entrada
  aislada inválida no elimina sus hermanas: se intenta el backup completo y, si tampoco sirve, los
  registros rescatables quedan en lectura degradada hasta una reparación explícita.
- Recuperar un backup válido debe promoverlo sin copiar antes el primario corrupto sobre `.bak`.
  `DesktopJsonStore` necesita una variante de promoción/reparación con pruebas de cortes entre cada
  rename; una escritura normal inmediata no es recuperación segura.
- `HistoryService` es la única autoridad read-modify-write. Hidrata una vez, mantiene una cola de
  mutaciones sobre el último snapshot **lógico** —incluido un estado dirty— y expone
  begin/close/recover idempotentes. `logicalRevision` y `durableRevision` permanecen separadas; cada
  retry escribe el snapshot lógico más reciente, que ya incorpora todas las mutaciones previas. No
  basta con serializar payloads completos ya calculados por varios callbacks.
- La inicialización y recuperación terminan antes de habilitar un launch. StrictMode, HMR o un
  segundo `initialize()` dentro de la misma ejecución son no-op y nunca interrumpen su propio intento.
- Una revisión de contenido antigua no invalida todo el archivo: el registro permanece legible y
  sólo se habilita su replay si la revisión determinista es compatible y sus decks se resuelven.
- La demo no aplica borrado automático por antigüedad. El límite físico de 5 MiB permanece como
  guarda; al alcanzarlo se detienen nuevas escrituras, se conserva todo lo anterior y se muestra
  **Historial lleno** con una acción confirmada para restablecerlo. Una política de archivado
  pertenece a Early Access.
- Un error de escritura nunca bloquea indefinidamente **Jugar**, pero tampoco se oculta: el servicio
  conserva estado dirty, reintenta en background y en la siguiente mutación, y la UI explica cuando
  el intento o resultado todavía no tiene garantía durable. Main sólo drena escrituras ya encoladas;
  no se promete que un cierre pueda rescatar un payload que el renderer nunca logró entregar.
- En web existe un solo writer de historial. Otra pestaña entra en lectura y nunca recupera como
  interrumpido el intento de una pestaña viva; el adapter coordina ownership y revisiones mediante
  un mecanismo de bloqueo/notificación disponible, con fallback seguro sin escrituras.

### Capabilities de producto

Una política central, separada de `import.meta.env.DEV`, expresa al menos:

```ts
const DEMO_CAPABILITIES = {
  resumeMatches: false,
  matchHistory: true,
} as const;

const RESUME_REGRESSION_CAPABILITIES = {
  resumeMatches: true,
  matchHistory: false,
} as const;
```

El build selecciona un preset tipado mediante un canal de producto explícito, nunca desde
`import.meta.env.DEV`. `resumeMatches: false` impide leer, escribir, borrar y ofrecer resume. No
elimina sus módulos ni sus pruebas. El preset de regresión se ejecuta en tests para impedir que ese
camino se pudra mientras permanece oculto, pero no habilita historial a la vez. El futuro preset de
Early Access con ambas capabilities en `true` sólo puede existir después de vincular resume con
`attemptId`; no se promete como parte de la demo.

## Plan de implementación

Tamaño relativo: validar el relato es un trabajo **pequeño**; la conexión player-facing de Canon
Seed es **mediana**; y la solución factual durable completa es **media-alta**, no por redactar textos
sino por cerrar correctamente lifecycle, corrupción, backup, concurrencia y reescritura exacta. Las
Fases 1 y 2 son pequeñas; 2.5 y 3 son medianas; 4 es grande; 5 y 6 son medianas-grandes; 7 es pequeña
o mediana y opcional; 8 es mediana. Esta clasificación sirve para controlar alcance, no es una
promesa de calendario.

| Fase | Entrega verificable | Gate manual del usuario |
| --- | --- | --- |
| 0 | Auditoría y contrato | No |
| 1 | Muestra ES/EN del relato sobre fixtures | Sí: elegir una de tres salidas creativas |
| 2 | Demo sin resume; camino oculto cubierto por un preset de regresión | No |
| 2.5 | Canon Seed generada, importable y copiada por el producto real | No |
| 3 | Modelo e invariantes del historial | No |
| 4 | Persistencia, recuperación y corrupción | No |
| 5 | Grabación completa del lifecycle | No |
| 6 | Biblioteca factual y replay exacto | No |
| 7 | Relato/hitos opcionales y QA integrado | Sí: copia/importación Canon, cierre forzado y lectura visual |
| 8 | Gates de release y documentación | No |

### Fase 0 — Auditoría y contrato

Estado: **completada en este documento**.

- Separar resume, historial y relato.
- Fijar identidad compuesta, estados del intento y semántica de un corte inesperado.
- Confirmar que HF1 ya existe pero no está conectado al launcher ni a **Copiar identidad**.
- Confirmar que no existe historial previo que migrar.
- Identificar las costuras vigentes de resultado, señales y persistencia.

**Cierre:** este documento, `seeds_of_destiny.md` y `CLAUDE.md` expresan la misma política de demo.

### Fase 1 — Prototipo aislado del relato

Estado: **completada y aprobada por el usuario el 2026-08-21**.

Entrega:

- `src/history/attemptNarrative.ts` contiene el vocabulario cerrado de ocho hitos, selección pura
  independiente del idioma, templates ES/EN, límites y fallback dentro del mundo.
- `tests/fixtures/attemptNarrativeFixtures.js` cubre los cuatro enfrentamientos builtin con
  victorias, derrotas e interrupciones.
- [`seeds_of_destiny_narrative_samples.md`](seeds_of_destiny_narrative_samples.md) es el artefacto
  legible generado por las mismas fixtures que ejercitan los tests.
- `tests/attemptNarrative.test.js` fija determinismo, vocabulario, límites, fallback, seguridad ante
  hitos desconocidos, paridad factual ES/EN y sincronía del artefacto.

Este prototipo sigue sin conectarse al runtime. No lee `game.log` ni toca `GameState`, Zustand,
persistencia, Electron o la maqueta.

Iteración de lectura del 2026-08-21:

- resultado y turno permanecen como metadatos del historial y no se repiten en el relato;
- se retiró «registrado» y el tono de reporte técnico de todas las plantillas narrativas;
- el cierre victorioso identifica su fuente, pero omite cantidad descartada y turno repetido;
- Reserva no basta para fabricar un acontecimiento: si es el único dato disponible, el párrafo dice
  que el Futuro no dejó un momento para la Crónica sin exponer el dato técnico.
- El vocabulario narrativo habla de **Ecos**, nunca de cartas ni de datos «generados» o
  «registrados».

No toca `GameState`, Zustand, persistencia, Electron ni la pantalla runtime.

- Definir un `AttemptFacts` mínimo y una lista cerrada de 8–12 hitos directos:
  - resultado y turno;
  - Campo al comenzar la primera Oleada;
  - mayor ataque sin defensor;
  - mayor pérdida directa de Vida;
  - efecto de un Eco sobre varios objetivos;
  - Archivo de la Hueste reducido a un umbral significativo;
  - Reserva sin usar al perder;
  - fuente directa del cierre victorioso.
- Implementar un resumidor puro y determinista que elija como máximo un párrafo y dos marcas.
- Prohibir inferencias como «salvó», «causó la derrota» o «llegó demasiado tarde» salvo que el hecho
  correspondiente sea explícito en la entrada.
- Abstenerse de generar un párrafo cuando no haya un acontecimiento directo con valor narrativo; el
  resultado y turno factual permanecen disponibles fuera del relato.
- Crear fixtures variados de ambos decks: victorias, derrotas, partidas ordinarias e interrupciones.
- Generar un artefacto legible con todos los resultados ES/EN para revisión, además de las assertions.

Verificación automática:

- mismo input produce exactamente el mismo resultado;
- ninguna salida inventa nombres, cantidades o causalidad;
- límite de extensión respetado;
- fallback siempre disponible;
- cambio de idioma no cambia la selección factual;
- un hito desconocido se ignora de forma segura.

**Validación del usuario necesaria:** leer el conjunto de ejemplos en español y decidir una de tres
salidas:

1. **Relato aprobado:** se conservan párrafo y marcas.
2. **Hitos factuales:** se conservan marcas estructuradas como bullets, sin párrafo ni causalidad.
3. **Descartado:** no se guardan hitos; el historial muestra sólo resultado, fecha, turno y estado
   final disponibles.

La decisión y los hitos aceptados se registran aquí antes de iniciar la Fase 2.

**Decisión registrada:** **Relato aprobado** como primera versión. Se conservan párrafo y hasta dos
marcas con el tono y vocabulario fijados arriba; su integración runtime sigue perteneciendo a la
Fase 7.

### Fase 2 — Política de sesión de la demo

Estado: **completada el 2026-08-21**.

Entrega:

- `src/product/productCapabilities.ts` fija `DEMO_CAPABILITIES` como preset activo y conserva
  `EARLY_ACCESS_RESUME_REGRESSION_CAPABILITIES` con historial todavía apagado.
- `src/persistence/resumeRuntime.ts` es la única frontera usada por `App`: con resume apagado,
  `load`, `clear` y `startCheckpointing` son operaciones nulas que no alcanzan el bridge.
- `App` enruta Jugar, volver al menú, contemplar, handoff del tutorial, carga y checkpoints por esa
  frontera. Ya no importa directamente ninguna operación mutable de resume.
- `StartMenu` exige `resumeEnabled` para renderizar Continuar, la recuperación o el descarte de un
  save corrupto. La demo usa `false`; el preset de regresión conserva restore y checkpointing.
- `tests/productCapabilities.test.js` prueba ambos presets con operaciones espía y protege el wiring
  estático del menú y `App`.

- Añadir los presets tipados de producto y seleccionar `DEMO_CAPABILITIES` en la build de la demo.
- No iniciar `loadDesktopResume` ni `startDesktopResumeCheckpointing` cuando esté apagada.
- No renderizar **Continuar**, **Continuar partida recuperada** ni la acción de save corrupto en ese
  producto.
- Ignorar, pero no borrar, un `resume-v1` que ya exista mientras la capability esté apagada.
- Gatear también cada llamada vigente a `deleteDesktopResume`: Jugar, volver al menú, contemplar,
  resultado y cualquier otra ruta futura. La demo no muta ese archivo de ninguna forma.
- Conservar sin recortes `resumeService`, `resumeSave`, checkpoints, IPC y recuperación.
- Probar las dos configuraciones coherentes: demo oculta y no muta un resume sembrado en ninguna
  ruta; el preset de regresión sin historial todavía muestra y restaura el comportamiento actual.

**Cierre:** ninguna ruta de la demo permite continuar a mitad, y las pruebas prueban que reactivar la
capability recupera el comportamiento actual.

### Fase 2.5 — Canon Seed player-facing y reproducible

Estado: **completada el 2026-08-21**.

Implementación: `src/content/MatchOrigin.ts` conserva el origen fuera de `GameState`; Preparación
genera e importa HF1, mientras la seed libre queda como ruta opaque separada. `App` propaga el mismo
origen al tablero, reescritura, desenlace y handoff del tutorial; este último carga siempre la
Primera Canon Seed aprobada `HF1-ELA-GRV-082-QC5`. `CanonSeed.ts` contiene un
registro de compatibilidad determinista independiente de la revisión del catálogo. Los golden
vectors de `tests/canonSeed.test.js` fijan identidad, orden completo de Crónica/Hueste y estado RNG;
`tests/matchOrigin.test.js` cierra generación/importación, incompatibilidad, opacidad y superficies
de copia.

Esta fase es bloqueante para el historial: define cuál es la identidad pública que se persiste y se
copia. No convierte una trayectoria jugada en replay; reproduce el origen exacto y el mismo stream
RNG, dejando mulligan y decisiones al nuevo intento.

- Crear un `MatchOrigin` fuera de `GameState` que conserve `seedKind`, `rngSeed`, `canonCode` cuando
  aplique, decks calificados, dificultad, Preparación, modo y revisiones deterministas.
- Sustituir la generación standard `hostfall-...` por cinco caracteres de entropía `A-Z0-9` y
  construir el `canonCode` con `encodeCanonSeed` usando los decks y dificultad seleccionados.
- Mantener la entropía al cambiar decks o dificultad y volver a codificar HF1; así cambia la
  identidad pública/configuración sin cambiar inadvertidamente el orden base alimentado al RNG.
- Entregar únicamente `decodeCanonSeed(canonCode).entropy` a `reset`/`createInitialGame`. El string
  HF1 completo nunca se usa como seed de `hashSeed`.
- Añadir una acción explícita **Usar Canon Seed**. Al importar, decodifica y aplica Crónica, Hueste,
  dificultad, Preparación y modo antes de habilitar **Jugar**. Un código inválido, incompatible o con
  decks ausentes muestra error y no sustituye opciones silenciosamente.
- Conservar la seed libre como modo avanzado/legacy separado. Escribir un texto con forma HF1 en ese
  campo no activa el importador ni cambia su semántica opaca.
- Hacer que Setup, Header, modal de Reescribir y victoria/derrota reciban `MatchOrigin`: para Canon,
  **Copiar identidad** escribe `canonCode`; `game.seed`/`rngSeed` no se expone como identidad pública.
- En una sesión opaque, ocultar **Copiar identidad** y explicar en el modo avanzado que esa seed no
  es compartible como Canon. Sólo Developer Mode puede ofrecer **Copiar seed interna** como acción
  técnica claramente distinta.
- Derivar `Futuro NNN·NNN` y su firma visual desde `canonCode` en sesiones Canon. Rewrite conserva el
  mismo `MatchOrigin`; Contemplate y el handoff normal del tutorial generan una identidad nueva.
- Añadir un registro de compatibilidad HF1 independiente de `package.json`/`contentCatalog.revision`.
  Cualquier cambio incompatible de decks, reglas o consumo de RNG exige HF2; HF1 se rechaza si la
  build ya no puede reproducirlo, nunca se reinterpreta con el contenido vigente.
- Añadir golden vectors fijados a mano: HF1 conocida → identidad, orden exacto de Crónica/Hueste y
  `currentRandomState`. No basta con comparar dos caminos que usan el mismo código actual.

Terminología de producto: toda HF1 válida es una **Canon Seed** reproducible. Sólo un código incluido
en el catálogo bundled de Hostfall puede mostrar el sello **Oficial**; una partida aleatoria del
jugador no se vuelve oficial sólo por haber sido generada por el juego.

**Cierre:** pruebas demuestran generación/importación round-trip, paridad del golden state, cambio
de configuración por código, rechazo incompatible, HF1 opaca no inferida, Rewrite estable, controles
públicos ausentes en opaque y que todas las superficies Canon copian el mismo `canonCode`, nunca
`game.seed`.

### Fase 3 — Dominio puro del historial

Estado: **completada el 2026-08-21**.

Implementación: `src/history/historyTypes.ts` fija el envelope v1, las identidades y el vocabulario
versionado de hitos; `historyParser.ts` valida estructura e invariantes sin consultar contenido;
`historyFuture.ts` separa compatibilidad determinista y resolución; `historyDomain.ts` implementa
mutaciones, secuencias, claves, agrupación y estados agregados; y `historyEligibility.ts` conserva
una única matriz explícita. `OPAQUE_MATCH_RULESET_VERSION` es el gate compartido para seeds libres:
cualquier cambio de reglas o consumo RNG exige incrementarlo, mientras los cambios de contenido se
separan mediante `contentRevision`.

- Crear `FutureIdentityV1`, `AttemptRecordV1`, `HistoryEnvelopeV1` y parsers sin dependencia de UI.
- Derivar una clave interna estable desde toda la identidad, nunca desde `Futuro NNN·NNN`.
- Implementar inicio, cierre idempotente y actualización opcional de metadatos durante una salida
  explícita, sin convertirlo en autosave por turno.
- Asignar `sequence` en la misma mutación serializada; ordenar Futuros por actividad e intentos por
  esa secuencia, nunca sólo por timestamp.
- Derivar el estado agregado preservado/perdido/interrumpido.
- Aplicar la matriz de elegibilidad mediante política explícita, no por nombres de cartas.
- Mantener separadas validación estructural, compatibilidad determinista y resolución de decks.
- En Canon, derivar la clave del `canonCode` normalizado y su formato compatible; app version y
  `observedContentRevision` no la fragmentan. En seeds libres, usar un registro versionado explícito
  de contenido/reglas. Cambios deterministas obligan a incrementar esa revisión mediante un gate
  documental/testeado; no puede quedar como una constante olvidada.
- Validar `seedKind` como dato de origen: una HF1 opaca y una Canon explícita nunca se agrupan ni se
  convierten entre sí por parecerse como texto.

**Cierre:** pruebas puras cubren colisiones del código cosmético, opaque con configuraciones o
revisiones distintas, la misma HF1 agrupada entre builds compatibles, HF1 opaca frente a Canon
explícita, `rngSeed` conservada byte a byte, empate de timestamps, victoria seguida de interrupción,
invariantes cruzados, cierres duplicados y callbacks de sesiones viejas.

El cierre vive en `tests/historyDomain.test.js`. Esta fase no conecta UI ni escribe archivos; esos
límites pertenecen respectivamente a las Fases 6 y 4.

### Fase 4 — Persistencia independiente

- Añadir adapter web y servicio desktop para `history-v1`.
- Extender `DesktopDataPaths`, preload, bridge y handlers main con canales concretos.
- Reutilizar `DesktopJsonStore` para escritura atómica, tamaño y flush, y extenderlo con promoción
  segura de backup que no rote un primario corrupto encima de la única copia válida.
- Recuperar backup válido y ofrecer un estado vacío seguro sólo si no existe archivo.
- Si primario y backup están corruptos, congelar escrituras y presentar estado **Historial dañado**;
  nunca tratarlo como vacío ni sobrescribirlo al comenzar la siguiente partida.
- Mantener historial separado de `preferences-v1` y `resume-v1`.
- Añadir una operación explícita y confirmada para restablecer historial dañado o lleno; en desktop
  conserva primero una copia de diagnóstico recuperable y en web preserva el payload corrupto bajo
  un namespace de cuarentena cuando la cuota lo permita. Si `localStorage` lleno impide duplicarlo,
  el reset exige una segunda confirmación que explique que no habrá copia recuperable.
- Coordinar una sola pestaña web escritora; una segunda pestaña es read-only y no produce lost
  updates ni recovery falso.

**Cierre:** round-trip web/desktop, promoción de backup con fallas inyectadas, corrupción doble,
cuarentena/reset, límite, dos adapters web, hydrate lento, mutaciones concurrentes e IDs duplicados
quedan cubiertos automáticamente.

### Fase 5 — Grabador del ciclo de vida

- Extraer un `MatchLaunchSpec` común y un coordinador puro de lifecycle con reloj, persistencia,
  sesión, `MatchOrigin` y callbacks inyectados; `App` queda como wiring fino. No se unifican las
  presentaciones: Jugar usa EncounterTransition; history replay, Rewrite y Contemplate usan el
  vórtice, aunque la última sólo cierra y navega sin crear otra partida.
- Extender `DestinyRewriteTransition` con un estado cubierto/hold y release explícito. Tras cerrar el
  intento anterior, ejecuta el reset, confirma el nuevo `active` o agota su timeout y sólo entonces
  revela. Movimiento reducido conserva la misma barrera aunque use fundido.
- Crear el intento `active` inmediatamente después del `reset` comprometido y esperar la escritura
  durable antes de revelar el Board. Si falla o excede un límite breve, la partida continúa en modo
  degradado con aviso explícito y sin prometer recuperación ante un corte.
- No actualizarlo tras cada acción ni turno. Una salida explícita puede capturar el turno; un crash
  conserva **Sin desenlace**.
- Un recorder scoped a `{attemptId, gameSessionId}` observa síncronamente la transición comprometida
  `game.ended`, captura el estado final inmutable y marca un gate de outcome como pending antes de que
  React presente el ganador. `Board.outcomeOutroReady` espera ese gate o su timeout degradado; no se
  depende de un `useEffect` posterior ni se altera el commit del engine.
- Cerrar como `interrupted` y esperar el mismo settle en salida, reescritura o contemplación antes de
  navegar; un fallo explícito se comunica y conserva el snapshot dirty para retry.
- Con resume apagado, recuperar todo `active` viejo como una única interrupción en el siguiente
  arranque. El preset Early Access no ejecuta esta conversión hasta que una fase futura enlace
  resume e `attemptId`.
- Empezar un nuevo `attemptId` sólo cuando el reset de una reescritura se comprometió; nunca al
  primer clic ni antes de que el vórtice cubra la escena.

**Cierre:** la máquina pura prueba toda la matriz de launches y exclusiones, doble clic, begin/close
sin `await`, fallo/timeout de begin seguido por close sobre el snapshot lógico dirty, dos inicios,
victoria natural, derrota, `triggerEndGame`, menú, rewrite, contemplate, hold/release del vórtice,
movimiento reducido, hydrate lento, doble inicialización, callbacks viejos, crash entre turnos,
reapertura repetida y corte después de `winner` pero antes del outro. No requiere montar React.

### Fase 6 — Biblioteca real y reescritura

- Sustituir `SEEDS_OF_DESTINY_FIXTURE` por el snapshot del historial persistido.
- Implementar estado vacío y el tercer estado visual **Historia interrumpida**.
- Mantener cada fila de intento como disclosure accesible y añadir el chevrón visible ya aprobado.
- Mostrar resultado, turno estable y hechos finales; esta fase es deliberadamente factual.
- Resolver índices mayores de cinco con una etiqueta numérica, no repetir «Quinta reescritura».
- Si dos identidades incompatibles comparten `Futuro NNN·NNN`, mostrarlas como entradas separadas con
  configuración/revisión suficiente para entender la colisión; nunca fusionar sus resultados.
- En cada entrada Canon, **Copiar identidad** copia `canonCode`. Una entrada opaque oculta ese control
  y explica que sólo puede reescribirse localmente; Developer Mode puede exponer por separado la seed
  interna.
- Conectar el CTA al `MatchLaunchSpec` compartido: resuelve `seedKind`, `rngSeed`, decks, dificultad,
  modo, Preparación y revisiones guardadas, crea un intento y ejecuta el handoff de vórtice completo.
- Si una identidad ya no puede resolverse con el contenido instalado, conservar el registro pero
  deshabilitar la reescritura con explicación; nunca sustituir decks silenciosamente.
- Ajustar el copy de salida: no promete Continuar y aclara que el Futuro quedará registrado para
  reescribirlo desde su origen.
- Presentar estados de carga, recuperación, persistencia degradada, historial lleno e historial
  dañado. Los dos últimos ofrecen el reset confirmado y recuperable definido en la Fase 4.
- El fixture puede sobrevivir únicamente como dato de tests o laboratorio dev; no entra al producto.

**Cierre:** un view-model puro cubre vacío, tres estados, varias reescrituras, colisiones de código,
identidad incompatible y payload exacto de replay; los guards UI vigentes cubren el wiring estático.
El runner actual no monta React: foco, teclado y layout permanecen en el QA visual final, sin añadir
jsdom o Testing Library sólo para esta feature.

### Fase 7 — Integración opcional del relato y QA de producto

Si la Fase 1 terminó en **Relato aprobado**:

- extender los drafts/proyectores semánticos con fuente, targets y el snapshot mínimo de cada hito
  aprobado; nunca leer oportunistamente `game.log` ni un estado posterior desde el listener;
- conectar únicamente esos hitos al grabador;
- renderizar las claves localizadas en la página real;
- conservar fallback factual para intentos viejos o sin hitos.

Si terminó en **Hitos factuales**, hace la misma instrumentación pero renderiza sólo bullets
estructurados. Si terminó en **Descartado**, no añade señales ni narrativa y no bloquea el historial.

Los escenarios de victoria, derrota, salida explícita, deduplicación y replay exacto son gates
automáticos de las fases anteriores; no se delegan al usuario.

**Validación del usuario necesaria, en la aplicación desktop:**

1. copiar una Canon Seed desde la partida, importarla en Preparación y confirmar visualmente que
   recupera Crónica, Hueste, dificultad y la misma Mano inicial;
2. después de que el Board haya abierto sin aviso de persistencia degradada, cerrar a la fuerza,
   abrir de nuevo y confirmar la integración real con el lifecycle de Windows: aparece como
   interrumpida y puede reescribirse desde el origen;
3. aprobar la lectura visual final —estado vacío, tres estados, disclosure/chevrón y foco— en
   1024×640; si el relato fue aprobado, confirmar también su tono en contexto.

### Fase 8 — Hardening de demo y documentación

- Ejecutar tipos, suite completa, `build:web`, `audit:offline`, `electron:package`,
  `electron:verify` y `electron:smoke`, en ese orden.
- Verificar que el renderer release conserva historial pero no herramientas dev ni fixtures falsos.
- Añadir `seed-history-v1.json` a la documentación de datos Cloud-worthy y al inventario de backups.
- Documentar el launcher Canon player-facing, el registro de compatibilidad HF1 y sus golden vectors.
- Documentar que el código de resume permanece cubierto, pero vincular `resume-v2` con `attemptId` y
  decidir el recovery de una partida reanudable son trabajo explícito de Early Access.
- Actualizar `CLAUDE.md`, `docs/README.md`, `docs/electron/persistence.md` y este tracking con el estado
  real, sin marcar fases cerradas antes de su verificación.

**Cierre:** demo sin Continuar, historial durable y reescritura exacta pasan todos los gates de
release; cualquier narrativa permanece opcional y factual.

## Fuera del alcance de la demo

- Continuar una partida desde un checkpoint.
- Convertir un intento interrumpido en una partida reanudable.
- Vincular un futuro `resume-v2` con `attemptId` o decidir el recovery de Early Access.
- Explicaciones estratégicas o análisis contrafactual de jugadas.
- Uso de LLM, red o servicios remotos para redactar resúmenes.
- Importación/exportación del historial completo, compartir resultados, filtros avanzados o búsqueda.
- Catálogo curado y sello **Oficial** para Canon Seeds; copiar/importar códigos HF1 comunitarios sí
  forma parte de la demo.
- Archivado, favoritos, borrado por Semilla y política definitiva de retención.
- Reinterpretar seeds antiguas con contenido incompatible.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Un apagón se registra como derrota | `active` sólo puede recuperarse como `interrupted`; derrota exige `winner: "host"`. |
| Resultado perdido durante el outro | Cerrar el intento en el commit de `winner`, antes de la presentación. |
| Duplicados al reabrir | `attemptId`, cierre idempotente y recovery transaccional. |
| El mismo código compacto agrupa Futuros distintos | Clave compuesta con seed y configuración completa. |
| Copiar `game.seed` no reproduce la configuración | Las sesiones standard copian `canonCode`; sólo `rngSeed` llega al engine. |
| Pegar HF1 cambia el shuffle | Importador explícito decodifica y entrega únicamente la entropía al RNG. |
| Una revisión nueva reescribe otro origen | Canon exige formato compatible; opaque incluye revisiones. La incompatibilidad conserva lectura y bloquea replay. |
| Recuperar `.bak` destruye la copia válida | Promoción especial que nunca rota un primario corrupto sobre el backup. |
| Dos callbacks pierden una mutación | Una autoridad hidratada serializa funciones de mutación, no snapshots rivales. |
| Dos pestañas se pisan | Un solo writer web; las demás permanecen en lectura y no ejecutan recovery. |
| El relato inventa causalidad | Whitelist de hitos directos, templates y fallback factual. |
| El historial rompe determinismo | Vive fuera del engine; fechas y persistencia no participan en reglas ni RNG. |
| Ocultar Continuar pudre su código | Tests ejecutan también la capability de Early Access. |
| Un archivo creciente invade preferencias o resume | Archivo propio, campos acotados, límite durable y reset explícito sin pruning silencioso. |

## Orden obligatorio

```text
Prototipo de relato
  → decisión del usuario
  → política demo sin Continuar
  → generación e importación de Canon Seed
  → dominio factual
  → persistencia
  → grabador de intentos
  → biblioteca y reescritura
  → relato opcional
  → hardening de demo
```

No se empieza la implementación del historial antes de registrar la decisión de la Fase 1, pero un
rechazo del relato nunca cancela ni rediseña las fases factuales.
