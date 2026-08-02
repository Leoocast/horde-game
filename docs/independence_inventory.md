# Inventario de independencia — baseline L0

Fecha: 2026-07-31  
Estado: baseline confirmado  
Fuente reproducible: [`scripts/audit-independence.mjs`](../scripts/audit-independence.mjs)

## Alcance

Este inventario registra lo encontrado durante L0. No elimina ni corrige los hallazgos. Cada grupo
se asigna a una fase posterior del
[`plan de limpieza`](independence_cleanup_plan.md).

Se revisaron por separado:

- código y datos importados por producción;
- herramientas bajo `dev/tools`;
- cartas y arte bajo `public/cards`;
- authored data de los cuatro decks registrados;
- engine, store y playground;
- pruebas;
- el build real generado en `dist`.

La documentación interna no se considera superficie de producto. Puede nombrar el material de
origen cuando sea necesario para registrar la auditoría. `docs`, `scripts` y archivos de agentes no
se copian a `dist` por la configuración actual de Vite.

## Baseline funcional

| Verificación | Resultado |
| --- | --- |
| TypeScript | OK |
| Deck lint | OK |
| Suite completa | 194/194 pruebas pasan |
| Build Vite | OK; 2125 módulos transformados |
| Auditor remoto | 0 referencias a proveedores remotos |

El deck lint mantiene un WIP ya conocido: las habilidades de `graf_harvest`. No es una regresión de
L0. El build muestra una advertencia previa por el chunk principal de aproximadamente 1.47 MB; no
es un bloqueo de independencia y se registra fuera del alcance de esta limpieza.

## Cómo reproducir

Modo informativo, útil durante las fases:

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\audit-independence.mjs
```

Salida estructurada:

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\audit-independence.mjs --json
```

