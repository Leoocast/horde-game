# Crónica: El Pacto de Elarion

Estado: **integrada en runtime y Card Studio; identidad Beta aprobada**
Deck técnico: `pact_of_elarion`
Nombre visible: `El Pacto de Elarion`
Última actualización: 2026-08-06

Este documento conserva la identidad narrativa, el mapeo mecánico y la dirección visual del deck.
Los 13 artes Beta viven en `public/cards/pact_of_elarion/art/`; los nombres, reglas y flavor se authorizan
en el JSON runtime. Los ids técnicos y las rutas usan la identidad canónica vigente del deck y de
cada carta.

## Premisa

Elarion fue un reino élfico unido a criaturas, guardianes y pueblos vecinos por un pacto más antiguo
que su corona. Cuando el reino cayó, Vaelor, su dragón protector, se retiró y las sendas que conducían
hacia él desaparecieron.

Aelyra hereda un nombre sin trono y un juramento roto. Para despertar a Vaelor debe volver a reunir
las voces del pacto: Liora conserva la última arboleda viva, Kaelor llama a la tormenta, Maela vigila
las alturas y hasta la Hidra de la Fronda Negra responde a la antigua alianza. El río recuerda el
camino que los mapas olvidaron.

La Crónica avanza como una reunión de fuerzas:

1. La Flor del Alba y el Río de Elarion restauran el flujo de Energía.
2. Aelyra fortalece a un aliado y sostiene la Vida del Cronista.
3. Liora, Kaelor y Maela reúnen a los defensores del reino.
4. Los hechizos recuperan fragmentos del poder élfico.
5. El Eco de la Ciudad Olvidada vuelve a proteger sus ruinas.
6. Vaelor despierta como culminación del pacto restaurado.

Aelyra es el Eco protagonista de este deck y conserva el modificador técnico `CHRONICLE`, que no se
muestra en su línea de tipo. El Cronista sigue siendo la persona jugadora que reconstruye la Crónica.

## Identidad visual

- Fantasía élfica dark-medieval con luz lunar, verdes profundos, tormenta, piedra antigua y oro
  apagado.
- El deck representa una alianza fundada por elfos, no una tribu exclusivamente élfica.
- Humanos, espíritus, monstruos y el dragón conservan identidades propias dentro del pacto.
- La luna y la magia blanca distinguen a Aelyra; el verde esmeralda identifica el regreso de Vaelor.
- Los nombres y el flavor se apoyan en el arte Beta vigente, no en las ilustraciones anteriores.

## Decisiones mecánicas aprobadas

1. **Aelyra, Heredera de Elarion** es un Eco 1/2 de coste 1. Al ser invocada, coloca un
   contador +1/+1 sobre un aliado y recupera 3 de Vida.
2. **Kaelor, Convocador de Tormentas** es 3/4 de coste 4. La primera vez que otro aliado sea
   invocado durante el turno del Cronista, Kaelor gana +1/+1 hasta el próximo turno del Cronista.
3. Kaelor no recibe Alerta y su habilidad sigue limitada a una vez por turno.
4. **Maela, Vigía de las Alturas** es 3/3 de coste 3 y conserva Guardia aérea.
5. Se conservan cantidades, efectos, timing y Rasgos del resto del deck.

## Mapeo carta por carta

| Id técnico | Identidad Beta | Mecánica | Papel narrativo |
| --- | --- | --- | --- |
| `veiled_dawn_flower` | **Flor del Alba** | Coste 1, 0/1; se Agota para agregar 1 de Energía. | Primera señal de que las sendas mágicas de Elarion vuelven a abrirse. |
| `aelyra_heir_of_elarion` | **Aelyra, Heredera de Elarion** | Coste 1, 1/2; Eco; contador +1/+1 y 3 de Vida al ser invocada. | Heredera sin trono que reconstruye el pacto y busca a Vaelor. |
| `liora_keeper_of_the_grove` | **Liora, Guardiana de la Arboleda** | Coste 2, 1/3; se Agota para agregar 1 de Energía. | Elfa que mantuvo viva la última rama del reino. |
| `hydra_of_the_black_bough` | **Hidra de la Fronda Negra** | Coste 3, 1/3; Letal y Veneno 1. | Monstruo territorial cuya lealtad demuestra que el pacto incluye más que elfos. |
| `kaelor_stormcaller` | **Kaelor, Convocador de Tormentas** | Coste 4, 3/4; primera invocación aliada del turno: +1/+1 hasta el próximo turno. | Mago élfico cuya tormenta crece con cada voz que responde al pacto. |
| `maela_watcher_of_the_heights` | **Maela, Vigía de las Alturas** | Coste 3, 3/3; Guardia aérea. | Arquera humana que protege las rutas altas de Elarion. |
| `echo_of_the_forgotten_city` | **Eco de la Ciudad Olvidada** | Coste 4, 4/5; Guardia aérea. | Memoria protectora de las ruinas del antiguo reino. |
| `vaelor_emerald_guardian` | **Vaelor, Guardián Esmeralda** | Coste 6, 6/5; Volar; al ser invocado pone un contador -1/-1 sobre cada enemigo. | Dragón protector y culminación de la Crónica. |
| `clash_of_echoes` | **Choque de Ecos** | Coste 2, Rápido; un aliado hace daño igual a su Fuerza a un enemigo. | Aelyra enfrenta con magia a un recuerdo hostil; sólo uno responde al llamado de Elarion. |
| `shield_of_the_heir` | **Escudo de la Heredera** | Coste 2; +1/+2 a un aliado y después lucha contra un enemigo. | La protección de Aelyra permite sostener un enfrentamiento directo. |
| `the_judgment_of_elarion` | **El Juicio de Elarion** | Coste 3, Rápido; destruye un Apoyo enemigo o un Eco enemigo con Imponente o Volar. | La antigua ley del reino alcanza tanto piedra como alas. |
| `elixir_of_the_first_leaf` | **Elixir de la Primera Hoja** | Coste 1, Rápido; un Eco gana +3/+3 hasta el final del turno. | Poder concentrado de los primeros guardianes élficos. |
| `river_of_elarion` | **Río de Elarion** | 15 copias; Fuente que se Agota para agregar 1 de Energía. | Camino vivo que todavía recuerda dónde duerme Vaelor. |

## Relación narrativa

```text
La flor despierta
  -> el río recupera su curso
  -> Aelyra reúne a los aliados del pacto
  -> Elarion vuelve a defender sus ruinas
  -> Vaelor encuentra un reino por el que vale la pena despertar
```

## Contrato técnico

- El JSON runtime es la fuente de verdad de nombres, reglas, stats y flavor bilingüe.
- Card Studio sólo agrega presentación, encuadres y rutas al arte local.
- Los JPEG Beta son arte fuente y no se sustituyen durante la regeneración de cartas.
- Los ids canónicos se derivan de los nombres ingleses vigentes; ninguna regla se programa por
  nombre visible.
