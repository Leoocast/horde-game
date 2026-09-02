# Plan por fases — Primera Visión Canon después de Aprender a jugar

Estado: **implementación completada; QA manual de ritmo y presentación pendiente**.

Última actualización: **2026-09-01**.

Implementación cerrada el 2026-09-01 en el director `firstCanonVision`, el runtime contextual de
producto y las superficies normales de Mano, Preparación, Campo y detalle. Typecheck, build web y
la suite completa quedaron verdes; el cierre definitivo conserva el QA manual del usuario previsto
en la Fase 6.

## Autoridad y alcance

Este documento gobierna la experiencia que comienza cuando **Contemplar otro futuro** termina el
vórtice y carga la Inscripción Canon `HF1-ELA-GRV-082-QC5` como una Visión normal:

- **El Pacto de Elarion** contra **El Alzamiento de los Sinsepulcro**;
- dificultad Normal;
- tres turnos de Preparación;
- RNG, historial y reglas normales. La persistencia jugable obedece las capabilities del producto:
  la demo registra historial, pero no lee ni escribe checkpoints de resume.

No rediseña el prólogo de **Aprender a jugar**, no crea otra `GuidedLesson` y no sustituye la
lección opcional **Preparación**, cuyo id técnico sigue siendo `first-seed`. La fuente de verdad del
prólogo hasta el handoff continúa en
[`learn_to_play_tutorial.md`](learn_to_play_tutorial.md); su plan técnico continúa en
[`learn_to_play_implementation_plan.md`](learn_to_play_implementation_plan.md). Este documento es la
fuente de verdad de la apertura de Mano, el mulligan, los cuadros iniciales de Preparación y las
ayudas contextuales pedidas para la Visión posterior.

«Apertura» en este plan significa la apertura de Mano de esa Visión. No decide el gate de primera
apertura de la aplicación ni la migración de perfiles existentes; esas decisiones siguen abiertas
en `learn_to_play_implementation_plan.md`.

El trabajo aquí descrito sigue siendo un plan. Cada fase debe revisarse antes de modificar código.

## Decisiones de producto cerradas

- La partida sigue siendo una Visión normal. Las ayudas observan y acotan acciones concretas, pero
  no reconstruyen el estado mediante una receta guiada ni alteran el orden de los Archivos.
- La secuencia ordenada de Mano y Preparación se presenta obligatoriamente en el primer handoff
  desde **Aprender a jugar**. La preferencia de repetición no puede suprimir ese primer encuentro.
- Al Contemplar de nuevo este Futuro, la secuencia sólo reaparece si la preferencia existente
  **No volver a mostrar explicaciones ya vistas** permite repetirlas. No se añade un interruptor
  maestro distinto en este plan.
- Un concepto contextual no visto conserva siempre su primera aparición. Uno visto sólo reaparece
  cuando se permiten repeticiones, con un máximo de una aparición por concepto y Visión.
- Mano vacía, Devolver Fuente, Volar y Estampida son recapitulaciones exigidas una vez por el perfil
  de primera Visión Canon aunque el prólogo ya haya marcado el concepto global como visto. Cada una
  espera a que ocurra su contexto real; después de mostrarse una vez, vuelve a obedecer la
  preferencia global normal.
- La elegibilidad de repetición se fija al crear la nueva Visión. Cambiar la preferencia durante una
  secuencia ya iniciada no deja gates a medio liberar ni cancela el cuadro actual; el nuevo valor se
  aplica a la siguiente Visión.
- **Marco Dorado** es el nombre canónico de la animación de marco usada para señalar una carta,
  botón o superficie accionable. Se reutiliza el mismo material y movimiento ya usado en **Mi
  Turno**, Ecos y cartas de la Mano; no se crea otro efecto parecido.
- Durante los cuadros de la Mano se bloquean el hover, el preview y las acciones de sus cartas.
  Música y Ajustes permanecen visibles, accesibles y utilizables con puntero y teclado.
