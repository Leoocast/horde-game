# Plan de implementación — Seed Explorer interno (MVP barato)

Estado: **implementación en curso; Fases 0–3.5 cerradas, Fase 4 pendiente**.

Última actualización: **2026-08-18**.

Referencia visual aprobada: [`dev/mockups/ui/seed-explorer.html`](../../dev/mockups/ui/seed-explorer.html).

## Resultado buscado

Construir una pantalla dev independiente que enumere muchas seeds, descarte aperturas claramente
indeseables y entregue 10–20 candidatas para playtest humano en el Board real.

El MVP no intenta jugar Hostfall ni decidir objetivamente si una partida es divertida. Usa datos
estructurales reales del futuro —Mano, mulligan, próximas cartas, Fuentes, curva y orden potencial
de la Hueste— para encontrar candidatos compatibles con un perfil como **Primer acercamiento**.

La decisión central es una búsqueda en dos niveles:

```text
Pools de cartas preparados una vez
  → shuffle compacto de muchas seeds con el RNG real
  → métricas y score aproximados
  → top-K acotado
  → reconstrucción exacta de finalistas con createInitialGame
  → inspección y playtest en el Board real
```

Esto hace fit con la arquitectura vigente sin refactorizar el engine completo.

## Conclusión de la auditoría

| Necesidad | Base actual | Decisión para el MVP |
| --- | --- | --- |
| RNG determinista | `src/engine/RNG.ts`: `hashSeed`, `nextRandom`, `shuffleWithState`. | Reutilizar exactamente esas funciones. |
| Orden inicial | `src/engine/GameState.ts::createInitialGame` baraja primero Cronista y después Hueste usando un único stream de RNG. | Extraer una costura pequeña y compartida para que juego y analyzer no dupliquen ese orden. |
| Mano real | `createInitialGame` roba siete cartas. | El análisis masivo proyecta la Mano; los finalistas se verifican contra el estado real. |
| Mulligan | `mulliganOpeningHand` devuelve toda la Mano, vuelve a barajar con el RNG restante y roba una carta menos. | Compartir/probar la proyección barata y verificarla otra vez para finalistas. |
| Preparación | `endPlayerTurn`, `startPlayerTurnReady` y `playerDrawForecast`. | Recordar que `N` turnos de Preparación producen `N - 1` robos antes de la primera Hueste. |
| Hueste | `HostRules.ts` y `HostController.ts` resuelven límite de revelados, corte por no-token, Mini Oleada, Oleada y efectos. | El bulk usa ventanas **potenciales**; nunca promete turnos exactos. |
| Tooling dev | `App` ya poda pantallas dev mediante imports condicionados por `import.meta.env.DEV`. | Añadir Seed Explorer como pantalla dev hermana de Playground y Audio Lab, accesible desde el dock dev del home. |
| Ejecución larga | No existen Workers ni un scheduler CPU. La CSP Electron usa `worker-src 'none'` en desarrollo y producción. | Ejecutar lotes cooperativos en el renderer con progreso y cancelación. Un Worker queda fuera del MVP. |
| Solver | Las reglas principales son headless, pero no existe `legalActions(state)`, agente genérico ni replay completo de decisiones. | Mantener `solvability: "unchecked"`. No construir IA ni beam search ahora. |

### Medición orientativa de la auditoría

En una medición local con los decks predeterminados y un mulligan:

- `createInitialGame` completo por seed: alrededor de **3.034 seeds/s**; 500.000 rondarían 165 s;
- pools preparados una vez + shuffles compactos con el RNG real: alrededor de **1,63 M seeds/s**;
- el fast path coincidió con el orden del engine en **1.000/1.000** seeds de la muestra.

Estos números no son un gate de CI y deben repetirse en el runtime real al implementar. Sí muestran
que construir un `GameState` para cada seed sería el enfoque equivocado.

## Alcance del primer corte

