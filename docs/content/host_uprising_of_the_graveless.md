# Hueste: El Alzamiento de los Sinsepulcro

Estado: **integrada en runtime y Card Studio; identidad técnica Hostfall final**
Deck actual: `uprising_of_the_graveless` / `El Alzamiento de los Sinsepulcro`
Última actualización: 2026-08-22

Este documento conserva la identidad narrativa y el mapeo mecánico de los Sinsepulcro. Los nombres,
reglas y flavor bilingüe viven en
`src/data/decks/host/uprising_of_the_graveless/uprising_of_the_graveless.json`; el Card Studio sólo
proyecta esos datos. Los ids técnicos se derivan de los nombres ingleses canónicos.

## Premisa

Un santuario se partió desde dentro y dejó a los primeros muertos sin lugar al cual regresar. Desde
esa grieta se extendió una orden muda: levantarse, recuperar los recuerdos enterrados y arrastrar
consigo todo cuerpo olvidado. Así nacieron los Sinsepulcro, una Hueste de soldados, bestias,
jinetes y engendros zombificados que convierte su propia Memoria en fuerza.

El alzamiento no avanza al sonido de una campana. Lo guía Nerezh, Matriarca Sinsepulcro, que cierra
las filas con cada cadáver caído. Cuanto más llena está la Memoria de la Hueste, más peligrosas se
vuelven sus criaturas. Incluso aquello que parece una pérdida —como `Retorno a la Memoria` enviando
cartas del Archivo a la Memoria— acerca a la Hueste a sus umbrales de tres y siete cartas.

## Lenguaje visual

- Fantasía funeraria oscura: piedra quebrada, osarios, raíces muertas y luz verde cadavérica.
- La insignia es una lápida rota. La campana deja de ser el símbolo central del deck.
- Todas las criaturas representan cuerpos o bestias zombificados, aunque sus razas secundarias
  varíen.
- El arte fuente se conserva separado de las cartas completas exportadas.

## Mapeo carta por carta

| Id técnico | Nombre visible | Mecánica | Lectura narrativa |
| --- | --- | --- | --- |
| `graveless_soldier` | **Soldado Sinsepulcro** | Ficha 2/2, x21. | La tropa básica liberada por el santuario. |
| `graveless_titan` | **Titán Sinsepulcro** | Ficha 5/5, x4. | Un cementerio entero comprimido dentro de una armadura. |
| `the_broken_headstone` | **El Santuario Quebrado** | Apoyo; da Imponente a los Zombis. | La primera grieta y emblema del alzamiento. |
| `inexhaustible_ossuary` | **Osario Inagotable** | Se imprime como 5/5 por sus cinco contadores iniciales; cada carta no Ficha consume uno y, sólo si se quitó, Invoca una Ficha 2/2. | Cada espacio vacío reclama otro cuerpo. |
| `devourer_of_the_last_memory` | **Devorador del Último Recuerdo** | Al morir, el Cronista descarta una carta. | Su muerte arrastra consigo un pensamiento enemigo. |
| `memory_thief` | **Ladrón de Memorias** | Al ser invocado, el Cronista descarta una carta. | La luz de su mano es un recuerdo robado. |
| `tribute_of_the_four_sorrows` | **Tributo de los Cuatro Pesares** | La Hueste sacrifica su Eco con menor suma de Fuerza y Aguante; después el Cronista pierde Vida, descarta y sacrifica un Eco y una Fuente. | Cuatro pagos para una tumba que no perdona ninguno. |
| `winged_stalker_of_the_crypt` | **Acechador Alado de la Cripta** | 2/1, Volar. | El último guardián esquelético de la cripta lleva su cacería hasta el cielo. |
| `stitched_wing_spawn` | **Engendro de Alas Cosidas** | 3/1, Volar. | Un cuerpo apenas sostenido por sus costuras. |
| `ossuary_rider` | **Jinete del Osario** | 3/4, Volar. | Montura reforzada con los huesos de cada caída. |
| `return_to_memory` | **Retorno a la Memoria** | 2/1, sin Volar; al entrar o morir mueve dos cartas del Archivo a la Memoria. | No es un cuervo: representa el regreso que alimenta la Memoria de la Hueste. |
| `barrow_wallbreaker` | **Rompemuros del Túmulo** | 3/2, Imponente. | Una bestia astada que exige dos defensores. |
| `three_eyed_corpse_gorger` | **Tragamuertos de Tres Ojos** | Con tres cartas gana +1/+1 e Imponente. | Cada muerto devorado abre un ojo; el tercero despierta su hambre. |
| `mastiff_of_the_overflowing_ossuary` | **Mastín del Osario Desbordado** | Con siete cartas gana Imponente. | La Memoria llena rompe su última cadena. |
| `spore_infested` | **Infestado de Esporas** | 1/1, Letal y Furtivo. | El arte muestra un cuerpo zombificado invadido por esporas, no una manada de ratas. |
| `harvester_of_the_fallen` | **Cosechadora de los Caídos** | Crece cuando muere otro Zombi aliado. | Recolecta algo de cada Sinsepulcro caído. |
| `nerezh_graveless_matriarch` | **Nerezh, Matriarca Sinsepulcro** | Refuerza a otros Zombis y castiga cada muerte aliada. | Comanda el alzamiento y devuelve cada baja a sus filas. |

## Contrato de exportación

- El JSON runtime es la fuente única de nombres, reglas, flavor y `showFlavorText`.
- `studio.config.json` conserva sólo decisiones visuales y rutas al arte fuente local.
- `scripts/card-studio-data.mjs --write` actualiza la proyección del taller.
- `dev/tools/Decks/export_cards.cjs uprising_of_the_graveless` regenera las 17 cartas completas.