- **Choque de Ecos** se explica al jugador como un Hechizo Rápido que puede lanzarse «en cualquier
  momento». Esa formulación es el lenguaje pedagógico aprobado para sus ventanas actuales; este
  plan no añade prioridad durante animaciones ni cambia la resolución del engine.
- **Hechizo Básico** es una categoría pedagógica para un `SPELL` sin `QUICK`; no añade un modifier
  `BASIC`, no cambia los datos de Escudo y no amplía el schema de cartas.
- **El Santuario Quebrado** muestra en su detalle la placa **Otorga: Imponente**, con la misma
  jerarquía visual que una palabra clave. El Apoyo no adquiere `DAUNTING`: concede Imponente a los
  Zombis aliados mientras permanece en el Campo.
- El umbral de Vida de esta ayuda es estricto: se activa al cruzar de 10 o más a menos de 10.
- Los textos en español son la base de implementación. Las formulaciones fijadas expresamente por
  el usuario —Hechizo Básico, Hechizo Rápido y Letal— son contractuales; el resto conserva la idea
  aprobada y admite pulido de voz durante QA sin cambiar su aprendizaje. La versión en inglés se
  redactará con la misma intención, longitud aproximada y precisión antes de cerrar cada fase.

## Estado determinista que debe certificarse

La implementación no puede cambiar la seed para facilitar el flujo. Un golden test debe fijar, con
el engine real, al menos este vector:

### Mano inicial de siete cartas

1. Río de Elarion.
2. Vaelor, Guardián Esmeralda.
3. Hidra de la Fronda Negra.
4. Flor del Alba.
5. Kaelor, Convocador de Tormentas.
6. Río de Elarion.
7. Kaelor, Convocador de Tormentas.

### Mano después de exactamente un mulligan real

1. Flor del Alba.
2. Escudo de la Heredera.
3. Río de Elarion.
4. Liora, Guardiana de la Arboleda.
5. Río de Elarion.
6. Río de Elarion.

El clic en **Volver a robar** debe ejecutar `mulliganOpeningHand` y consumir el RNG normal. Un
segundo intento queda bloqueado antes de entrar al engine, por lo que no cambia Mano, RNG, Archivo,
historial ni número de mulligans.

Después del mulligan, el comienzo del Archivo del Cronista, de arriba hacia abajo, queda fijado como:

1. Hidra de la Fronda Negra.
2. Vaelor, Guardián Esmeralda.
3. Aelyra, Heredera de Elarion.
4. Kaelor, Convocador de Tormentas.
5. Eco de la Ciudad Olvidada.
6. Río de Elarion.
7. Maela, Vigía de las Alturas.
8. Aelyra, Heredera de Elarion.
9. Río de Elarion.
10. Choque de Ecos.
11. Río de Elarion.
12. El Juicio de Elarion.

El primer paso terminado de Preparación roba Hidra; el segundo roba Vaelor; cerrar Preparación 3/3
despierta a la Hueste sin otro robo, y Aelyra es el siguiente robo normal. El golden test no se
limita a esta lista abreviada: serializa el orden completo de Mano, Archivo del Cronista, Archivo de
la Hueste y `currentRandomState` antes y después del mulligan. Así cualquier cambio queda explícito
y no depende de interpretar qué carta era «relevante».

## Contrato de preferencias y repetición

| Lanzamiento | Estado previo | No repetir vistas | Resultado |
| --- | --- | --- | --- |
| Primer `learn-to-play-handoff` con milestone incompleto | Grupo no completado | Cualquier valor | Presenta la secuencia ordenada completa; es el primer encuentro contractual. |
| Handoff posterior, `rewrite` o `history-replay` del mismo Futuro | Grupo completado | Activado | No repite Mano ni Preparación; los conceptos posteriores vistos también se suprimen. |
| Handoff posterior, `rewrite` o `history-replay` del mismo Futuro | Grupo completado | Desactivado | Repite la secuencia desde el comienzo, como máximo una vez en esa Visión. |
| Restore de la misma sesión, sólo cuando la capability de resume está habilitada | Grupo parcial | Valor fijado al lanzar | Rehidrata el siguiente paso pendiente; no vuelve a ejecutar el mulligan ni repite cuadros aceptados. |
| Importación o partida nueva con `source: "play"` | Cualquier estado | Cualquier valor | No instala la secuencia ordenada sólo por coincidir el código de seed. Los conceptos globales siguen su política normal. |

