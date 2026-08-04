# Semillas del Destino

Nota de diseño para la narrativa del tutorial y el futuro historial de partidas de Hostfall.
Este documento recoge una dirección conceptual; no describe una funcionalidad ya implementada.

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
| Abandonar una partida | Dejar una historia inconclusa que puede retomarse. |

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
- una acción para continuar o volver a explorarla.

### Estados y acciones sugeridos

| Estado | Presentación posible | Acción principal |
| --- | --- | --- |
| Victoria | **Destino preservado** | **Explorar otra posibilidad** |
| Derrota | **Futuro perdido** | **Reescribir destino** |
| Partida guardada | **Historia inconclusa** | **Continuar la Crónica** |

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

## Decisiones pendientes para implementación

- Definir qué información exacta se persiste por Semilla y por intento.
- Decidir si una partida inconclusa puede continuarse o sólo reiniciarse desde la misma seed.
- Aclarar qué configuraciones deben formar parte de la identidad de una Semilla: decks, modo,
  dificultad y futuras variantes de reglas.
- Establecer si el historial tendrá límites, archivado o eliminación manual.
- Diseñar cómo se comunica que repetir una seed conserva sus condiciones deterministas aunque las
  decisiones del jugador creen otra ramificación.
- Revisar el copy final junto con el tutorial y la pantalla real para evitar explicaciones
  excesivas.

