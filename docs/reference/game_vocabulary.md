# Hostfall: vocabulario canónico

Estado: **vigente, versión 1.0**.

Este documento define el lenguaje de reglas y la identidad que usa el producto. La fuente técnica
de ids vive en `src/engine/hostfallVocabulary.ts` y `src/engine/hostfallZones.ts`; la presentación
localizada vive en `src/i18n/gameVocabulary.ts` y `src/i18n/rulesText.ts`.

La revisión de licencias necesaria para una publicación comercial es un trabajo separado.

## Capas de lenguaje

- **Vocabulario del juego:** bandos, zonas, recursos, estadísticas, tipos de carta, fases, Acciones,
  Rasgos, Estados, marcadores y condiciones de victoria.
- **Término de reglas:** palabra con definición normativa, como Agotar, Invocar o Desterrar.
- **Rasgo:** habilidad fija y reutilizable de un Eco, con nombre, definición, tooltip e interacción
  implementada.
- **Acción:** verbo que ordena hacer algo; no es una propiedad de la carta.
- **Estado:** condición temporal mostrada por la UI, como Agotada o Estabilizándose.
- **Glosario:** vista de consulta derivada del registro tipado; nunca es la fuente técnica.

Hostfall no usa Palabras de habilidad actualmente. Una etiqueta temática futura no puede aportar
reglas por sí misma.

## Identidad

| Concepto | English | Español |
| --- | --- | --- |
| Persona jugadora | Chronicler | Cronista |
| Deck del jugador | Chronicle | Crónica |
| Enemigo automatizado | Host | Hueste |
| Partida | Chapter | Capítulo |
| Escalada enemiga | Surge | Oleada |

Una Crónica es un registro incompleto de un episodio. Sus cartas son fragmentos de memoria con los
que el Cronista reconstruye un Capítulo:

- un Eco da forma a una persona o criatura;
- el Archivo contiene fragmentos aún no recordados;
- la Mano contiene fragmentos disponibles para el Cronista;
- la Memoria contiene fragmentos usados, destruidos o sacrificados;
- el Olvido contiene fragmentos separados de la reconstrucción;
- Estabilizándose representa el tiempo que necesita un Eco recién Invocado para actuar.

`Carta`, `deck` y `mazo` siguen siendo términos genéricos válidos fuera de una partida. Dentro de un
Capítulo se usa `Archivo` para la pila de cartas.

## Zonas

| Id authored | Runtime | English | Español |
| --- | --- | --- | --- |
| `ARCHIVE` | `archive` | Archive | Archivo |
| `HAND` | `hand` | Hand | Mano |
| `FIELD` | `field` | Field | Campo |
| `MEMORY` | `memory` | Memory | Memoria |
| `OBLIVION` | `oblivion` | Oblivion | Olvido |

El JSON authored usa mayúsculas y `authoredDeckNormalizer.ts` convierte solamente ese casing para
los consumidores runtime. No existen zonas paralelas ni aliases en el estado del juego.

## Tipos de carta

| Id | English | Español | Comportamiento |
| --- | --- | --- | --- |
| `ECHO` | Echo | Eco | Puede atacar y defender; tiene Fuerza y Aguante. |
| `SOURCE` | Source | Fuente | Permanece en el Campo y normalmente genera Energía. |
| `SPELL` | Spell | Hechizo | Produce un efecto y después pasa a la Memoria. |
| `SUPPORT` | Support | Apoyo | Permanece en el Campo y modifica reglas o produce efectos. |
| `TOKEN` | Token | Ficha | Objeto creado por un efecto que no pertenece a un Archivo. |

Modificadores:

- `QUICK` / Rápido modifica un Hechizo y enumera sus ventanas reales: Principal, Batalla y
  Defender. Hostfall no promete pila ni prioridad libre.
- `CHRONICLE` convierte la línea visible en `Chronicle Echo / Eco de Crónica`. Es una distinción
  narrativa y visual; no limita copias ni añade una regla de unicidad.

Los subtipos como Vampiro, Druida, Zombi o Trasgo son lore y filtros, no tipos de carta.

