# Plan de corrección de la huella visual generada

Estado: **no iniciado; requiere conversación y aprobación por fase**
Última actualización: 2026-08-11

## Objetivo

Eliminar las señales visuales que hacen que Hostfall se lea como una interfaz generada
automáticamente, sin tocar el arte de las cartas, el balance ni las reglas.

El problema no es de ingeniería: la UI funciona. Es de **percepción**. Un jugador escéptico no
audita el engine determinista ni el shader de Burn; mira los íconos, la tipografía y el texto de una
carta durante tres segundos y decide. Este plan ataca exactamente esos tres segundos.

## Qué queda explícitamente fuera

- **El arte de stock.** Es una decisión de financiación tomada: el presupuesto actual no cubre
  ilustración original y la vía prevista es un Kickstarter de arte y música. No es un defecto a
  corregir aquí. La acreditación visible del ilustrador y el `collectorId` por carta ya son la
  defensa correcta y deben conservarse.
- **El fondo de la mesa de duelo.** `assets/images/background.jpg` es provisional y ya está
  identificado para reemplazo. No forma parte de este plan.
- **El tutorial y la claridad de reglas.** Pertenecen a
  [`ui_core_rules_clarity_plan.md`](ui_core_rules_clarity_plan.md). Este documento no autoriza
  cambios de reglas, layout de campo ni contratos de animación.

## Cómo debe utilizarse este documento

Igual que el plan de claridad: cada fase se **discute, se aprueba y recién después se implementa**.
La aprobación de una fase no autoriza las siguientes. Las Fases A y B son independientes entre sí y
pueden reordenarse; las Fases C y D sólo tienen sentido después de B.

## Diagnóstico

Evidencia medida sobre el árbol actual, no impresión general:

| # | Hallazgo | Evidencia | Impacto | Costo |
| --- | --- | --- | --- | --- |
| A | Title Case aplicado sobre español | 3 reglas en `deck-card-studio.css`, 3 en `styles.css` | Alto | Bajo |
| B | Set de íconos genérico (lucide) | 79 íconos distintos en 40 de 73 componentes | Alto | Alto |
| C | Materialidad simulada sólo con CSS | 505 `linear-gradient`, 189 `radial-gradient`, 367 `box-shadow`, 0 texturas | Medio | Medio |
| D | Tipografía sin identidad | 56 usos de Georgia, 17 de Trebuchet MS; Cinzel en 5 | Medio | Bajo |

El orden recomendado de ejecución es **A → B → D → C**: A es casi gratis y muy visible, B es el tell
real, D refuerza a B, y C es el más caro con el retorno más difuso.

---

## Fase A — Casing del español impreso

### Problema

Las cartas imprimen "Mirevna, Condesa **Del** Eclipse Carmesí", "Rompefilas **De** Varka", "Río
**De** Elarion" y "Eco **De** Crónica — Vampiro Noble".

El español no usa Title Case. Ningún hispanohablante escribe "Condesa Del". Para el jugador objetivo
esta es la señal más ruidosa de todo el proyecto: comunica que el texto pasó por una máquina que
piensa en inglés. Y aparece en el nombre de la carta, que es lo primero que se lee.

### Evidencia

Los datos de autoría **ya son correctos**. En el JSON runtime:

- `court_of_the_crimson_eclipse.json:370` → `"displayNameEs": "Mirevna, Condesa del Eclipse Carmesí"`
- `legion_of_varka.json:509` → `"displayNameEs": "Rompefilas de Varka"`
- `deck-data.generated.js` → `"tipo": "Fuente — Santuario"`, `"Eco de Crónica — Vampiro Noble"`

La preposición minúscula se destruye en presentación, con `text-transform: capitalize`:

- `dev/tools/Decks/deck-card-studio.css:393` — `.tcg-title` (nombre impreso)
- `dev/tools/Decks/deck-card-studio.css:837` — línea de tipo
- `dev/tools/Decks/deck-card-studio.css:1096` — `.tcg-card--full-art .tcg-typeband`
- `src/styles.css:3084` — `.deck-detail-info-header p`
- `src/styles.css:3443` — `.deck-collection-modal-header small`
- `src/styles.css:17778` — `.playground-readout > strong` (sólo tooling)

Es un bug de presentación puro, sin componente de datos. Eso lo hace barato de decidir y caro de
propagar: los tres primeros están **horneados en los 61 PNG** ya exportados.

### Propuesta

1. Quitar `text-transform: capitalize` de las tres reglas de Card Studio y dejar que el string
   authored gane. Los nombres ya están escritos con la mayúscula correcta.
2. Quitar las dos reglas de `styles.css` que afectan UI visible (`deck-detail-info-header`,
   `deck-collection-modal-header`). `playground-readout` es tooling y puede quedarse.
3. Re-exportar el lote español completo. Sólo la exportación española actualiza `public/cards/`, el
   layout runtime y la huella de `check-card-assets.mjs`; el lote inglés se re-exporta aparte y no
   toca esos artefactos.

### Decisión pendiente para el usuario