Para esta decisión de repetición, «tener activadas las ayudas contextuales» significa permitir que
las explicaciones ya vistas vuelvan a mostrarse; en la preferencia vigente, **No volver a mostrar
explicaciones ya vistas** debe estar desactivada.

El grupo de Mano/Preparación tiene un milestone de finalización versionado y etapas efímeras por
sesión. Si una Visión termina antes de completar el grupo, una nueva Visión elegible lo reinicia
desde el primer cuadro: no se guarda una secuencia parcial en el perfil. Sólo un restore real de la
misma sesión, en una capability que admita resume, continúa desde el siguiente checkpoint estable.

La procedencia se guarda de forma explícita. `rewrite` cubre **Contemplar de nuevo** desde el tablero
o el desenlace; `history-replay` cubre abrir el mismo Futuro desde Historial. En builds con resume,
restaurar el mismo checkpoint no crea una repetición. En la demo, cerrar la aplicación interrumpe el
intento histórico y no restaura la partida. Ningún caso se infiere sólo desde el string de la seed.

## Experiencia ordenada de Mano inicial

La explicación vive dentro del diálogo real de apertura. Se reserva una franja sobre las cartas;
no se monta un segundo `aria-modal` encima ni se permite que el cuadro cubra la Mano.

### 1. Un Futuro ya vivido

Al terminar la entrada visual de las siete cartas se muestra el primer cuadro. Mientras está
visible:

- hover, zoom, preview, click derecho y acciones de las cartas quedan bloqueados;
- las intenciones de **Conservar** y **Volver a robar** se interceptan antes del engine y quedan
  bloqueadas;
- Música y Ajustes siguen disponibles.

El alcance de foco de la apertura es compuesto: incluye el cuadro, sus acciones y los controles
globales de Música/Ajustes que ya viven por encima del overlay. `Tab` y `Shift+Tab` no alcanzan las
cartas ni el tablero, pero sí esos controles. `Escape` nunca acepta el aprendizaje ni compromete una
acción de Mano; si Ajustes está abierto, sólo cierra su propia superficie y restaura el foco.

> **Un Futuro ya vivido**  
> Yo ya viví este Futuro, Cronista. Con estos Ecos, torcer el curso de la Hueste será demasiado
> incierto. Volvamos a robar; quizá la Visión nos muestre una senda más firme.

### 2. Volver a robar

Al aceptar el cuadro:

- se habilita el hover normal de las cartas;
- **Conservar** permanece bloqueado;
- **Volver a robar** queda habilitado y recibe el Marco Dorado;
- el jugador debe ejecutar el mulligan real; no se simula ni se sustituye la Mano desde UI.

El store publica un receipt y una señal semántica de mulligan completado con revisión, cantidad,
ids anteriores, ids nuevos y `mulligansTaken`. La secuencia espera a que las seis cartas terminen de
entrar antes de avanzar.

### 3. La Visión responde

La segunda Mano bloquea inmediatamente cualquier nuevo mulligan. Cuando termina de asentarse se
vuelven a suprimir los hovers de carta y aparece:

> **La Visión responde**  
> Sí… éstos son. La Visión los reconoce, y yo también. Con estos Ecos podremos contener a la Hueste
> y preservar el Futuro. Conserva esta Mano.

Al aceptar, vuelve el hover, **Conservar** queda habilitado y **Volver a robar** permanece visible
pero deshabilitado. Aceptar la Mano continúa la apertura normal.