## Recursos, estadísticas y marcadores

| English | Español | Regla |
| --- | --- | --- |
| Energy | Energía | Recurso numérico que paga cartas y Acciones. |
| Energy cost | Coste de Energía | Cantidad indicada por el orbe de coste. |
| Power | Fuerza | Daño base que hace un Eco. |
| Endurance | Aguante | Daño que soporta un Eco antes de morir. |
| Life | Vida | Recurso de supervivencia del Cronista. |
| +1/+1 counter | Contador +1/+1 | Aumento persistente de Fuerza y Aguante. |
| -1/-1 counter | Contador -1/-1 | Reducción persistente de Fuerza y Aguante. |
| Poison | Veneno | Presión acumulada que hace perder cartas del Archivo a la Hueste. |

Una Fuente es una carta permanente; Energía es el recurso que produce. Se escribe `Sacrifica una
Fuente`, nunca `Sacrifica una Energía`.

En `+N/+N` y `-N/-N`, el primer valor siempre es Fuerza y el segundo Aguante. La Energía generada se imprime
como `Agrega {E}` o `Agrega {E}{E}`, sin un número junto al símbolo.

## Fases y ventanas

| Orden | English | Español |
| --- | --- | --- |
| 1 | Ready | Preparar |
| 2 | Draw | Robar |
| 3 | Main | Principal |
| 4 | Battle | Batalla |
| 5 | End | Final |
| Hueste | Host Turn | Turno de la Hueste |
| Hueste | Defend | Defender |

## Acciones de reglas

| Id | English | Español | Definición breve |
| --- | --- | --- | --- |
| `PLAY` | Play | Jugar | Pagar costes y usar una carta de la Mano. |
| `INVOKE` | Invoke | Invocar | Poner la carta indicada en el Campo. |
| `EXHAUST` | Exhaust | Agotar | Girar una carta preparada para pagar o atacar. |
| `READY` | Ready | Preparar | Devolver una carta agotada a su orientación disponible. |
| `DRAW` | Draw | Robar | Mover la carta superior del Archivo a la Mano. |
| `DISCARD` | Discard | Descartar | Mover las cartas indicadas a la Memoria. |
| `DESTROY` | Destroy | Destruir | Mover una carta del Campo a la Memoria por un efecto. |
| `DIE` | Die | Morir | Resultado de un Eco con daño letal. |
| `SACRIFICE` | Sacrifice | Sacrificar | Elegir una carta aliada y moverla a la Memoria. |
| `BANISH` | Banish | Desterrar | Mover una carta al Olvido. |
| `REVEAL` | Reveal | Revelar | Mostrar una carta sin cambiar necesariamente su zona. |

Una carta es Invocada cada vez que entra al Campo, sin importar su origen. Hostfall no tiene una
keyword equivalente a mill: se escribe la instrucción completa, por ejemplo `Descarta las 2
primeras cartas del Archivo de la Hueste a su Memoria`.

En reglas impresas, `aliado` y `enemigo` usados como sustantivos significan un Eco respecto al
controlador de la carta. Se nombra el tipo completo cuando aporta información real: `Eco Ficha`,
`Eco con Volar`, `sacrifica un Eco` o `destruye un Apoyo enemigo`.

## Clases de habilidad

| English | Español | Uso |
| --- | --- | --- |
| Trait | Rasgo | Propiedad nombrada y reutilizable de un Eco. |
| Action | Acción | Habilidad que el Cronista decide activar y cuyo coste paga. |
| Reaction | Reacción | Habilidad automática encolada por un evento. |
| Passive | Pasiva | Efecto continuo mientras su fuente cumpla las condiciones. |

La UI no usa jerga interna como ETB, triggered effect, static ability o resolves.

## Rasgos

