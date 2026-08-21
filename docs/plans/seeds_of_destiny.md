# Semillas del Destino

Nota de diseño para la narrativa del tutorial y el futuro historial de partidas de Hostfall.
El control de reescritura y la identidad básica de cada Futuro ya están implementados; el historial
y la biblioteca personal descritos más abajo siguen siendo dirección conceptual. La auditoría, el
contrato de demo y el orden verificable para implementarlos viven en
[`seeds_of_destiny_history_implementation_plan.md`](seeds_of_destiny_history_implementation_plan.md).

## Premisa

El jugador encarna al Cronista, que observa historias posibles desde fuera del tiempo. Su deber es
encontrar, entre incontables futuros, aquellos desenlaces en los que aún pueda sobrevivir la
esperanza.

Cada *seed* del juego es una **Semilla del Destino**: una línea temporal que todavía no se ha
consolidado. Sus condiciones iniciales, encuentros y peligros ya laten en ella, pero su final aún
no está escrito. Las decisiones del Cronista pueden conducirla hacia desenlaces diferentes.

El Cronista no viaja físicamente al pasado. Observa una posibilidad, aprende de ella y regresa al
origen de la Semilla para intentar reescribir su desarrollo. De esta forma, reintentar una partida
forma parte del mundo narrativo en lugar de ser solamente una acción del sistema.

La idea central se resume así:

> Todo destino comienza como una posibilidad. Tu deber es decidir cuál se convertirá en historia.

## Superficie implementada

- La seed técnica se representa mediante un código cosmético estable **Futuro `NNN·NNN`**. El
  código se deriva hoy de `game.seed`, no es reversible y no sustituye una identidad exacta.
- **Copiar identidad** todavía copia `game.seed`, normalmente un string `hostfall-...`; no incluye
  decks, dificultad ni Preparación y, por sí solo, no es una identidad pública autocontenida.
- El codec Canon `HF1-PPP-HHH-XXD-XXX` ya existe y Seed Explorer entrega sólo su entropía al engine,
  pero el launcher normal todavía no genera ni importa ese código.
- La barra de partida muestra **Reescribir** antes de Música y Ajustes. No aparece en tutoriales ni
  con la seed técnica `developer`.
- **Reescribir este futuro** reinicia siempre la misma seed y conserva Crónica, Hueste, dificultad
  y modo. No permite escribir ni generar otra seed dentro de esa acción.
- **Contemplar otro futuro** vuelve a Preparación conservando la Crónica y la Hueste elegidas; esa
  pantalla genera y muestra la identidad de un Futuro nuevo.
- La seed y el reinicio normal salieron de Ajustes in-game. El reinicio de tutorial y el reinicio
  técnico de Developer Mode conservan sus superficies restringidas.
- Una transición global de vórtice absorbe la pantalla, realiza el reset o la navegación cuando el
  centro ya la cubrió y revela el nuevo estado. Movimiento reducido usa un fundido breve.
- Victoria y derrota muestran **Destino preservado** o **Futuro perdido**, la identidad del Futuro,
  y las mismas acciones de reescritura o contemplación.

Esta superficie todavía no persiste intentos ni convierte el código compacto en una clave única de
historial. Esas responsabilidades pertenecen a la futura biblioteca de Semillas.

## Decisión de producto para la demo — 2026-08-21

- **Continuar** se ocultará en la demo y no se leerán ni mutarán checkpoints jugables. La
  infraestructura actual de resume se conserva detrás de una capability para Early Access.
- Abandonar, cerrar la aplicación o sufrir un corte eléctrico registra un intento **interrumpido**,
  nunca una derrota. Desde el historial sólo puede reescribirse desde el origen, no retomarse a
  mitad.
- El historial factual se implementará independientemente de que se apruebe o descarte la prosa del
  Cronista.
- Antes del historial, toda partida standard autogenerada recibirá una Canon Seed HF1. **Copiar
  identidad** copiará ese código, mientras `game.seed` conservará sólo la entropía interna que
  reproduce el shuffle.
- Preparación tendrá una acción explícita para importar HF1: aplicará decks, dificultad y turnos de
  Preparación codificados antes de jugar. Pegar HF1 en el campo de seed libre no la reinterpreta.
- Las sesiones de seed libre no mostrarán **Copiar identidad**; sólo Developer Mode podrá copiar la
  seed interna bajo un nombre técnico distinto.
- La identidad persistida incluye `canonCode`/entropía o seed libre, Crónica, Hueste, dificultad,
  modo, turnos de Preparación y revisiones compatibles de contenido/reglas; el código
  `Futuro NNN·NNN` sigue siendo sólo una etiqueta cosmética.
- Antes de implementar el historial se validará el relato con fixtures aislados. El usuario elegirá
  entre relato breve, hitos factuales sin prosa o descarte de esa capa.

