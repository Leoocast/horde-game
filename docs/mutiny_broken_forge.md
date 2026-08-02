# Hueste: El Motín de la Forja Rota

Estado: **integrada en runtime y Card Studio; ids técnicos pendientes de L7**  
Deck actual: `goblin_assault_horde` / `El Motín de la Forja Rota`  
Última actualización: 2026-08-01

Este documento conserva la identidad narrativa, el mapeo mecánico y la dirección visual del corte
propio del antiguo deck Goblin. Los 17 nombres y sus flavor bilingües viven en
`src/data/decks/horde/goblins/goblin_assault_horde.json`; el Card Studio sólo proyecta esos datos.
Los 17 artes fuente viven en `public/cards/goblins/art/` y sus cartas completas exportadas en
`public/cards/goblins/`. La procedencia, prompts resumidos, dimensiones y hashes del lote viven en
`docs/asset_provenance_broken_forge.json`.

Se conservan los ids técnicos heredados para no introducir una migración de persistencia no
solicitada. El corte cambia identidad y presentación, no estadísticas, cantidades ni reglas. La
única reasignación de modificador aprobada es narrativa: Varka es el único Eco de Crónica del deck;
los tres Ecos que antes lo declaraban dejaron de hacerlo.

## Premisa

En una ciudad construida alrededor de hornos que nunca se apagan, las cuadrillas trasgas trabajaban
por turnos contados con placas de hierro. Cuando los capataces ordenaron fundir también los nombres
de los caídos, Varka hizo girar las cadenas de la forja contra sus dueños. Desde entonces cada
sirena abre otra compuerta, cada baja llama al siguiente relevo y todo objeto —herramienta, armadura
o cadáver de máquina— termina convertido en un proyectil para el Motín.

La Hueste no avanza como un ejército disciplinado: se propaga como un cambio de turno que nadie
consigue detener. Sus piezas débiles importan por cantidad, por llegada y por muerte; las figuras de
mando convierten esa presión colectiva en crecimiento, refuerzos o daño directo.

## Lenguaje visual común

- Fantasía industrial dark-medieval dentro de una ciudad-horno rota: hierro negro, cerámica
  agrietada, cadenas, remaches, cobre oxidado, luz naranja de fragua y neblina de hollín.
- Trasgos adultos, fibrosos y trabajadores, con piel rojiza manchada de carbón, orejas largas y
  angulares y ojos pálidos como brasas. No son caricaturas ni criaturas infantiles.
- Martillos de relevo, placas de cuenta, compuertas y conductos conectan las cartas sin volverlas
  intercambiables.
- Cada arte comunica primero la estadística o el efecto real: número exacto de ayudantes, refuerzo
  de otros Trasgos, sustitución del caído, crecimiento por ataque o daño producido por una multitud.
- Realismo pictórico de fantasía oscura con materiales táctiles y siluetas legibles, cercano a un
  juego de estrategia o cartas para PC de principios de los 2000.
- No hay texto, marcos, logos ni símbolos de otras franquicias dentro del arte fuente.
- **La Ficha es vertical**: fuente 1024×1536 y figura completa pensada para el formato full-art.
  Las otras dieciséis fuentes son horizontales porque ocupan la ventana de arte del marco.

## Mapeo carta por carta