El MVP incluye:

1. configuración de Crónica, Hueste y dificultad; Preparación se deriva de la dificultad;
2. enumeración determinista de Canon Seeds `HF1` en modo `standard`;
3. análisis estático barato de Mano, un mulligan, próximos robos y Archivo de la Hueste;
4. perfil versionado **Primer acercamiento**;
5. filtros, ranking estable y top-K acotado;
6. progreso incremental y cancelación;
7. inspección exacta de los finalistas;
8. copiar Canon Seed, identidad completa y resultados como JSON/CSV al portapapeles;
9. favoritos locales dev-only;
10. probar una candidata en el Board real sin contaminar la seed de una partida normal.

Queda fuera:

- solver, IA, greedy agent, beam search o winning certificates;
- simulación completa de partidas;
- afirmar Vida final, duración, comeback real o densidad real de decisiones;
- etiquetar una seed como imposible, ganable o verificada;
- Chaos Mode, que está deprecated;
- CLI, servicio online, dashboard para jugadores o metaprogresión;
- Web Worker o cualquier relajación de la CSP;
- persistir búsquedas dentro de resume, perfil o preferencias del juego.

El menú player-facing **Canon Seeds** no forma parte del Explorer interno. Su codec sí se implementa
desde la Fase 0 para que las candidatas que produce el tooling ya usen el contrato definitivo.

## Contratos

### Canon Seed V1

El código compartible usa siempre bloques de tres caracteres:

```text
HF1-PPP-HHH-XXD-XXX
```

- `HF1`: versión del formato y de las reglas canónicas compatibles;
- `PPP`: código estable del deck del Cronista, por ejemplo `ELA`;
- `HHH`: código estable del deck de la Hueste, por ejemplo `GRV`;
- los cinco caracteres `XX` + `XXX`: entropía alfanumérica de la seed;
- `D`: dificultad en una posición fija.

Ejemplo acordado:

```text
HF1-ELA-GRV-LE2-GPT
```

Se decodifica como:

```text
Cronista:   ELA
Hueste:     GRV
Entropía:   LEGPT
Dificultad: 2 (Normal)
Preparación: 3 turnos, derivada de Normal
```

La entropía usa exactamente cinco caracteres `A-Z`/`0-9`: `36^5 = 60.466.176` órdenes posibles por
enfrentamiento; cada uno puede combinarse con las dificultades habilitadas. El input en minúsculas
se normaliza a mayúsculas. No se permiten espacios, acentos ni símbolos. No hay checksum: un
jugador puede escribir manualmente un código válido y crear otro futuro intencionalmente.

La seed que recibe `hashSeed` es sólo la entropía (`LEGPT` en el ejemplo). El dígito de dificultad
no participa en el shuffle, así que estas identidades conservan el mismo orden de decks:

```text
HF1-ELA-GRV-LE1-GPT  → Fácil
HF1-ELA-GRV-LE2-GPT  → Normal
HF1-ELA-GRV-LE3-GPT  → Difícil
```

La tabla V1 vincula dificultad y Preparación; no existen combinaciones como “Normal con 1 turno”:

| Código | Dificultad | Preparación |
| --- | --- | --- |
| `1` | Fácil | 4 turnos |
| `2` | Normal | 3 turnos |
| `3` | Difícil | 2 turnos |

`3` queda reservado en el formato. La decisión de congelar o deshabilitar Difícil se tomará por
separado; este plan no la ejecuta ni la mezcla con la implementación del Explorer.

Los códigos de deck son IDs de registro, no abreviaturas localizadas. El mismo código se comparte en
todos los idiomas: la UI decodifica `ELA`, `GRV` y `2` y presenta nombres y dificultad mediante i18n.
`SIN`, por ejemplo, no se usa porque dependería del nombre español de Sinsepulcro.

El registro `HF1` ya fijado para los cuatro decks jugables es:

