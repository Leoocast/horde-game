# Contexto del juego: "Horde Game" (prototipo)

Este documento describe un juego de cartas PvE en desarrollo, inspirado en el formato "Horde Magic" de Magic: The Gathering. Es un prototipo jugable (React/TypeScript), no un juego terminado, así que las reglas descritas abajo son las reglas *reales* implementadas hoy, no un diseño aspiracional.

Este es un documento narrativo, no una fuente de implementación. Para implementar cartas consultar
`docs/adding_cards.md`; ante cualquier diferencia mandan los JSON registrados, el engine y los
tests.

> **Actualización canónica de identidad:** el vocabulario y la ontología narrativa vigentes viven
> en `docs/game_vocabulary.md`. Las secciones mecánicas inferiores todavía documentan el prototipo
> legacy y por eso conservan términos de Magic que deben migrarse.

## Crónicas, fragmentos y protagonistas

Cada mazo del jugador es una **Crónica** y debe contar una historia, no limitarse a reunir cartas de
un mismo arquetipo. Sus cartas representan fragmentos de memoria con los que el Cronista
reconstruye un Capítulo; los Ecos Invocados son reconstrucciones de las figuras recordadas, no las
personas históricas originales.

Cuando la protagonista o el protagonista aparece como carta, se distingue como `Chronicle Echo /
Eco de Crónica`. Esta designación expresa importancia narrativa y visual, pero no concede reglas
ni unicidad. Una Crónica puede contener otros Ecos de Crónica si son figuras centrales de su
relato. El `keyCardId` técnico existente solo selecciona la carta de portada del mazo y no sustituye
la declaración narrativa de protagonista.

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

Mazo actual del Player: **"La Última Lluvia"**. El JSON contiene 39 cartas y 15 Manantiales de
Raízhonda; al
construir una partida estándar, `GameState.ts` limita el deck activo a 9 cartas de energía.
Arquetipo: acelerar energía con criaturas que la generan, desplegar amenazas verdes grandes con
Guardia aérea, y usar trucos de combate, lucha o remoción de Reliquias, Ritos y criaturas con
Guardia aérea. No hay
remoción dura genérica tipo “destroy target creature”.

Curva y piezas clave del mazo actual:
- Generadores de Energía: Recolectores del Primer Rocío y Custodio de la Raíz Dormida
  (Agota: ganan {E}).
- Iria, Voz de la Última Lluvia: Eco de Crónica que al entrar pone un contador +1/+1 en un aliado
  —puede elegirse a sí misma— y hace ganar 3 de Vida.
- Acechador de Savia Negra: Toque mortal + Tóxico 1 (mecánica de veneno adaptada, ver abajo).
- Arven, Primero de la Manada: la primera vez que otro aliado es invocado durante tu turno,
  gana +1/+1 hasta el inicio de tu próximo turno.
- Vigías del Dosel Antiguo / Quebracielos de la Hondonada / Orun, la Raíz Despierta: amenazas
  grandes con Guardia aérea y sin Desborde.
- La Presa Señalada (Rápido): un aliado hace daño igual a su Fuerza a otro Eco.
- El Juramento del Claro: un aliado gana +1/+2 temporal y después lucha contra un enemigo.
- Cuando las Raíces Tocaron el Cielo (Rápido): destruye una Reliquia, Rito o Eco con Guardia aérea.
- Savia del Primer Árbol (Rápido): +3/+3 hasta el final del turno; se puede jugar en varias fases.

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
- **Ímpetu implícito**: sus Ecos pueden atacar al entrar porque ambos perfiles actuales tienen
  `hostEchosHaveImpetus: true`. Por eso Ímpetu no se muestra como badge.
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

### La Procesión de la Campana Hueca (mazo predeterminado y seleccionable, 50 cartas)

Tema: una ciudad-campanario ahogada reconstruye una procesión de muertos con recuerdos robados.

- **Muerto del Último Taño** (2/2, x21) y **Coloso de la Fosa Común** (5/5, x4) son las dos Fichas;
  ambas usan arte vertical de cuerpo completo.
- **La Campana Hueca** da Imponente a todos los Zombis. Sus otras dos habilidades permanecen
  declaradas como pendientes y no se ejecutan.
- **El Cadalso de los Cinco Nudos** entra con cinco contadores +1/+1. Cada carta no Ficha invocada
  retira uno e Invoca un Muerto del Último Taño.
