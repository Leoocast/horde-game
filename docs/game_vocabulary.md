# Hostfall: vocabulario canonico y auditoria de independencia

Estado: vocabulario v1.0. La Parte 1 (identidad, zonas, tipos, recursos, fases, acciones, Rasgos y
estados) está cerrada como diseño. La Parte 2 ya implementó el registro canónico y la capa de
presentación para UI, cartas generadas, logs, errores, ARIA y herramientas de desarrollo.

Este documento define el idioma propio de Hostfall y el criterio de aceptacion para retirar de la
superficie del producto todo lo que haga que se lea como una implementacion de Magic. No es una
opinion legal. Antes de una publicacion comercial hace falta revisar derechos y procedencia con la
persona responsable del producto y, si corresponde, asesoria legal.

## Veredicto de publicacion

**No publicar el build actual en Steam.** Renombrar `mana`, `graveyard` o las keywords no basta.

Bloqueos encontrados en el repositorio:

- 44 definiciones usan nombres de cartas publicadas de Magic; tres definiciones adicionales son
  fichas basadas en esos mismos mazos. Son 47 definiciones Magic-derived entre Mono Green,
  Zombies y Goblins.
- `public/cards/mono_green_ramp`, `public/cards/zombies` y `public/cards/goblins` contienen 60
  archivos de carta/arte derivados. Vite copia `public` completo al build, incluso si un recurso
  no se abre desde la UI.
- El deck de Zombies declara `"source": "Horde Magic - Limited Edition 2.1"`.
- Los JSON y generadores conservan nombres, set codes, collector numbers, consultas y URLs de
  Scryfall.
- La superficie reproduce en conjunto las categorias de Magic: mana, land, creature, instant,
  sorcery, enchantment, library, battlefield, graveyard, exile, untap/main/combat/end, cast,
  tap, mill, +1/+1 counters y gran parte de sus keywords perennes.
- El tutorial heredado ya fue retirado por completo; el menú conserva solamente el botón
  deshabilitado `How to Play`. El log ya normaliza el texto del engine y no usa la categoría
  `Magic`.
- No existe un registro de procedencia/licencia para arte, musica, SFX, fuentes y otros recursos.

Referencias externas para el criterio:

- Steam no permite publicar contenido que el desarrollador no posea o para el que no tenga
  derechos adecuados: <https://partner.steamgames.com/steamdirect/>.
- La oficina de copyright de EE. UU. distingue los metodos de juego, que no quedan protegidos por
  copyright, de la expresion grafica y textual original, que si puede quedar protegida:
  <https://www.copyright.gov/register/tx-games.html>.
- La politica de fan content de Wizards permite solamente ciertos usos gratuitos y excluye usar su
  IP dentro de otros juegos: <https://company.wizards.com/en/legal/fancontentpolicy>.
- Wizards identifica como propias las ilustraciones, imagenes, textos y otros contenidos
  protegibles de sus productos: <https://company.wizards.com/en/legal/terms>.
- Una marca identifica el origen comercial de bienes o servicios; una palabra no se posee en todos
  sus usos posibles: <https://www.uspto.gov/trademarks/basics/what-trademark>.

La consecuencia practica es sencilla: una mecanica puede inspirar otra mecanica, pero no debemos
reutilizar cartas, arte, personajes, lugares, marcos, texto expresivo ni la impresion global de que
Hostfall es una version digital no autorizada de Magic.

## Que significa cada capa de lenguaje

### Vocabulario del juego

Conjunto completo de nombres que usa el producto: bandos, zonas, recursos, estadisticas, tipos de
carta, fases, acciones, rasgos, estados, marcadores y condiciones de victoria. Es el paraguas
general.

### Termino de reglas

Palabra con una definicion normativa. Si cambiar la palabra puede cambiar una jugada valida, debe
estar definida. Ejemplos actuales: `Agotar`, `Invocar`, `Desterrar`, `Campo`.