## Experiencia ordenada de Preparación

El director espera a que el banner de Preparación termine. No abre cuadros durante la entrada de
cartas, cambios de fase ni otra presentación global.

### 1. Concentrar la mente

El primer cuadro se acompaña con Marco Dorado en `setup.progress`, arriba a la izquierda:

> **Concentrar la mente**  
> Al iniciar una Visión, debemos concentrar la mente, Cronista. Tendremos tres turnos de Preparación
> para reunir nuestras mejores fuerzas y escoger las opciones que darán forma a este Futuro.

### 2. El límite de la concentración

Antes de liberar el juego aparece el segundo cuadro:

> **El límite de la concentración**  
> Sin embargo, mientras estemos tan concentrados en la Visión, no podremos conservar la Energía
> sobrante de tus Fuentes entre los turnos de Preparación. Aprovéchala antes de terminar cada turno.

El texto describe la Energía sobrante de las Fuentes entre pasos de Preparación; no afirma que la
Reserva generada directamente por un efecto esté bloqueada. Al aceptarlo se retira el Marco Dorado
y el jugador conserva libertad normal durante los tres turnos.

### 3. La Hueste despierta

Cuando el jugador pulsa **Terminar turno** en Preparación 3/3, el director retiene esa intención y
abre el aviso antes de que comiencen revelados o ataques. Mientras está visible no se vuelve a abrir
el tablero ni se permite cambiar decisiones. No se le pide revisar el Campo ni repetir el clic: sus
decisiones ya fueron tomadas y el cuadro es sólo un aviso.

> **La Hueste despierta**  
> Cronista, espero que hayas tomado tus mejores decisiones. La Preparación ha terminado; a partir
> de este turno, la Hueste atacará.

Al aceptar, la misma intención se autoriza automáticamente y comienza el turno de la Hueste.

## Catálogo contextual de esta Visión

Cada concepto usa señales, resultados y estado tipado. Ninguno se activa leyendo el log, el copy
visible, un nombre CSS o un timeout. Las identidades concretas pertenecen al catálogo de producto;
el runtime genérico continúa siendo independiente de decks y cartas.

Las cuatro recapitulaciones procedentes del prólogo llevan un ledger `first-canon-recap` separado.
Si una no ocurre en el primer intento, permanece pendiente para la siguiente Visión de este mismo
Futuro hasta encontrar su situación real. Mostrarla consume sólo ese recap; no borra ni duplica el
progreso global del concepto.