Gate de publicación:

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\audit-independence.mjs --strict
```

El modo normal reporta y termina correctamente aunque existan residuos conocidos. `--strict`
termina con error mientras quede al menos una categoría bloqueante.

## Resumen automático

| Severidad | Categorías actuales |
| --- | ---: |
| Bloqueantes | 9 |
| Advertencias | 3 |
| Checks limpios | 2 |

Checks limpios:

- no quedan referencias a Scryfall ni a endpoints equivalentes en runtime, herramientas o build;
- no hay consumidores activos de `dev/tools/Cards` en `src`, `index.html`, configuración de Vite o
  `package.json`.

## L1 — Referencias explícitas y herramientas deprecated

### Producto y build

Se encontraron dos referencias en source de producción:

- `src/data/decks/horde/zombies/horde-zombies.json` declara
  `Horde Magic - Limited Edition 2.1`;
- `src/playground/scenario.ts` menciona símbolos de Magic en un comentario interno.

La referencia incluida en el JSON llega al chunk principal de `dist`. Los comentarios de source se
eliminan durante el build y no explican por sí solos la coincidencia compilada.

### Herramientas antiguas

`dev/tools/Cards` contiene 27 archivos candidatos a eliminación, incluyendo 24 HTML y tres assets.
Dos HTML imprimen créditos de Wizards:

- `dev/tools/Cards/index.html`;
- `dev/tools/Cards/index2.html`.

El escaneo de consumidores activos dio cero. L1 deberá repetir esa comprobación inmediatamente
antes de borrar el árbol; L0 no autoriza la eliminación.

## L2 — Divergencia entre fuentes y PNG

Hay 61 PNG finales bajo `public/cards` y no existe un manifest de generación que relacione cada PNG
con un hash de sus datos y arte fuente.

La revisión visual confirmó que algunos PNG distribuidos son anteriores al vocabulario actual:

- `public/cards/mono_green_ramp/llanowar_elves.png` imprime `Criatura`;
- `public/cards/goblins/goblin_chainwhirler.png` imprime `Criatura` y `Daña primero`;
- `public/cards/zombies/diregraf_captain.png` imprime `Criatura`, `Toque mortal` y `Horda`;
- `public/cards/vampires/court_duelist.png` imprime `Criatura` y `pagar 3 vidas`.

Los tests actuales comparan estudios y JSON, pero no pueden leer el texto rasterizado dentro de los
PNG. L2 debe introducir una prueba de frescura basada en entradas y hashes, no depender de OCR.

Cierre de L2 (2026-07-31): el manifest y la verificación por hashes ya existen. Mono Green (13 PNG)
y Vampiros (14 PNG) fueron regenerados y eran verificables en aquel corte. Los 34 PNG de Zombies y
Trasgos se difirieron porque sus estudios apuntaban circularmente a esos mismos PNG como arte.

Actualización L6 (2026-08-01): La Procesión de la Campana Hueca y El Motín de la Forja Rota ya
tienen 17 fuentes separadas y 17 exportaciones verificables cada uno. Los 14 PNG de Vampiros fueron
regenerados después de incorporar el flavor authored. Los cuatro decks jugables suman 61/61 PNG
frescos desde arte local separado.

## L3 — Authored data legacy

El auditor contó 425 apariciones de campos legacy en los cuatro decks activos:

| Campo | Apariciones | Decks afectados |
| --- | ---: | ---: |
| `cardTypes` | 95 | 4 |
| `colors` | 64 | 4 |
| `keywords` | 63 | 4 |
| `manaCost` | 60 | 4 |
| `manaValue` | 62 | 4 |
| `requiresNoSummoningSickness` | 1 | 1 |
| `tap` | 5 | 2 |
| `toughness` | 75 | 4 |

Estos campos deben migrarse mediante un adaptador temporal. L0 no determina todavía el formato
exacto del schema nuevo ni cambia comportamiento.

Avance L3.1 (2026-07-31): Mono Green ya usa schema Hostfall `1.0.0`. El auditor bajó de 425 a 327
apariciones y los tres decks todavía en `0.2.0` contienen la totalidad restante. El adaptador
temporal y el lint del schema están cubiertos por pruebas.

Avance L3.2 (2026-07-31): Vampiros también usa schema Hostfall `1.0.0`. El auditor bajó a 234
apariciones, concentradas exclusivamente en Zombies y Trasgos; ambos permanecen en `0.2.0` hasta
sus respectivos bloques. Mono Green y Vampiros conservan huellas de generación válidas.

Avance L3.3 (2026-07-31): Zombies usa schema Hostfall `1.0.0`. El auditor bajó a 128 apariciones,
todas dentro de Trasgos, el último deck que permanece en `0.2.0`. Las 17 imágenes de Zombies
continúan dentro de la excepción de arte sin fuente separada aceptada para L6.

## L4 — Modelo interno legacy

Se contaron 859 coincidencias en `src/engine`, `src/store` y `src/playground`. El número representa
apariciones, no reglas distintas, y sirve como baseline para medir que cada subfase reduzca el
inventario.

Grupos incluidos:

- `library`, `battlefield`, `graveyard`, `exile`;
- `mana`, `ManaPool`, `coloredMana`, `genericMana`;
- tipos `Creature`, `Land`, `Instant`, `Sorcery`, `Enchantment`, `Artifact`;
- Rasgos legacy;
- `tapped` y `summoningSickness`;
- la identidad interna `horde` donde deba migrarse a Host.

No todas las coincidencias deben reemplazarse ciegamente. Los términos genéricos se evalúan por
concepto y los aliases necesarios se aíslan en bordes de compatibilidad.

## L5 — Definiciones derivadas

El inventario fijo reconoce 47 definiciones únicas distribuidas así:

| Deck | Definiciones |
| --- | ---: |
| Mono Green | 13 |
| Zombies | 17 |
| Goblins | 17 |

Las 47 identidades aparecen también como strings dentro del chunk principal del build. La lista del
auditor es fija: cambiar el contenido del deck no mueve la meta automáticamente, y una identidad
solo deja de contar cuando su nombre realmente sale de authored data y `dist`.

Vampiros no forma parte de esta lista fija de identidades. El usuario confirmó que sus 14 artes son
propios y L6 regeneró sus PNG desde esas fuentes locales.

## L6 — Arte y limpieza visual

Este bloque nació como inventario L0 de los tres árboles heredados. Sus rutas técnicas permanecen,
pero el contenido visual fue sustituido durante L6:

| Ruta | Archivos |
| --- | ---: |
| `public/cards/mono_green_ramp` | 26 |
| `public/cards/zombies` | 17 |
| `public/cards/goblins` | 17 |

Vite sigue copiando esos árboles a `dist/cards`; renombrar ids y rutas pertenece a L7 y no implica
que el arte actual siga siendo derivado.

Estado al cierre de L6:

- La Última Lluvia: 13 fuentes locales y 13 PNG frescos;
- La Corte Carmesí: 14 fuentes locales propias y 14 PNG frescos;
- La Procesión de la Campana Hueca: 17 fuentes locales y 17 PNG frescos;
- El Motín de la Forja Rota: 17 fuentes locales y 17 PNG frescos.

Los tres lotes creados durante la migración conservan registros de prompts y hashes. La limpieza de
Hostfall no exige un registro legal individual de audio, fuentes o cada archivo distribuido; una
revisión comercial completa sólo se hará si el usuario la solicita aparte.

## L7 — Pruebas y retiro de compatibilidad

Las pruebas contienen 1025 coincidencias legacy. En L0 se clasifican como información, no como
fallo: hoy esas pruebas describen correctamente el modelo existente y protegen el comportamiento
durante la migración.

Cada subfase de L4 deberá migrar sus pruebas al mismo tiempo. L7 eliminará los últimos fixtures,
comentarios y aliases una vez que el engine ya no dependa de ellos.

## Asignación por fase

| Hallazgo | Fase responsable |
| --- | --- |
| Referencias explícitas y herramientas antiguas | L1 |
| Pipeline y prueba de frescura de PNG | L2 |
| 34 PNG legacy sin arte fuente separado | Resuelto en L6 |
| 128 campos legacy restantes en authored data (baseline: 425) | L3 |
| 859 coincidencias en engine/store/playground | L4 |
| 47 identidades derivadas | L5 |
| Arte derivado bajo los tres árboles originales | Resuelto en L6; ids y rutas técnicas pasan a L7 |
| 1025 coincidencias en pruebas y aliases finales | L7 |

## Interpretación del baseline

El juego está funcional, pero el build no está listo para publicación independiente. La limpieza
remota ya está cerrada; los siguientes bloqueos son locales y están cuantificados. Este inventario
es la referencia contra la que se mide cada fase, no una instrucción para resolverlas todas juntas.