| Id | English | Español | Definición |
| --- | --- | --- | --- |
| `FLYING` | Flying | Volar | Solo puede ser defendido por Volar o Guardia aérea. |
| `SKYGUARD` | Skyguard | Guardia aérea | Puede defender contra Volar. |
| `ALERT` | Alert | Alerta | Atacar no Agota este Eco. |
| `DAUNTING` | Daunting | Imponente | Requiere dos o más defensores. |
| `LETHAL` | Lethal | Letal | Si este Eco hace cualquier cantidad de daño a otro Eco, ese Eco muere. |
| `REFLEX` | Reflex | Reflejos | Hace daño de combate antes que un Eco sin Reflejos. |
| `FURTIVE` | Furtive | Furtivo | No puede ser defendido por un Eco con mayor Fuerza. |
| `DRAIN` | Drain | Drenar | Su daño de combate recupera la misma cantidad de Vida. |
| `POISON_N` | Poison N | Veneno N | Al dañar a la Hueste, agrega N de Veneno. |
| `OVERFLOW` | Overflow | Desborde | El daño sobrante puede pasar al bando defendido; se oculta en el modo estándar. |
| `IMPETUS` | Impetus | Ímpetu | Puede actuar durante el turno en que es Invocado. |

Un Rasgo nuevo requiere id tipado, traducciones, tooltip, regla implementada y pruebas. No basta
con añadir una etiqueta visible.

## Estados visibles

| English | Español |
| --- | --- |
| Ready | Preparada |
| Exhausted | Agotada |
| Attacking | Atacando |
| Defending | Defendiendo |
| Wounded | Herida |
| Empowered | Potenciada |
| Stabilizing | Estabilizándose |

Los Estados usan badges de presentación; los Rasgos usan badges con tooltip de reglas. No deben
compartir semántica ni orden visual por accidente.

Marcado, Aturdido y Atado existen únicamente en el preview de Cazadores. No son mecánicas del
engine. Trampa también es un subtipo preview de Eco, no un tipo de carta adicional.

## Texto de cartas

1. Una instrucción por oración y en el orden real de ejecución.
2. Presente e imperativo; sin texto copiado de otro sistema de reglas.
3. Usar `este Eco` o `esta carta` sólo cuando el sujeto no sea inequívoco.
4. Las entradas usan `Al ser invocado/a`, con concordancia respecto al sujeto visible.
5. `Hasta el final del turno` y `hasta tu próximo turno` son duraciones normativas.
6. `Agrega` aumenta la Energía; `gana` se usa para Vida, modificadores temporales y Rasgos; los
   contadores se colocan.
7. Vida es singular: `Paga 3 de Vida`, `pierde 3 de Vida`, `gana 3 de Vida`.
8. Los costes y elecciones van antes de punto y coma: `Agota esta carta y paga 2 de Vida; ...`.
9. Un Rasgo se imprime como nombre; su tooltip contiene la definición.
10. Español e inglés deben describir exactamente la misma regla.
11. El flavor nunca completa una regla.

Plantillas preferidas:

- `Al ser invocada, ...`
- `Invoca dos Esbirros de Varka.` cuando la Ficha tenga una identidad visible propia.
- `Invoca un Eco Ficha Zombi 2/2.` cuando la Ficha no tenga un nombre propio.
- `Agota esta carta; agrega {E}.`
- `Un aliado gana +2/+3 hasta el final del turno.`
- `Destierra una carta de la Memoria al Olvido.`

## Guardas vigentes

- `deckLint` rechaza versiones, campos, valores, zonas, efectos y handlers desconocidos.
- `tests/vocabulary.test.js` protege traducciones y presentación canónica.
- `scripts/audit-independence.mjs --strict` impide reintroducir identidad, proveedores, assets o
  vocabulario retirados en código y build.
- `scripts/card-studio-data.mjs --check` impide que los estudios diverjan del JSON runtime.
- `scripts/check-card-assets.mjs` valida arte local, hashes y frescura de los PNG finales.

La regla permanente es simple: datos, engine, UI, herramientas, assets y build deben usar la misma
identidad Hostfall. Los términos genéricos —Zombie, Trasgo, Vampiro, ataque, carta, deck, turno,
daño, objetivo, robar y Mano— pueden conservarse cuando mejoran la claridad.
