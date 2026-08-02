# Hueste: La Procesión de la Campana Hueca

Estado: **integrada en runtime y Card Studio; ids técnicos pendientes de L7**  
Deck actual: `horde_zombies` / `La Procesión de la Campana Hueca`  
Última actualización: 2026-08-01

Este documento conserva la identidad narrativa, el mapeo mecánico y la dirección visual del corte
propio del antiguo deck Zombie. Los 17 nombres y sus flavor bilingües viven en
`src/data/decks/horde/zombies/horde-zombies.json`; el Card Studio sólo proyecta esos datos. Los 17
artes fuente viven en `public/cards/zombies/art/` y sus cartas completas exportadas en
`public/cards/zombies/`. La procedencia, prompts resumidos, dimensiones y hashes del lote viven en
`docs/asset_provenance_hollow_bell.json`.

Se conservan los ids técnicos heredados para no introducir una migración de persistencia no
solicitada. El corte cambia identidad y presentación, no estadísticas, cantidades ni reglas.

## Premisa

Bajo una ciudad-campanario inundada, una campana sin badajo vuelve a sonar. Cada tañido arranca un
recuerdo del Archivo y lo fija dentro de un cadáver preparado para marchar. Los primeros muertos
son reemplazables; los últimos ya cargan los recuerdos, costuras y placas de todos los que cayeron
antes. La Procesión no busca territorio: avanza para vaciar al Cronista de identidad y convertirlo
en su último integrante.

## Lenguaje visual común

- Fantasía funeraria dark-medieval en una ciudad osario ahogada: bronce verdín, piedra negra
  mojada, mortajas, aceite funerario negro y niebla azul cadavérica.
- La campana, los nudos, las tablillas de memoria y las bóvedas numeradas conectan las cartas sin
  volverlas intercambiables.
- Cada arte comunica primero las estadísticas o el efecto real: ligereza, resistencia, cantidad de
  contadores, condición de siete cartas, evasión o crecimiento por muertes.
- No hay texto, marcos, logos ni símbolos de otras franquicias dentro del arte fuente.
- **Las dos Fichas son verticales**: fuente 1024×1536 y figura completa pensada para el formato
  full-art. Las otras quince fuentes son horizontales porque ocupan la ventana de arte del marco.

## Mapeo carta por carta

| Id técnico | Identidad final | Mecánica conservada | Papel narrativo y brief visual |
| --- | --- | --- | --- |
| `zombie_token` | **Muerto del Último Taño** | Ficha 2/2, x21. | Soldado básico que se endereza con el tañido. Retrato vertical de cuerpo completo y jerarquía visual deliberadamente modesta. |
| `zombie_giant_token` | **Coloso de la Fosa Común** | Ficha 5/5, x4. | Muchos cuerpos y lápidas comprimidos en una sola figura monumental. Retrato vertical que hace evidente su masa 5/5. |
| `graf_harvest` | **La Campana Hueca** | Apoyo; da Imponente a los Zombis. Dos habilidades siguen pendientes. | La fuente persistente de la marcha: una campana de bronce verdín que obliga a filas enteras a levantarse. |
| `noosegraf_mob` | **El Cadalso de los Cinco Nudos** | Entra con cinco contadores +1/+1; cada carta no Ficha retira uno e Invoca una Ficha 2/2. | Cinco nudos sostienen una multitud compuesta; al soltarse uno, una figura abandona el cadalso. |
| `rottenheart_ghoul` | **Carroña del Último Pensamiento** | 2/4; al morir, el Cronista descarta una carta. | Cuerpo ancho y resistente usado como relicario para un único recuerdo que estalla al morir. |
| `miasmic_mummy` | **Portador de la Mortaja Mnémica** | 2/2; al ser invocada, el Cronista descarta una carta. | Una mortaja de humo arranca una tablilla de memoria al cruzar el umbral del Archivo. |
| `smallpox` | **Diezmo de Carne y Raíz** | Hechizo: pierde Vida, descarta y sacrifica un Eco y una Fuente. | Altar simbólico con cuatro ofrendas que se extinguen; cada objeto representa uno de los cuatro pagos. |
| `blighted_bat` | **Alapútrida de la Cripta** | 2/1, Volar. | Murciélago de hueso y tela funeraria: ligero, veloz y frágil. |
| `stitchwing_skaab` | **Ala Hilvanada** | 3/1, Volar; recursión ignorada en este modo. | Primer prototipo de vuelo, poderoso pero apenas unido por costuras desiguales. |
| `advanced_stitchwing` | **Ala Sepulcral Reforzada** | 3/4, Volar; recursión ignorada en este modo. | Evolución de la anterior con dobles costuras y costillas de bronce que justifican Aguante 4. |
| `crow_of_dark_tidings` | **Cuervo Carroñero del Archivo** | 2/1, Volar; al entrar o morir manda dos cartas del Archivo a la Memoria. | Cuervo que carga exactamente dos tablillas; su sombra anticipa la repetición del efecto al morir. |
| `cursed_minotaur` | **Rompelíneas Astado** | 3/2, Imponente. | Minotauro ancho de cuernos cuya silueta explica que hacen falta dos defensores. |
| `thraben_foulbloods` | **Sabueso de la Séptima Memoria** | 3/2; con siete cartas en Memoria gana +1/+1 e Imponente. | Sabueso flaco que absorbe la séptima tablilla y empieza a crecer. |
| `hound_of_the_farbogs` | **Mastín del Osario Colmado** | 5/3; con siete cartas en Memoria gana Imponente. | Mastín masivo frente a siete bóvedas llenas; la cadena del portón deja de contenerlo. |
| `rancid_rats` | **Ratas de la Mordida Silente** | 1/1, Letal y Furtivo. | Ratas diminutas ocultas bajo el pavimento; la mordida aceitosa importa más que su cuerpo. |
| `gavony_unhallowed` | **Recolector de los Caídos** | 2/4; gana un contador +1/+1 cuando muere otro Zombi aliado. | Recolector duradero que fija a su cuerpo placas tomadas de cada aliado caído. |
| `diregraf_captain` | **Mariscal de la Última Marcha** | 2/2, Letal; +1/+1 a otros Zombis y pérdida de Vida por cada otra muerte aliada. | Oficial que cierra las filas mientras cada baja alimenta una brasa de aceite negro contra el Cronista. |

## Contrato de datos y exportación

- El nombre del deck, los nombres de carta, las reglas, el flavor bilingüe y `showFlavorText` se
  authorizan únicamente en el JSON runtime.
- Todas las cartas conservan flavor aunque las de texto largo declaren `showFlavorText: false`.
- `dev/tools/Decks/zombies/studio.config.json` conserva sólo decisiones visuales y rutas a
  `public/cards/zombies/art/*.png`.
- `scripts/card-studio-data.mjs --write` genera la proyección del taller y
  `dev/tools/Decks/export_cards.cjs zombies` regenera las 17 cartas completas.
- Los ids y nombres de archivo heredados no son identidad visible. Su eventual cambio pertenece a
  una migración explícita de persistencia en L7.
