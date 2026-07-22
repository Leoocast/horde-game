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
- El jugador comienza con 35 vidas.
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

## Modo Twin Hosts

Twin Hosts es un modo arcade futuro en el que una Chronicle se enfrenta a dos mazos de Horda durante la misma partida. Su objetivo es crear combinaciones enemigas nuevas reutilizando los Hosts existentes, sin convertir la partida en una campaña o un roguelike.

Estado: **concepto de diseño; todavía no implementado**.

### Selección de combatientes

- El jugador selecciona 1 Chronicle.
- El jugador selecciona 2 Hosts diferentes.
- Cada Host conserva su propia biblioteca, cementerio y exilio.
- Las criaturas y otros permanentes de ambos Hosts comparten el mismo campo de batalla.
- La seed determina de forma reproducible el orden de ambos mazos.

### Turnos de la Horda

- Los Hosts se alternan como Host activo durante los turnos de la Horda.
- Solamente el Host activo revela cartas ese turno.
- Todas las criaturas de ambos Hosts atacan juntas, sin importar cuál esté activo.
- Si un Host es derrotado, el Host restante se convierte en el activo durante todos los turnos posteriores.

Ejemplo:

1. Zombies revela; Zombies y Goblins atacan.
2. Goblins revela; Zombies y Goblins atacan.
3. Se repite la alternancia mientras ambos Hosts sigan activos.

### Ataque del jugador

Propuesta inicial:

- Antes de confirmar el ataque, el jugador elige cuál de los dos Hosts será el objetivo.
- Todo el daño de ese combate se asigna al Host elegido; inicialmente no se permite dividir atacantes entre ambos.
- Cada 3 puntos de daño millean 1 carta de la biblioteca del Host objetivo, igual que en el modo normal.
- Los poison counters pertenecen al Host que recibió el daño con Toxic.
- Cada Host procesa por separado el mill producido por sus poison counters.

Elegir un único objetivo por combate mantiene clara la UI y crea una decisión estratégica sin rehacer todo el sistema de asignación de atacantes.

### Surge

Propuesta inicial:

- Surge utiliza un contador global compartido.
- Antes de Surge, los Hosts continúan alternándose.
- Al comenzar Surge, ambos Hosts revelan cartas durante cada turno de la Horda.
- Para la primera prueba, cada Host realiza su revelado normal y no recibe revelados extra adicionales.

Esta regla debe probarse con cuidado: dos secuencias completas de revelado pueden crear un aumento de dificultad demasiado brusco dependiendo de la combinación de Hosts.

### Victoria y derrota

- Un Host queda derrotado cuando se queda sin biblioteca y sin amenazas que le pertenezcan en el campo.
- Derrotar al primer Host no termina la partida.
- El jugador gana cuando ambos Hosts han sido derrotados y no quedan amenazas de la Horda.
- El jugador pierde normalmente al llegar a 0 vidas.

### Presentación y UI

- La pantalla de preparación debe mostrar 1 Chronicle contra 2 Hosts.
- Cada Host necesita su propio contador de biblioteca, cementerio, exilio y poison.
- El Host activo debe quedar señalado visualmente durante la alternancia.
- Durante el ataque del jugador, los dos mazos deben funcionar como objetivos claros y seleccionables.
- Las cartas de ambos Hosts pueden compartir la fila principal del campo, pero deben conservar alguna señal visual de su mazo de origen.
- Los triggers de ambos mazos deben seguir resolviéndose en secuencia, nunca todos al mismo tiempo.

### Decisiones pendientes

- Cuántas vidas iniciales necesita el jugador.
- En qué turno debe comenzar Surge.
- Si el orden inicial de los Hosts lo elige el jugador o la seed.
- Cómo se comportan los efectos que hacen referencia al cementerio o biblioteca de “la Horda”.
- Si los efectos estáticos de un Host pueden beneficiar criaturas del otro Host.
- Si algunas combinaciones de Hosts necesitan reglas de compatibilidad.
- Si Twin Hosts podrá combinarse con Chaos en el futuro. La primera versión debería mantenerse separada.
