# Auditoría y plan por fases — Aprender a jugar y ayudas contextuales

Estado: **auditoría técnica completada; prólogo, derrota, vórtice y handoff a la primera Visión
Canon implementados. La apertura de Mano y sus ayudas tienen un plan propio; la durabilidad del
handoff, el hardening contextual y el QA manual de ritmo/presentación siguen abiertos**.

Última actualización: **2026-09-01**.

## Objetivo y alcance

Este documento traduce el prólogo de
[`learn_to_play_tutorial.md`](learn_to_play_tutorial.md) a necesidades de arquitectura y a un plan
de implementación incremental. La partida normal que comienza después del handoff —Mano,
mulligan, Preparación mental y ayudas contextuales de `HF1-ELA-GRV-082-QC5`— se gobierna desde
[`first_canon_vision_plan.md`](first_canon_vision_plan.md).

Se deben conservar dos productos distintos:

- la lección guiada actual pasa a presentarse como **Preparación** y conserva el framework lineal
  que ya funciona;
- **Aprender a jugar** es un recorrido nuevo: prólogo determinista semi-guiado, derrota narrativa y
  salto ya implementado a una partida real preparada con ayudas contextuales.

**Aprender a jugar será el tutorial obligatorio** y **Preparación será opcional**. Ambos estarán
disponibles dentro de Cómo jugar para repetirse manualmente. La apertura de Mano, mulligan y
repetición de la primera Visión están decididos en `first_canon_vision_plan.md`; todavía no están
implementados. El gate de primera apertura de la aplicación y el alcance sobre perfiles existentes
siguen siendo decisiones separadas y pendientes en este documento.

Si el jugador abandona antes de esa acción, el intento no se reanuda ni recuerda conceptos
provisionales. El CTA único se llama **Contemplar otro futuro**. Su activación completa el recorrido,
ejecuta el vórtice y carga la partida real preparada; ese handoff ya está implementado.

Durante este corte, **Continuar** queda deshabilitado globalmente, no condicionado al progreso de un
tutorial. La decisión posterior de demo es ocultarlo y apagar resume mediante una capability de
producto; su reactivación se reserva para Early Access. Ese cambio pertenece a
`seeds_of_destiny_history_implementation_plan.md`, no a este tutorial.

Este plan no autoriza a implementar todas las fases juntas. Antes de cada fase se revisan con el
usuario su experiencia visible, sus límites y las decisiones abiertas que le correspondan; sólo
después de aprobación explícita se modifica código.

## Conclusión de la auditoría

La propuesta es técnicamente viable y su riesgo global es **medio-alto**, no porque exija rehacer el
juego, sino porque cruza varias fronteras que hoy están separadas: reglas, store, animaciones,
persistencia y lifecycle de producto.

El framework actual es una buena base para **Preparación** y para intervenciones estrictas breves,
pero no debe convertirse en un sistema monolítico de ramas y tutoriales contextuales. La extensión
más segura separa cuatro responsabilidades:

1. un stream semántico siempre activo para observar intentos y resultados reales;
2. un runtime de ayudas contextuales por concepto;
3. un director efímero del recorrido **Aprender a jugar**;
4. un catálogo de producto capaz de mostrar ambos tutoriales en **Cómo jugar**.

La partida real posterior no necesitó diseñarse turno por turno para construir estas bases ni para
entregar el prólogo. Seed, dificultad, Preparación y mulligan ya están fijados. La demo conserva el
resume apagado; el plan post-handoff usa un marcador transaccional acotado para recuperar el
vórtice, no un checkpoint jugable nuevo.

## Qué existe y se puede reutilizar

| Necesidad | Estado actual | Decisión |
| --- | --- | --- |
| Construir una partida avanzada exacta | `buildGuidedScenario` ya fija decks, orden de zonas, Mano, Campo, turnos, Vida, Energía, Reserva, contadores, Agotado y Estabilizándose. | Reutilizar la receta y el builder; extraer su parte genérica si el nuevo director la necesita sin una `GuidedLesson`. |
| Validar cartas y copias authored | `GuidedLessonRegistry` y `validation.ts` resuelven claves calificadas contra `ContentCatalog`. | Reutilizar el patrón y fallar antes de entrar al tablero. |
| Enseñar una acción exacta | `GuidedSessionStore`, `GuidedInteractionGate` y `GuidedTutorialOverlay` ejecutan Explicar → Actuar → Observar. | Conservar para **Preparación** y para intervenciones realmente guiadas del prólogo. |
| Esperar animaciones | `GuidedPresentationActivityRegistry`, `isGuidedPresentationSettled` y `GuidedBeatBarrier` ya coordinan checkpoints estables. | Generalizar su uso sin congelar commits o animaciones a mitad. |
| Señalar elementos del tablero | Hay anchors por carta y para Mano, Campo, Fuentes, Reserva, Vida, Archivos, acciones de fase y preview. | Reutilizar registro, geometría, spotlight, conectores y glosario. |
| Partida determinista por seed | `createInitialGame` y `mulliganOpeningHand` consumen RNG determinista real. | La partida del nuevo Futuro debe usar esas reglas, no una receta disfrazada de partida normal. |
| Derrota y vórtice | Ya existen `DefeatShatterAnimator`, `DefeatModal` y `DestinyRewriteTransition`. | Reutilizar la presentación con una variante explícita de prólogo y un destino nuevo. |
| Finalización sin resume intermedio | El progreso guiado sólo persiste una lección completada. | Conservar para **Preparación**; añadir progreso contextual y de recorrido sin guardar el paso activo. |