| Código | Bando | Deck calificado |
| --- | --- | --- |
| `ELA` | Cronista | `hostfall.core/pact_of_elarion` |
| `CEC` | Cronista | `hostfall.core/court_of_the_crimson_eclipse` |
| `GRV` | Hueste | `hostfall.core/uprising_of_the_graveless` |
| `VRK` | Hueste | `hostfall.core/legion_of_varka` |

`HF1` fija también la interpretación de sus códigos de deck, dificultad y reglas deterministas. Una
revisión incompatible de contenido o reglas debe introducir otro prefijo; no puede cambiar
silenciosamente el futuro producido por un código `HF1` ya publicado.

### Identidad resuelta de un futuro

El codec transforma el código en una identidad completa para el engine:

```ts
type SeedFutureIdentity = Readonly<{
  canonCode: string;
  format: "HF1";
  entropy: string;
  playerDeckKey: string;
  hostDeckKey: string;
  difficulty: DifficultyMode;
  /** Derivado de difficulty; nunca se serializa como una elección independiente. */
  preparationTurns: number;
  gameMode: "standard";
  contentRevision: string;
  rulesetVersion: 1;
}>;
```

Reglas del contrato:

- `canonCode` se normaliza a mayúsculas y vuelve a serializarse en su única forma canónica;
- `entropy` contiene los cinco caracteres que alimentan `hashSeed`;
- se resuelven las claves calificadas de los decks, no sus nombres visibles;
- `preparationTurns` sale únicamente de la tabla de dificultad V1;
- `contentRevision` usa `contentCatalog.revision` para distinguir cambios de contenido;
- `rulesetVersion` se incrementa cuando cambia una regla determinista que altera el futuro;
- `futureCodeFromSeed` es sólo identidad cosmética y nunca sustituye la seed real;
- una trayectoria jugada requeriría además mulligan y decisiones; no forma parte de esta identidad.

Los seeds técnicos `developer`, `devlost` y `devwin` no caben en la entropía de cinco caracteres y
nunca son Canon Seeds. Siguen disponibles únicamente por sus flujos dev actuales.

### Canon, comunidad y oficialidad

**Canónica** significa “identidad completa y reproducible”, no “publicada oficialmente”:

- cualquier código válido creado manualmente o desde una partida personalizada es una Canon Seed
  de comunidad;
- una Canon Seed es **oficial** sólo si su código exacto aparece en el catálogo firmado/bundled de
  Hostfall;
- autor, título, descripción y sello oficial son metadatos externos y nunca se confían al texto del
  código;
- `Verified` continúa reservado para una futura prueba reproducible de solvability.

### Resultado compacto

```ts
type SeedAnalysisResult = Readonly<{
  identity: SeedFutureIdentity;
  analysisRevision: 1;
  score: number;
  profileId: SeedSearchProfileId;
  metrics: SeedMetricsV1;
  preview: SeedPreviewV1;
  mulligan: {
    recommendation: "keep" | "mulligan";
    delta: number;
  };
  solvability: { status: "unchecked" | "structurally-valid" };
}>;
```

El bulk produce resultados compactos, sin `GameState`, logs ni `CardInstance`. Después de reconstruir
un finalista con el engine, puede pasar de `unchecked` a `structurally-valid`; nunca a
`winning-line-found` en este MVP. `analysisRevision` cambia por separado cuando se modifican
métricas, filtros o pesos sin alterar la partida reproducida.

## Métricas V1

### Datos exactos

- IDs de la Mano inicial y de la Mano tras un mulligan;
- número y posiciones de Fuentes;
- histograma de costes impresos;
- primeras `N` cartas del Archivo del Cronista antes de decisiones;
- primeras `N` cartas del Archivo de la Hueste antes de decisiones;
- tipos, costes, Fuerza y Aguante impresos;
- reglas configuradas de revelado, Mini Oleada y Oleada.

