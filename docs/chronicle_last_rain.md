# Crónica: La Última Lluvia

Estado: **integrada en runtime y Card Studio; identidad técnica Hostfall final**
Deck actual: `last_rain` / `La Última Lluvia`
Última actualización: 2026-08-01

Este documento conserva la identidad narrativa, el mapeo mecánico y la dirección visual acordados
para el primer pase de contenido propio del deck. El usuario autorizó el corte completo el
2026-08-01: los 13 artes aprobados sustituyen las fuentes anteriores bajo
`public/cards/last_rain/art/`, los nombres y flavor viven en el JSON runtime, las excepciones
mecánicas de Iria y Arven están implementadas y los 13 PNG completos fueron regenerados. La
procedencia, prompts y hashes del lote viven en `docs/asset_provenance_last_rain.json`. L7 sustituyó
los ids y rutas heredados por las claves finales de esta Crónica.

## Premisa

Durante años, un bosque antiguo ha permanecido seco y silencioso, pero no muerto. Iria regresa
llevando el último recuerdo de la lluvia. Al despertar manantiales, aliados y criaturas olvidadas,
reconstruye la cadena vital del bosque. Incluso la savia corrompida se convierte en defensa. Cuando
la restauración está completa, despierta el guardián ancestral que dormía bajo sus raíces.

La Crónica cuenta una restauración gradual, no una guerra genérica de naturaleza contra maldad:

1. Se recuperan las Fuentes y vuelve a circular la Energía.
2. Iria restaura Vida y fortalece al primer aliado.
3. Exploradores y custodios reúnen a las criaturas del bosque.
4. La corrupción venenosa se redirige contra la Hueste.
5. Despiertan los guardianes del dosel.
6. Orun aparece como culminación del episodio.

El Chronicler sigue siendo el jugador que reconstruye todas las Crónicas. **Iria es el Eco de
Crónica y protagonista de este deck**, no su Chronicler.

## Tono y lenguaje visual común

- Fantasía natural dark-medieval: húmeda, antigua, pesada y parcialmente arruinada.
- El bosque no debe parecer un jardín feérico alegre. Hay piedra mojada, árboles petrificados,
  santuarios hundidos, niebla baja y criaturas que parecen haber dormido durante siglos.
- Paleta principal: verdes profundos, musgo, carbón, piedra fría, lluvia gris y ámbar apagado.
- La savia negra funciona como acento de corrupción; no debe dominar las cartas que representan la
  restauración.
- Motivos compartidos: ondas circulares, raíces iluminadas bajo el suelo, cuencos de piedra, gotas
  suspendidas, corteza agrietada que vuelve a mostrar vida y siluetas enormes entre el dosel.
- Cada imagen debe comunicar primero la estadística o el efecto real de su carta. La continuidad
  narrativa no debe volver ambiguo qué hace la carta.
- Los Ecos pequeños se leen como restauradores, recolectores o custodios. Los Ecos grandes se leen
  como partes antiguas del paisaje que vuelven a moverse.

## Decisiones mecánicas aprobadas

El esqueleto del deck se conserva salvo estas excepciones explícitas:

1. **Iria, Voz de la Última Lluvia** será `CHRONICLE`.
2. Iria conserva su coste 1, Fuerza 0, Aguante 2 y el contador +1/+1 que entrega al ser invocada,
   pero pasa de recuperar 1 a recuperar **3 de Vida**.
3. **Arven, Primero de la Manada** conserva coste 3 y estadísticas 3/3, pero pierde `OVERFLOW`.
4. El disparo de Arven pasa a ocurrir solo la primera vez que otro aliado sea invocado durante el
   turno del Chronicler. Arven gana +1/+1 hasta que comience el próximo turno del Chronicler.
5. Arven **no** recibe `ALERT`. Atacar o conservarlo como defensor debe seguir siendo una decisión.
6. Se retira `OVERFLOW` de todo el deck, sin reemplazarlo por otro Rasgo. Esto afecta a Arven, al
   Eco 4/5 y al Eco 6/5.
7. Fuera de estas excepciones, se conservan costes, cantidades, Fuerza, Aguante, efectos, timing y
   Rasgos actuales.

Texto de reglas de diseño para Arven:

> La primera vez que otro aliado sea invocado durante tu turno, Arven gana +1/+1 hasta que
> comience tu próximo turno.

El límite de una vez por turno evita que varios Ecos baratos o varias copias de Arven conviertan el
bono persistente de Aguante en una escalada difícil de responder. La duración permite usar el bono
al atacar o reservarlo para la defensa, pero la ausencia de Alerta impide hacer ambas cosas sin
coste de decisión.

## Mapeo carta por carta

Los ids Hostfall finales aparecen junto a los nombres visibles de la Crónica.