| Id técnico | Identidad final | Mecánica conservada | Papel narrativo y brief visual |
| --- | --- | --- | --- |
| `goblin_token_1_1_red` | **Corredor de Ascua y Chatarra** | Ficha 1/1, x24 en el Archivo. | Relevo básico con tenazas de brasa y escudo de descarte. Retrato vertical de cuerpo completo y jerarquía modesta. |
| `hobgoblin_bandit_lord` | **Capataz del Recuento Ardiente** | 2/3; +1/+1 a otros Trasgos y daño al entrar según los Trasgos invocados ese turno. | Capataz robusto que equipa a los recién llegados y convierte el recuento del turno en un disparo de brasa. |
| `rundvelt_hordemaster` | **Llamador de la Próxima Cuadrilla** | 1/1; +1/+1 a otros Trasgos; una muerte inspecciona la primera carta e Invoca el siguiente Eco Trasgo. | Señalero frágil que entrega la placa del caído a una cadena de relevo para llamar al próximo trabajador. |
| `battle_cry_goblin` | **Pregonero del Horno Abierto** | 2/2; al entrar da +1/+0 a los Trasgos hasta el fin del turno. | Abre una compuerta y grita por un cuerno mientras la presión caliente impulsa a toda la cuadrilla. |
| `goblin_war_drums` | **El Martillo de Turno** | Apoyo; da Imponente a las criaturas de la Hueste. | Martillo suspendido que golpea el yunque central; sus ondas obligan a afrontar la formación de dos en dos. |
| `raid_bombardment` | **Lluvia de Remaches** | Apoyo; cada Trasgo atacante de Fuerza 2 o menos aporta 1 de daño. | Muchas manos débiles lanzan remaches que por separado son insignificantes y juntos forman una salva. |
| `beetleback_chief` | **Jefe de la Cuadrilla Doble** | 2/2; al entrar Invoca exactamente dos Fichas. | Un jefe llega con dos ayudantes y un cajón de herramientas compartido. |
| `siege_gang_commander` | **Capataz de los Tres Hornos** | 2/2; al entrar Invoca exactamente tres Fichas. | Un capataz acciona tres hornos, cada uno liberando a un corredor distinto. |
| `goblin_rabblemaster` | **Agitador de la Primera Sirena** | 2/2; antes de atacar Invoca una Ficha y crece por los otros Trasgos atacantes. | La primera sirena abre un portón para un corredor nuevo; la multitud que responde agranda al agitador. |
| `goblin_surprise` | **¡Abran Otra Compuerta!** | Hechizo rápido; da +2/+0 al ejército existente o inicia otra ronda de revelado si no hay criaturas. | Una compuerta explota hacia afuera: detrás puede haber refuerzos o una oleada de presión ofensiva. |
| `mogg_mob` | **Tres Bajo el Mismo Yunque** | Eco Trasgo vanilla 3/3. | Exactamente tres trabajadores cargan un solo yunque: masa conjunta sin habilidad adicional. |
| `volley_veteran` | **Maestro de la Salva de Escoria** | 4/2; al entrar daña un Eco enemigo según la cantidad de Trasgos aliados. | Artillero potente pero expuesto maneja un lanzador de escoria alimentado por toda la cuadrilla. |
| `goblin_chainwhirler` | **Varka, Eje de la Revuelta** | Eco de Crónica 3/3, Reflejos; al entrar hace 1 de daño al Cronista y a cada Eco que controla. | Varka, con la oreja izquierda rota, gira dos cadenas en un solo círculo de fuego que alcanza a todos. |
| `goblin_trashmaster` | **Maestro de la Armadura Recuperada** | 3/3; da +1/+1 a otros Trasgos. | Armero que remacha placas rescatadas sobre los demás y deja su propia silueta sin el beneficio del aura. |
| `general_kreat_the_boltbringer` | **Mariscal del Golpe Repetido** | 2/2; una declaración de ataque crea una Ficha y cada otra llegada causa 1 de daño al Cronista. | Mariscal que abre una salida lateral para un atacante y sincroniza cada nuevo martillo con un golpe de ariete. |
| `krenko_tin_street_kingpin` | **Brakka, la Cuenta Creciente** | 1/2; al atacar gana un contador +1/+1 e Invoca Fichas igual a su nueva Fuerza. | Brakka fija una placa de victoria a su armadura; el recuento creciente atrae una formación cada vez mayor. |
| `pashalik_mons` | **Artillero de los Últimos Remaches** | 2/2; cada muerte de un Trasgo hace 1 de daño a un Eco enemigo aleatorio. | Recoge el último remache de cada aliado caído y lo dispara de inmediato contra una silueta enemiga. |

## Eco de Crónica

`goblin_chainwhirler` es **Varka, Eje de la Revuelta** y el único elemento con
`modifiers: ["CHRONICLE"]`. `general_kreat_the_boltbringer`, `krenko_tin_street_kingpin` y
`pashalik_mons` conservan sus reglas, estadísticas y cantidades, pero ya no declaran ese
modificador. El cambio resuelve la decisión narrativa pendiente sin introducir una mecánica nueva.

## Contrato de datos y exportación

- El nombre del deck, los nombres de carta, las reglas, el flavor bilingüe y `showFlavorText` se
  authorizan únicamente en el JSON runtime.
- Todas las cartas conservan flavor aunque las de texto largo declaren `showFlavorText: false`.
- `dev/tools/Decks/goblins/studio.config.json` conserva sólo decisiones visuales y rutas a
  `public/cards/goblins/art/*.png`.
- `scripts/card-studio-data.mjs --write` genera la proyección del taller y
  `dev/tools/Decks/export_cards.cjs goblins` regenera las 17 cartas completas.
- Los ids y nombres de archivo heredados no son identidad visible. Su eventual cambio pertenece a
  una migración explícita de persistencia en L7.
