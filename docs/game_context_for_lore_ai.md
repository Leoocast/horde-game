# Contexto del juego: "Horde Game" (prototipo)

Este documento describe un juego de cartas PvE en desarrollo, inspirado en el formato "Horde Magic" de Magic: The Gathering. Es un prototipo jugable (React/TypeScript), no un juego terminado, así que las reglas descritas abajo son las reglas *reales* implementadas hoy, no un diseño aspiracional.

Este es un documento narrativo, no una fuente de implementación. Para implementar cartas consultar
`docs/adding_cards.md`; ante cualquier diferencia mandan los JSON registrados, el engine y los
tests.

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

Mazo actual del Player: **"Mono-Green Ramp 39"**. El JSON contiene 39 cartas y 15 Forest; al
construir una partida estándar, `GameState.ts` limita el deck activo a 9 cartas de energía.
Arquetipo: acelerar energía con criaturas que la generan, desplegar amenazas verdes grandes con
reach/trample, y usar trucos de combate, pelea o remoción de artifact/enchantment/flying. No hay
remoción dura genérica tipo “destroy target creature”.

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

El comportamiento de cada Horda viene de `rulesProfile` en su deck. Los dos decks actuales usan:

- **Reveal automático ("Assault Reveal")**: revela hasta 3 cartas y se detiene al revelar una
  carta no-token.
- **Mini Surge**: en el turno 6 de la Horda revela 1 carta adicional una sola vez.
- **Surge**: comienza en el turno 10 de la Horda, o en el 8 en Chaos, y añade 2 revelados por
  turno. No depende del tamaño del cementerio.
- **Haste implícito**: sus criaturas pueden atacar al entrar porque ambos perfiles actuales tienen
  `hordeCreaturesHaveHaste: true`. Por eso Haste no se muestra como badge.
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

Actualmente hay dos mazos de Horda seleccionables:

### Zombie Horde (mazo predeterminado y seleccionable, 50 cartas)
Tema: zombies negros/azules, cementerio, discard, sinergia de graveyard.
- **Zombie Token** (2/2, x21) y **Zombie Giant Token** (5/5, x4): la carne de cañón de la horda.
- **Graf Harvest** (Enchantment): actualmente da Menace a todos los zombies. Su trigger de upkeep y
  su activación para crear tokens están declarados `engineSupport: "pending"` y no se ejecutan.
- **Noosegraf Mob** (0/0 con 5 counters +1/+1 iniciales, 5/5 efectivo): cada vez que se castea una
  carta no-token, saca un counter y genera un Zombie Token.
- Varias criaturas con "discard forzado al oponente" (Rottenheart Ghoul al morir, Miasmic Mummy al entrar) — adaptadas a "each opponent discards" porque la Horda no tiene mano propia que perder.
- **Smallpox**: sorcery que castiga fuerte al Player (pierde vida, descarta, sacrifica criatura y tierra).
- Criaturas voladoras (Blighted Bat, Stitchwing Skaab, Advanced Stitchwing, Crow of Dark Tidings):
  la recursión desde graveyard que paga descarte está **ignorada en este modo** porque la Horda no
  tiene mano.
- Crow of Dark Tidings: millea a la propia Horda al entrar y al morir (le da velocidad al Player para vaciarla).
- Cursed Minotaur: Menace nativo.
- Rancid Rats: Deathtouch + Skulk (no puede ser bloqueada por poder mayor — en este contexto es al revés: son ellos atacando, así que "skulk" afecta cómo el Player puede bloquearlas... revisar en Targeting.ts si hace falta precisión de regla).
- Thraben Foulbloods / Hound of the Farbogs: "Threshold" custom — se agrandan y ganan Menace si el graveyard de la Horda tiene 7+ cartas (o sea, cuanto más desgastada está la Horda, más peligrosos se vuelven sus zombies sobrevivientes — tensión de diseño interesante para lore: "los zombies se alimentan de sus propios caídos").
- Gavony Unhallowed: gana +1/+1 counter cada vez que muere otra criatura de la Horda.
- Diregraf Captain: lord de zombies (+1/+1 a otros zombies) + Deathtouch, y cuando muere un zombie, el Player pierde 1 vida.