| Concepto | Disparador semántico | Presentación y comportamiento | Copy español |
| --- | --- | --- | --- |
| Hechizo Básico | Primer `card.played` de **Escudo de la Heredera**, validado como `SPELL` sin `QUICK`. | Cuadro informativo después de resolver el Hechizo. | **Hechizo Básico** — «Escudo de la Heredera es un Hechizo Básico. Sólo puedes lanzarlo durante tu fase Principal.» |
| Imponente | Primer defensor asignado a un atacante que posee Imponente en ese estado. | Resaltar atacante y defensores. Aparece tras la primera asignación, antes de confirmar una defensa insuficiente. | **Imponente** — «Un Eco Imponente sólo puede ser contenido por dos o más defensores. Los enfrentará uno por uno, en el mismo orden en que los asignes.» |
| Mano vacía | Robo automático de dos cartas con la Mano realmente vacía. | Reutilizar el mismo cuadro del tutorial; bloquea el tablero mientras está visible. | «Al comenzar tu turno con la Mano vacía, robas 2 cartas en lugar de 1.» |
| Quinta Fuente | Rechazo tipado al intentar jugar una quinta Fuente con el contenedor completo. | Reutilizar el mismo cuadro e interacción de **Devolver Fuente** del tutorial. | Se conserva el copy vigente de **Devolver Fuente**. |
| Hechizo Rápido | Turno de la Hueste, atacantes declarados y **Choque de Ecos** realmente disponible para jugar. | Levantar Choque mediante el estado visual de Mano y poner Marco Dorado. El levantamiento termina al jugarlo, perder la ventana, cerrar la ayuda o cambiar de sesión. | **Hechizo Rápido** — «Choque de Ecos es un Hechizo Rápido: puedes lanzarlo en cualquier momento.» |
| Estampida | Primera `host.surgeStarted`, después de su animación y antes de continuar con los revelados. | Cuadro bloqueante sobre el tablero asentado; al aceptarlo continúan los revelados. | **La Estampida** — «¡Cronista! Ha llegado el momento. En cada Visión, al llegar el turno 10, la Hueste entra en Estampida y su ofensiva se vuelve mucho más peligrosa. Ten cuidado.» |
| Veneno | La Hidra hace daño de Batalla a la Hueste y añade Veneno. | Esperar a que terminen impacto y contadores; resaltar Hidra y contador de Veneno. | **Veneno** — «Cada vez que la Hidra dañe a la Hueste, dejará 1 de Veneno. Al acumular 3, la Hueste descartará una carta de su Archivo.» |
| Furtivo | Intento rechazado con `FURTIVE_BLOCK_RESTRICTION`. | Cuadro reactivo anclado al atacante y al defensor inválido. | **Furtivo** — «Los Ecos Furtivos eluden a quienes los superan en Fuerza. Sólo un Eco con Fuerza igual o menor puede cerrarles el paso.» |
| Letal | Primer intento de asignar un defensor a un atacante Letal. | Intervención preventiva: explica antes de comprometer la asignación y permite repetirla después. | **Letal** — «Ten cuidado, Cronista: cualquier cantidad de daño de un Eco Letal destruye al defensor, sin importar su Aguante.» |
| Volar | Intento rechazado con `BLOCK_REQUIRES_FLYING_OR_SKYGUARD`. | Reutilizar el mismo cuadro del tutorial, anclado a ambas cartas. | Se conserva el copy vigente de Volar y Guardia aérea. |
| Apoyo de la Hueste | **El Santuario Quebrado** termina de entrar y todas sus auras, buffs y VFX están asentados. | Cuadro cerca del Apoyo y Marco Dorado sobre la carta. | **Los Apoyos de la Hueste** — «A veces, la Hueste invoca Apoyos para fortalecer a sus Ecos. Mientras El Santuario Quebrado permanezca en el Campo, sus Zombis serán Imponentes.» |
| Vida menor de 10 | Un ataque de la Hueste termina y la Vida cruza de `>= 10` a `< 10`, sin resultado terminal. | Cuadro tras todas las animaciones. Al cerrarlo queda un Marco Dorado no bloqueante en **Contemplar de nuevo**; no obliga a usarlo. | **Todavía podemos aprender** — «La Visión se estrecha, Cronista, pero nada de lo aprendido se pierde. Puedes Contemplar de nuevo este Futuro y regresar con cada decisión más clara. A veces, la victoria empieza por recordar cómo caímos.» |

El copy presenta como regla de producto aprobada que la Estampida llega en el turno 10 de cada
Visión. El disparador técnico no cuenta turnos por su cuenta: escucha `host.surgeStarted`, de modo
que el cuadro y el engine no puedan divergir silenciosamente.

## Marco Dorado y estados visuales

La implementación debe extraer el patrón vigente de `LearnToPlayJourneyCues` a una primitiva
reutilizable, por ejemplo `AnchoredGoldenFrame`, con estas propiedades:

- resuelve un anchor semántico desde el registro vigente;
- sigue su geometría durante layout y animación;
- no captura interacción por sí mismo;
- admite `prefers-reduced-motion` sin perder el énfasis;
- se limpia al desaparecer el target, cambiar la sesión o terminar el concepto;
- no crea otra jerarquía de dorados para cartas frente a botones.