Receipts ya útiles durante una guía: `card.played`, `source.played`, `source.recycled`,
`card.inspected`, `ability.activated`, targeting, `defense.confirmed`, `player.drew`,
`player.discarded`, `reserve.released`, `hostArchive.discarded`, `phase.changed` y
`host.resolved`.

## Brechas encontradas

### 1. El runtime guiado es lineal y exclusivo

El schema v1 admite un único `allowedIntent` en un paso `act` y un único `nextStepId`. El primer
receipt consume la acción. No puede representar:

- Flor y Vaelor en cualquier orden;
- defensas completamente libres;
- atacar o no atacar;
- Choque, Ciudad o pasar;
- «juega hasta que ocurra X»;
- permitir todo excepto confirmar el fin del turno antes de Devolver Fuente;
- ramas equivalentes que convergen por estado y no por una secuencia de clics.

**Consecuencia:** no se debe convertir `GuidedLessonDefinition` v1 en el director de toda la
partida. **Preparación** permanece en schema v1. El nuevo recorrido coordina ventanas libres,
milestones y pequeñas intervenciones guiadas conectadas al tablero vivo.

### 2. Los receipts desaparecen fuera de una guía

`GuidedInteractionGate.publish()` no publica nada si no hay una policy activa. Por tanto, los
receipts existentes no pueden activar un concepto durante una partida normal.

**Consecuencia:** hace falta una fuente semántica siempre activa, independiente de que exista una
lección. El gate guiado puede adaptarse a esa fuente para conservar sus receipts y aliases, pero no
debe ser la fuente global.

### 3. Muchos intentos inválidos no llegan al engine

`ActionFailureCode` sólo tipa `NOT_ENOUGH_ENERGY`. Límite de Fuentes, Estabilizándose y restricciones
de defensa siguen siendo strings o resultados silenciosos. Además, `Hand`, `Battlefield` y `Card`
desactivan varias interacciones antes de llamar al store:

- Aelyra contra un atacante con Volar;
- Vaelor intentando atacar mientras se Estabiliza;
- Flor intentando usar su Acción mientras se Estabiliza;
- un quinto Río intentando jugarse.

**Consecuencia:** escuchar sólo cambios del `GameState` no basta. La UI debe reportar de forma
accesible el intento sobre una acción no disponible, y el motor/store debe devolver códigos
semánticos cuando sí recibe una acción rechazada. No se interpretarán toasts, copy ni strings del
log.

### 4. Faltan señales del flujo diseñado

No existen todavía eventos públicos suficientemente ricos para:

- atacantes de la Hueste declarados en su orden real;
- atacante que dañó la Vida y cantidad;
- comienzo efectivo de Estampida y bonificación aplicada;
- cartas concretas reveladas por la Hueste;
- Fuentes que volvieron a prepararse;
- Eco que se Agotó al atacar;
- cadena de muertes/Reacciones completamente asentada;
- detalles ampliados realmente abiertos;
- intento de terminar turno antes de Devolver Fuente;
- resultado de derrota completamente presentado.

`host.resolved` no incluye IDs y se publica antes de terminar todas las llegadas y Reacciones. Los
tokens de presentación como `life.damage` indican animación, no el resultado pedagógico.

### 5. No existe progreso por concepto

El envelope vigente guarda solamente `lessonId`, revisión y fecha de finalización. Faltan:

- `conceptId` y revisión mostrada;
- preferencia global de no repetir conceptos vistos;
- deduplicación por partida;
- conjunto provisional del intento de prólogo;
- commit atómico al completar y descarte total al abandonar;
- primera aparición garantizada en cualquier partida futura.

### 6. No hay presentación contextual

