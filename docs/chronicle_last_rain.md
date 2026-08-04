# Crónica: El Pacto de Elarion

Estado: **integrada en runtime y Card Studio; identidad Beta aprobada**
Deck técnico: `last_rain`
Nombre visible: `El Pacto de Elarion`
Última actualización: 2026-08-03

Este documento conserva la identidad narrativa, el mapeo mecánico y la dirección visual del deck.
Los 13 artes Beta viven en `public/cards/last_rain/art/`; los nombres, reglas y flavor se authorizan
en el JSON runtime. Los ids técnicos y las rutas permanecen estables para conservar escenarios,
replays y consumidores existentes.

## Premisa

Elarion fue un reino élfico unido a criaturas, guardianes y pueblos vecinos por un pacto más antiguo
que su corona. Cuando el reino cayó, Vaelor, su dragón protector, se retiró y las sendas que conducían
hacia él desaparecieron.

Aelyra hereda un nombre sin trono y un juramento roto. Para despertar a Vaelor debe volver a reunir
las voces del pacto: Liora conserva la última arboleda viva, Kaelor llama a la tormenta, Maela vigila
las alturas y hasta la Hidra de la Fronda Negra responde a la antigua alianza. El río recuerda el
camino que los mapas olvidaron.

La Crónica avanza como una reunión de fuerzas:

1. La Flor del Alba Velada y el Río de Elarion restauran el flujo de Energía.
2. Aelyra fortalece a un aliado y sostiene la Vida del Cronista.
3. Liora, Kaelor y Maela reúnen a los defensores del reino.
4. Los hechizos recuperan fragmentos del poder élfico.
5. El Eco de la Ciudad Olvidada vuelve a proteger sus ruinas.
6. Vaelor despierta como culminación del pacto restaurado.

Aelyra es el Eco de Crónica y la protagonista de este deck. El Cronista sigue siendo la persona
jugadora que reconstruye la Crónica.

## Identidad visual

- Fantasía élfica dark-medieval con luz lunar, verdes profundos, tormenta, piedra antigua y oro
  apagado.
- El deck representa una alianza fundada por elfos, no una tribu exclusivamente élfica.
- Humanos, espíritus, monstruos y el dragón conservan identidades propias dentro del pacto.
- La luna y la magia blanca distinguen a Aelyra; el verde esmeralda identifica el regreso de Vaelor.
- Los nombres y el flavor se apoyan en el arte Beta vigente, no en las ilustraciones anteriores.

## Decisiones mecánicas aprobadas

1. **Aelyra, Heredera de Elarion** es un Eco de Crónica 0/2 de coste 1. Al ser invocada, coloca un
   contador +1/+1 sobre un aliado y recupera 3 de Vida.
2. **Kaelor, Convocador de Tormentas** es 3/4 de coste 4. La primera vez que otro aliado sea
   invocado durante el turno del Cronista, Kaelor gana +1/+1 hasta el próximo turno del Cronista.
3. Kaelor no recibe Alerta y su habilidad sigue limitada a una vez por turno.
4. **Maela, Vigía de las Alturas** es 3/3 de coste 3 y conserva Guardia aérea.
5. Se conservan cantidades, efectos, timing y Rasgos del resto del deck.

## Mapeo carta por carta

| Id técnico | Identidad Beta | Mecánica | Papel narrativo |
| --- | --- | --- | --- |
| `first_dew_gatherers` | **Flor del Alba Velada** | Coste 1, 1/1; se Agota para ganar 1 Energía. | Primera señal de que las sendas mágicas de Elarion vuelven a abrirse. |
| `iria_voice_last_rain` | **Aelyra, Heredera de Elarion** | Coste 1, 0/2; Eco de Crónica; contador +1/+1 y 3 de Vida al ser invocada. | Heredera sin trono que reconstruye el pacto y busca a Vaelor. |
| `keeper_sleeping_root` | **Liora, Guardiana de la Arboleda** | Coste 2, 1/3; se Agota para ganar 1 Energía. | Elfa que mantuvo viva la última rama del reino. |
| `black_sap_stalker` | **Hidra de la Fronda Negra** | Coste 3, 1/3; Letal y Veneno 1. | Monstruo territorial cuya lealtad demuestra que el pacto incluye más que elfos. |
| `arven_first_pack` | **Kaelor, Convocador de Tormentas** | Coste 4, 3/4; primera invocación aliada del turno: +1/+1 hasta el próximo turno. | Mago élfico cuya tormenta crece con cada voz que responde al pacto. |
| `ancient_canopy_watchers` | **Maela, Vigía de las Alturas** | Coste 3, 3/3; Guardia aérea. | Arquera humana que protege las rutas altas de Elarion. |
| `hollow_skybreaker` | **Eco de la Ciudad Olvidada** | Coste 4, 4/5; Guardia aérea. | Memoria protectora de las ruinas del antiguo reino. |
| `orun_waking_root` | **Vaelor, Guardián Esmeralda** | Coste 6, 6/5; Guardia aérea. | Dragón protector y culminación de la Crónica. |
| `marked_prey` | **Choque de Ecos** | Coste 2, Rápido; un aliado hace daño igual a su Fuerza a otro Eco. | Aelyra enfrenta con magia a un recuerdo hostil; sólo uno responde al llamado de Elarion. |
| `oath_clearing` | **Escudo de la Heredera** | Coste 2; +1/+2 a un aliado y después lucha contra un enemigo. | La protección de Aelyra permite sostener un enfrentamiento directo. |
| `roots_touched_sky` | **El Juicio de Elarion** | Coste 3, Rápido; destruye un Apoyo o un Eco con Volar. | La antigua ley del reino alcanza tanto piedra como alas. |
| `first_tree_sap` | **Elixir de la Primera Hoja** | Coste 1, Rápido; un Eco gana +3/+3 hasta el final del turno. | Poder concentrado de los primeros guardianes élficos. |
| `deep_root_spring` | **Río de Elarion** | 15 copias; Fuente que se Agota para ganar 1 Energía. | Camino vivo que todavía recuerda dónde duerme Vaelor. |

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
- Los ids técnicos históricos permanecen estables; ninguna regla se programa por nombre visible.
