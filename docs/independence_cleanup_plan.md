# Plan de limpieza e independencia de Hostfall

Estado: **L3 en progreso; Zombies listo para prueba del usuario**
Última actualización: 2026-07-31  
Checkpoint de origen: el usuario confirmó que la rama fue enviada y estaba limpia antes de iniciar
este proceso.

## Propósito

Este documento coordina la limpieza necesaria para que Hostfall deje de depender de contenido,
vocabulario y estructuras heredadas de Magic, incluyendo el código interno del juego.

No reemplaza a [`game_vocabulary.md`](game_vocabulary.md): ese documento sigue siendo la fuente
canónica de términos y conceptos de Hostfall. Este archivo define el orden de ejecución, los límites
de cada fase, sus criterios de aceptación y el registro de decisiones.

El proceso no es una opinión ni una certificación legal. Su objetivo es producir un build cuya
identidad, contenido, recursos y lenguaje técnico pertenezcan a Hostfall y cuya procedencia pueda
demostrarse.

## Estado general

| Etapa | Estado | Autorización |
| --- | --- | --- |
| Preparación del plan | Completada | Autorizada |
| L0 — Punto seguro e inventario | Completada | Autorizada |
| L1 — Basura y referencias explícitas | Completada | Autorizada |
| L2 — Fuente única para cartas | Completada con excepción diferida a L6 | Autorizada |
| L3 — Schema Hostfall para decks | En progreso: 3/4 decks | Autorizada por partes |
| L4 — Limpieza interna del engine | No iniciada | No autorizada todavía |
| L5 — Independencia de los mazos | No iniciada | No autorizada todavía |
| L6 — Arte y procedencia | No iniciada | No autorizada todavía |
| L7 — Retiro legacy y auditoría final | No iniciada | No autorizada todavía |

## Protocolo de trabajo

1. Se trabaja una sola fase a la vez.
2. Antes de iniciar una fase se presenta su alcance exacto y los archivos previstos.
3. Una autorización no permite adelantar trabajo de fases posteriores.
4. No se hacen reemplazos globales en el engine. Cada dominio se migra como un cambio revisable.
5. No se cambia arte, diseño visual o identidad de un mazo dentro de una fase técnica.
6. No se borra un archivo hasta confirmar con búsquedas que no tiene consumidores.
7. Al terminar una fase se entrega un resumen del diff, hallazgos, riesgos y verificaciones.
8. La siguiente fase no comienza hasta recibir una instrucción explícita del usuario.

Si una fase descubre un problema perteneciente a otra, se registra aquí y se difiere. No se amplía
silenciosamente el alcance.

## Invariantes que deben conservarse

- Los mazos actuales deben seguir siendo jugables durante la migración técnica.
- Las reglas reales permanecen en `src/engine`; los componentes no absorben lógica para facilitar
  un renombre.
- El orden de beats, triggers, daño, muertes y animaciones no debe cambiar accidentalmente.
- El deck lint debe continuar distinguiendo habilidades implementadas, parciales y deliberadamente
  ignoradas.
- El generador visual no sustituye a los JSON runtime como fuente de reglas.
- Los ids o adaptadores temporales se permiten solo si tienen una fase explícita de eliminación.
- Ningún proveedor remoto de cartas puede regresar al runtime ni a los estudios.
- Los cambios de presentación deben respetar el vocabulario cerrado en
  [`game_vocabulary.md`](game_vocabulary.md).

## Capas que se auditan por separado

### 1. Producto visible

UI, cartas impresas, imágenes, tooltips, logs, errores, texto accesible, nombres de mazos, iconos y
capturas que recibe el jugador.

### 2. Contenido authored

JSON de decks, costes, estadísticas, Rasgos, efectos, composición de mazos, ids, nombres, texto de
ambientación y metadata narrativa.

### 3. Modelo interno

Tipos TypeScript, nombres de propiedades, eventos, zonas, fases, acciones, recursos, comentarios y
fixtures de prueba.

### 4. Herramientas y residuos

Estudios HTML, scripts, mirrors, documentos deprecated, assets no usados, datos de proveedores y
archivos que no llegan al flujo normal pero siguen dentro del repositorio.