Una HF1 generada por el juego es **Canon** y reproducible. **Oficial** queda reservado a códigos
curados que aparezcan en un catálogo bundled de Hostfall; no es una propiedad de cualquier partida
aleatoria.

El estado actual del código todavía muestra **Continuar** como opción deshabilitada y no guarda
historial. La lista anterior es el objetivo aprobado para la demo, no una descripción de trabajo ya
entregado.

## Texto propuesto para el tutorial

> **Cronista, escucha.**
>
> Ante ti yace una Semilla del Destino: una historia que todavía no ha ocurrido. Sus peligros ya
> están escritos, pero su desenlace permanece abierto.
>
> Guía a los héroes. Aprende de sus derrotas. Reescribe sus decisiones.
>
> Encuentra el futuro en el que sobrevivan… y haz que sea ese el que recuerde la eternidad.

Una versión más extensa para desarrollar esta idea:

> Tu deber como Cronista es buscar, entre incontables futuros, aquellas semillas que todavía
> puedan florecer.
>
> Cada Semilla del Destino contiene una historia posible: sus encuentros, sus adversarios y sus
> tragedias ya laten en su interior. Pero su final aún no ha sido escrito.
>
> Observa. Interviene. Reescribe cuanto sea necesario.
>
> Si los héroes caen, habrás contemplado un futuro perdido. Si sobreviven, su historia quedará
> inscrita para siempre en la Crónica.

## Traducción narrativa de las acciones del juego

| Acción | Significado dentro del mundo |
| --- | --- |
| Comenzar una seed | Descubrir y contemplar una nueva posibilidad. |
| Reintentar la misma seed | Regresar a su origen para reescribir el destino. |
| Elegir otra seed | Buscar una posibilidad diferente entre incontables futuros. |
| Perder | Contemplar un futuro en el que los héroes cayeron. |
| Ganar | Estabilizar y preservar una versión victoriosa de la historia. |
| Abandonar una partida | Dejar una historia interrumpida que puede reescribirse desde su origen. |

Una derrota no elimina la Semilla: conserva el desenlace observado para que el Cronista pueda
aprender de él. Una victoria tampoco necesita impedir nuevos intentos; el Cronista puede explorar
otras ramificaciones sin borrar el futuro que ya consiguió preservar.

El seed literal `developer` sigue siendo una herramienta ajena al lore, como establece
`CLAUDE.md`.

## Menú «Semillas del Destino»

El menú principal podrá incluir una opción llamada **Semillas del Destino**. Será a la vez el
historial de partidas y el archivo personal del Cronista: una biblioteca de victorias, tragedias e
historias pendientes.

Texto introductorio propuesto:

> **Semillas del Destino**
>
> Aquí reposan los futuros que has contemplado. Algunos fueron preservados. Otros terminaron en
> tragedia. Ninguno está completamente fuera de tu alcance.

Cada Semilla podría mostrar:

- su código;
- la Crónica y la Hueste enfrentadas;
- el resultado o estado actual;
- la cantidad de intentos;
- la fecha del intento más reciente;
- información relevante de la partida, como el turno del desenlace;
- una acción para reescribirla desde su origen o contemplar otro Futuro.

### Estados y acciones sugeridos

| Estado | Presentación posible | Acción principal |
| --- | --- | --- |
| Victoria | **Destino preservado** | **Reescribir este futuro** |
| Derrota | **Futuro perdido** | **Reescribir destino** |
| Intento abandonado o cortado | **Historia interrumpida** | **Reescribir desde el origen** |

Estos nombres son copy propuesto y deberán revisarse en contexto cuando se diseñe la pantalla.

## Historial de reescrituras

Reintentar una Semilla no debería borrar los intentos anteriores. Agrupar los intentos bajo la
misma Semilla permite que las derrotas y la victoria final formen una pequeña historia emergente:

> **Semilla `ELARION-0427`**
>
> Primer presagio — Los héroes cayeron en el turno 6.
>
> Segunda reescritura — La Hueste fue derrotada en el turno 9.
>
> **Destino preservado.**

Así, el registro no se limita a decir si el jugador ganó o perdió: muestra cómo el Cronista vio un
futuro terrible, aprendió de él y encontró una ramificación victoriosa.

## Decisiones todavía abiertas

- Establecer la política definitiva de retención, archivado o eliminación por Semilla.
- Diseñar cómo se comunica que repetir una seed conserva sus condiciones deterministas aunque las
  decisiones del jugador creen otra ramificación.
- Revisar el copy final y qué hechos visibles sobreviven al prototipo de relato.
- Definir en Early Access cómo una partida reanudable se vincula al mismo `attemptId` sin crear un
  intento duplicado.

La forma exacta de persistencia, los estados del intento, la identidad compuesta y los gates de
validación ya no están abiertos: se fijan en el plan técnico enlazado al comienzo de este documento.