### Rasgo

Nombre corto para una habilidad fija que puede aparecer en varios Ecos. Es el término visible
de Hostfall para lo que internamente suele llamarse keyword ability. Un Rasgo siempre debe tener:

- id estable;
- nombre localizado;
- definicion completa;
- reminder corto;
- icono y texto accesible;
- reglas de acumulacion;
- interacciones y casos limite testeados.

### Accion de reglas

Verbo que sustituye una instruccion recurrente. Ejemplos: `Agota`, `Prepara`, `Destruye`,
`Destierra`. No es una propiedad de la carta: ordena hacer algo.

### Palabra de habilidad

Etiqueta temática que agrupa cartas, pero no aporta reglas por sí misma. Hostfall no usa ninguna
actualmente; no debe nombrarse una hasta que varias cartas implementadas compartan el patrón. Una
Palabra de habilidad nunca puede depender del glosario para completar su significado.

### Estado

Condicion temporal mostrada por la UI, no texto impreso de la carta: `Agotada`, `Atacando`,
`Defendiendo`, `Herida`, `Potenciada`. Un Estado no debe mezclarse visualmente con un Rasgo.

### Glosario

Vista de consulta para el jugador. Reune terminos de reglas y Rasgos; no es la fuente tecnica. La
fuente tecnica debe ser un registro tipado del que deriven labels, tooltips, orden visual y tests.

## Identidad canonica

| Concepto | English | Espanol | Definicion |
| --- | --- | --- | --- |
| Persona jugadora | Chronicler | Cronista | Persona que dirige una Crónica. |
| Deck del jugador | Chronicle | Crónica | Conjunto de fragmentos elegido por el Cronista para reconstruir un Capítulo. |
| Enemigo automatizado | Host | Hueste | Fuerza automatizada que despliega y ataca siguiendo su perfil. |
| Partida | Chapter | Capítulo | Un episodio de una Crónica que el Cronista reconstruye o vuelve a vivir contra una Hueste. |
| Escalada enemiga | Surge | Oleada | Estado tardío que intensifica el turno de la Hueste. |

Regla de localizacion: `Chronicler` no debe aparecer sin traducir dentro de la UI espanola;
`Horde/Horda` se reemplaza por `Host/Hueste` en toda superficie visible.

## Ontología narrativa de las cartas

Una Crónica es un registro incompleto de un episodio del mundo. Sus cartas no son las personas,
lugares o sucesos originales ni son literalmente memorias completas: son **fragmentos de memoria**
con los que el Cronista reconstruye un Capítulo.

- Una carta sigue llamándose `Card / Carta` en la UI; `fragmento de memoria` es su explicación de
  lore, no un nuevo tipo de reglas.
- Al Invocar un Eco, el fragmento de una persona o criatura toma forma en el Campo.
  Esto permite que una misma figura aparezca en más de una copia sin afirmar que la persona
  histórica original fue clonada.
- El Archivo contiene fragmentos todavía no recordados durante el Capítulo.
- La Mano contiene fragmentos que el Cronista tiene presentes y puede usar.
- La Memoria contiene fragmentos ya usados, destruidos o sacrificados que todavía pueden volver a
  recordarse.
- El Olvido contiene fragmentos borrados de la reconstrucción y normalmente irrecuperables.
- `Stabilizing / Estabilizándose` representa el tiempo que necesita un Eco recién Invocado para
  tomar forma estable dentro del Capítulo.

## Zonas

| Id canonico | English | Espanol | Reemplaza | Definicion |
| --- | --- | --- | --- | --- |
| `ARCHIVE` | Archive | Archivo | library | Pila boca abajo de cartas todavía no obtenidas o invocadas. |
| `HAND` | Hand | Mano | hand | Cartas disponibles para el Cronista. `Mano` se conserva por claridad y por ser generico. |
| `FIELD` | Field | Campo | battlefield | Zona donde permanecen Ecos, Fuentes y Apoyos. |
| `MEMORY` | Memory | Memoria | graveyard | Cartas usadas, destruidas, sacrificadas o derrotadas. |
| `OBLIVION` | Oblivion | Olvido | exile | Zona separada de la Memoria; una carta Desterrada queda Olvidada y normalmente ya no puede recuperarse. |