Si algún nombre depende hoy de `capitalize` para verse bien —por ejemplo si algún
`displayNameEs` está escrito enteramente en minúsculas en el JSON— hay que corregir ese dato en vez
de conservar la regla CSS. Hay que revisar el lote antes de exportar y decidir carta por carta.

### Verificación

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\card-studio-data.mjs --check
```

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\check-card-assets.mjs
```

La huella de assets **va a cambiar** en esta fase: es esperado y debe regenerarse deliberadamente.

### Qué no se toca

El texto inglés, la gramática de reglas, `card_text_rules.md` y el layout de la carta.

---

## Fase B — Reemplazo del set de íconos

### Problema

Los 79 íconos distintos del juego vienen de `lucide-react`, presente en 40 de los 73 componentes.
Lucide es el set por defecto que emiten los asistentes de código y los generadores de UI. Su
lenguaje visual —trazo uniforme de 2px, terminaciones redondeadas, geometría regular, gris
neutro— es exactamente lo contrario de lo que pide `CLAUDE.md`: estética de estrategia PC de
principios de los 2000, materiales físicos, marco metálico.

El caso más grave es [`CardTraitIcon.tsx:24`](../../src/components/CardTraitIcon.tsx:24): `Sparkles`
representa el Rasgo **Ímpetu** y además es el `fallback` de cualquier Rasgo sin ícono propio. La
varita de chispitas es el glifo culturalmente asociado a "esto lo generó una IA". Está impresa sobre
mecánicas de combate.

### Propuesta

No es un reemplazo uno a uno de 79 íconos. Es una separación en dos capas:

**Capa 1 — Íconos de juego (~12).** Los Rasgos y Estados de `cardTraitPresentation.ts`: Alerta,
Daunting, Drenar, Volar, Furtivo, Ímpetu, Letal, Desborde, Veneno, Reflejo, Guardia aérea, más el
fallback. Estos merecen glifos propios, dibujados como sellos grabados —no line-art— coherentes con
el marco metálico de las cartas. Son los que el jugador mira mil veces por partida y los que
aparecen impresos sobre el arte.

**Capa 2 — Íconos de chrome (~67).** Settings, Volume, ChevronLeft, X, Search, Play/Pause. Aquí
lucide es aceptable y reemplazarlo es gasto sin retorno. Nadie acusa a un juego de estar generado
por su ícono de cerrar.

La regla de decisión: **si el ícono toca una carta, un Rasgo o un Estado, se dibuja; si vive en un
menú, se deja.**

### Decisiones pendientes para el usuario

- Quién dibuja los ~12 glifos. Es trabajo de arte, y por volumen es un candidato natural a entrar en
  el alcance del Kickstarter junto con el arte y la música.
- Si los glifos se entregan como SVG o como una fuente de íconos. SVG es más simple de teñir por
  bando; una fuente es más simple de imprimir en Card Studio.
- Si el fallback debe existir. Un Rasgo sin ícono propio quizás debería mostrar sólo su nombre en
  vez de un glifo genérico.

### Alcance técnico

`cardTraitPresentation.ts` ya centraliza la elección por `CardTraitIconKind`, así que la sustitución
es local: cambia el mapa de `CardTraitIcon.tsx` y el renderer de Card Studio. No hace falta tocar los
40 componentes.

Esta fase requiere re-exportar PNG si los glifos aparecen impresos en la carta.

### Qué no se toca

Los íconos de coste, el símbolo de Energía y las insignias de bando, que ya son propios.

---

## Fase D — Identidad tipográfica

### Problema

`styles.css` declara `Georgia, "Times New Roman", serif` 56 veces y
`"Trebuchet MS", Verdana, Tahoma, ui-sans-serif, system-ui, sans-serif` 17 veces. Son las fuentes
del sistema: la elección de "que se vea elegante sin licenciar nada". Cinzel y Cinzel Decorative
—la voz de display real— aparecen sólo 5 veces entre las dos.

Además, Cinzel es la fuente fantasy gratuita más usada que existe. Está en todos los pósters de D&D
generados. No te delata como generado, pero tampoco te distingue de ellos.

Sólo hay seis `.woff2` empaquetados, todos bajo `public/fonts/pact-of-elarion/`, un directorio cuyo
nombre ya no describe su contenido: son las fuentes del juego, no de un deck.

### Propuesta

1. Definir tres roles tipográficos y nada más: **display** (títulos, nombres impresos), **texto**
   (reglas, flavor, tooltips) y **numérico/UI** (stats, contadores, HUD).
2. Licenciar una display con carácter propio que reemplace a Cinzel. Es la compra tipográfica de
   mayor retorno del proyecto y cuesta menos que una sola ilustración.
3. Conservar Lora para texto de reglas: es legible, ya está empaquetada y no es un tell.
4. Reemplazar los 56 `Georgia` y 17 `Trebuchet MS` por variables CSS que apunten a los tres roles,
   dejando las fuentes de sistema únicamente como fallback real.
5. Renombrar `public/fonts/pact-of-elarion/` a algo neutral.

