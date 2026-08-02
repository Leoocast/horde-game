# Hueste: La Procesión de la Campana Hueca

Estado: **integrada en runtime y Card Studio; identidad técnica Hostfall final**
Deck actual: `hollow_bell_procession` / `La Procesión de la Campana Hueca`
Última actualización: 2026-08-01

Este documento conserva la identidad narrativa, el mapeo mecánico y la dirección visual de la
Procesión. Los 17 nombres y sus flavor bilingües viven en
`src/data/decks/host/hollow_bell_procession/hollow_bell_procession.json`; el Card Studio sólo proyecta esos datos. Los 17
artes fuente viven en `public/cards/hollow_bell_procession/art/` y sus cartas completas exportadas en
`public/cards/hollow_bell_procession/`. La procedencia, prompts resumidos, dimensiones y hashes del lote viven en
`docs/asset_provenance_hollow_bell.json`.

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
| `last_knell_dead` | **Muerto del Último Taño** | Ficha 2/2, x21. | Soldado básico que se endereza con el tañido. Retrato vertical de cuerpo completo y jerarquía visual deliberadamente modesta. |
| `mass_grave_colossus` | **Coloso de la Fosa Común** | Ficha 5/5, x4. | Muchos cuerpos y lápidas comprimidos en una sola figura monumental. Retrato vertical que hace evidente su masa 5/5. |
| `hollow_bell` | **La Campana Hueca** | Apoyo; da Imponente a los Zombis. Dos habilidades siguen pendientes. | La fuente persistente de la marcha: una campana de bronce verdín que obliga a filas enteras a levantarse. |
| `five_knot_gallows` | **El Cadalso de los Cinco Nudos** | Entra con cinco contadores +1/+1; cada carta no Ficha retira uno e Invoca una Ficha 2/2. | Cinco nudos sostienen una multitud compuesta; al soltarse uno, una figura abandona el cadalso. |
| `last_thought_carrion` | **Carroña del Último Pensamiento** | 2/4; al morir, el Cronista descarta una carta. | Cuerpo ancho y resistente usado como relicario para un único recuerdo que estalla al morir. |
| `memory_shroud_bearer` | **Portador de la Mortaja Mnémica** | 2/2; al ser invocada, el Cronista descarta una carta. | Una mortaja de humo arranca una tablilla de memoria al cruzar el umbral del Archivo. |
| `flesh_root_tithe` | **Diezmo de Carne y Raíz** | Hechizo: pierde Vida, descarta y sacrifica un Eco y una Fuente. | Altar simbólico con cuatro ofrendas que se extinguen; cada objeto representa uno de los cuatro pagos. |
| `crypt_rotwing` | **Alapútrida de la Cripta** | 2/1, Volar. | Murciélago de hueso y tela funeraria: ligero, veloz y frágil. |
| `basted_wing` | **Ala Hilvanada** | 3/1, Volar; recursión ignorada en este modo. | Primer prototipo de vuelo, poderoso pero apenas unido por costuras desiguales. |
| `reinforced_gravewing` | **Ala Sepulcral Reforzada** | 3/4, Volar; recursión ignorada en este modo. | Evolución de la anterior con dobles costuras y costillas de bronce que justifican Aguante 4. |
| `archive_carrion_crow` | **Cuervo Carroñero del Archivo** | 2/1, Volar; al entrar o morir manda dos cartas del Archivo a la Memoria. | Cuervo que carga exactamente dos tablillas; su sombra anticipa la repetición del efecto al morir. |
| `horned_linebreaker` | **Rompelíneas Astado** | 3/2, Imponente. | Minotauro ancho de cuernos cuya silueta explica que hacen falta dos defensores. |
| `seventh_memory_hound` | **Sabueso de la Séptima Memoria** | 3/2; con siete cartas en Memoria gana +1/+1 e Imponente. | Sabueso flaco que absorbe la séptima tablilla y empieza a crecer. |
| `full_ossuary_mastiff` | **Mastín del Osario Colmado** | 5/3; con siete cartas en Memoria gana Imponente. | Mastín masivo frente a siete bóvedas llenas; la cadena del portón deja de contenerlo. |
| `silent_bite_rats` | **Ratas de la Mordida Silente** | 1/1, Letal y Furtivo. | Ratas diminutas ocultas bajo el pavimento; la mordida aceitosa importa más que su cuerpo. |
| `fallen_gatherer` | **Recolector de los Caídos** | 2/4; gana un contador +1/+1 cuando muere otro Zombi aliado. | Recolector duradero que fija a su cuerpo placas tomadas de cada aliado caído. |
| `last_march_marshal` | **Mariscal de la Última Marcha** | 2/2, Letal; +1/+1 a otros Zombis y pérdida de Vida por cada otra muerte aliada. | Oficial que cierra las filas mientras cada baja alimenta una brasa de aceite negro contra el Cronista. |

## Contrato de datos y exportación

- El nombre del deck, los nombres de carta, las reglas, el flavor bilingüe y `showFlavorText` se
  authorizan únicamente en el JSON runtime.
- Todas las cartas conservan flavor aunque las de texto largo declaren `showFlavorText: false`.
- `dev/tools/Decks/hollow_bell_procession/studio.config.json` conserva sólo decisiones visuales y rutas a
  `public/cards/hollow_bell_procession/art/*.png`.
- `scripts/card-studio-data.mjs --write` genera la proyección del taller y
  `dev/tools/Decks/export_cards.cjs hollow_bell_procession` regenera las 17 cartas completas.
- Los ids y nombres de archivo usan la identidad final de la Procesión.