`GuidedTutorialOverlay` instala un escudo global, atrapa foco y bloquea clic, teclado, drag,
contextmenu, tooltips y previews. Es correcto para una instrucción estricta, no para una ayuda que
acompaña una partida real.

Se necesitan tres políticas explícitas:

| Política | Comportamiento |
| --- | --- |
| Informativa/observada | Espera a que la consecuencia termine, muestra una sola ayuda y no captura el resto de la UI. |
| Preventiva/reactiva | Intercepta únicamente la confirmación o el intento que necesita explicación; después exige un nuevo intento del jugador. |
| Guiada | Usa el overlay y gate actuales para la acción exacta estrictamente necesaria. |

La geometría, anchors, glosario y materiales visuales sí son reutilizables. La captura global de
input no lo es.

### 7. El lifecycle actual interpreta la derrota como un error

Al aparecer `winner`, `GuidedSessionStore.notifyGameEnded()` aborta la sesión. `Board` sólo muestra
`DefeatModal` en una sesión normal, y `App` sólo ofrece Reescribir/Contemplar en la pantalla normal.
Además, completar cualquier lección guiada devuelve inmediatamente al menú.

**Consecuencia:** **Aprender a jugar** necesita un lifecycle superior que sobreviva a la derrota:

`prologue → defeatPresented → handoff → preparedFutureLoaded → completed`

Terminar una intervención guiada interna no termina el recorrido.

### 8. `sessionKind` mezcla políticas incompatibles

El booleano actual controla a la vez autosave, Settings, `PhaseBanner`, resultados y controles de
Futuro. El prólogo necesita:

- autosave desactivado;
- Settings de tutorial;
- fases y Estampida visibles normalmente;
- Reescribir oculto;
- derrota especial habilitada;
- abandono que reinicia desde el cold open.

Esas capacidades deben expresarse como políticas de sesión, no como otra cadena de condicionales
alrededor de `sessionKind === "tutorial"`.

### 9. No existe el cierre letal adaptativo ni un hook para planearlo

El motor resuelve combate real de izquierda a derecha y Reacciones entre impactos, pero no explora
el mejor resultado defensivo posible. Tampoco existe una operación de producto que, después del
cálculo, presente una cantidad variable de Invocaciones authored.

Además, el control de fase termina el turno y solicita inmediatamente el `runHostMain` normal. El
director no tiene todavía un punto semántico donde sustituir sólo ese turno por un plan terminal.
La integración necesita descomponer la Hueste en «comenzar turno → ejecutar plan de revelado →
resolver entradas → comenzar combate» y permitir un plan authored registrado únicamente durante el
prólogo. El botón de fase no debe conocer el tutorial.

El evaluador deberá:

1. recibir una copia del estado estable anterior al cierre;
2. probar las respuestas Rápidas todavía legales, especialmente Choque de Ecos;
3. enumerar asignaciones legales de defensores, incluidas Volar/Guardia aérea y restricciones;
4. resolver impactos y Reacciones con las reglas reales y su orden real;
5. maximizar la Vida final del jugador;
6. elegir la fuerza mínima que contenga el Titán terminal y los Soldados necesarios para que el
   mejor resultado sea Vida `<= 0`;
7. fallar en validación si el contenido authored no contiene suficientes copias.

La simulación usa clones y funciones puras; nunca prueba candidatos mutando la partida visible. El
resultado elegido se ejecuta después por el camino real de entrada y presentación de la Hueste.

El Archivo real puede proteger el desenlace sin una zona secreta. El daño máximo del ataque
opcional es 11 —Vaelor 6 y Maela+Aelyra 5—, por lo que sólo puede descartar tres cartas con el
umbral actual. Tres Soldados colocados delante del Titán terminal garantizan que ese Titán no sea
descartado. Al llegar el cierre se continúa revelando desde arriba: pueden quedar cero a tres de
esos Soldados antes del Titán según lo que hizo el jugador, y el planificador añade después las
copias necesarias.

El deck contiene 21 Soldados y 4 Titanes. La primera Estampida y el cierre consumen dos Titanes. Una
cota conservadora reserva 1 Soldado de equivalencia, 3 de guardia y hasta 16 posteriores al Titán:
20 de 21 copias. El evaluador debe certificar la cota real y fallar antes del runtime si no alcanza.

### 10. Cómo jugar sólo conoce una tarjeta

`StartMenu` recibe `onOpenBasicTutorial`, la tarjeta está hardcodeada y el registro release contiene
sólo `first-seed`.

**Consecuencia:** hace falta un catálogo de entradas de producto. Se recomienda:

- conservar el ID estable `first-seed` y su progreso histórico para **Preparación**;
- crear el ID independiente `learn-to-play`;
- entregar a Cómo jugar una lista localizada con estado y launcher, no añadir otra prop singular.

### 11. El handoff no puede reactivar resume en la demo

La política actual de demo no lee, escribe ni borra checkpoints jugables, aunque el handoff termine
en pantalla `game`. Por tanto, la partida Canon no sobrescribe el `resume-v1` existente ni habilita
autosave por entrar al tablero.

La recuperación de un cierre durante el vórtice sigue siendo una brecha real, pero se resuelve con
una transacción o marcador específico del handoff descrito en `first_canon_vision_plan.md`, no
reactivando la capability de resume. Early Access puede rehidratar la misma sesión sólo bajo su
capability de regresión ya existente.

### 12. Mulligan existe como regla, pero no como contenido guiado

El motor ya ejecuta mulligans deterministas. Sin embargo:

- `opening.mulligan` no es authorable en el schema guiado v1;
- no existe receipt de mulligan completado;
- el botón no tiene anchor propio;
- no se ha certificado una seed con Mano inicial y reemplazos esperados.

Esto no bloquea las primeras fases ni la finalización, que ahora ocurre en el CTA anterior. Sí
bloquea la autoría de la primera Mano de la partida preparada si todavía se quiere enseñar o exigir
allí un mulligan contextual.

## Validación de la Vida inicial

**31 es el mínimo analítico correcto con las reglas y estadísticas actuales:**

`31 + 3 de Aelyra - 13 del primer ataque - 20 de la primera Estampida = 1`

No defender nada es el peor caso del primer ataque. Matar un Zombi anterior puede sumar 1 de Fuerza
a la Cosechadora, pero esa defensa evita al menos 2 de daño, así que no empeora el total. Durante la
primera Estampida, la Cosechadora ataca antes que los cuerpos recién llegados; sus muertes posteriores
no aumentan ese ataque ya resuelto. Con 30, la rama sin defensa llega a 0 antes de enseñar Mano
vacía.

La cifra se considera analíticamente resuelta, pero no certificada para release hasta que la receta
real y un test exhaustivo de ramas la conviertan en un gate automático.

## Arquitectura recomendada

```text
Game engine / GameStore / UI attempts
                │
                ▼
       Semantic gameplay signals
          │                 │
          ▼                 ▼
Guided receipt adapter   Contextual runtime
          │                 │
          ▼                 ▼
Preparación / strict     Context callout +
interventions            concept progress
          └─────────┬───────┘
                    ▼
          Learn-to-play journey
     scenario → defeat → prepared future
```

### Stream semántico siempre activo

Cada señal debe tener cursor monotónico y `gameSessionId`; cuando corresponda incluye intent,
código de resultado, IDs de entidades, cantidades, fase y causa. El stream es efímero y de memoria
acotada: no es telemetría ni se serializa dentro del `GameState`.

Familias mínimas:

- `intent.attempted`, incluso desde affordances no disponibles;
- `action.succeeded` y `action.rejected` con código tipado;
- `card.played`, `source.played`, `source.recycled`, `card.detailsOpened`;
- `turn.started`, `turn.ended`, `cards.drawn`, `reserve.released`;
- `host.cardsRevealed`, `host.surgeStarted`, `host.attackDeclared`;
- `combat.assignmentRejected`, `combat.impact`, `combat.finished`;
- `presentation.settled` o consulta equivalente antes de mostrar;
- `game.ended` y `outcome.presented`.

El sistema guiado actual consume un adaptador de estas señales y conserva sus aliases y receipts.
Así **Preparación** no cambia de comportamiento mientras las partidas normales ganan observabilidad.

### Runtime contextual

Una definición de concepto debe declarar, sin nombres visibles ni condiciones de deck en el core:

- ID y revisión;
- clase de intervención;
- señales que pueden dispararla;
- condición sobre estado semántico;
- prioridad y deduplicación;
- anchors dinámicos o superficies;
- copy/glosario localizado;
- política de commit: provisional en prólogo o inmediata en partida normal.

Sólo una ayuda puede estar activa. Las demás se encolan, se vuelven a validar antes de mostrarse y
se descartan si su contexto dejó de existir. Una ayuda no se monta durante targeting incompatible,
otra guía, Estampida en transición, animación finita o desenlace.

La regla persistente fijada es:

`mostrar = concepto no visto || repeticiones permitidas`

Un concepto no visto nunca puede ser suprimido por la preferencia global. «No volver a mostrar
explicaciones ya vistas» estará activado por defecto; un concepto cuenta como visto al cerrar o
aceptar su ayuda. Si el jugador permite repeticiones, cada concepto aparece como máximo una vez por
partida.