### 5. Build distribuible

Contenido real de `dist`, incluyendo todo lo que Vite copia desde `public`, aunque la UI no lo abra.

## Fase L0 — Punto seguro e inventario

### Objetivo

Medir el estado real antes de limpiar. Esta fase no elimina, renombra ni rediseña contenido.

### Trabajo permitido

- Confirmar que el checkpoint de Git está limpio.
- Ejecutar el baseline completo.
- Crear un auditor reproducible para `src`, `public`, herramientas y `dist`.
- Clasificar cada hallazgo por capa, severidad y fase responsable.
- Registrar excepciones deliberadas, por ejemplo documentos internos de auditoría.

### Trabajo excluido

- Borrar HTML deprecated.
- Renombrar tipos, zonas o propiedades.
- Regenerar cartas.
- Cambiar reglas, balance, nombres o arte.

### Entregables

- Resultado de TypeScript, deck lint, suite completa, build y `git diff --check`.
- Script de auditoría repetible.
- Inventario inicial con rutas y categorías.
- Lista de strings prohibidos para producción y allowlist documental justificada.

El baseline cerrado y sus cantidades viven en
[`independence_inventory.md`](independence_inventory.md). El auditor reproducible quedó en
`scripts/audit-independence.mjs` con modos normal, `--json` y `--strict`.

### Criterio de aceptación

El mismo comando debe poder detectar nuevamente los residuos sin depender de memoria humana. El
baseline funcional debe permanecer verde.

## Fase L1 — Basura y referencias explícitas

### Objetivo

Retirar residuos inequívocos sin cambiar ninguna mecánica.

### Candidatos ya observados, pendientes de confirmar en L0

- HTML antiguos bajo `dev/tools/Cards/`.
- Créditos o referencias explícitas a Wizards.
- El campo `source` del deck de Zombies que nombra Horde Magic.
- Metadata histórica dentro de archivos que sí puedan terminar en el bundle.
- Mirrors o ejemplos que ya no alimenten el flujo vigente.

Las referencias dentro de documentación interna podrán conservarse únicamente si son necesarias
para explicar la auditoría y nunca forman parte de `dist`.

### Resultado L1

- Se eliminó completo `dev/tools/Cards`: 27 archivos sin consumidores activos.
- Se retiró la procedencia explícita del JSON de Zombies.
- Se reescribió el único comentario de producción que nombraba Magic.
- Los seis checks L1 quedaron en cero en source, herramientas y el build regenerado.
- El auditor pasó de 9 a 6 categorías bloqueantes y de 3 a 2 advertencias; los bloqueos restantes
  pertenecen a L2–L7.

### Criterio de aceptación

- Ningún archivo eliminado tenía consumidores activos.
- El producto y el build no contienen referencias explícitas a Magic o Wizards.
- Todas las verificaciones permanecen verdes.

## Fase L2 — Fuente única para cartas

### Objetivo

Eliminar la divergencia entre datos runtime, estudios HTML y PNG exportados.

### Trabajo previsto

- Definir una única fuente de datos imprimibles por deck.
- Separar claramente arte fuente, datos de carta y PNG generado.
- Hacer que los estudios consuman datos locales, sin duplicar reglas en HTML embebido.
- Guardar un hash de las entradas usadas para generar cada lote de PNG.
- Fallar una verificación cuando un PNG sea anterior a sus datos fuente.
- Regenerar las cartas con el vocabulario Hostfall vigente.

### Problema conocido

Los PNG de producción fueron exportados antes que varias correcciones de vocabulario. Algunos aún
imprimen términos como `Criatura`, `Toque mortal`, `Daña primero`, `Horda` o construcciones antiguas
de Vida aunque sus estudios y JSON ya tengan texto nuevo.

### Resultado L2

- El JSON runtime es la fuente única de reglas, nombre, coste, estadísticas y cantidad para cada
  deck jugable. `studio.config.json` conserva solamente presentación: arte, línea de tipo, lore y
  excepciones visuales que no cambian reglas.
- Los cinco índices consumen `deck-data.generated.js`; ya no contienen arreglos de cartas
  embebidos. `scripts/card-studio-data.mjs --check` falla si la proyección deja de coincidir.