### Proxies explícitamente aproximados

- **Cobertura de Fuentes:** posibilidad de jugar una Fuente por turno de Preparación usando Mano y
  los `preparationTurns - 1` robos conocidos;
- **Cobertura de curva:** cartas cuyo coste impreso cabe en las Fuentes vistas por esa política
  source-first; no se llaman “cartas legalmente jugables”;
- **Riesgo de apertura atascada:** falta de Fuentes o ausencia de costes accesibles;
- **Ventanas potenciales de Hueste:** agrupación estructural por `revealCount`, `stopOnNonToken`,
  Mini Oleada y Oleada;
- **Presión impresa:** Fuerza/Aguante acumulados y pico por ventana, sin suponer bloqueos, efectos o
  decisiones del jugador;
- **Escalada potencial:** diferencia entre ventanas tempranas y posteriores.

Las ventanas de Hueste se presentan como potenciales porque efectos y acciones reales pueden
revelar, mover o descartar cartas. La UI no mostrará “Titán en T4” como un hecho garantizado.

### Lo que no se infiere

No habrá métricas V1 llamadas `comebackPotential`, `decisionDensity`, `expectedLength`, `winRate` o
`lifeRemaining`. Tampoco se infiere sinergia genérica desde nombres o texto de cartas. El inspector
muestra las cartas reales para que el creador evalúe esas cualidades.

## Perfil `first-approach-v1`

El score es una preferencia configurable, no una medida objetiva de diversión. El perfil inicial:

- favorece una cantidad razonable de Fuentes en la apertura;
- favorece acceso a otra Fuente durante Preparación cuando hace falta;
- favorece varias cartas de coste accesible;
- penaliza manos compuestas casi por completo por Fuentes o costes inaccesibles;
- penaliza una primera ventana de Hueste extrema;
- favorece presión posterior mayor que la inicial;
- penaliza también una Hueste completamente inofensiva.

Se conservan los valores crudos junto al score. Los pesos y umbrales viven en un objeto versionado y
se prueban de forma aislada. La seed que dejó al creador en 2 de Vida sirve como referencia humana de
**Hostfallero experimentado**, no como una verdad que el analyzer pueda deducir sin jugarla.

## Perfiles V1 — Fase 3.5

La misma extracción de métricas alimenta cinco preferencias versionadas. Cambiar perfil no altera
la Canon Seed, el orden de cartas ni las métricas crudas: cambia filtros, pesos y objetivo de
presión. Son aproximaciones iniciales pendientes de calibración humana en la Fase 4.

| Perfil | Preferencia estructural |
| --- | --- |
| `first-approach-v1` | Recursos estables, curva accesible y presión gradual. |
| `balanced-v1` | Reparto parejo entre apertura, recursos, curva, presión y escalada. |
| `experienced-v1` | Tolera menos estabilidad y favorece presión y escalada mayores. |
| `high-pressure-v1` | Exige presión temprana suficiente y le da el mayor peso del score. |
| `progressive-pressure-v1` | Exige crecimiento entre ventanas y limita un inicio excesivo. |

**Evitar picos tempranos** permanece como filtro adicional. Cada perfil propone un default, pero el
usuario puede cambiarlo sin crear otra identidad de partida. Favoritos y exports guardan el perfil
que produjo el score; favoritos anteriores sin perfil migran a `first-approach-v1`.

## Algoritmo de búsqueda

### Preparación por configuración

Una vez por búsqueda:

1. resolver los decks desde `contentCatalog`;
2. expandir cantidades a referencias compactas;
3. aplicar `gameplayLandCount` con la misma función genérica que usa `createInitialGame`;
4. construir un contexto inmutable con rasgos necesarios para las métricas;
5. validar modo estándar, revisiones y límites.

### Por cada seed