| Id técnico | Identidad final | Mecánica conservada o aprobada | Papel narrativo y brief visual |
| --- | --- | --- | --- |
| `deep_root_spring` | **Manantial de Raízhonda** | 15 copias. Fuente que se Agota para ganar 1 Energía. | Red de agua enterrada que Iria reactiva. Un estanque oscuro entre ruinas; raíces bajo el agua empiezan a iluminarse. Es la base literal del despertar. |
| `first_dew_gatherers` | **Recolectores del Primer Rocío** | 2 copias. Coste 1, 1/1; se Agota para ganar 1 Energía. | Pequeños habitantes que recogen gotas de hojas, estatuas y piedras. Su fragilidad comunica que trabajan y transportan, no que sean guerreros. |
| `iria_voice_last_rain` | **Iria, Voz de la Última Lluvia** | 3 copias. Coste 1, 0/2. Eco de Crónica. Al ser invocada, da un contador +1/+1 a un aliado y recupera 3 de Vida. | Protagonista. No vence por Fuerza propia: restaura a otro ser y al Chronicler. Porta un cuenco o recipiente de piedra que nunca deja de contener lluvia. |
| `keeper_sleeping_root` | **Custodio de la Raíz Dormida** | 2 copias. Coste 2, 1/3; se Agota para ganar 1 Energía. | Guardián paciente de los conductos profundos. Debe verse más resistente y experimentado que los Recolectores, cerca de una cámara de raíces o un pozo sellado. |
| `black_sap_stalker` | **Acechador de Savia Negra** | 2 copias. Coste 3, 1/3; Letal y Veneno 1. | Criatura nacida de la parte enferma del bosque. Es delgada, resistente y poco poderosa, pero una sola mordida es mortal. La savia negra aparece en colmillos y grietas, no como armadura masiva. |
| `arven_first_pack` | **Arven, Primero de la Manada** | 3 copias. Coste 3, 3/3, sin Rasgos. Primera invocación aliada del turno: +1/+1 hasta el próximo turno. | Compañero principal de Iria. Reúne y conduce a las criaturas despertadas. Su presencia debe leerse como la de un líder que corre junto a la manada, no como un jinete que la domina. |
| `ancient_canopy_watchers` | **Vigías del Dosel Antiguo** | 2 copias. Coste 4, 4/4; Guardia aérea. | Guardianes altos y sólidos que vuelven a ocupar las copas. Brazos, astas o lanzas de madera alcanzan amenazas aéreas. Su silueta debe explicar Guardia aérea sin depender del texto. |
| `hollow_skybreaker` | **Quebracielos de la Hondonada** | 2 copias. Coste 4, 4/5; Guardia aérea. Sin Desborde. | Grandes bestias primordiales que emergen cuando el bosque ya recuperó suficiente Energía. Su altura o anatomía les permite disputar el cielo; el Aguante 5 debe sentirse en masa y protección corporal. |
| `orun_waking_root` | **Orun, la Raíz Despierta** | 1 copia. Coste 6, 6/5; Guardia aérea. Sin Desborde. | Culminación de la Crónica. Coloso de madera, piedra y vegetación cuyo cuerpo formaba parte del paisaje. Iria no lo controla: logra que el bosque lo recuerde y vuelva a levantarse. |
| `marked_prey` | **La Presa Señalada** | 2 copias. Coste 2, Rápido. Un aliado hace daño igual a su Fuerza a otro Eco. | Emboscada coordinada por Arven. El aliado encuentra la apertura y golpea sin recibir daño; la imagen no debe parecer un duelo simultáneo. |
| `oath_clearing` | **El Juramento del Claro** | 1 copia. Coste 2. Un aliado gana +1/+2 hasta el final del turno y después lucha contra un enemigo. | Un defensor se cubre de raíces o corteza antes del choque frontal. A diferencia de La Presa Señalada, ambos combatientes deben verse comprometidos en la confrontación. |
| `roots_touched_sky` | **Cuando las Raíces Tocaron el Cielo** | 2 copias. Coste 3, Rápido. Destruye un Apoyo o un Eco con Volar. | Momento concreto de la historia: raíces gigantes derriban una estructura y alcanzan una amenaza aérea. La composición debe admitir visualmente ambos tipos de objetivo. |
| `first_tree_sap` | **Savia del Primer Árbol** | 2 copias. Coste 1, Rápido. Un Eco gana +3/+3 hasta el final del turno. | Un aliado recibe por un instante la fuerza del bosque original. Raíces luminosas recorren su cuerpo y detrás aparece la silueta incompleta de una criatura ancestral. |

## Relaciones narrativas

La progresión del deck debe sentirse como una sola cadena causal:

```text
Manantiales
  -> Recolectores y custodios restauran el flujo
  -> Iria devuelve fuerza y memoria
  -> Arven reúne a las criaturas
  -> regresan los guardianes del dosel
  -> Orun despierta
```

El Acechador de Savia Negra evita que la restauración sea limpia o sentimental. El bosque que
regresa también es venenoso, territorial y peligroso. Iria no elimina esa parte: devuelve el
equilibrio suficiente para que deje de consumir al propio bosque y pueda volverse contra la Hueste.

Los Hechizos son fragmentos de acontecimientos concretos de la Crónica, no poderes genéricos:

- Arven o uno de sus aliados señala una presa y ejecuta una emboscada.
- Un defensor jura sostener el claro y acepta un enfrentamiento directo.
- Las raíces alcanzan aquello que amenazaba desde arriba.
- La savia ancestral manifiesta temporalmente la grandeza del primer bosque.

## Decisiones visuales integradas

El corte de producción usa estas decisiones:

- Iria es una restauradora humana adulta de piel morena, cabello negro trenzado, manto pesado de
  musgo y ropa medieval práctica. Su silueta gira alrededor del cuenco de piedra y el gesto de sanar.
- Arven pertenece a un pueblo lupino original del bosque: adulto, esbelto, de pelaje carbón y equipo
  de cuero, corteza y tela de musgo. Corre junto a la manada y no la monta ni la domina.
- Recolectores y Custodios pertenecen a un mismo pueblo pequeño de rasgos anfibios y corteza; los
  primeros son frágiles y ágiles, mientras el Custodio es mayor, ancho y resistente.
- Vigías son guardianes arbóreos verticales y disciplinados; Quebracielos es una bestia cuadrúpeda
  de gran masa; Orun es un fragmento asimétrico del paisaje que vuelve a levantarse.
- Los ids, nombres de archivo y rutas usan la identidad final de la Crónica.

## Estado después de L7

- Identidad visible, ids, rutas y PNG usan nombres Hostfall.
- Los escenarios y preferencias anteriores al corte no se migran.
