# Reglas de las cartas de La Legión de Varka

Este documento registra el comportamiento PvE que usa el juego. El JSON de cartas es la fuente de
verdad de reglas; este archivo explica las adaptaciones intencionales y la presentación esperada.
Los ids canónicos aparecen entre paréntesis como referencias técnicas.

`engineSupport: "pending"` y «no se activa automáticamente en partidas» no son equivalentes. Una
habilidad activada de Hueste puede normalizarse como efecto válido y aun así carecer de una política
que decida cuándo usarla. `scripts/lint-decks.mjs` es la fuente de verdad para los marcadores WIP.

## Esbirro de Varka (`varkas_minion`)

- Las copias se apilan visualmente por definición y grupo de llegada.
- Las criaturas de la Hueste nunca muestran badge de Agotada ni filtro gris: su agotamiento es una
  regla del modo, no una decisión del jugador.
- Se inclinan con el chevrón de ataque desde que aterrizan durante el turno de la Hueste, antes de
  que los atacantes se declaren formalmente.

## Chamán de la Brasa Sombría (`shaman_of_the_umbral_ember`)

- Los otros Ecos aliados reciben +1/+1.
- Al entrar, hace daño al mejor Eco enemigo por cada Eco invocado bajo control de la Hueste durante
  el turno actual, incluido él mismo.
- El aura se resuelve primero. Si ya produjo el pulso de activación, el daño de entrada sigue como
  beat separado sin volver a iluminar la carta ni repetir el sonido.

## Invocador de las Filas (`summoner_of_the_ranks`)

- Los otros Ecos aliados reciben +1/+1 y el aura anuncia su cobertura mediante el beat de activación
  estática.
- La muerte de un Eco aliado inspecciona la primera carta del Archivo. Cualquier Eco se Invoca de
  inmediato; cualquier otra carta se mueve al fondo.
- El efecto nunca usa el Olvido. Toda muerte de Eco aliado activa al Invocador; si él mismo muere, usa el
  beat de revelado de muerte junto a la Memoria antes de resolver la inspección.

## Portaestandarte de Varka (`varkas_standard_bearer`)

- Al entrar, los Ecos aliados de la Hueste reciben +1/+0 hasta el fin del turno.
- Ímpetu y Pack tactics se omiten deliberadamente.
- El trigger de entrada produce un pulso; el buff grupal sólo reproduce sus líneas azules.

## El Frente Imponente (`the_daunting_front`)

- Las criaturas de la Hueste tienen Imponente mientras este Apoyo permanece en el Campo.

## Todos contra uno (`all_against_one`)

- Cada Trasgo atacante de Fuerza 2 o menos aporta 1 de daño.
- Los atacantes elegibles se capturan una sola vez al declararlos: varios bloqueadores no duplican
  la aportación y morir durante el ataque no la elimina.
- El daño espera hasta que terminen todas las animaciones de ataque. Después el Apoyo pulsa una vez
  y lanza una salva compacta hacia la Vida del Cronista con el total combinado.
- Se dibujan como máximo seis proyectiles para conservar legibilidad, pero el número de daño siempre
  muestra el total real.

## Jefe de la Doble Guardia (`chief_of_the_double_guard`)

- Su efecto de entrada Invoca dos Esbirros de Varka.

## Jinete de la Tercera Carga (`rider_of_the_third_charge`)

- Su efecto de entrada Invoca tres Esbirros de Varka.
- Su daño activado por sacrificio fue retirado del corte de la carta.

## Rompefilas de Varka (`varkas_linebreaker`)

- Invoca un Esbirro antes de declarar atacantes.
- La obligación impresa anterior de atacar está marcada `engineSupport: "ignored"` porque la regla
  global de la Hueste ya hace atacar a toda criatura capaz.
- Su bono cuenta los otros Trasgos atacantes cuando el trigger se resuelve.

## ¡Liberen a la Legión! (`unleash_the_legion`)

- Si la Hueste controla al menos una criatura, todas sus criaturas reciben +2/+0 hasta el fin del
  turno. El Hechizo se presenta junto al Archivo y el bono aterriza con el buff compartido.
- Si no controla criaturas, ejecuta inmediatamente otra ronda normal de revelado dentro del mismo
  turno, sin sumar otra Estampida menor o Estampida.

## Oso de Guerra Corrompido (`corrupted_war_bear`)

- Es un Eco Bestia/Oso vanilla 3/3.

## Jinete de la Salva Umbría (`rider_of_the_umbral_volley`)

- Su efecto de entrada usa la animación Burn reutilizable.
- El daño cuenta todos los Ecos aliados presentes en el Campo cuando se resuelve, incluido el propio
  Jinete.
- El objetivo de la Hueste se decide mediante la política declarada en JSON, no en componentes.

## Varka, Matriarca Infernal (`varka_infernal_matriarch`)

- Es el único Eco del deck que conserva el modificador técnico `CHRONICLE`; no se muestra en su
  línea de tipo.
- Todos los Ecos aliados, incluida Varka, reciben +1/+1 mientras permanezca en el Campo.
- Su propia Pasiva la convierte en 4/4. Reflejos se resuelve en un paso separado de daño de combate:
  mata a un bloqueador 5/4 antes de que responda; un 5/5 sobrevive y la mata en el paso normal.
- Su entrada encola un único evento simultáneo de 2 de daño para el Cronista y todos sus Ecos. El trigger
  produce el único pulso y una salva compacta envía un proyectil por una ruta distinta a cada blanco.
- Los impactos visuales se escalonan 90 ms, pero el daño de reglas se confirma para todos a la vez
  en el impacto final.

## Forjador de Varka (`varkas_forgemaster`)

- Los otros Trasgos reciben +1/+1.
- La activación anterior de destrucción de artefactos fue retirada del corte de la carta.

## Mariscal de la Oleada (`marshal_of_the_wave`)

- Cuando uno o más Trasgos atacan, Invoca exactamente un Esbirro agotado y atacando. El trigger
  ocurre una vez por declaración, no una vez por atacante.
- Cada otra criatura de la Hueste que entra encola su propio daño de 1 a la Vida del Cronista; dos
  entradas producen dos Burns completos y ordenados.
- El Esbirro creado por el Mariscal activa naturalmente la segunda habilidad. Como el primer beat
  ya lo iluminó, esa continuación no pulsa la misma carta otra vez.

## Vardek, Escriba de la Legión (`vardek_scribe_of_the_legion`)

- Cuando Vardek ataca, recibe primero un contador +1/+1 y después Invoca esa cantidad de Esbirros
  agotados y atacando según su nueva Fuerza.

## Escupefuego de la Retaguardia (`rear_guard_firebreather`)

- Regla PvE: cuando muere un Trasgo de la Hueste, hace 1 de daño a un Eco enemigo aleatorio.
- La selección es determinista con el RNG sembrado y se declara en JSON como `selection: "RANDOM"`.
- Cada muerte se resuelve por separado en el momento en que ocurre; el combate no agrupa triggers.
- El daño usa la animación `BURN`: pulso de fuente, viaje, shader y chispas, número flotante y marca
  de quemadura sobre un superviviente hasta la limpieza de fin de turno.
- Si otro elemento reacciona a la misma muerte, cada fuente conserva su propio beat.
- La activación anterior de creación de fichas fue retirada del corte de la carta.