1. convertir un índice del rango `00000`–`ZZZZZ` a entropía base 36, sin `Math.random`;
2. construir el Canon Seed con decks y dificultad seleccionados;
3. aplicar `hashSeed` únicamente a los cinco caracteres de entropía;
4. barajar el pool del Cronista y continuar el mismo RNG para barajar la Hueste;
5. separar la Mano de siete cartas;
6. proyectar un mulligan con el estado de RNG restante;
7. extraer sólo las ventanas requeridas;
8. calcular métricas, filtros y score;
9. conservar únicamente un heap con los mejores candidatos.

El desempate final usa el Canon Seed completo para que el ranking sea estable.

### Verificación del shortlist

El fast path conserva un pool mayor que el resultado visible, por ejemplo
`max(finalists * 20, 250)`. Para ese pool reducido:

1. ejecutar `createInitialGame` real;
2. ejecutar `mulliganOpeningHand` real;
3. comprobar que Mano, mulligan y topes coinciden con la proyección;
4. recalcular el resultado visible desde el snapshot exacto;
5. descartar y reportar cualquier divergencia en lugar de ocultarla;
6. ordenar y devolver las 10–20 finalistas.

Así el camino rápido sólo filtra; todo lo que el inspector presenta como exacto vuelve a pasar por el
engine real.

## Ejecución en runtime

La búsqueda corre dentro del renderer del Playground en lotes cooperativos:

- cada slice trabaja hasta un presupuesto aproximado de 8–12 ms;
- después cede con el scheduler más pequeño posible (`setTimeout(0)` inyectable);
- un `AbortSignal` cancela al cambiar configuración, iniciar otra búsqueda o cerrar la pantalla;
- progreso y shortlist se publican unas pocas veces por segundo, no por seed;
- abandonar la pantalla cancela trabajo futuro, pero conserva el último resultado completo mientras
  la herramienta siga montada;
- nunca se muta `useGameStore` durante búsqueda o inspección.

No se usa Web Worker: hoy no existe esa infraestructura y `electron/protocolServer.ts` fija
`worker-src 'none'`. Si el benchmark real demuestra jank después del fast path, habilitar Workers
será una propuesta independiente con revisión de CSP y seguridad, no un cambio incidental.

## Integración visual como pantalla dev

El diseño aprobado no cabe dentro del dock de 460–620 px y conceptualmente no es una herramienta
del Playground. La integración será una **pantalla dev independiente**:

- añadir **Seed Explorer** junto a Playground y Audio Lab en un dock dev abajo a la derecha del home;
- `SeedExplorerScreen` ocupa el viewport y usa las tres columnas del mockup;
- **Probar en tablero** alterna la propia pantalla al Board real sin pasar por Playground;
- el componente de la herramienta conserva resultados, selección y favoritos al volver desde el Board;
- las columnas se apilan en breakpoints estrechos como ya hace el mockup;
- la paleta y controles reutilizan el lenguaje visual vigente del Playground, no su distribución;
- el código Canon nunca se traduce; sólo se localizan los nombres y la dificultad de su preview.

Playground no importa ni monta Seed Explorer y mantiene su navegación dedicada a escenarios.

### Probar una candidata

**Probar en tablero**:

1. decodifica la Canon Seed y reconstruye el futuro con `createInitialGame`, usando `entropy` como
   seed RNG y la dificultad/Preparación resueltas;
2. lo planta con `useGameStore.loadScenario`, no con `reset`, para no persistir la seed como próxima
   partida normal;
3. informa al Board los turnos reales de Preparación;
4. muestra el Board dentro de Seed Explorer, conservando en memoria el shortlist de la herramienta;
5. deja que mulligan, acciones, Hueste y combate ocurran por los handlers normales.

Al volver desde el Board, el shortlist sigue disponible para probar la siguiente candidata.

## Archivos previstos

### Nuevos

