# Reglas de las cartas de El Motín de la Forja Rota

Este documento registra el comportamiento PvE que usa el juego. El JSON de cartas es la fuente de
verdad de reglas; este archivo explica las adaptaciones intencionales y la presentación esperada.
Los ids heredados aparecen entre paréntesis únicamente como referencias técnicas.

`engineSupport: "pending"` y «no se activa automáticamente en partidas» no son equivalentes. Una
habilidad activada de Hueste puede normalizarse como efecto válido y aun así carecer de una política
que decida cuándo usarla. `scripts/lint-decks.mjs` es la fuente de verdad para los marcadores WIP.

## Corredor de Ascua y Chatarra (`goblin_token_1_1_red`)

- Las copias se apilan visualmente por definición y grupo de llegada.
- Las criaturas de la Hueste nunca muestran badge de Agotada ni filtro gris: su agotamiento es una
  regla del modo, no una decisión del jugador.
- Se inclinan con el chevrón de ataque desde que aterrizan durante el turno de la Hueste, antes de
  que los atacantes se declaren formalmente.

## Capataz del Recuento Ardiente (`hobgoblin_bandit_lord`)

- Los otros Trasgos reciben +1/+1.
- Adaptación PvE: al entrar, hace daño al mejor Eco enemigo por cada Trasgo invocado bajo control de
  la Hueste durante el turno actual, incluido él mismo.
- El aura se resuelve primero. Si ya produjo el pulso de activación, el daño de entrada sigue como
  beat separado sin volver a iluminar la carta ni repetir el sonido.

## Llamador de la Próxima Cuadrilla (`rundvelt_hordemaster`)

- Los otros Trasgos reciben +1/+1 y el aura anuncia su cobertura mediante el beat de activación
  estática.
- La muerte de un Trasgo inspecciona la primera carta del Archivo. Un Eco Trasgo se Invoca de
  inmediato; cualquier otra carta se mueve al fondo.
- El efecto nunca usa el Olvido. Toda muerte de Trasgo activa al Llamador; si él mismo muere, usa el
  beat de revelado de muerte junto a la Memoria antes de resolver la inspección.

## Pregonero del Horno Abierto (`battle_cry_goblin`)

- Adaptación PvE: al entrar, los Trasgos de la Hueste reciben +1/+0 hasta el fin del turno.
- Ímpetu y Pack tactics se omiten deliberadamente.
- El trigger de entrada produce un pulso; el buff grupal sólo reproduce sus líneas azules.

## El Martillo de Turno (`goblin_war_drums`)

- Las criaturas de la Hueste tienen Imponente mientras este Apoyo permanece en el Campo.

## Lluvia de Remaches (`raid_bombardment`)

- Cada Trasgo atacante de Fuerza 2 o menos aporta 1 de daño.
- Los atacantes elegibles se capturan una sola vez al declararlos: varios bloqueadores no duplican
  la aportación y morir durante el ataque no la elimina.
- El daño espera hasta que terminen todas las animaciones de ataque. Después el Apoyo pulsa una vez
  y lanza una salva compacta hacia la Vida del Cronista con el total combinado.
- Se dibujan como máximo seis proyectiles para conservar legibilidad, pero el número de daño siempre
  muestra el total real.

## Jefe de la Cuadrilla Doble (`beetleback_chief`)

- Su efecto de entrada Invoca dos Corredores de Ascua y Chatarra.

## Capataz de los Tres Hornos (`siege_gang_commander`)

- Su efecto de entrada Invoca tres Corredores de Ascua y Chatarra.
- Su daño activado por sacrificio fue retirado del corte de la carta.

## Agitador de la Primera Sirena (`goblin_rabblemaster`)

- Invoca un Corredor antes de declarar atacantes.
- La obligación impresa anterior de atacar está marcada `engineSupport: "ignored"` porque la regla
  global de la Hueste ya hace atacar a toda criatura capaz.
- Su bono cuenta los otros Trasgos atacantes cuando el trigger se resuelve.

## ¡Abran Otra Compuerta! (`goblin_surprise`)

- Si la Hueste controla al menos una criatura, todas sus criaturas reciben +2/+0 hasta el fin del
  turno. El Hechizo se presenta junto al Archivo y el bono aterriza con el buff compartido.
- Si no controla criaturas, ejecuta inmediatamente otra ronda normal de revelado dentro del mismo
  turno, sin sumar otra Mini Oleada u Oleada.

## Tres Bajo el Mismo Yunque (`mogg_mob`)

- Adaptación PvE: es solamente un Eco Trasgo vanilla 3/3.

## Maestro de la Salva de Escoria (`volley_veteran`)

- Su efecto de entrada usa la animación Burn reutilizable.
- El objetivo de la Hueste se decide mediante la política declarada en JSON, no en componentes.

## Varka, Eje de la Revuelta (`goblin_chainwhirler`)

- Es el único Eco de Crónica del deck.
- Reflejos se resuelve en un paso separado de daño de combate. Varka 3/3 mata a un bloqueador 4/3
  antes de que responda y sobrevive; un 4/4 sobrevive a Reflejos y la mata en el paso normal.
- Su entrada encola un único evento simultáneo de daño para el Cronista y todos sus Ecos. El trigger
  produce el único pulso y una salva compacta envía un proyectil por una ruta distinta a cada blanco.
- Los impactos visuales se escalonan 90 ms, pero el daño de reglas se confirma para todos a la vez
  en el impacto final.

## Maestro de la Armadura Recuperada (`goblin_trashmaster`)

- Los otros Trasgos reciben +1/+1.
- La activación anterior de destrucción de artefactos fue retirada del corte de la carta.

## Mariscal del Golpe Repetido (`general_kreat_the_boltbringer`)

- Cuando uno o más Trasgos atacan, Invoca exactamente un Corredor agotado y atacando. El trigger
  ocurre una vez por declaración, no una vez por atacante.
- Cada otra criatura de la Hueste que entra encola su propio daño de 1 a la Vida del Cronista; dos
  entradas producen dos Burns completos y ordenados.
- El Corredor creado por el Mariscal activa naturalmente la segunda habilidad. Como el primer beat
  ya lo iluminó, esa continuación no pulsa la misma carta otra vez.

## Brakka, la Cuenta Creciente (`krenko_tin_street_kingpin`)

- Cuando Brakka ataca, recibe primero un contador +1/+1 y después Invoca esa cantidad de Corredores
  agotados y atacando según su nueva Fuerza.

## Artillero de los Últimos Remaches (`pashalik_mons`)

- Regla PvE: cuando muere un Trasgo de la Hueste, hace 1 de daño a un Eco enemigo aleatorio.
- La selección es determinista con el RNG sembrado y se declara en JSON como `selection: "RANDOM"`.
- Cada muerte se resuelve por separado en el momento en que ocurre; el combate no agrupa triggers.
- El daño usa la animación `BURN`: pulso de fuente, viaje, shader y chispas, número flotante y marca
  de quemadura sobre un superviviente hasta la limpieza de fin de turno.
- Si otro elemento reacciona a la misma muerte, cada fuente conserva su propio beat.
- La activación anterior de creación de fichas fue retirada del corte de la carta.