### Progreso

Se recomienda introducir un envelope versionado de guía v2 con migración desde el progreso actual,
sin reinterpretar el ID `first-seed`:

- finalizaciones de lecciones guiadas;
- finalizaciones de recorridos;
- conceptos `{ conceptId, shownRevision, shownAt }`;
- preferencia global de repetición.

El intento de prólogo mantiene un ledger sólo en memoria. Pulsar el CTA final ejecuta una única
operación que registra el recorrido y sus conceptos provisionales; abandonar antes descarta el
ledger entero. En una partida normal, un concepto se persiste al cerrar/aceptar la ayuda.

Web y desktop necesitan parsers tolerantes y pruebas de migración. Nunca se persisten paso actual,
bindings, timers, cola de ayudas ni el `GameState` del prólogo.

### Director de Aprender a jugar

El director no decide reglas. Declara capítulos, milestones, ventanas libres y acciones authored
del escenario. Consulta señales y estado estable, y solicita al store ejecutar reglas reales.

Responsabilidades:

- cargar la receta avanzada y conservar bindings de sus copias;
- exigir sólo los hitos estructurales: cuarta Fuente/Aelyra, Vaelor y Devolver Fuente;
- permitir las ramas fijadas en el documento de contenido;
- activar intervenciones guiadas breves sobre el tablero actual;
- coordinar primera Estampida, ventana posterior y cierre terminal;
- esperar la derrota normal y presentar su variante narrativa;
- completar y comprometer progreso al pulsar el CTA final;
- cargar después la partida real preparada.

Debe existir un validador de ramas que explore las decisiones finitas conocidas del prólogo y
compruebe invariantes en cada convergencia. El camino esperado no es cobertura suficiente.

### Catálogo y políticas de sesión

El catálogo de Cómo jugar distingue el tipo de launcher:

- `guided-lesson`: **Preparación**;
- `journey`: **Aprender a jugar**.

El tablero recibe capacidades explícitas para autosave, resultado, fase, Settings y controles de
Futuro. Esto permite una derrota narrativa dentro del prólogo sin debilitar las restricciones de
Preparación ni cambiar la derrota normal.

## Tutoriales contextuales mínimos del recorrido

La infraestructura debe poder registrar, como mínimo, estos conceptos independientes:

- jugar una Fuente e Invocar un Eco;
- asignar defensores;
- orden de ataque de la Hueste;
- Volar y Guardia aérea ante un intento inválido;
- daño a la Vida;
- Reserva y preparación de Fuentes;
- Estabilizándose ante Acción o ataque inválidos;
- detalles ampliados de una carta;
- atacar el Archivo y Agotarse al atacar;
- Estampida;
- Mano vacía y robo adicional;
- límite de cuatro Fuentes y Devolver Fuente.

No todos deben aparecer en el prólogo. Los que no ocurran continúan como no vistos y se activan en
la primera partida futura que produzca su contexto. El catálogo completo de mecánicas de otros
decks puede añadirse después sin rediseñar el runtime.

Anchors nuevos mínimos: contador de Estampida, acción de mulligan si se conserva y, si el QA lo pide,
un anchor general de turno/fase. `card.preview` ya cubre los detalles ampliados.

## Riesgo por área

| Área | Riesgo | Motivo |
| --- | --- | --- |
| Renombrar/listar tutoriales | Bajo | Cambio de catálogo y copy; se preservan IDs. |
| Snapshot avanzado inicial | Bajo-medio | El builder ya cubre casi todo; falta validar la receta completa. |
| Señales siempre activas | Medio | Muchos commits del store y affordances deshabilitadas deben emitir exactamente una vez. |
| Runtime/progreso contextual | Medio | Cola, prioridad, accesibilidad, rollback y migración. |
| Director semi-guiado | Medio-alto | Ramas libres conocidas y convergencias por invariantes. |
| Derrota y handoff | Medio-alto | Cruza outcome, vórtice, pantalla, historial y capabilities de persistencia. |
| Evaluador letal | Alto | Debe explorar respuestas legales y Reacciones sin divergir de las reglas reales. |

## Plan de implementación por fases

### Fase 0 — Cerrar los últimos contratos de producto

Sin cambios de código.

- Confirmar **Contemplar otro futuro** como nombre visible del CTA final.
- Fijar el límite del primer corte en la aparición de ese CTA, sin activar todavía el handoff.
- Mantener fuera del corte la Mano/mulligan, seed, dificultad y Preparación de la partida posterior.
- Aplazar el comportamiento de primera apertura y perfiles existentes.
- Presentar todas las llegadas terminales con el revelado normal, una carta a la vez y sin agrupación.
- Deshabilitar **Continuar** globalmente para este corte; el objetivo posterior de la demo es
  ocultarlo mediante la capability del plan de historial de Semillas.