`Deck/Mazo` describe una lista fuera de la partida. Dentro de un Capítulo se usa `Archivo`.

La Memoria contiene cartas que aún forman parte de la historia y pueden recuperarse. El Olvido
contiene cartas separadas de ella; `Forgotten / Olvidada` describe su estado narrativo, no otra
zona ni un Rasgo.

`Memoria` requiere una presentación explícita para jugadores nuevos: icono estable, contador
visible y tooltip `Cartas usadas y destruidas`. Un onboarding futuro deberá mostrar la primera
carta que pasa a esta zona. La UI no debe depender de que el jugador ya conozca el alias interno.

## Tipos de carta

| Id canonico | English | Espanol | Reemplaza | Comportamiento |
| --- | --- | --- | --- | --- |
| `ECHO` | Echo | Eco | Creature | Fragmento de una persona o criatura que puede tomar forma en el Campo, atacar y defender; tiene Fuerza y Aguante. |
| `SOURCE` | Source | Fuente | Land / Energy | Permanece en el Campo y normalmente genera Energía. |
| `SPELL` | Spell | Hechizo | Sorcery / Instant | Produce un efecto y después pasa a la Memoria. |
| `SUPPORT` | Support | Apoyo | Artifact / Enchantment | Permanece en el Campo y modifica reglas o produce efectos. |
| `TOKEN` | Token | Ficha | Token | Eco u otro objeto creado por un efecto que no pertenece a un Archivo. |

Modificadores de tipo:

- `QUICK` / `RÁPIDO`: velocidad de un Hechizo, no un tipo de carta. La línea visible usa
  `SPELL · QUICK` / `HECHIZO · RÁPIDO` y el tooltip enumera sus ventanas legales.
- Los subtipos de especie o profesion son lore (`Vampire`, `Druid`, `Goblin`) y no tipos de reglas.
- No se deben importar supertypes o card types de Magic que Hostfall no implemente.
- `CHRONICLE` modifica a `ECHO`: `Chronicle Echo / Eco de Crónica` identifica una figura central
  del relato de una Crónica, como su protagonista. Es una distinción narrativa y visual; no limita
  copias ni agrega reglas por sí misma.
- Cada Crónica del jugador debe declarar su protagonista cuando exista. El `keyCardId` actual solo
  elige la carta usada para presentar el mazo y no debe confundirse con esa metadata narrativa.
- `Notable Echo` no es canónico: la fuerza de una carta puede cambiar con el balance y no debe
  convertirse en tipo o supertype sin una regla estable.
- `Legendary` existe como metadata heredada en algunos JSON y debe migrarse o eliminarse. El engine
  no aplica actualmente una regla de unicidad.
- `Echo` es siempre un tipo de carta en Hostfall, nunca un Rasgo ni una instrucción para repetir una
  carta. No se introducirán costes o keywords llamados `Echo`.

## Recursos, estadisticas y marcadores

| English | Espanol | Reemplaza | Regla |
| --- | --- | --- | --- |
| Energy | Energía | mana | Recurso que paga cartas y Acciones. No tiene los cinco colores de Magic. |
| Energy cost | Coste de Energía | mana cost/value | Cantidad total indicada por el orbe de coste. |
| Power | Fuerza | power | Daño base que hace un Eco. |
| Endurance | Aguante | toughness | Daño que un Eco soporta antes de morir. |
| Life | Vida | life | Recurso de supervivencia del Cronista. Es un termino generico y se conserva. |
| +1/+1 counter | Contador +1/+1 | +1/+1 counter | Da +1 Fuerza y +1 Aguante de forma persistente. |
| Poison | Veneno | poison counters | Presión acumulada sobre la Hueste; al alcanzar su umbral, la Hueste pierde cartas de su Archivo. |