- Se eliminaron cuatro mirrors editables: `mono-green.json`, `vampires.json`, `hunters.json` y
  `mono_green_ramp_card_generator.json`. Cazadores quedó como una única configuración preview
  porque todavía no tiene deck runtime.
- Los estudios dejaron de depender de CDN para tipografías e iconos. Sus entradas son locales y
  enumerables.
- El exportador sincroniza datos, rechaza arte circular y actualiza
  `dev/tools/Decks/generation-manifest.json` con hashes del deck, presentación, renderer, fuentes,
  arte y cada PNG de salida.
- Se regeneraron y verificaron 13 PNG de Mono Green y 14 de Vampiros. Ambos lotes imprimen el
  vocabulario vigente y pasan la prueba de frescura.

### Excepción aceptada y diferida a L6

Zombies y Trasgos no conservan arte fuente local. Sus estudios recibían URLs remotas hasta que se
retiró Scryfall y ahora apuntan a sus propios PNG finales. Regenerarlos así anidaría una carta
dentro de otra y sobrescribiría la única copia conservada; extraer el arte desde el raster final
también duplicaría overlays y degradaría la imagen.

El usuario autorizó conservar intactos esos 34 PNG y resolverlos al generar el arte definitivo en
L6. El exportador continúa bloqueándolos deliberadamente para impedir una exportación recursiva.
Esta excepción ya no impide cerrar L2: queda registrada como deuda explícita de assets para L6.

No se inició L3 y los PNG actuales de ambas Huestes permanecen intactos.

### Criterio de aceptación

Una edición de datos tiene un solo lugar de origen y existe una forma objetiva de saber si las
imágenes distribuidas están actualizadas. Los 34 PNG legacy sin arte fuente constituyen la excepción
documentada y protegida hasta su sustitución en L6.

## Fase L3 — Schema Hostfall para decks

### Objetivo

Hacer que los JSON authored hablen Hostfall. Durante esta fase un adaptador temporal podrá producir
el modelo que todavía espere el engine.

### Mapeo previsto

| Legacy authored | Hostfall authored |
| --- | --- |
| `cardTypes` | `kinds` |
| `Creature` | `ECHO` |
| `Land` / `Energy` | `SOURCE` |
| `Sorcery` | `SPELL` |
| `Instant` | `SPELL` con modificador `QUICK` |
| `Artifact` / `Enchantment` | `SUPPORT` |
| `toughness` | `endurance` |
| `keywords` | `traits` |
| `manaCost`, `manaValue`, `colors` | modelo de `energyCost` |

El diseño definitivo del coste de Energía debe preservar primero el comportamiento actual y luego
retirar la compatibilidad de colores en L4.

### Orden

Se convierte un deck por vez. Cada conversión debe producir el mismo estado runtime que antes del
cambio hasta que una fase de diseño autorice modificar reglas.

### Avance L3.1 — Mono Green

- `mono_green_ramp.json` usa schema `1.0.0` y ya no contiene campos authored legacy.
- El coste usa una sola cantidad de Energía, sin colores; el adaptador genera el coste genérico que
  todavía paga el engine conservando la cantidad de Fuentes requerida.
- `hostfallDeckAdapter.ts` traduce tipos, Rasgos, Aguante, zonas, Agotar, eventos y generación de
  Energía. Los decks `0.2.0` pasan por el mismo borde sin modificaciones.
- El lint rechaza campos legacy dentro de cualquier deck `1.0.0`.
- Las pruebas cubren los aliases, producción de Energía y la expansión de `SUPPORT` a las dos
  categorías que todavía distingue el engine. No se migró ningún otro deck.

### Avance L3.2 — Vampiros

- El usuario validó Mono Green mediante una partida completa antes de autorizar este bloque.
- El contrato canónico Hostfall se fijó en `1.0.0` para código, documentación y decks migrados.
- `vampire_preview.json` usa `CHRONICLER`, `energyCost`, `kinds`, `modifiers`, `endurance`,
  `traits`, `FIELD`, `QUICK`, `exhaust`, `requiresStabilized`, `SOURCE_IS_READY` y `GAIN_ENERGY`.