### Goblin Assault Horde (mazo seleccionable, 50 cartas)
Tema: trasgos rojos, generación masiva de tokens, sacrificio, daño directo.
- **Goblin Token** (1/1 rojo, x25): volumen puro.
- Varios "lords" que dan +1/+1 a otros goblins (Hobgoblin Bandit Lord, Rundvelt Hordemaster, Goblin Trashmaster).
- Generadores de tokens al entrar (Beetleback Chief, Siege-Gang Commander) o al atacar (Goblin Rabblemaster, Krenko Tin Street Kingpin, General Kreat).
- Sacrificio de goblins para daño directo (Siege-Gang Commander). Mogg Mob es deliberadamente
  una criatura vanilla 3/3 en este modo.
- Goblin War Drums / Raid Bombardment: enchantments que dan Menace global o pegan daño extra por atacantes chicos.
- Goblin Chainwhirler: daño en área al entrar (1 a Player y a todo lo que controla).
- Varias legendarias (General Kreat, Krenko, Pashalik Mons) con triggers de generar tokens al atacar o al morir un goblin.

Este mazo es jugable y seleccionable, pero tiene más habilidades marcadas
`engineSupport: "pending"` que Zombies. El comando `scripts/lint-decks.mjs` es la fuente vigente de
esa lista; no se duplica aquí para evitar que vuelva a quedar atrasada.

## Estética y tono (importante para lore)

- Fantasía dark-medieval estilo Age of Empires / Path of Exile viejo. Nada de UI limpia tipo SaaS ni "glass" moderno.
- Paneles con bordes dorados/café, botones redondeados/orbitales.
- El juego no tiene landing page: la pantalla principal ES el juego.
- Hay "Developer mode" (seed literal `developer`) usado solo para testear rápido — no es parte de la narrativa del juego, es una herramienta de desarrollo (vida alta, mano fija, tierras en juego, cartas forzadas al tope del mazo de la Horda).
- Hay música dinámica: un "Battle Theme" normal que cambia a un "climax" cuando la vida del Player baja de 10 — refuerza que la horda se vuelve más desesperante cuanto más cerca está la derrota.

## Limitaciones mecánicas actuales (para que el lore no prometa de más)

- Sólo existen dos Hosts: Zombies negro/azul, predeterminado, y Goblins rojo. Ambos son
  seleccionables; Goblins conserva varias habilidades WIP declaradas.
- El Player solo tiene un mazo: mono-verde ramp. No hay otros colores/arquetipos de Player implementados.
- No hay parser de texto de Magic real ni intención de tenerlo: cada carta nueva se implementa
  mediante JSON y efectos genéricos de `EffectResolver`. Una habilidad incompleta debe marcarse
  `pending`, `ignored` o `custom`; una habilidad sin marcador que no coincide con el vocabulario
  real hace fallar el deck lint.
- Varias cartas de zombies renuncian a mecánicas de Magic real porque la Horda no tiene mano (por
  ejemplo, la recursión que paga descarte está marcada `engineSupport: "ignored"`).
- La Horda no tiene decisiones tácticas: no elige bloqueos, no elige a quién atacar de forma inteligente, no tiene "IA" — es determinística según reglas fijas (revela hasta 3, ataca con todo).
- Precisión total de reglas de Magic no es el objetivo: el diseño prioriza que el flujo de juego sea claro y jugable por sobre el rules-accuracy total.

## Qué SÍ es fijo (para anclar el lore)

- Es un enfrentamiento 1 vs. horda, no 1 vs. 1 simétrico.
- La horda no siente miedo ni cansancio salvo mecánicamente: se agranda cuando su cementerio crece (Threshold en zombies), lo que sugiere que "se alimenta de sus propios muertos".
- El veneno/toxic es una propiedad de las criaturas del Player que infecta a la Horda (no al revés), y la Horda se derrumba (millea) cuando se satura de contaminación — encaja con un lore de "purgar/contaminar" a la horda en descomposición.
- El desgaste de la Horda no es matarla pieza por pieza sino vaciar su reserva (su "biblioteca" = las fuerzas que aún no se han desplegado). Narrativamente esto se presta a "la horda es finita, aunque parezca infinita — cada golpe consume sus reservas".
- El Player gana maná/tempo mediante criaturas verdes (druids/elfos), no artefactos ni tierras raras — el lore de Player encaja con "guardianes de la naturaleza / vida" contra "horda de no-muertos/invasores".