- `src/content/CanonSeed.ts` — codec HF1, registro de códigos, dificultad derivada y validación.
- `src/engine/InitialDeckOrder.ts` — pools genéricos y secuencia compartida de shuffles.
- `src/playground/seedExplorer.ts` — contratos, analyzer estático, métricas y perfiles.
- `src/playground/seedExplorerSearch.ts` — enumeración, top-K y verificación exacta incremental.
- `src/playground/seedExplorerRuntime.ts` — slices cooperativos, progreso, cancelación y protección
  contra resultados obsoletos.
- `src/seed-explorer/SeedExplorerScreen.css` — piel de la pantalla dentro del chunk dev-only.
- `src/seed-explorer/SeedExplorerScreen.tsx` — filtros, lista, inspector, acciones y handoff al Board.
- `src/playground/seedExplorerStorage.ts` — favoritos locales versionados y validación defensiva.
- `tests/canonSeed.test.js` — codec, normalización, dificultad derivada e independencia de idioma.
- `tests/seedExplorer.test.js` — paridad, métricas, ranking, batching y storage.

### Modificados

- `src/engine/GameState.ts` — consumir la nueva costura de orden inicial sin cambiar gameplay.
- `src/App.tsx` — import dev-only y ruta interna de la pantalla.
- `src/components/StartMenu.tsx` — dock de herramientas dev en el home.
- `src/styles.css` — posición y piel del dock dev.
- `scripts/run-engine-tests.mjs` — registrar explícitamente el nuevo test.
- `tests/uiPresentation.test.js` — gate dev-only y contrato de la pantalla independiente.
- `docs/guides/testing.md` — añadir la nueva cobertura.
- `CLAUDE.md` — sólo al cerrar la implementación, para resumir el contrato vigente.

No se crea CLI ni se añade dependencia.

## Fases de implementación

### Fase 0 — Costura determinista compartida

**Estado:** cerrada el 2026-08-18. El codec vive en `src/content/CanonSeed.ts`; la preparación y el
shuffle compartidos viven en `src/engine/InitialDeckOrder.ts`. `createInitialGame` ya consume esa
costura y la suite certifica paridad en los cuatro enfrentamientos builtin.

- fijar el codec `HF1-PPP-HHH-XXD-XXX` y el registro estable de códigos de deck;
- derivar Preparación exclusivamente desde dificultad;
- añadir roundtrip, normalización, validación e independencia de idioma;
- extraer preparación de pools, límite de Fuentes y shuffle Cronista → Hueste;
- hacer que `createInitialGame` consuma esa costura;
- mantener ramas especiales para seeds reservadas;
- añadir tests de paridad antes de construir UI.

**Salida:** una Canon Seed se resuelve sin ambigüedad y el engine se comporta igual usando el nuevo
fast path compartido.

### Fase 1 — Analyzer, perfil y búsqueda pura

**Estado:** cerrada el 2026-08-18. `src/playground/seedExplorer.ts` contiene métricas, preview,
perfil, filtros, proyección de mulligan y ventanas potenciales. `seedExplorerSearch.ts` aporta el
rango base 36, acumulador por batches, heap top-K, desempate y verificación exacta sin Zustand.

- definir identidad, preview y métricas V1;
- implementar keep + un mulligan, filtros y `first-approach-v1`;
- implementar heap top-K y desempate estable;
- verificar finalistas mediante el engine completo;
- medir 10k, 100k y 500k sin establecer un límite temporal flaky en CI.

**Salida:** una función pura devuelve finalistas reproducibles sin tocar Zustand.

Benchmark local observado con Elarion vs Sinsepulcro, Normal, mulligan y top 20 —incluye pool de
verificación de 400 finalistas—:

| Seeds | Tiempo | Throughput observado | Pasaron filtros | Divergencias |
| ---: | ---: | ---: | ---: | ---: |
| 10.000 | 304 ms | 32.912/s | 9.186 | 0 |
| 100.000 | 1.319 ms | 75.844/s | 91.532 | 0 |
| 500.000 | 5.821 ms | 85.895/s | 457.727 | 0 |