- La Condesa conserva su identidad de `Chronicle Echo` mediante `CHRONICLE`; los Rasgos declarados
  dentro de efectos también pasan por el adaptador, como `DRAIN` hacia el alias temporal del engine.
- El auditor bajó el inventario authored legacy de 327 a 234 apariciones. Las restantes pertenecen
  exclusivamente a Zombies y Trasgos, que continúan en `0.2.0` hasta sus respectivos bloques.
- Mono Green y Vampiros fueron reexportados para renovar su huella de frescura bajo `1.0.0`; los
  únicos PNG todavía no verificables son los 34 de Horda diferidos a L6.

### Avance L3.3 — Zombies

- El usuario validó Vampiros mediante una partida completa antes de autorizar este bloque.
- `horde-zombies.json` usa schema `1.0.0`, `side: HOST`, `ECHO`, `TOKEN`, `SUPPORT`, `SPELL`,
  `energyCost`, `endurance`, `traits`, `FIELD`, `MEMORY`, `INVOKED` y controladores `HOST`.
- `rulesProfile` habla Hostfall (`damagePerArchiveDiscard`, `poisonPerArchiveDiscard`,
  `hostEchosHaveImpetus`) y el adaptador restaura temporalmente el contrato que consume L4.
- Los aliases de reglas exclusivos de este deck se migraron a `BEGIN_READY`, `CARD_PLAYED`,
  `ECHO_DIED`, `MEMORY_COUNT_AT_LEAST`, `DISCARD_OWN_ARCHIVE_TO_MEMORY` y costes de Energía.
- Graf Harvest mantiene sus dos habilidades pendientes y Smallpox conserva su resolución custom;
  ninguna habilidad WIP fue activada accidentalmente.
- El auditor bajó el inventario authored legacy de 234 a 128 apariciones, todas pertenecientes a
  Trasgos. Los 34 PNG de Zombies y Trasgos siguen bajo la excepción de arte aceptada para L6.

### Criterio de aceptación

- Todos los decks usan el schema Hostfall.
- El lint rechaza nuevos campos legacy en authored data.
- Los aliases sobreviven únicamente en un adaptador identificado y testeado.

## Fase L4 — Limpieza interna del engine

### Objetivo

Retirar el vocabulario heredado del modelo técnico sin cambiar las reglas por accidente.

### Subfases obligatorias

1. Tipos de carta y Rasgos.
2. Zonas.
3. Energía y costes.
4. Estados de cartas.
5. Acciones, eventos y reglas de la Hueste.
6. Store, componentes, playground y pruebas consumidoras.

### Mapeos principales

| Legacy interno | Hostfall interno |
| --- | --- |
| `library` | `archive` |
| `battlefield` | `field` |
| `graveyard` | `memory` |
| `exile` | `oblivion` |
| `tapped` | `exhausted` |
| `summoningSickness` | `stabilizing` |
| `manaPool` | `energyPool` |
| `DEATHTOUCH` | `LETHAL` |
| `REACH` | `SKYGUARD` |
| `VIGILANCE` | `ALERT` |
| `MENACE` | `DAUNTING` |
| `FIRST_STRIKE` | `REFLEX` |
| `SKULK` | `FURTIVE` |
| `LIFESTEAL` | `DRAIN` |
| `TRAMPLE` | `OVERFLOW` |
| `HASTE` | `IMPETUS` |
| `TOXIC_N` | `POISON_N` |

`player`, `card`, `hand`, `attack`, `damage`, `draw` y otros términos genéricos no se renombran por
rutina. Solo se cambia un término cuando el modelo Hostfall aporta una distinción real.

### Estrategia de seguridad

- Migrar un dominio completo y pequeño por cambio.
- Mantener aliases únicamente en bordes de carga o compatibilidad.
- No mantener dos copias mutables del mismo estado.
- Mover reglas visuales puras a módulos testeables cuando sea necesario.
- Decidir explícitamente si los saves de desarrollo se migran o reciben un version bump.

### Criterio de aceptación

`src/engine` usa el modelo Hostfall y cualquier vocabulario legacy restante está aislado en un
adaptador con una fase de eliminación conocida.

## Fase L5 — Independencia de los mazos

### Objetivo