- **Carroña del Último Pensamiento** al morir y **Portador de la Mortaja Mnémica** al ser invocada
  obligan al Cronista a descartar.
- **Diezmo de Carne y Raíz** hace perder 1 de Vida, descartar una carta y sacrificar un Eco y una
  Fuente al Cronista.
- **Alapútrida de la Cripta**, **Ala Hilvanada**, **Ala Sepulcral Reforzada** y **Cuervo Carroñero
  del Archivo** tienen Volar. La recursión de las dos Alas continúa ignorada porque la Hueste no
  tiene mano.
- **Cuervo Carroñero del Archivo** descarta las dos primeras cartas del Archivo de la Hueste a su
  Memoria al ser invocado o morir.
- **Rompelíneas Astado** tiene Imponente; **Ratas de la Mordida Silente** tiene Letal y Furtivo.
- **Sabueso de la Séptima Memoria** y **Mastín del Osario Colmado** se fortalecen al llegar a siete
  cartas en la Memoria de la Hueste.
- **Recolector de los Caídos** recibe un contador +1/+1 por cada otro Zombi aliado que muere.
- **Mariscal de la Última Marcha** fortalece a los demás Zombis; tiene Letal y cada muerte aliada
  hace perder 1 de Vida al Cronista.

### El Motín de la Forja Rota (Hueste seleccionable, 50 cartas)

Tema: una revuelta de cuadrillas trasgas dentro de una ciudad-horno; muchas piezas pequeñas se
convierten en refuerzos, crecimiento y daño directo.

- **Corredor de Ascua y Chatarra** es la Ficha 1/1 y ocupa 24 espacios del Archivo.
- **Capataz del Recuento Ardiente**, **Llamador de la Próxima Cuadrilla** y **Maestro de la
  Armadura Recuperada** fortalecen a otros Trasgos; los dos primeros añaden respectivamente daño
  por llegadas y reemplazo de caídos.
- **Jefe de la Cuadrilla Doble** y **Capataz de los Tres Hornos** Invocan exactamente dos y tres
  Fichas al entrar. **Agitador de la Primera Sirena**, **Mariscal del Golpe Repetido** y **Brakka,
  la Cuenta Creciente** generan refuerzos al atacar.
- **El Martillo de Turno** da Imponente a la Hueste; **Lluvia de Remaches** convierte cada Trasgo
  atacante de Fuerza 2 o menos en 1 de daño al Cronista.
- **¡Abran Otra Compuerta!** da +2/+0 a la formación o inicia otra ronda de revelado si el Campo
  está vacío. **Tres Bajo el Mismo Yunque** es un Eco Trasgo vanilla 3/3.
- **Maestro de la Salva de Escoria** escala su daño de entrada con la cantidad de Trasgos.
  **Artillero de los Últimos Remaches** dispara a un Eco enemigo aleatorio por cada muerte aliada.
- **Varka, Eje de la Revuelta** es el único Eco de Crónica: tiene Reflejos y al entrar hace 1 de
  daño al Cronista y a cada Eco que controla.

Este mazo es jugable, seleccionable y no conserva habilidades `engineSupport: "pending"`.
Zombies sí mantiene trabajo parcial declarado. El comando `scripts/lint-decks.mjs` es la fuente
vigente de esa lista; no se duplica aquí para evitar que vuelva a quedar atrasada.

## Estética y tono (importante para lore)

- Fantasía dark-medieval estilo Age of Empires / Path of Exile viejo. Nada de UI limpia tipo SaaS ni "glass" moderno.
- Paneles con bordes dorados/café, botones redondeados/orbitales.
- El juego no tiene landing page: la pantalla principal ES el juego.
- Hay "Developer mode" (seed literal `developer`) usado solo para testear rápido — no es parte de la narrativa del juego, es una herramienta de desarrollo (vida alta, mano fija, tierras en juego, cartas forzadas al tope del mazo de la Horda).
- Hay música dinámica: un "Battle Theme" normal que cambia a un "climax" cuando la vida del Player baja de 10 — refuerza que la horda se vuelve más desesperante cuanto más cerca está la derrota.

## Limitaciones mecánicas actuales (para que el lore no prometa de más)

- Sólo existen dos Hosts: Zombies negro/azul, predeterminado, y Goblins rojo. Ambos son
  seleccionables; Zombies conserva trabajo parcial declarado y Goblins está completamente soportado.
- El Chronicler tiene dos mazos seleccionables: mono-verde ramp y Vampiros.
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