Anchors mínimos nuevos:

- `opening.mulliganAction` para **Volver a robar**;
- `destiny.contemplateAgain` para el launcher de **Contemplar de nuevo**.

Las cartas continúan usando sus anchors por `instanceId`. Levantar **Choque de Ecos** reutiliza el
estado sostenido de la Mano; no aplica transformaciones imperativas a las capas de fan, drag o
layout.

## Click derecho, detalle y palabras clave

El click derecho vigente abre el `CardPreview` bloqueado. La fase visual debe:

- añadir un fade negro sutil a su capa de descarte, sin modificar el fondo del overlay de Mano;
- mantener la carta y sus explicaciones como foco dominante, sin blur pesado;
- cerrar con click exterior, botón visible o Escape;
- declarar semántica de diálogo, foco inicial, contención de foco y restauración al origen;
- ofrecer una ruta equivalente por teclado para inspeccionar una carta;
- aplicar el mismo tratamiento al detalle ampliado que sí sea alcanzable en runtime.

Los cuadros explicativos de palabras clave reciben fondo más definido, borde de mayor contraste,
halo suave de su color, mejor interlineado y separación. Este estilo se limita a preview y detalle;
no intensifica globalmente todos los pills del tablero, Archivo o Memoria.

Para **El Santuario Quebrado**, el detalle añade una entrada presentacional:

> **Otorga: Imponente**  
> Cuando ataquen, los Zombis aliados requieren dos o más Ecos defensores mientras este Apoyo
> permanezca en el Campo.

La entrada usa el icono, halo y legibilidad de Imponente, pero no hace que
`hasTrait(santuario, "DAUNTING")` devuelva verdadero. Los Ecos beneficiados siguen mostrando
Imponente como Rasgo efectivo mediante `getTraits`.

## Arquitectura propuesta

### Director de primera Visión

Crear un director pequeño y versionado, separado de `GuidedLessonDefinition`, con etapas derivadas
de receipts y checkpoints estables:

`opening-intro -> await-mulligan -> mulligan-settling -> keep-hand -> preparation-intro ->`
`preparation-energy -> free-play -> host-awakening-warning -> completed`

El director:

- se instala por procedencia y preferencias, no por nombres dentro de componentes;
- autoriza o bloquea sólo `opening.accept` y `opening.mulligan` durante la secuencia de Mano;
- suprime sólo interacciones de carta cuando un cuadro lo requiere;
- observa el `GameState` vivo y nunca reconstruye la partida;
- puede rehidratar la etapa sólo en builds cuya capability restaure ese mismo `GameState`; la demo
  no activa resume;
- cede al runtime contextual global después del aviso del despertar.

La activación del CTA y la creación del intento histórico deben volverse atómicas o recuperables:
cerrar durante el vórtice no puede dejar el tutorial marcado como completado sin una Visión Canon
válida. La recuperación usa una transacción o marcador específico del handoff, no reactiva ni
escribe `resume-v1` en la demo. Una vez creada la partida, cerrar la demo conserva la política actual:
el intento queda interrumpido en historial y no aparece **Continuar**.

### Runtime contextual

Ampliar el contrato de presentación para separar:

- cuadro visible;
- Marco Dorado persistente después del cuadro;
- carta de Mano levantada;
- supresión de hover/preview de cartas;
- bloqueo de una intención concreta;
- política de repetición fijada para la Visión.

El runtime mantiene una sola enseñanza activa, prioridad, deduplicación por Visión, revalidación del
target y espera de presentación. Los cuadros nuevos declaran una revisión estable para que un
cambio pedagógico sustancial pueda volver a enseñarse sin resetear conceptos no relacionados.

### Observabilidad

Reutilizar las señales existentes donde ya expresan el hecho real:

- `card.played` para Hechizo Básico;
- `blocker.assigned` para Imponente;
- `action.denied` tipado para Furtivo, Volar y quinta Fuente;
- `host.attackersDeclared` para buscar Choque realmente jugable;
- `host.surgeStarted` para Estampida;
- ataque confirmado al Archivo y rasgo efectivo para Veneno;
- `host.cardsRevealed` más barrera de presentación para Santuario;
- `player.lifeLost` más settle del combate para Vida baja.

Añadir un receipt/señal de mulligan completado. Sólo añadir una señal específica de Veneno si el
estado disponible no permite atribuir de forma inequívoca el contador a la Hidra después del settle.
No usar animadores como fuente semántica.

Extraer de `Hand` un selector puro compartido para determinar si Choque está disponible; debe
consultar timing, Energía, targets y reglas reales sin duplicarlas en el concepto contextual.

## Fases de implementación

### Fase 0 — Contratos, preferencias y golden vector

- Registrar este plan como autoridad post-handoff y retirar decisiones obsoletas de los planes
  anteriores.
- Fijar el milestone versionado del grupo Mano/Preparación y su matriz con
  `hideSeenContextualHelp`.
- Certificar la Mano inicial, el primer mulligan, ambos Archivos completos,
  `currentRandomState` y la secuencia exacta de robos de `HF1-ELA-GRV-082-QC5`.
- Fijar ids y revisiones de conceptos, copies ES y equivalentes EN.

**Cierre:** preferencias migradas sin perder progreso y golden vector aprobado sin cambiar la seed.

### Fase 1 — Lifecycle y director recuperable

- Propagar procedencia `learn-to-play-handoff` y linaje de **Contemplar de nuevo** al contexto de
  guidance.
- Crear el director de primera Visión y, sólo bajo una capability con resume, su rehidratación desde
  el mismo checkpoint normal.
- Hacer atómico o recuperable el tramo CTA -> vórtice -> partida normal mediante un marcador de
  handoff acotado, sin habilitar checkpointing en la demo.
- Probar que importar la seed no instala el director y que **No volver a mostrar** suprime un grupo
  ya completado al repetir la Visión.

**Cierre:** no existen tutorial completado huérfano, intento histórico duplicado por la recuperación
ni checkpoint de demo escrito por accidente.

### Fase 2 — Mano y mulligan

- Añadir anchor de **Volver a robar** y receipt de mulligan completado.
- Reservar el panel narrativo sobre las cartas.
- Implementar los tres estados visibles, el scope de hover y el único mulligan real.
- Cubrir doble clic, teclado, foco, Settings, Música y cierre/reanudación.

**Cierre:** la Mano certificada cambia una sola vez y ninguna entrada alternativa consume RNG
adicional.

### Fase 3 — Preparación mental y despertar

- Esperar el banner y registrar el Marco Dorado de `setup.progress`.
- Presentar **Concentrar la mente** y **El límite de la concentración** antes de liberar el juego.
- Retener la intención de terminar Preparación 3/3, mostrar **La Hueste despierta** y autorizar esa
  misma intención automáticamente al aceptar, sin pedir otro clic ni reabrir decisiones.
- Mantener Reserva directa utilizable y no introducir una regla falsa en tooltips o copy.

**Cierre:** los cuadros nunca pisan robos, banners, revelados o animaciones; el aviso final no
ofrece decisiones que ya no existen.

### Fase 4 — Conceptos de reglas y recaps

- Añadir Hechizo Básico, Imponente, Hechizo Rápido, Veneno, Furtivo y Letal.
- Reutilizar Mano vacía, Devolver Fuente, Volar y Estampida con las revisiones de copy aprobadas.
- Definir prioridades cuando dos conceptos coincidan y revalidar cartas/targets antes de mostrar.
- Mantener el levantamiento de Choque y todos los Marcos Dorados como presentación declarativa.

**Cierre:** cada concepto aparece en su primer contexto real, como máximo una vez por Visión; las
repeticiones obedecen `hideSeenContextualHelp` y los cuatro recaps conservan su ledger obligatorio.

