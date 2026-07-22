# Contexto del juego: "Horde Game" (prototipo)

Este documento describe un juego de cartas PvE en desarrollo, inspirado en el formato "Horde Magic" de Magic: The Gathering. Es un prototipo jugable (React/TypeScript), no un juego terminado, así que las reglas descritas abajo son las reglas *reales* implementadas hoy, no un diseño aspiracional.

## Concepto central

Un jugador humano (el "Player") se enfrenta en solitario a una horda de criaturas controlada por el sistema (la "Horde"). No es un duelo simétrico de Magic: la Horda no tiene mano, no tiene vida, no paga maná de forma normal y no toma decisiones estratégicas — revela cartas de su propio mazo de forma automática y ataca con todo lo que puede. El Player sí juega con las reglas clásicas de Magic (tierras, maná, criaturas, instants, sorceries, combate con bloqueos).

Es una experiencia de tipo "supervivencia contra oleadas": el Player gana si logra reducir la Horda a que se quede sin cartas (mill) o sin amenazas en su mazo; el Player pierde si su vida llega a 0.

## Las dos facciones

### Player
Bando controlado por la persona. Tiene:
- **Vida** (life total clásico de Magic).
- **Library, Hand, Battlefield, Graveyard, Exile** (zonas normales).
- **Mana pool** y tierras que se tapean para maná.
- Juega una tierra por turno, castea criaturas/instants/sorceries según fase, ataca, bloquea, activa habilidades tap.

Mazo actual del Player: **"Mono-Green Ramp"** (verde mono-color, 40 cartas, 17 Forest). Arquetipo: acelerar maná con criaturas que dan maná (dorks), desplegar amenazas verdes grandes con reach/trample, y usar trucos de combate (pump, fight spells) o remoción basada en peleas de criaturas. No hay remoción dura tipo "destroy target creature": todo pasa por combate, pelea (fight) o destruir artifact/enchantment/flying.

Curva y piezas clave del mazo actual:
- Dorks de maná: Llanowar Elves, Druid of the Cowl (tap: agregan {G}).
- Sunshower Druid: entra y pone un +1/+1 counter en una criatura (puede targetearse a sí misma) y gana 1 vida.
- Ichorspit Basilisk: Deathtouch + Toxic 1 (mecánica de veneno adaptada, ver abajo).
- Beast-Kin Ranger: se hace más grande cada vez que entra otra criatura suya ese turno.
- Magnigoth Sentry / Colossadactyl / Timberland Ancient: bombas grandes con reach/trample, sin texto de reglas extra.
- Cosmic Hunger (instant): una criatura propia "golpea" no en combate a una criatura/planeswalker/battle enemigo por su poder.
- Ruthless Predation (sorcery): pelea forzada entre una criatura propia (+1/+2 temporal) y una enemiga.
- Broken Wings (instant): destruye artifact, enchantment o flying creature.
- Giant Growth (instant): +3/+3 hasta fin de turno, se puede jugar en varias fases.

### Horde
Bando automatizado, sin jugador humano detrás. No tiene:
- Vida.
- Mano (todo lo que "juega" sale directo de revelar su library).
- Maná normal de jugador (sus criaturas pueden tapear para maná solo cuando un efecto/directiva de Horda lo exige explícitamente).

Sí tiene: library, battlefield, graveyard, exile, y un contador de **poison counters** propio (mecánica custom de este modo, no poison de Magic real).

Reglas de comportamiento de la Horda (aplican a cualquier mazo de Horda, no solo zombies):
- **Reveal automático ("Assault Reveal")**: en su turno, revela hasta 3 cartas de su library y las pone en juego (las castea gratis). Se detiene apenas revela una carta que no sea token.
- **Surge**: si graveyard + exile de la Horda es mayor que su library, revela 2 cartas extra ese turno (está desesperada, se está quedando sin mazo).
- **Todas sus criaturas tienen Haste** siempre (regla implícita del modo — por eso Haste no se muestra como badge en la UI para criaturas de Horda).
- **Ataca con todo lo que puede** cada combate suyo — no elige selectivamente.
- El Player **pierde por vida a 0**; la **Horda "pierde" por quedarse sin amenazas / vaciar su mazo** (mill).