Las cartas impresas pueden usar el formato compacto `+N/+N`; el primer valor siempre es Fuerza y
el segundo Aguante. Los tooltips y explicaciones extensas nombran ambas estadísticas cuando haga
falta evitar ambigüedad.

## Fases y ventanas

| Orden | English | Espanol | Reemplaza |
| --- | --- | --- | --- |
| 1 | Ready | Preparar | untap |
| 2 | Draw | Robar | draw |
| 3 | Main | Principal | main |
| 4 | Battle | Batalla | battle/combat del Cronista |
| 5 | End | Final | end |
| Hueste | Host Turn | Turno de la Hueste | horde phase/turn |
| Hueste | Defend | Defender | declare blockers/defend |

Hostfall no implementa la pila ni prioridad libre de Magic. Por eso la velocidad `Quick` debe
enumerar sus ventanas reales: Main, Battle y Defend. No se debe usar `Instant` como promesa
implícita de reglas que el engine no tiene.

## Acciones de reglas

| Id | English | Espanol | Definicion |
| --- | --- | --- | --- |
| `PLAY` | Play | Jugar | Pagar costes y usar una carta de la Mano. Reemplaza la distincion cast/play. |
| `INVOKE` | Invoke | Invocar | Poner en el Campo el Eco, Fuente, Apoyo o Ficha indicado. Si se invoca desde la Mano, primero se pagan sus costes normales salvo que el efecto diga lo contrario. |
| `EXHAUST` | Exhaust | Agotar | Girar una carta preparada para pagar un coste o declarar un ataque. |
| `READY` | Ready | Preparar | Devolver una carta agotada a su orientacion disponible. |
| `DRAW` | Draw | Robar | Mover la carta superior del Archivo a la Mano. Se conserva por ser universal. |
| `DISCARD` | Discard | Descartar | Mover las cartas indicadas a la Memoria. La instrucción debe indicar su origen cuando no sea la Mano. |
| `DESTROY` | Destroy | Destruir | Mover una carta del Campo a la Memoria por un efecto. |
| `DIE` | Die | Morir | Resultado de un Eco con daño letal. |
| `SACRIFICE` | Sacrifice | Sacrificar | Elegir una carta aliada del Campo y moverla a la Memoria como coste o instrucción. |
| `BANISH` | Banish | Desterrar | Mover una carta al Olvido. |
| `REVEAL` | Reveal | Revelar | Mostrar una carta sin cambiar necesariamente su zona. |

Una carta es `Invocada` cada vez que entra al Campo, sin importar si procede de la Mano, el
Archivo, la Memoria o un efecto que crea Fichas. La palabra describe el evento de entrada; no
implica por sí sola que se haya pagado un coste.

Hostfall no tiene una keyword equivalente a `mill`. La UI y las cartas escriben la instrucción
completa: `Descarta las N primeras cartas del Archivo de la Hueste a su Memoria`.

Plantillas preferidas:

- `Cuando este Eco es invocado, ...`
- `Invoca dos Fichas de Goblin.`
- `Agota: Gana 1 Energía.`
- `Destruye un Apoyo enemigo.`
- `Un Eco aliado gana +2/+3 hasta el final del turno.`
- `Descarta las 2 primeras cartas del Archivo de la Hueste a su Memoria.`
- `Destierra una carta de la Memoria al Olvido.`

La UI usa `aliada`, `enemiga`, `esta carta` y `la Hueste` en vez de copiar el lenguaje de
controlador/oponente de un juego PvP cuando esa precision no existe en Hostfall.

## Clases de habilidad