### Fase 5 — Santuario, Vida baja y detalle de carta

- Añadir la llegada asentada de Santuario y su Marco Dorado.
- Añadir **Otorga: Imponente** sin mutar rasgos del Apoyo.
- Añadir el umbral de Vida y el cue de **Contemplar de nuevo**.
- Implementar fade, accesibilidad y material mejorado de palabras clave en preview/detalle.
- Registrar las variantes reutilizables en UI Reference o marcarlas **Revisar en contexto**.

**Cierre:** reglas efectivas y reglas otorgadas se distinguen visual y mecánicamente; los overlays
no compiten por foco o z-index.

### Fase 6 — Hardening y QA final

- Completar paridad ES/EN.
- Ejecutar typecheck, suite de engine/guidance/UI y build cuando corresponda.
- Validar reduced motion, escalas, teclado, screen reader, Settings, resultados, targeting, drag,
  capabilities de persistencia y Contemplar de nuevo.
- Realizar QA manual del usuario sin levantar un servidor como parte de la verificación del agente.
- Actualizar en `CLAUDE.md` el estado de implementación y sustituir el resumen de este plan por los
  contratos vigentes cuando no queden decisiones ni QA pendientes.

**Cierre:** recorrido completo aprobado en la seed real, sin regresiones cuando las explicaciones
vistas deben permanecer suprimidas.

## Estrategia de pruebas

Como mínimo:

- `tests/canonSeed.test.js`: Mano inicial, primer mulligan, arrays completos de ambos Archivos,
  `currentRandomState` y robos exactos de Preparación/primer turno normal.
- `tests/matchOrigin.test.js` y lifecycle: procedencia, linaje, vórtice interrumpido y un solo intento
  histórico.
- progreso contextual: milestone del grupo ordenado, ledger de recaps obligatorios, matriz de
  repetición, revisiones y dedupe por Visión.
- gate de interacción: conservar bloqueado, un solo mulligan, doble clic, Enter/Espacio, hover de
  cartas suprimido y Música/Ajustes accesibles.
- runtime contextual: prioridades, revalidación, cartas ausentes y espera de presentación.
- reglas: timing de Básico/Rápido, dos defensores para Imponente y orden, Furtivo, Letal, Veneno y
  umbral estricto de Vida.
- presentación: anchors nuevos, Marco Dorado, levantamiento y limpieza de Choque, Santuario tras
  VFX, cue de Destino y convivencia de capas.
- detalles: **Otorga: Imponente**, Ecos con Imponente efectivo, fade, foco, Escape y estilos
  limitados a preview/detalle.
- localización: inventario completo y paridad de placeholders ES/EN.

Los tests no deben depender de strings del log, sleeps, orden accidental del DOM ni selectores de
estilo como autoridad de gameplay.

## Fuera de alcance

- Cambiar la seed, decks, dificultad, tres turnos de Preparación o orden determinista.
- Convertir la partida en una receta guiada, desactivar su historial normal o reactivar el resume de
  la demo.
- Cambiar las reglas de `QUICK`, añadir pila o prioridad durante resoluciones y animaciones.
- Rebalancear cartas para garantizar que todos los conceptos aparezcan. Santuario, Hidra, Furtivo,
  Letal y demás ayudas son condicionales a que la partida produzca su contexto.
- Forzar al jugador a usar **Contemplar de nuevo** al bajar de 10 de Vida.
- Rediseñar globalmente pills, cartas, Archivo, Memoria o todos los modales del juego.
- Voces, cinemáticas nuevas o diálogo hablado del Cronista.

## Criterio de cierre

El plan se considera implementado cuando la seed conserva su vector determinista, la experiencia
completa respeta las preferencias contextuales y todas las entradas alternativas relevantes, cada
cuadro aparece después del settle correcto, Santuario comunica **Otorga: Imponente** sin alterar
reglas y la suite completa queda verde. Hasta entonces permanece en **Planes abiertos**.