### Daño a la Horda / mill
No existe "vida de la Horda". En cambio, el daño de combate que recibe se traduce en mill: **cada 3 puntos de daño acumulado, la Horda millea 1 carta de su library** (redondeando hacia abajo). Es la forma en que el Player "gana terreno": atacar a la Horda no la mata, la desgasta.

### Poison / Toxic (mecánica custom)
- Toxic se normaliza como `TOXIC_1` (siempre 1, no escala con cantidad de daño).
- Si una criatura del Player con Toxic conecta daño de combate contra la Horda, la Horda gana **poison counters** (no el jugador — es al revés de cómo funciona infect/poison en Magic real, donde el poison lo recibe un jugador).
- **Cada 3 poison counters, al pasar turno, la Horda millea 1 carta adicional.**
- Es otra vía de presión sobre el mazo de la Horda, en paralelo al mill por daño.

## Mazos de Horda disponibles

Actualmente hay dos mazos de Horda construidos (uno activo en juego, el otro disponible para inspeccionar):

### Zombie Horde (mazo activo, 50 cartas)
Tema: zombies negros/azules, cementerio, discard, sinergia de graveyard.
- **Zombie Token** (2/2, x21) y **Zombie Giant Token** (5/5, x4): la carne de cañón de la horda.
- **Graf Harvest** (Enchantment): da Menace a todos los zombies; tiene una directiva de activación propia de la Horda que exilia criaturas del graveyard para generar más Zombie Tokens; se sacrifica solo si el graveyard no tiene la combinación token+non-token requerida.
- **Noosegraf Mob** (6/6 con 5 +1/+1 counters iniciales): cada vez que la Horda "castea" (revela) una carta no-token, saca un counter y genera un Zombie Token — se va debilitando a sí misma con el tiempo a cambio de más tokens.
- Varias criaturas con "discard forzado al oponente" (Rottenheart Ghoul al morir, Miasmic Mummy al entrar) — adaptadas a "each opponent discards" porque la Horda no tiene mano propia que perder.
- **Smallpox**: sorcery que castiga fuerte al Player (pierde vida, descarta, sacrifica criatura y tierra).
- Criaturas voladoras (Blighted Bat, Stitchwing Skaab, Advanced Stitchwing, Crow of Dark Tidings): su habilidad de recursión desde graveyard vía descarte está **ignorada en este MVP** porque la Horda no tiene mano.
- Crow of Dark Tidings: millea a la propia Horda al entrar y al morir (le da velocidad al Player para vaciarla).
- Cursed Minotaur: Menace nativo.
- Rancid Rats: Deathtouch + Skulk (no puede ser bloqueada por poder mayor — en este contexto es al revés: son ellos atacando, así que "skulk" afecta cómo el Player puede bloquearlas... revisar en Targeting.ts si hace falta precisión de regla).
- Thraben Foulbloods / Hound of the Farbogs: "Threshold" custom — se agrandan y ganan Menace si el graveyard de la Horda tiene 7+ cartas (o sea, cuanto más desgastada está la Horda, más peligrosos se vuelven sus zombies sobrevivientes — tensión de diseño interesante para lore: "los zombies se alimentan de sus propios caídos").
- Gavony Unhallowed: gana +1/+1 counter cada vez que muere otra criatura de la Horda.
- Diregraf Captain: lord de zombies (+1/+1 a otros zombies) + Deathtouch, y cuando muere un zombie, el Player pierde 1 vida.