**Salida:** contrato del primer corte cerrado; las decisiones posteriores están aplazadas de forma
explícita y no bloquean su implementación.

### Fase 1 — Observabilidad semántica sin cambiar la experiencia

Estado: **completada el 2026-08-17**.

- Crear el stream siempre activo y su cursor por sesión.
- Hacer que los receipts guiados actuales se alimenten de él o convivan mediante un adaptador
  único, sin duplicados.
- Tipar los rechazos mínimos: límite de Fuentes, Estabilizándose, Volar/Guardia aérea, timing y
  Acción de Fuente ya usada.
- Reportar intentos por mouse, teclado y drag aun cuando la UI conozca de antemano que son inválidos.
- Añadir las señales autónomas de turno, robo, Reserva, revelado, Estampida, ataque e impacto.
- Probar que una partida normal emite y que **Preparación** sigue idéntica.

**Cierre:** ninguna ayuda visible todavía; suite actual intacta y pruebas de emisión exactamente una
vez.

### Fase 2 — Runtime contextual y progreso

**Estado: completada el 2026-08-17.** El runtime y el callout nacieron como infraestructura
genérica; el registro de producto permaneció vacío hasta la autoría del prólogo en la Fase 4.

- Crear registro de conceptos, evaluador, cola, prioridad, deduplicación y revalidación.
- Implementar políticas informativa, preventiva y reactiva; la política guiada sigue usando el
  overlay actual.
- Crear el callout contextual reutilizando anchors, geometría y glosario sin escudo global.
- Implementar ledger provisional, commit/rollback, progreso versionado y preferencia global.
- Añadir un laboratorio de desarrollo con señales sintéticas; no authorar aún todo el prólogo.

**Cierre:** pruebas de primera aparición, repetición, dos triggers simultáneos, espera estable,
abandono y accesibilidad básica.

### Fase 3 — Catálogo de Cómo jugar y shell del recorrido

**Estado: completada el 2026-08-17.** La Fase 4 ya sustituyó el tablero shell por el snapshot
avanzado authored y activó el launcher de **Aprender a jugar** desde **Cómo jugar**. No se activó
ningún gate de primera apertura.

- Mantener `first-seed` y presentar su tarjeta como **Preparación**.
- Registrar `learn-to-play` con identidad independiente y launcher propio.
- Volver data-driven el listado de Cómo jugar.
- Deshabilitar **Continuar** globalmente sin convertir todavía `learn-to-play` en gate de primera
  apertura. El plan posterior de historial lo ocultará en la demo sin eliminar el camino de Early
  Access.
- Crear el lifecycle del recorrido y las políticas explícitas de tablero.
- Permitir que una intervención guiada breve se conecte al `GameState` actual sin reconstruirlo ni
  marcar completa la jornada.
- Mantener autosave apagado y reinicio total al abandonar el prólogo.

**Cierre:** ambas opciones abren el runtime correcto en desarrollo; **Preparación** conserva su
comportamiento y el shell de **Aprender a jugar** puede iniciar/reiniciar/salir sin guardar pasos.
El gate release aún no se activa sobre contenido incompleto.

### Fase 4 — Prólogo hasta el comienzo de la Estampida

**Estado: implementada el 2026-08-17; pendiente de QA manual de ritmo y presentación.**

- Authorar y validar el snapshot avanzado con `hostTurnNumber` correcto.
- Implementar cuarta Fuente/Aelyra como intervención guiada y conservar el objetivo libre.
- Integrar defensa libre, orden de ataque y ayudas reactivas.
- Resolver Reserva, robo de Flor, Vaelor/Flor en cualquier orden e inspección ampliada.
- Enseñar ataque sólo si existe un atacante legal; si no, dejar los conceptos no vistos.
- Añadir contador de Estampida y explicación cuando el Surge haya comenzado realmente.

La implementación vigente carga un escenario declarativo independiente de una lección lineal,
conserva la sesión del recorrido por encima de intervenciones estrictas adjuntas y aplica límites
estructurales sólo mientras `learn-to-play` está activo. La cuarta Fuente y Aelyra usan la guía
estricta; defensa, Vida, Reserva, Volar/Guardia aérea, Estabilizándose, ataque al Archivo, agotamiento
del atacante y Estampida usan el runtime contextual global. Vaelor es obligatorio para converger y la
inspección de la Cosechadora no puede saltarse por cerrar turno durante otra ayuda.

