# Modos de juego

Notas de diseño para variantes futuras. Estas reglas todavía no forman parte necesariamente del engine.

## Modo difícil

El objetivo no es solamente aumentar estadísticas, sino obligar al jugador a tomar decisiones distintas.

Posibles modificadores:

- Las criaturas débiles pueden recibir `MENACE`.
- Las criaturas grandes pueden recibir `TRAMPLE`.
- Algunos enemigos pueden recibir `DEATHTOUCH`.
- La Horda puede comenzar con un permanente especial en el campo.
- Surge puede comenzar antes o revelar una carta adicional.
- Algunas criaturas pueden recibir una keyword al entrar al campo.

Los modificadores deberían ser pequeños, visibles y fáciles de anticipar. Ejemplo:

> Los Zombies con fuerza 3 o mayor tienen Menace.

Posible progresión de dificultad:

- **Veterano:** mejores estadísticas.
- **Pesadilla:** keywords adicionales.
- **Apocalipsis:** estadísticas, keywords y Surge más agresivo.

Evitar repartir demasiadas keywords ocultas: una derrota debe sentirse explicable y no arbitraria.

## Modo Chaos

Chaos es un modo separado de la dificultad normal. Tiene su propia entrada **Chaos Mode** debajo de **Play** en el menú principal.

### Ritmo de partida

- El jugador roba 2 cartas por turno.
- No hay turnos de preparación.
- El jugador comienza con 1 energía básica enderezada en el campo.
- La energía inicial se retira del deck; no se crea una copia adicional.
- El jugador comienza con su mano normal de 7 cartas y no roba durante el primer turno.
- Surge comienza en el turno 8 de la Horda.
- Se conservan las reglas generales de energía: máximo 5 energías y una acción de energía por turno, incluyendo reciclar una energía.
- Se mantiene la mano inicial normal.

La energía inicial se probará con valor 1. Si el primer ataque de la Horda deja muy poco espacio para responder, se puede subir a 2 después de playtesting.

### Mutación de criaturas

- Todas las criaturas reciben mutación, incluyendo tokens.
- Las keywords impresas originales se eliminan y son reemplazadas por las keywords obtenidas mediante Chaos.
- La primera keyword mutada está garantizada.
- Después de obtener una keyword existe una probabilidad de obtener otra; esa probabilidad disminuye con cada éxito.
- No se repiten keywords en una misma criatura.
- Todas las keywords del pool tienen la misma probabilidad de ser elegidas.
- Todas las copias de una misma definición de carta comparten la misma mutación durante esa partida.
- La mutación se determina mediante la seed y puede repetirse usando la misma seed.
- El jugador descubre la mutación cuando la carta se revela en la partida.

Propuesta inicial para las tiradas sucesivas:

- Primera keyword: 100%.
- Segunda keyword: 25%.
- Tercera keyword: 20%, solamente si obtuvo la segunda.
- Cuarta keyword: 10%, solamente si obtuvo la tercera.
- Quinta keyword y posteriores: la probabilidad continúa reduciéndose a la mitad hasta que una tirada falla o se agota el pool.

Con estos valores, el 75% de las criaturas tendrá una sola keyword, el 20% tendrá exactamente dos y aproximadamente el 5% llegará a tres. Solo alrededor del 0.5% llegará a cuatro. Los porcentajes son valores de balance y pueden ajustarse sin cambiar la regla central.

### Pool de keywords

Cada lado obtiene keywords únicamente del pool de su propio mazo. No hay un pool global ni se agregan keywords ajenas a la identidad del deck. Todas las opciones válidas tienen el mismo peso.

El pool se forma con las keywords impresas originalmente en las criaturas y tokens del deck, antes de aplicar las mutaciones. Las keywords otorgadas temporalmente o mediante efectos de permanentes no entran al pool.

### Cartas excluidas

- Graf Harvest no forma parte del deck de Zombies en Chaos.
- Los permanentes no criatura se eliminan del deck antes de barajarlo.
- Las tierras/energías son la excepción y permanecen en el deck.
- Los instants y sorceries permanecen en el deck.
- Las cartas eliminadas no aportan keywords al pool de Chaos.
- Las criaturas que conceden keywords permanecen en el deck y conservan el resto de sus efectos.

### Presentación pendiente

- **Chaos Mode** aparece debajo de **Play** y abre su propio menú.
- Debe conservar el estilo dark medieval del juego, pero sentirse inestable, extraño y peligroso.
- La UI debe mostrar claramente todas las keywords mutadas cuando la carta se vuelve visible.