Convertir los mazos derivados en contenido propio sin perder sus roles jugables.

### Regla de rediseño

Cambiar nombre y arte no basta. Cada carta se evalúa también por:

- coste;
- Fuerza y Aguante;
- efecto o condición;
- timing;
- cantidad de copias;
- relación con el resto del deck.

Se puede conservar un rol amplio —productor de Energía, defensor, lord tribal, removal, crecimiento—
sin conservar una ficha uno-a-uno de una carta publicada.

### Orden recomendado

1. Validar Vampiros como Crónica original de referencia.
2. Crear una Hueste original a partir del espacio jugable de Zombies.
3. Rediseñar Trasgos.
4. Rediseñar Mono Green.

Antes de tocar un deck se prepara una tabla carta por carta y el usuario aprueba el diseño. Solo un
deck puede estar en migración de contenido a la vez.

### Criterio de aceptación

No existe una correspondencia sistemática de nombre nuevo + arte nuevo + mismo coste + mismas
estadísticas + mismo efecto + misma cantidad.

## Fase L6 — Arte y procedencia

### Objetivo

Sustituir recursos derivados y demostrar derechos de uso.

### Registro mínimo por recurso

- ruta;
- autor o proveedor;
- licencia o contrato;
- permiso comercial y de modificación;
- fecha y comprobante;
- atribución necesaria;
- hash del archivo aprobado.

Los art crops editables deben vivir en carpetas `art/`. Un PNG final de carta no puede convertirse
en la fuente de arte de su propio generador.

### Criterio de aceptación

Cada recurso distribuido tiene procedencia documentada y todos los PNG fueron generados desde arte
y datos locales aprobados.

## Fase L7 — Retiro legacy y auditoría final

### Objetivo

Eliminar la capa de compatibilidad y revisar el build como un tercero.

### Trabajo previsto

- Borrar aliases y adaptadores temporales.
- Retirar ids, fixtures, comentarios y nombres de pruebas derivados.
- Borrar imágenes y archivos sustituidos.
- Migrar o invalidar saves antiguos de forma explícita.
- Ejecutar la auditoría sobre `dist`, no solamente sobre `src`.
- Revisar nombres, imágenes, reglas, iconos, créditos y procedencia del producto final.

### Criterio de aceptación

Una persona que recibe únicamente el build no encuentra nombres, arte, texto, metadata, servicios
ni terminología específica de Magic, y cada recurso tiene prueba de derechos comerciales.

## Matriz de verificación

Cada fase con cambios de código debe cerrar con:

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\typescript\lib\tsc.js -b
```

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\lint-decks.mjs
```

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test scripts\run-engine-tests.mjs
```

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\vite\bin\vite.js build
```

Además:

- `git diff --check`;
- auditor de independencia;
- revisión del diff limitada a la fase;
- confirmación de que no comenzó trabajo de la fase siguiente.

Una fase exclusivamente documental puede cerrar con TypeScript y `git diff --check`; cualquier
cambio en datos, scripts, assets o código exige la matriz completa.

## Hallazgos preliminares

Estos puntos justificaron el plan, pero no sustituyen el inventario reproducible de L0:

- Existen cartas derivadas bajo `public/cards` y Vite copia `public` al build.
- Algunos PNG no reflejan el vocabulario ya actualizado en sus fuentes.
- El authored data todavía usa costes, colores, tipos y Rasgos legacy.
- El engine todavía modela zonas, mana, tap y estabilización con nombres legacy.
- Existe al menos una procedencia explícita de Horde Magic en datos de producción.
- Existen herramientas HTML antiguas con créditos de Wizards.
- La documentación de vocabulario estima 44 definiciones nombradas y tres fichas derivadas entre
  Mono Green, Zombies y Goblins.

Todos deben confirmarse, cuantificarse y asignarse durante L0 antes de eliminarlos.

## Registro de decisiones