No son límites de CI. Los filtros V1 son deliberadamente conservadores y todavía dejan pasar la
mayoría de futuros; la Fase 4 calibrará pesos y umbrales con playtests sin cambiar las métricas
crudas.

### Fase 2 — Runtime cooperativo

**Estado:** cerrada el 2026-08-18. `src/playground/seedExplorerRuntime.ts` ejecuta tanto el barrido
como la verificación exacta en slices con presupuesto temporal y límites de trabajo defensivos. El
scheduler y el reloj son inyectables para probar cancelación y progreso sin timers reales. El
coordinador invalida búsquedas anteriores por `runId` y retiene por separado el último resultado
completo.

- envolver la búsqueda pura en slices cancelables;
- limitar frecuencia de progreso y resultados parciales;
- impedir que respuestas de búsquedas viejas reemplacen la activa;
- conservar el último resultado completo al navegar.

**Salida:** el renderer puede ceder entre slices durante una búsqueda larga; Cancelar se observa
antes de procesar el siguiente chunk y ninguna ejecución obsoleta puede reemplazar la activa.

### Fase 3 — Pantalla dev aprobada

**Estado:** cerrada en código el 2026-08-18; queda el QA visual/manual del usuario. La herramienta
vive en `src/seed-explorer/SeedExplorerScreen.tsx` como pantalla dev hermana de Playground y Audio
Lab. Se abre desde el dock dev abajo a la derecha del home, usa el runtime real, favoritos locales
versionados y export JSON/CSV. Reconstruye la candidata mediante `createInitialGame`, la entrega a
`loadScenario` y alterna al Board real sin perder el estado de búsqueda. La lista permite cambiar
entre **Mejores** (ranking puro) y **Variadas** (default), usando un pool verificado más amplio y
distancia estructural sin alterar score ni filtros.

- trasladar el mockup a React con datos reales;
- integrar filtros, lista, inspector, favoritos y copy/export;
- conectar **Probar en tablero** al estado real;
- integrar la entrada dev en el home y el responsive sin comprimir el diseño dentro de otro dock.

**Salida:** flujo completo búsqueda → inspección → playtest manual, pendiente únicamente de ajuste
visual si el usuario detecta diferencias en su resolución real.

### Fase 3.5 — Perfiles estructurales adicionales

**Estado:** cerrada el 2026-08-18. El selector de **Perfil buscado** ejecuta cinco perfiles reales:
Primer acercamiento, Equilibrada, Hostfallero experimentado, Presión alta y Escalada progresiva.
Todos reutilizan las métricas V1, mantienen ranking determinista y pasan por la misma verificación
exacta. El perfil forma parte de request, resultado, favoritos y export, pero no de la Canon Seed.

- generalizar score, filtros y razones de rechazo por perfil;
- conservar `first-approach-v1` como default compatible;
- exigir presión mínima o escalada mínima sólo en los perfiles que la solicitan;
- aplicar defaults de picos tempranos explícitos por perfil;
- migrar favoritos anteriores al perfil default;
- comprobar con muestras locales que los cinco perfiles producen finalistas distinguibles.

**Salida:** el creador puede buscar tipos de futuro distintos antes de iniciar la calibración humana,
sin IA jugadora ni nuevas métricas del engine.

### Fase 4 — Calibración y cierre

- ejecutar búsquedas del matchup de demo;
- comparar finalistas de los perfiles relevantes con playtests humanos;
- ajustar sólo pesos y umbrales de perfil, manteniendo métricas crudas estables;
- documentar throughput observado y limitaciones;
- ejecutar gates release para probar que el Explorer no se empaqueta.

**Salida:** 10–20 candidatas reales para escoger la seed de primer acercamiento.

## Pruebas y gates

Entre `tests/canonSeed.test.js` y `tests/seedExplorer.test.js` se debe cubrir:

