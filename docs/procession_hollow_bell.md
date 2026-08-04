# Hueste: El Alzamiento de los Sinsepulcro

Estado: **integrada en runtime y Card Studio; identidad técnica Hostfall final**
Deck actual: `hollow_bell_procession` / `El Alzamiento de los Sinsepulcro`
Última actualización: 2026-08-04

Este documento conserva la identidad narrativa y el mapeo mecánico de los Sinsepulcro. Los nombres,
reglas y flavor bilingüe viven en
`src/data/decks/host/hollow_bell_procession/hollow_bell_procession.json`; el Card Studio sólo
proyecta esos datos. Los ids técnicos históricos se conservan para no romper partidas ni pruebas.

## Premisa

Una lápida se partió desde dentro y dejó a los primeros muertos sin lugar al cual regresar. Desde
esa grieta se extendió una orden muda: levantarse, recuperar los recuerdos enterrados y arrastrar
consigo todo cuerpo olvidado. Así nacieron los Sinsepulcro, una Hueste de soldados, bestias,
jinetes y engendros zombificados que convierte su propia Memoria en fuerza.

El alzamiento no avanza al sonido de una campana. Lo guía Nerezh, Matriarca Sinsepulcro, que cierra
las filas con cada cadáver caído. Cuanto más llena está la Memoria de la Hueste, más peligrosas se
vuelven sus criaturas. Incluso aquello que parece una pérdida —como `Retorno a la Memoria` enviando
cartas del Archivo a la Memoria— acerca a la Hueste a sus umbrales de siete cartas.

## Lenguaje visual

- Fantasía funeraria oscura: piedra quebrada, osarios, raíces muertas y luz verde cadavérica.
- La insignia es una lápida rota. La campana deja de ser el símbolo central del deck.
- Todas las criaturas representan cuerpos o bestias zombificados, aunque sus razas secundarias
  varíen.
- El arte fuente Beta permanece intacto; los cambios afectan nombres, lore, tipos impresos y marco.

## Mapeo carta por carta

| Id técnico | Nombre visible | Mecánica conservada | Lectura narrativa |
| --- | --- | --- | --- |
| `last_knell_dead` | **Soldado Sinsepulcro** | Ficha 2/2, x21. | La tropa básica liberada por la lápida. |
| `mass_grave_colossus` | **Titán Sinsepulcro** | Ficha 5/5, x4. | Un cementerio entero comprimido dentro de una armadura. |
| `hollow_bell` | **La Lápida Quebrada** | Apoyo; da Imponente a los Zombis. | La primera grieta y emblema del alzamiento. |
| `five_knot_gallows` | **Osario Inagotable** | Cinco contadores; cada carta no Ficha consume uno e Invoca una Ficha 2/2. | Cada espacio vacío reclama otro cuerpo. |
| `last_thought_carrion` | **Devorador del Último Recuerdo** | Al morir, el Cronista descarta una carta. | Su muerte arrastra consigo un pensamiento enemigo. |
| `memory_shroud_bearer` | **Ladrón de Memorias** | Al ser invocado, el Cronista descarta una carta. | La luz de su mano es un recuerdo robado. |
| `flesh_root_tithe` | **Tributo de los Cuatro Pesares** | Vida, descarte, sacrificio de Eco y de Fuente. | Cuatro pagos para una tumba que no perdona ninguno. |
| `crypt_rotwing` | **Jinete de la Cripta Vacía** | 2/1, Volar. | Jinete y montura esquelética abandonan una cripta vacía. |
| `basted_wing` | **Engendro de Alas Cosidas** | 3/1, Volar. | Un cuerpo apenas sostenido por sus costuras. |
| `reinforced_gravewing` | **Jinete del Osario** | 3/4, Volar. | Montura reforzada con los huesos de cada caída. |
| `archive_carrion_crow` | **Retorno a la Memoria** | 2/1, sin Volar; al entrar o morir mueve dos cartas del Archivo a la Memoria. | No es un cuervo: representa el regreso que alimenta la Memoria de la Hueste. |
| `horned_linebreaker` | **Rompemuros del Túmulo** | 3/2, Imponente. | Una bestia astada que exige dos defensores. |
| `seventh_memory_hound` | **Sabueso de los Siete Recuerdos** | Con siete cartas gana +1/+1 e Imponente. | El séptimo recuerdo completa su crecimiento. |
| `full_ossuary_mastiff` | **Mastín del Osario Desbordado** | Con siete cartas gana Imponente. | La Memoria llena rompe su última cadena. |
| `silent_bite_rats` | **Infestado de Esporas** | 1/1, Letal y Furtivo. | El arte muestra un cuerpo zombificado invadido por esporas, no una manada de ratas. |
| `fallen_gatherer` | **Cosechadora de los Caídos** | Crece cuando muere otro Zombi aliado. | Recolecta algo de cada Sinsepulcro caído. |
| `last_march_marshal` | **Nerezh, Matriarca Sinsepulcro** | Refuerza a otros Zombis y castiga cada muerte aliada. | Comanda el alzamiento y devuelve cada baja a sus filas. |

## Contrato de exportación

- El JSON runtime es la fuente única de nombres, reglas, flavor y `showFlavorText`.
- `studio.config.json` conserva sólo decisiones visuales y rutas al arte fuente local.
- `scripts/card-studio-data.mjs --write` actualiza la proyección del taller.
- `dev/tools/Decks/export_cards.cjs hollow_bell_procession` regenera las 17 cartas completas.
