# Hueste: La Legión de Varka

Estado: **integrada en runtime y Card Studio; identidad técnica Hostfall final**
Deck actual: `legion_of_varka` / `La Legión de Varka`
Última actualización: 2026-08-06

Este documento conserva la identidad narrativa, el mapeo mecánico y la dirección visual de la
Legión. Los 17 nombres y sus flavor bilingües viven en
`src/data/decks/host/legion_of_varka/legion_of_varka.json`; el Card Studio sólo proyecta esos datos.
Los 17 artes fuente viven en `public/cards/legion_of_varka/art/` y sus cartas completas exportadas en
`public/cards/legion_of_varka/`.

Varka es el único Eco de Crónica del deck; los tres Ecos que también llevaban ese modificador
dejaron de hacerlo sin cambiar estadísticas, cantidades ni reglas.

## Premisa

En una ciudad construida alrededor de hornos que nunca se apagan, las cuadrillas trasgas trabajaban
por turnos contados con placas de hierro. Cuando los capataces ordenaron fundir también los nombres
de los caídos, Varka hizo girar las cadenas de la forja contra sus dueños. Desde entonces cada
sirena abre otra compuerta, cada baja llama al siguiente relevo y todo objeto —herramienta, armadura
o cadáver de máquina— termina convertido en un proyectil para la Legión.

La Hueste no avanza como un ejército disciplinado: se propaga como un cambio de turno que nadie
consigue detener. Sus piezas débiles importan por cantidad, por llegada y por muerte; las figuras de
mando convierten esa presión colectiva en crecimiento, refuerzos o daño directo.

## Lenguaje visual común

- Fantasía industrial dark-medieval dentro de una ciudad-horno rota: hierro negro, cerámica
  agrietada, cadenas, remaches, cobre oxidado, luz naranja de fragua y neblina de hollín.
- La Legión mezcla Trasgos, Orcos, una Bestia de guerra y la Matriarca infernal bajo una misma
  disciplina de hierro, brasas y estandartes. No son caricaturas ni criaturas infantiles.
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
| `varkas_minion` | **Esbirro de Varka** | Ficha Trasgo 1/1, x24 en el Archivo. | La tropa mínima que Varka llama chispas y la Legión reconoce como primera oleada. |
| `shaman_of_the_umbral_ember` | **Chamán de la Brasa Sombría** | 2/3; +1/+1 a otros Ecos y daño al entrar según los Ecos invocados ese turno. | Chamán orco que mide cuántos soldados puede gastar todavía Varka. |
| `summoner_of_the_ranks` | **Invocador de las Filas** | 1/1; +1/+1 a otros Ecos; una muerte inspecciona la primera carta e Invoca el siguiente Eco. | La marca de Varka transforma cada baja aliada en una llamada a filas. |
| `varkas_standard_bearer` | **Portaestandarte de Varka** | 2/2; al entrar da +1/+0 a los Ecos aliados hasta el fin del turno. | Repite la orden de Varka y hace avanzar bajo un mismo estandarte a toda la formación. |
| `the_daunting_front` | **El Frente Imponente** | Apoyo; da Imponente a las criaturas de la Hueste. | Una primera línea acorazada domina el paso y obliga a afrontar la formación de dos en dos. |
| `all_against_one` | **Todos contra uno** | Apoyo; cada Trasgo atacante de Fuerza 2 o menos aporta 1 de daño. | Muchas manos débiles lanzan remaches que por separado son insignificantes y juntos forman una salva. |
| `chief_of_the_double_guard` | **Jefe de la Doble Guardia** | 2/2; al entrar Invoca exactamente dos Esbirros de Varka. | Un jefe llega con dos ayudantes y un cajón de herramientas compartido. |
| `rider_of_the_third_charge` | **Jinete de la Tercera Carga** | 2/2; al entrar Invoca exactamente tres Esbirros de Varka. | Un jinete trasgo abre la tercera carga y arrastra consigo tres nuevos esbirros. |
| `varkas_linebreaker` | **Rompefilas de Varka** | 2/2; antes de atacar Invoca un Esbirro de Varka y gana +1/+0 hasta el final del turno por cada otro Trasgo atacante. | La primera sirena abre un portón para un corredor nuevo; la multitud que responde agranda al agitador. |
| `unleash_the_legion` | **¡Liberen a la Legión!** | Hechizo rápido; da +2/+0 al ejército existente o inicia otra ronda de Revelado si la Hueste no controla aliados. | Una compuerta explota hacia afuera: detrás puede haber refuerzos o una oleada de presión ofensiva. |
| `corrupted_war_bear` | **Oso de Guerra Corrompido** | Eco Bestia/Oso vanilla 3/3. | Una bestia sometida a la maquinaria de guerra de la Legión. |
| `rider_of_the_umbral_volley` | **Jinete de la Salva Umbría** | 4/2; al entrar daña un Eco enemigo según la cantidad de Ecos aliados en el Campo, incluido él mismo. | Jinete orco que mide la salva por todas las voces que responden. |
| `varka_infernal_matriarch` | **Varka, Matriarca Infernal** | Eco de Crónica 3/3 impresa y 4/4 por su propia Pasiva; Reflejos, +1/+1 a todos los Ecos aliados y 2 de daño global al entrar. | Varka convierte sus cadenas en un círculo de fuego que alcanza a todos sus enemigos. |
| `varkas_forgemaster` | **Forjador de Varka** | 3/3; da +1/+1 a otros Trasgos. | Armero que remacha placas rescatadas sobre los demás y deja su propia silueta sin el beneficio del aura. |
| `marshal_of_the_wave` | **Mariscal de la Oleada** | 2/2; una declaración con uno o más Trasgos Invoca un Esbirro atacando; cada otra llegada causa 1 de daño al Cronista. | Mariscal que abre una salida lateral para un atacante y sincroniza cada nuevo martillo con un golpe de ariete. |
| `vardek_scribe_of_the_legion` | **Vardek, Escriba de la Legión** | 1/2; al atacar gana un contador +1/+1 y después Invoca Esbirros atacando según su Fuerza resultante. | Vardek marca cada victoria en su armadura y hace aparecer a la cuadrilla que viene a cobrarla. |
| `rear_guard_firebreather` | **Escupefuego de la Retaguardia** | 2/2; cada muerte de un Trasgo hace 1 de daño a un Eco enemigo aleatorio. | Recoge el último remache de cada aliado caído y lo dispara de inmediato contra una silueta enemiga. |