La receta deja la Vida en 31, la Cosechadora con dos contadores y el próximo revelado en el segundo
Acechador. Retorno consume los dos Soldados de equivalencia al morir; después quedan las dos ramas
robustas de la primera Estampida, con o sin el descarte opcional previo. Al cerrar esta fase, el
director se detenía en la señal real `host.surgeStarted`; las fases siguientes extienden ahora ese
mismo recorrido sin simular la Estampida. El primer turno de Estampida conserva una pausa de dominio entre
`beginHostMain` y los revelados: termina la animación, se explica la Estampida y sólo entonces se
revelan los Ecos de la Hueste.

Las pruebas automáticas enumeran ambos objetivos legales de Aelyra, todas las asignaciones legales
de Maela/Aelyra y los órdenes `omitir Flor`, `Flor → Vaelor` y `Vaelor → Flor`. Todas las ramas
certifican Reserva 3, Flor robada, Cosechadora final 7/9 y el segmento robusto del Archivo; también
se prueban cero o un descarte antes de la primera Estampida.

**Cierre automático alcanzado:** tipos y suite completa aprobados. Falta el QA manual del usuario
para cerrar ritmo, copy y presentación hasta la Estampida.

### Fase 5 — Post-Estampida y cierre adaptativo

**Estado: implementada el 2026-08-17; pendiente de QA manual de ritmo y presentación.**

- Certificar el segmento robusto de Ladrones/Titán/Soldado frente a cero o un descarte opcional.
- Resolver descarte de Flor, Mano vacía y robo Río + Choque mediante reglas reales.
- Interceptar jugar el quinto Río o terminar turno para enseñar Devolver Fuente.
- Conservar Choque/Ciudad/Flor/ataque como ramas libres.
- Interponer un plan de turno de la Hueste sólo en el cierre, sin enseñar otra regla de Estampida.
- Implementar el evaluador puro de supervivencia y un límite authored verificable.
- Proteger al Titán con tres Soldados reales del Archivo y presentar la fuerza mínima mediante el
  evento terminal aprobado.
- Animar cada llegada terminal mediante el revelado normal, sin agrupar cartas aunque el número sea
  grande.
- Ejecutar el ataque real hasta Vida 0.

**Cierre:** enumeración automática de todas las ramas alcanzables, sin loops ni fallback arbitrario;
cada una llega al turno pedagógico y después a derrota.

La receta contiene Río, Choque y Ciudad en el orden authored, vacía la Mano mediante los Ladrones
reales y usa el robo normal de dos cartas. Jugar la quinta Fuente o intentar avanzar activa una
intervención estricta breve para **Devolver Fuente**; después, Choque, Ciudad, Flor y el ataque
permanecen libres. Los descartes opcionales consumen primero los tres Soldados authored y nunca el
Titán terminal.

El cierre consulta el tablero vivo y calcula cuántas llegadas necesita. Su ruta rápida sólo admite
las identidades fijadas por este escenario, modela cada ataque con las reglas reales y verifica la
asignación óptima una vez con `resolveHostCombat`; cualquier divergencia falla cerrada. El store
revela después exactamente ese número de cartas, una a una, esperando la llegada y sus Reacciones
antes de continuar, y entrega el combate a la resolución normal.

**Cierre automático alcanzado:** tipos y suite completa aprobados. Las pruebas cubren Flor usada o
descartada, cero o un descarte antes de Estampida, el rechazo de la quinta Fuente, Río → Ciudad,
Choque, el ataque opcional contra los Soldados protegidos y una rama defensiva con más Vida.

### Fase 6 — Derrota y handoff a la primera Visión Canon

**Estado: implementada; handoff Canon fijado el 2026-08-21.**

- Reutilizar el quiebre normal con variante narrativa y un único CTA.
- Nombrar ese CTA **Contemplar otro futuro**.
- Llegar a la pantalla sin convertir la derrota en un aborto de la sesión guiada.
- Activar el CTA para registrar la finalización del recorrido, ejecutar el vórtice y cargar
  `HF1-ELA-GRV-082-QC5`: Elarion contra los Sinsepulcro, Normal, Preparación 3.
- Mantener fuera de este corte el mulligan authored, el gate de primera apertura y la recuperación
  ante un cierre durante el vórtice.

**Cierre:** la derrota se resuelve con las reglas reales, aparece su presentación narrativa y el
CTA único conduce a la primera Visión Canon aprobada sin conservar estado parcial del prólogo.