| English | Espanol | Uso |
| --- | --- | --- |
| Trait | Rasgo | Propiedad nombrada y reutilizable de un Eco. |
| Action | Acción | Habilidad que el Cronista decide activar y cuyo coste paga. |
| Reaction | Reacción | Habilidad automática que se encola cuando ocurre un evento. |
| Passive | Pasiva | Efecto continuo mientras su fuente cumpla las condiciones. |

`Triggered effect`, `activated ability`, `static ability`, `ETB` y `resolves` no deben aparecer
en la UI. Pueden sobrevivir temporalmente como nombres internos durante la migracion.

## Rasgos

Los ids del engine pueden conservarse como aliases, pero la carta, badge, tooltip, log y texto
accesible deben usar solamente el Rasgo Hostfall. Esta tabla incluye
solo nombres ya aceptados y mecánicas visibles hoy.

| Id Hostfall | English | Espanol | Alias actual | Definicion canonica |
| --- | --- | --- | --- | --- |
| `FLYING` | Flying | Volar | `FLYING` | Solo puede ser defendido por un Eco con Volar o Guardia aérea. |
| `SKYGUARD` | Skyguard | Guardia aérea | `REACH` | Puede defender contra Ecos con Volar. |
| `ALERT` | Alert | Alerta | `VIGILANCE` | Atacar no Agota este Eco. |
| `DAUNTING` | Daunting | Imponente | `MENACE` | Requiere dos o más Ecos defensores. |
| `LETHAL` | Lethal | Letal | `DEATHTOUCH` | Cualquier cantidad positiva de daño que haga a otro Eco es letal. |
| `REFLEX` | Reflex | Reflejos | `FIRST_STRIKE` | Hace daño de combate antes que un Eco sin Reflejos. |
| `FURTIVE` | Furtive | Furtivo | `SKULK` | No puede ser defendido por un Eco con mayor Fuerza. |
| `DRAIN` | Drain | Drenar | `LIFESTEAL` | Su daño de combate recupera la misma cantidad de Vida. |
| `POISON_N` | Poison N | Veneno N | `TOXIC_N` | Al dañar en combate a la Hueste, agrega N de Veneno. |

### Rasgos próximos ya nombrados

| Id Hostfall | English | Español | Alias actual | Estado y definición canónica |
| --- | --- | --- | --- | --- |
| `OVERFLOW` | Overflow | Desborde | `TRAMPLE` | Existe en datos, pero se oculta en el modo estándar. El daño de combate sobrante puede pasar al bando defendido. |
| `IMPETUS` | Impetus | Ímpetu | `HASTE` | La Hueste tiene esta regla global y se prevé usarla en cartas futuras. Este Eco no necesita Estabilizarse: puede atacar y usar Acciones de Agotar durante el turno en que es invocado. |

`HEXPROOF` e `INDESTRUCTIBLE` no aparecen en las cartas actuales y se eliminan del vocabulario
activo. `Unbroken / Inquebrantable` queda como nombre reservado para una posible regla equivalente
futura; no es un Rasgo activo ni debe aparecer en la UI hasta que esa mecánica exista.

No basta con sustituir labels. Cada JSON debe guardar una definicion semantica valida, el lint debe
reconocerla y las pruebas deben cubrir su regla.

## Estados visibles

| English | Espanol | Regla de UI |
| --- | --- | --- |
| Ready | Preparada | Puede actuar si las demas reglas lo permiten. |
| Exhausted | Agotada | No puede atacar ni pagar otro coste de Agotar. |
| Attacking | Atacando | Fue asignada a la Batalla actual. |
| Defending | Defendiendo | Fue asignada contra un atacante. |
| Wounded | Herida | Tiene dano marcado. |
| Empowered | Potenciada | Sus estadisticas efectivas superan las impresas. |
| Stabilizing | Estabilizándose | Fue Invocada este turno y no puede atacar ni Agotarse hasta la próxima fase de Preparar de su bando. |

Los Estados usan badges de presentacion; los Rasgos usan badges con tooltip de reglas. Nunca deben
compartir nombre, color semantico ni orden de apilado por accidente.