## Eco de Crónica

`varka_infernal_matriarch` es **Varka, Matriarca Infernal** y el único elemento con
`modifiers: ["CHRONICLE"]`. `marshal_of_the_wave`, `vardek_scribe_of_the_legion` y
`rear_guard_firebreather` conservan sus reglas, estadísticas y cantidades, pero ya no declaran ese
modificador. El cambio resuelve la decisión narrativa pendiente sin introducir una mecánica nueva.

## Contratos mecánicos de redacción

- Chamán de la Brasa Sombría y Jinete de la Salva Umbría hacen que la Hueste elija automáticamente
  un enemigo mediante `BEST_LETHAL`; el texto no presenta esa selección como una decisión del
  Cronista.
- Todos contra uno cuenta únicamente Trasgos atacantes con Fuerza 2 o menos, capturados al declarar
  el ataque, y aplica la suma al terminar toda la secuencia.
- El daño de entrada de Varka se resuelve como un único evento para el Cronista y cada enemigo; el
  texto impreso lo expresa como una sola instrucción de daño. Todos sus proyectiles usan el mismo
  material de fuego amarillo-dorado, incluida esta descarga de entrada.
- Los ataques de Varka conservan el resultado normal del combate, pero se presentan con dos bolas
  de fuego amarillo-doradas simultáneas, como las llamas de sus manos y más pequeñas que la de
  Vaelor. Nacen de los bordes izquierdo y
  derecho de su carta y convergen sobre un mismo destino: con defensor apuntan a ese Eco; sin
  defensor apuntan al panel de Vida del Cronista. Ambas rutas producen un solo impacto de reglas.
- La cantidad de Esbirros creada por Vardek usa su Fuerza después de colocar el contador +1/+1.
- Forjador de Varka conserva sólo su Pasiva de +1/+1 a los demás Trasgos; su antigua Acción de
  sacrificio permanece retirada del corte.

## Contrato de datos y exportación

- El nombre del deck, los nombres de carta, las reglas, el flavor bilingüe y `showFlavorText` se
  authorizan únicamente en el JSON runtime.
- Todas las cartas conservan flavor aunque las de texto largo declaren `showFlavorText: false`.
- `dev/tools/Decks/legion_of_varka/studio.config.json` conserva sólo decisiones visuales y rutas a
  `public/cards/legion_of_varka/art/*.png`.
- `scripts/card-studio-data.mjs --write` genera la proyección del taller y
  `dev/tools/Decks/export_cards.cjs legion_of_varka` regenera las 17 cartas completas.
- Los ids de carta se derivan de sus nombres ingleses canónicos y todas las rutas usan
  `legion_of_varka`.