### Goblin Assault Horde (mazo disponible en el inspector, no activo aún, 50 cartas)
Tema: trasgos rojos, generación masiva de tokens, sacrificio, daño directo.
- **Goblin Token** (1/1 rojo, x25): volumen puro.
- Varios "lords" que dan +1/+1 a otros goblins (Hobgoblin Bandit Lord, Rundvelt Hordemaster, Goblin Trashmaster).
- Generadores de tokens al entrar (Beetleback Chief, Siege-Gang Commander) o al atacar (Goblin Rabblemaster, Krenko Tin Street Kingpin, General Kreat).
- Sacrificio de goblins para daño directo (Siege-Gang Commander, Mogg Mob divide 3 daño entre hasta 3 targets).
- Goblin War Drums / Raid Bombardment: enchantments que dan Menace global o pegan daño extra por atacantes chicos.
- Goblin Chainwhirler: daño en área al entrar (1 a Player y a todo lo que controla).
- Varias legendarias (General Kreat, Krenko, Pashalik Mons) con triggers de generar tokens al atacar o al morir un goblin.

Este mazo tiene más `engineSupportNeeded` sin resolver (target flexible a Player/criatura/planeswalker/battle, "must attack if able", conteo de goblins que atacaron, etc.) — es decir, mecánicamente está menos maduro que el de zombies.

## Estética y tono (importante para lore)

- Fantasía dark-medieval estilo Age of Empires / Path of Exile viejo. Nada de UI limpia tipo SaaS ni "glass" moderno.
- Paneles con bordes dorados/café, botones redondeados/orbitales.
- El juego no tiene landing page: la pantalla principal ES el juego.
- Hay "Developer mode" (seed literal `developer`) usado solo para testear rápido — no es parte de la narrativa del juego, es una herramienta de desarrollo (vida alta, mano fija, tierras en juego, cartas forzadas al tope del mazo de la Horda).
- Hay música dinámica: un "Battle Theme" normal que cambia a un "climax" cuando la vida del Player baja de 10 — refuerza que la horda se vuelve más desesperante cuanto más cerca está la derrota.

## Limitaciones mecánicas actuales (para que el lore no prometa de más)

- Solo dos colores/temas de horda existen: zombies negro/azul (activo) y goblins rojo (en inspector, incompleto). No hay más facciones de horda implementadas todavía.
- El Player solo tiene un mazo: mono-verde ramp. No hay otros colores/arquetipos de Player implementados.
- No hay parser de texto de Magic real ni intención de tenerlo: cada carta nueva se implementa a mano vía JSON + efectos genéricos (`EffectResolver`). Si una carta no tiene una implementación de regla, su habilidad simplemente no funciona en el juego aunque el texto de sabor exista.
- Varias cartas de zombies renuncian a mecánicas de Magic real porque la Horda no tiene mano (ej. recursión pagando con descarte queda ignorada).
- La Horda no tiene decisiones tácticas: no elige bloqueos, no elige a quién atacar de forma inteligente, no tiene "IA" — es determinística según reglas fijas (revela hasta 3, ataca con todo).
- Precisión total de reglas de Magic no es el objetivo: el diseño prioriza que el flujo de juego sea claro y jugable por sobre el rules-accuracy total.

## Qué SÍ es fijo (para anclar el lore)

- Es un enfrentamiento 1 vs. horda, no 1 vs. 1 simétrico.
- La horda no siente miedo ni cansancio salvo mecánicamente: se agranda cuando su cementerio crece (Threshold en zombies), lo que sugiere que "se alimenta de sus propios muertos".
- El veneno/toxic es una propiedad de las criaturas del Player que infecta a la Horda (no al revés), y la Horda se derrumba (millea) cuando se satura de contaminación — encaja con un lore de "purgar/contaminar" a la horda en descomposición.
- El desgaste de la Horda no es matarla pieza por pieza sino vaciar su reserva (su "biblioteca" = las fuerzas que aún no se han desplegado). Narrativamente esto se presta a "la horda es finita, aunque parezca infinita — cada golpe consume sus reservas".
- El Player gana maná/tempo mediante criaturas verdes (druids/elfos), no artefactos ni tierras raras — el lore de Player encaja con "guardianes de la naturaleza / vida" contra "horda de no-muertos/invasores".