`Summoning sickness` se reemplaza en la UI por el Estado `Stabilizing / Estabilizándose`. Puede
sobrevivir como alias interno del engine, pero no debe aparecer en cartas, tooltips, logs, errores
ni texto accesible. Ímpetu evita este Estado.

## Texto de cartas

Reglas de estilo:

1. Una instruccion por oracion y orden real de ejecucion.
2. Presente e imperativo; sin frases de Oracle ni reminder text copiado.
3. `Este Eco` para autorreferencia salvo que el nombre sea necesario.
4. `Cuando este Eco es invocado`, no `cuando entra al campo de batalla`.
5. `Hasta el final del turno` y `hasta tu próximo turno` son duraciones normativas.
6. Los modificadores pueden usar `+N/+N` en el texto impreso; su orden siempre es Fuerza/Aguante.
7. Vida es un recurso singular: `Paga 3 de Vida`, `pierde 3 de Vida` y `gana 3 de Vida`; nunca
   `paga 3 vidas`. En inglés: `Pay 3 Life`, sin `of`.
8. Los costes van antes de dos puntos: `Agota y paga 2 de Vida: ...`.
9. Un Rasgo se imprime como nombre; el tooltip contiene su definicion. No repetir ambos.
10. Espanol e ingles deben describir la misma regla, no ser traducciones libres con diferencias.
11. El texto de ambientacion nunca completa una regla.

## Inventario Magic que debe salir de produccion

### Cronica Mono Green

Llanowar Elves, Sunshower Druid, Druid of the Cowl, Ichorspit Basilisk, Beast-Kin Ranger,
Magnigoth Sentry, Colossadactyl, Timberland Ancient, Cosmic Hunger, Ruthless Predation, Broken
Wings, Giant Growth y Forest.

### Hueste Zombie

Graf Harvest, Noosegraf Mob, Rottenheart Ghoul, Miasmic Mummy, Smallpox, Blighted Bat, Stitchwing
Skaab, Advanced Stitchwing, Crow of Dark Tidings, Cursed Minotaur, Thraben Foulbloods, Hound of the
Farbogs, Rancid Rats, Gavony Unhallowed y Diregraf Captain, ademas de sus dos fichas derivadas.

### Hueste Goblin

Hobgoblin Bandit Lord, Rundvelt Hordemaster, Battle Cry Goblin, Goblin War Drums, Raid
Bombardment, Beetleback Chief, Siege-Gang Commander, Goblin Rabblemaster, Goblin Surprise, Mogg
Mob, Volley Veteran, Goblin Chainwhirler, Goblin Trashmaster, General Kreat, Krenko y Pashalik
Mons, ademas de su ficha derivada.

No se acepta un reskin uno-a-uno que conserve nombre cambiado + mismo arte + mismo coste + mismas
estadisticas + mismo texto + misma cantidad. Cada reemplazo necesita nombre, arte, texto y balance
propios, aunque reutilice una mecanica generica implementada por el engine.

## Direccion de producto recomendada

La identidad ya presente ofrece una base mejor que el vocabulario heredado:

- Cada Capítulo reconstruye un episodio de una Crónica; Hostfall no es un duelo entre dos magos.
- El Cronista lleva una Crónica; la Hueste consume un Archivo finito.
- El daño contra la Hueste descarta cartas de su Archivo a su Memoria, no reduce Vida. Esta
  operación se escribe completa y no tiene keyword propia.
- Veneno se acumula sobre la Hueste y, al alcanzar su umbral, también descarta cartas de su
  Archivo a su Memoria.
- Las Fuentes producen una sola Energía funcional por Crónica; no deben exponer los cinco colores,
  letras ni simbolos de mana de Magic.
- La Hueste avanza mediante su propio perfil de turno y entra en Oleada. A medio plazo conviene
  que el algoritmo tenga parámetros propios de Hostfall y no se describa como “revelar
  tokens hasta la primera carta no-token”.