El tablero de `learn-to-play` reutiliza la misma barrera de presentación, captura y quiebre que una
derrota normal, pero monta un resultado propio sin código de Futuro ni las dos acciones normales.
El único CTA visible es **Contemplar otro futuro**. Comparte el material visual del control de
Reescribir, sin icono ni código de Futuro, y está habilitado sólo después de aceptar la narración.
Una victoria accidental del escenario tampoco puede instalar una barrera de resultado huérfana.

### Fase 6B — Durabilidad del handoff — transferida

Las decisiones de apertura de Mano y mulligan dejaron de estar aplazadas. Su contrato y sus fases de
implementación viven en [`first_canon_vision_plan.md`](first_canon_vision_plan.md). El gate de
primera apertura de la aplicación y el alcance sobre perfiles existentes permanecen pendientes
aquí. Este plan conserva además la frontera ya implementada del prólogo:

- activar el CTA completa **Aprender a jugar**;
- el vórtice crea una sola Visión normal de `HF1-ELA-GRV-082-QC5`;
- la transición debe volverse atómica o recuperable ante un cierre;
- no se duplica historial ni progreso guiado y la demo no reactiva resume.

**Cierre compartido:** no existe un tutorial completado huérfano ni una partida Canon creada dos
veces. La aceptación detallada pertenece al nuevo plan.

### Fase 7 — Framework contextual y hardening compartido

El runtime global, progreso por concepto y catálogo inicial ya existen. Los conceptos específicos
de la primera Visión y su QA se implementarán desde `first_canon_vision_plan.md`. Este plan conserva
la obligación transversal de:

- mantener observabilidad semántica sin leer logs;
- probar migración web/desktop, remounts, teclado, reduced motion y convivencia con targeting,
  Settings, resultados y capabilities de persistencia;
- ejecutar QA conjunto de **Preparación**, prólogo, handoff y una partida normal.

**Cierre:** un concepto no visto aparece en cualquier partida compatible; uno visto obedece las
preferencias contextuales sin repetirse varias veces en la misma Visión.

## Estrategia de pruebas

Además de conservar la suite guiada actual, el trabajo necesita estas verticales:

- señales: orden, payload, causa, sesión y emisión única con/sin guía;
- rechazos: clic, teclado y drag para Volar, Estabilizándose y quinta Fuente;
- runtime contextual: prioridad, dedupe, revalidación y presentación no bloqueante;
- progreso: migración, commit provisional y rollback;
- director: todas las ramas aprobadas, no sólo el camino feliz;
- letalidad: comparación contra resolución real de cada defensa/respuesta candidata;
- lifecycle del primer corte: la derrota no aborta y presenta el CTA único;
- regresión de producto: derrota normal conserva dos CTA y **Preparación** conserva su overlay.

Los tests no deben depender de textos del log, selectores CSS accidentales ni `setTimeout` como
autoridad semántica.

## Decisiones de producto confirmadas

- **Aprender a jugar** será obligatorio; **Preparación** será opcional.
- Abandonar antes del CTA final reinicia el recorrido y descarta conceptos provisionales.
- El CTA final se llama **Contemplar otro futuro**.
- El primer corte histórico terminó al mostrarlo; la Fase 6 implementó después su activación, el
  vórtice y la carga de la partida Canon.
- En este corte **Continuar** permanece deshabilitado; la demo final lo ocultará y Early Access
  conservará la capacidad de reactivarlo.
- La preferencia de no repetir está activa por defecto; se marca visto al cerrar/aceptar y, si se
  permiten repeticiones, hay un máximo de una aparición por concepto y partida.
- Las ayudas observadas son no bloqueantes; las preventivas interceptan sólo la acción relevante;
  las imprescindibles reutilizan el modo guiado actual.
- Tres Soldados protegen al Titán terminal dentro del Archivo real.
- Choque de Ecos conserva su ventana legal después del revelado terminal.
- La posición del Titán puede variar según los descartes anteriores.
- Todas las llegadas terminales se muestran mediante el revelado normal, una carta a la vez.
- La apertura de Mano de `HF1-ELA-GRV-082-QC5`, su mulligan, Preparación mental, preferencias y
  ayudas posteriores se gobiernan desde `first_canon_vision_plan.md`.

## Decisiones aplazadas expresamente

Mano, mulligan, seed, dificultad, Preparación y recuperación durante el vórtice fueron transferidos
al plan aprobado de la primera Visión Canon. Continúan aplazados aquí:

1. el gate de **Aprender a jugar** en la primera apertura de la aplicación;
2. el tratamiento de perfiles existentes cuando ese gate se active;
3. el contrato de Early Access para enlazar su resume habilitado con el mismo intento sin duplicarlo.

Continúan fuera de este corte el copy narrativo definitivo del prólogo, el lore previo del Cronista
y la cinemática futura.