| Fecha | Decisión | Motivo |
| --- | --- | --- |
| 2026-07-31 | Trabajar fase por fase con aprobación explícita. | Evitar cambios amplios y mantener el juego funcional. |
| 2026-07-31 | Usar el push limpio del usuario como checkpoint inicial. | Existe un punto de recuperación antes de L0. |
| 2026-07-31 | Documentar el proceso antes de comenzar L0. | Mantener continuidad entre sesiones y agentes. |
| 2026-07-31 | El auditor normal reporta sin fallar y `--strict` rechaza bloqueos. | Permite medir progreso durante la migración y usar el mismo script como gate final. |
| 2026-07-31 | Eliminar todo `dev/tools/Cards` después de confirmar cero consumidores. | El árbol completo pertenecía al creador HTML deprecated; `dev/tools/Decks` permanece intacto como flujo vigente. |
| 2026-07-31 | Permitir referencias históricas solo en documentación y auditoría internas. | No llegan a `dist` y son necesarias para explicar el proceso de independencia. |

| 2026-07-31 | Derivar las reglas impresas desde el JSON runtime y limitar `studio.config.json` a presentación. | Evita dos copias editables de coste, stats, cantidad y texto de reglas sin adelantar el schema Hostfall de L3. |
| 2026-07-31 | Rechazar un PNG final usado como arte de su propio estudio. | Evita sobrescritura circular y degradación silenciosa; Zombies y Trasgos requieren una decisión explícita. |

## Registro de avance

| Fecha | Fase | Acción | Resultado | Verificación |
| --- | --- | --- | --- | --- |
| 2026-07-31 | Preparación | Diseño inicial del proceso. | Documento creado; L0 todavía no iniciada. | TypeScript OK; `git diff --check` OK. |
| 2026-07-31 | L0 | Baseline, auditor e inventario de source, tools, `public` y `dist`. | 9 categorías bloqueantes, 3 advertencias y 2 checks limpios; ninguna corrección adelantada. | TypeScript OK; deck lint OK; 194/194 tests; build OK; JSON y gate estricto validados. |
| 2026-07-31 | L1 | Retiro de herramientas deprecated y referencias explícitas. | 27 archivos eliminados; los seis checks de L1 quedaron en cero; quedan 6 bloqueos, 2 advertencias y 6 checks limpios. | TypeScript OK; deck lint OK; 194/194 tests; build OK; auditor L1 limpio; `git diff --check` OK. |

| 2026-07-31 | L2 | Fuente runtime única, proyecciones generadas, pipeline local y manifest de frescura. | 27 PNG verificados; el usuario aceptó diferir a L6 los 34 PNG sin arte fuente de Zombies/Trasgos, protegidos contra exportación recursiva. | Proyección OK; TypeScript OK; deck lint OK; 195/195 tests; build OK; `git diff --check` OK. El auditor conserva la excepción como advertencia de L6. |
| 2026-07-31 | L3.1 | Schema Hostfall y adaptador temporal; migración exclusiva de Mono Green. | Mono Green quedó en el contrato canónico `1.0.0`; el inventario authored legacy bajó de 425 a 327 ocurrencias, todas pertenecientes a los tres decks pendientes. | TypeScript OK; deck lint OK; 196/196 tests; revisión visual de PNG y partida completa del usuario OK. |
| 2026-07-31 | L3.2 | Promoción del schema a `1.0.0` y migración exclusiva de Vampiros. | Mono Green y Vampiros usan el contrato canónico; el inventario authored legacy bajó a 234 ocurrencias, todas en Zombies y Trasgos. | TypeScript OK; deck lint OK; Card Studio OK; 197/197 tests; partida completa del usuario OK. |
| 2026-07-31 | L3.3 | Migración exclusiva de Zombies y ampliación de aliases de Hueste. | Tres decks usan `1.0.0`; el inventario authored legacy bajó a 128 ocurrencias, todas en Trasgos. | TypeScript OK; deck lint OK; Card Studio OK; 198/198 tests; build OK; auditor restaurado a los 34 PNG de Horda ya diferidos. Pendiente prueba del usuario antes de migrar Trasgos. |

## Plantilla para cerrar una fase

Al finalizar cada fase se agrega una entrada que incluya:

- alcance ejecutado;
- archivos creados, modificados y eliminados;
- hallazgos diferidos;
- decisiones tomadas;
- resultados de TypeScript, lint, tests, build y auditoría;
- riesgos conocidos;
- estado de Git;
- autorización necesaria para la siguiente fase.