- Los Hechizos rápidos tienen ventanas explícitas; Hostfall no promete stack ni priority.

Los nombres amplios `Zombie`, `Goblin`, `Vampire`, `attack`, `defend`, `card`, `deck`, `turn`,
`damage`, `target`, `draw` y `hand` son genericos. Pueden conservarse cuando mejoran claridad. La
originalidad debe venir del sistema completo, no de sustituir cada palabra comun por fantasia
opaca.

## Arquitectura de normalizacion

La migracion debe separar tres capas:

1. **Id interno estable**: puede conservar `FLYING`, `library` o `battlefield` temporalmente para no
   romper el engine.
2. **Concepto canónico**: `FLYING`, `ARCHIVE`, `FIELD`.
3. **Presentación localizada**: `Volar/Flying`, `Archivo/Archive`, `Campo/Field`.

El registro tipado vive en `src/i18n/gameVocabulary.ts`; la normalización de texto heredado en
`src/i18n/rulesText.ts`. De ellos derivan:

- labels de UI;
- tooltips y glosario;
- orden visual de Rasgos;
- texto accesible;
- templates de cartas;
- validacion del deck lint;
- lista de aliases legacy permitidos solo dentro del engine.

No volver a repartir mappings entre `translations.ts`, `cardLocalization.ts`, `selectors.ts`,
componentes, generadores y JSON.

## Guardas automatizadas de publicacion

La suite ya falla si el tutorial reaparece, si el copy localizado contiene vocabulario retirado o
si el texto/tipo visible de una carta no se puede presentar con el vocabulario Hostfall. Todavía
faltan guardas de assets y procedencia que fallen cuando:

- un campo visible contiene `Magic`, `mana`, `Scryfall`, `Oracle`, un card type/zone legacy o un
  nombre de la lista anterior;
- un deck de produccion declara `scryfall`, set code, collector number o una URL de cartas Magic;
- un manifest de produccion no tiene procedencia de arte;
- un Rasgo carece de nombre, tooltip o definicion en ingles o espanol;
- una fase, zona, tipo, Accion o Estado visible no sale del registro canonico;
- un componente de juego agrega copy literal fuera de i18n;
- el build contiene los directorios Magic-derived bajo `public/cards`;
- una carta impresa no coincide con el JSON runtime.

El registro de recursos debe incluir, como minimo:

- ruta del archivo;
- autor/proveedor;
- tipo de licencia o contrato;
- permiso para uso comercial y modificacion;
- fecha y comprobante;
- notas de atribucion;
- hash del archivo aprobado.

## Orden de migracion

1. **Completado:** congelar el vocabulario v1.0.
2. **Completado:** implementar el registro canónico, retirar el tutorial heredado y migrar el copy
   controlado por la app: UI, log, ARIA, tooltips, modales y caras de carta generadas por código.
3. Convertir La Corte Carmesí, que ya tiene nombres propios, al nuevo vocabulario y verificar la
   procedencia de todo su arte.
4. Crear al menos una Hueste completamente original para que exista un loop publicable.
5. Reemplazar o retirar Mono Green, Zombies y Goblins; borrar sus recursos de `public`, no solo
   ocultarlos del selector.
6. Eliminar Scryfall/Oracle y metadata Magic del camino de produccion y de los generadores que
   exportan cartas finales.
7. Diseñar un onboarding original cuando haga falta y reescribir documentación de jugador y
   capturas de tienda.
8. Ejecutar lint de vocabulario, auditoria de recursos, tipos, tests, build y un escaneo final de
   `dist`.

## Criterio de terminado

Hostfall esta listo para una revision de independencia cuando una persona que solo recibe el build
no encuentra nombres, arte, texto, metadata, servicios ni terminologia de Magic; entiende todas las
reglas desde el glosario Hostfall; y cada recurso distribuido tiene prueba de derechos comerciales.