### Decisión pendiente para el usuario

Presupuesto y licencia de la display. Debe permitir **embedding en aplicación de escritorio y
distribución en Steam**, no sólo web — es la restricción que descalifica a la mayoría de las
opciones gratuitas.

### Qué no se toca

El tamaño de cuerpo del texto de reglas y el ajuste de línea de las cartas ya exportadas, salvo que
la display nueva cambie la métrica del título.

---

## Fase C — Materialidad

### Problema

`styles.css` tiene 505 `linear-gradient`, 189 `radial-gradient`, 367 `box-shadow` y **cero texturas
y cero SVG**. Todo el material físico del juego —metal, madera, piedra, pergamino— está simulado
con degradados calculados en código.

Es la firma de una interfaz escrita, no diseñada: un director de arte pinta un metal en Photoshop y
lo tilea; un generador escribe `linear-gradient(#3a2a1a, #6b5230)`. El resultado se ve limpio y
plano, y "limpio y plano" es justo lo que `CLAUDE.md` prohíbe.

Hay además 45 declaraciones `backdrop-filter` (≈23 superficies contando los pares `-webkit-`), es
decir glassmorphism, que la guía canónica descarta explícitamente: "evitar estética SaaS o glass
moderna". El código se está alejando del norte escrito.

Nota a favor: `deck-card-studio.css` tiene **cero** `backdrop-filter`. Las cartas están limpias; el
glass está sólo en el chrome de la aplicación.

### Qué NO es esta fase

**Los botones no entran.** `.old-button` (`styles.css:4257`) ya resuelve bien la materialidad con
bisel, sombra interna y repisa dura de 4px: es un botón de juego, no una superficie plana generada.
Tampoco entran las cartas, que ya tienen su marco impreso.

**Tampoco se trata de estirar PNG.** La preocupación legítima —que un marco en imagen se deforme
entre resoluciones— aplica sólo a la técnica equivocada. Hay dos cosas distintas:

- **Textura** (grano, veta, poro): se tilea con `background-repeat: repeat`. No escala, se repite.
  Un tile de 256×256 se ve idéntico en 1080p y en 4K y es indiferente al tamaño del contenedor.
- **Forma** (marcos, esquinas, molduras): se resuelve con `border-image` 9-slice, que fija las
  esquinas, repite los bordes y estira sólo el centro. Es la técnica de los juegos de estrategia PC
  de principios de los 2000 y la que usan Unity y Godot. Hoy el proyecto tiene **0 usos de
  `border-image`**; ese es el hueco real, no los degradados.

El escalado actual —118 `clamp()`, 174 unidades `vw/vh`, 44 media queries— no se ve afectado por
ninguna de las dos técnicas.

### Propuesta

Es la fase más cara y la de retorno más difuso, por eso va última. **Es opcional:** si sólo se
ejecutan A y B, el objetivo del plan ya está cumplido en lo esencial. Alcance mínimo viable:

1. Eliminar el `backdrop-filter` de las superficies **opacas**, donde el blur no se ve y sólo cuesta
   GPU. Conservarlo únicamente donde haya transparencia intencional sobre el campo. Este paso es
   puro borrado: no requiere dibujar nada, borra glassmorphism y libera rendimiento a la vez. Puede
   ejecutarse solo, sin el resto de la fase.
2. Inventariar las superficies grandes —paneles de vitals, barra de fases, modales, menú principal—
   y darles **una textura tileable** cada una: piedra, cuero, pergamino. Tres o cuatro texturas bien
   elegidas cambian la lectura entera; no hace falta tocar los 505 degradados.
3. Dejar los degradados donde simulan **luz**, no material. Un brillo de borde es legítimamente un
   degradado; una placa de metal no.

### Riesgo específico

`backgroundThrottling: true` y el presupuesto de contexto WebGL ya están fijados. Añadir texturas
grandes al chrome compite por memoria con el renderer compartido de VFX. Revisar
[`webgl_context_budget.md`](webgl_context_budget.md) antes de empezar y medir tras el cambio.

### Qué no se toca

El z-index documentado en componentes y CSS, el layout del campo, y los animadores.

---

## Riesgos generales

- **Fases A y B invalidan la huella de impresión.** Ambas requieren re-exportar el lote español y
  regenerar `check-card-assets.mjs`. Conviene agruparlas en una única re-exportación si se aprueban
  juntas, en vez de exportar dos veces.
- **Ninguna fase debe tocar reglas.** Si en el camino aparece un texto impreso mal redactado, se
  anota y se trata bajo `card_text_rules.md`, no dentro de este plan.
- **La Fase C puede degradar rendimiento.** Es la única con riesgo técnico real.

## Verificación transversal

Al cerrar cualquier fase:

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\typescript\lib\tsc.js -b
```

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test scripts/run-engine-tests.mjs
```

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\audit-independence.mjs --strict
```

Las Fases A y B añaden `card-studio-data.mjs --check` y `check-card-assets.mjs`. El usuario prueba
el juego; el agente no levanta servidor para validar.