- roundtrip exacto de `HF1-ELA-GRV-LE2-GPT`;
- normalización de minúsculas y rechazo de bloques, símbolos o códigos de deck desconocidos;
- extracción de entropía `LEGPT` sin incluir el dígito de dificultad;
- dificultad `1/2/3` derivada a Preparación `4/3/2`, sin combinaciones editables;
- misma entropía con distinta dificultad → mismo orden inicial de decks;
- codec sin dependencias de i18n y misma Canon Seed bajo cualquier idioma visible;
- rango base 36 `00000`–`ZZZZZ` sin duplicados dentro de una búsqueda;
- misma identidad → misma Mano, métricas, score y ranking;
- paridad fast path vs `createInitialGame` en los cuatro cruces de decks jugables;
- paridad de un mulligan vs `mulliganOpeningHand`;
- orden de la Hueste dependiente del mismo stream consumido por el deck del Cronista;
- `N` turnos de Preparación → `N - 1` robos previos a la primera Hueste;
- respeto de `gameplayLandCount`;
- seeds técnicas reservadas imposibles de representar como Canon Seed;
- ranking estable y exactamente `top` resultados;
- procesar en uno o muchos batches produce el mismo shortlist;
- ejecución cooperativa produce el mismo resultado que la búsqueda síncrona;
- cancelación impide ejecutar/publicar batches posteriores;
- una búsqueda reemplazada no pisa la activa y cancelar conserva el último resultado completo;
- filtros y pesos sobre fixtures sintéticos comprensibles;
- export JSON/CSV reproducible y storage inválido que falla cerrado;
- ningún resultado declara `winning-line-found` o `impossible`.

Gates al terminar:

```bash
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\typescript\lib\tsc.js -b
```

```bash
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test scripts\run-engine-tests.mjs
```

```bash
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\vite\bin\vite.js --config vite.config.ts build
```

```bash
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\audit-offline-runtime.mjs
```

No se añade un assertion rígido de milisegundos al CI. La responsividad, Cancelar, responsive y el
handoff al Board se validan manualmente.

## Criterios de aceptación del MVP

- Una búsqueda repetida con la misma request produce exactamente el mismo top 20.
- Cada resultado expone un único código `HF1-PPP-HHH-XXD-XXX` válido y normalizado.
- El mismo código decodifica la misma configuración en todos los idiomas; sólo cambia su copy.
- Preparación nunca puede separarse de la dificultad codificada.
- El inspector de cada finalista coincide con el engine real para Mano, mulligan y topes mostrados.
- Buscar no modifica la partida visible ni ningún dato persistente del jugador.
- Cancelar detiene el trabajo antes del siguiente slice.
- La UI sigue utilizable durante una búsqueda de 500.000 seeds, aunque el tiempo final dependa del
  hardware.
- Una candidata puede copiarse y cargarse en el Board con la misma identidad completa.
- La UI dice claramente **Análisis aproximado** y no presenta solvability ficticia.
- El build release no contiene Seed Explorer, Playground ni sus datos locales.

## Evolución posterior, no autorizada por este plan

Sólo después de usar el MVP y medir sus carencias se evaluaría:

- simulación host-only para enriquecer unos pocos finalistas;
- etiquetas/arquetipos calibrados con datos de playtest;
- notas manuales y fixtures de regresión;
- un modelo genérico de acciones legales;
- agentes sencillos y winning certificates;
- canonicalizar IDs de `EventQueue`, que hoy usan `Date.now()` y romperían un hash byte a byte;
- Web Worker tras una revisión explícita de CSP;
- menú player-facing **Canon Seeds**, creación desde partida personalizada y catálogo
  Oficial/Comunidad, consumiendo el codec ya establecido;
- una Future Explorer para jugadores sin spoilers.

Ninguno de esos puntos es requisito para encontrar buenas candidatas de demo.
