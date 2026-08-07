# Plan para 2026-08-06: presupuesto de contextos WebGL

Estado: **fases 1 y 2 implementadas** y **fase 3 en curso** el 2026-08-06. `GrowthBuffAnimator`,
`BuffSurgeAnimator`, `HeavyCreatureLanding`, `BloodSiphonAnimator`, `DrainEssenceAnimator` y
`FinalBanquetAnimator` ya dibujan mediante `src/components/sharedVfxRenderer.ts`; quedan pendientes
de comprobación en partida. Sólo `BurnAnimator` aún abre un contexto propio. Este documento explica
el fallo, descarta dos soluciones que no sirven y fija el diseño al que hay que llegar.

## Objetivo

Que el número de contextos WebGL vivos **no dependa del contenido del juego**: ni de cuántas
criaturas hay en el campo, ni de cuántos decks o cartas existan, ni de cuántas partidas se jueguen
seguidas sin recargar la página.

## Síntoma observado

Durante una partida, al lanzar una bola de fuego aparecía un fogonazo claro a pantalla completa con
el icono de imagen rota de Chromium arriba a la izquierda. Ocurría **en partida y no en el
Playground**, y de forma sistemática con Varka.

La consola lo explicaba:

```
WARNING: Too many active WebGL contexts. Oldest context will be lost.
  BuffSurgeAnimator.tsx:210
  GrowthBuffAnimator.tsx:527
  BurnAnimator.tsx:121
```

## Diagnóstico

Cada `<canvas>` que dibuja por GPU necesita un **contexto**: una conexión con la tarjeta gráfica que
consume memoria de vídeo real. El navegador admite del orden de **dieciséis contextos vivos por
página**. Al pedir uno más no falla la petición: descarta el contexto **más antiguo**. Ese lienzo
queda muerto —deja de dibujar— y el navegador lo pinta como imagen rota. Eso es el fogonazo con
icono.

### Por qué el juego llega al techo

Tres animadores se montan **dentro del bucle de cartas** de `Battlefield.tsx`, así que abren un
contexto **por criatura**:

| Animador | Montaje | Contextos |
| --- | --- | --- |
| `HeavyCreatureLanding` | `Battlefield.tsx:1030` | 1 por criatura que aterriza |
| `BuffSurgeAnimator` | `Battlefield.tsx:1047`, `:1057`, `:1072` | 1 por criatura |
| `GrowthBuffAnimator` | `Battlefield.tsx:1078` | 1 por criatura |
| `BurnAnimator` | `Board.tsx:127` | 1 |
| `FinalBanquetAnimator` | `Board.tsx:133` | 1 |
| `BloodSiphonAnimator`, `DrainEssenceAnimator` | Board | 1 cada uno |

Diez criaturas recibiendo un buff son diez contextos simultáneos. Sumados los fijos, se roza el
límite con un tablero grande y corriente.

Además, `renderer.dispose()` libera geometrías, materiales y texturas de Three.js, pero **no
devuelve el contexto al cupo en ese momento**: el navegador lo recupera cuando el recolector se
lleva el lienzo, y eso ocurre cuando le conviene. Por eso el problema **empeora dentro de una misma
sesión**: los contextos de efectos ya terminados siguen ocupando plaza un rato.

### Por qué el Playground no lo sufre

El Playground monta muchos menos efectos encadenados y no arrastra el historial de una partida
larga, así que rara vez se acerca al cupo.

### Por qué apareció al implementar la bola de fuego nueva

La bola anterior era DOM y CSS: **cero contextos**. La procedural mantiene uno vivo durante toda la
partida. La fuga ya existía; ese contexto extra fue el que rebasó el límite. Por eso el warning
señala a `BurnAnimator.tsx:121`, que es justo donde se crea el renderer: cuando le toca su turno, ya
no quedan plazas libres.

## Callejón sin salida 1: `forceContextLoss()`

Es la función que cierra el contexto de inmediato, y parece la solución obvia. **No lo es, y no debe
reintentarse.**

`forceContextLoss()` deja el `<canvas>` inservible de forma permanente: ese elemento no volverá a
obtener un contexto nunca. Y `React.StrictMode` está activo (`src/main.tsx:7`), de modo que en
desarrollo cada efecto se monta, se limpia y se vuelve a montar **sobre el mismo lienzo**. Llamarlo
en cualquier limpieza mata el segundo montaje:

```
THREE.WebGLRenderer: Context Lost.
```

Se probó el 2026-08-06 en los siete animadores y rompió **todas** las animaciones del juego. Está
revertido. La regresión `no animator poisons its canvas with forceContextLoss` de
`tests/uiPresentation.test.js` lo prohíbe explícitamente.

## Callejón sin salida 2: un renderer por tipo de animador

Compartir un renderer entre las instancias de cada animador baja la cuenta de "uno por criatura" a
"uno por tipo". Resuelve el caso de hoy, pero **el techo sigue creciendo con el contenido**: cada
efecto nuevo que llegue con una carta nueva es un contexto más, y el objetivo comercial son más
decks y más cartas. En una SPA donde el jugador reintenta partidas sin recargar, esto sólo retrasa
el problema.

## Diseño recomendado: un único renderer para toda la aplicación

Un `WebGLRenderer` es fontanería genérica: sabe dibujar *cualquier* escena con *cualquier* cámara.
Lo que distingue un efecto de otro no es el contexto, sino su escena, sus materiales y sus
geometrías, y todos esos objetos pueden convivir dentro del mismo contexto.

```
                                     ┌→ lienzo 2D de la carta A
un único renderer WebGL  ────────────┼→ lienzo 2D de la carta B
(1 contexto, vive toda la sesión)    ├→ overlay 2D a pantalla completa (Burn)
                                     └→ ...los que hagan falta
```

Cada fotograma, para cada efecto activo: se prepara su escena, se dibuja en el lienzo compartido y
se **copia** el resultado al lienzo de destino con `drawImage`. Los lienzos de destino pasan a ser
**canvas 2D**, que no consumen cupo WebGL y pueden ser tantos como haga falta.

### Qué vive en cada sitio

- **Compartido y permanente**: el renderer, su lienzo y su contexto. Se crea de forma diferida al
  primer efecto y no se destruye nunca.
- **Propio de cada efecto**: escena, cámara, geometrías, materiales, texturas y su reloj. Se libera
  al terminar el efecto, como ya se hace hoy. Eso es lo que evita que crezca la memoria de vídeo
  cuando se añadan cartas.
- **Por dibujado, no por creación**: color de fondo, `pixelRatio`, `outputEncoding` y tamaño. Hoy
  cada animador los fija una vez al crear su renderer; con uno compartido hay que fijarlos en cada
  llamada, porque el anterior efecto pudo dejarlos en otro valor.

### Cuentas

| Escenario | Hoy | Con renderer único |
| --- | --- | --- |
| 10 criaturas con buff | 10 y subiendo | 1 |
| 50 decks y 400 cartas | crece con el contenido | 1 |
| 20 partidas seguidas sin recargar | se acumula hasta romper | 1 |

## Coste y riesgos

- Una copia `drawImage` por efecto activo y por fotograma. Para recuadros del tamaño de una carta es
  barato; para los efectos a pantalla completa es una copia grande, aunque rara vez hay más de uno
  activo a la vez.
- El lienzo compartido debe ser al menos tan grande como el efecto mayor. Sólo debe redimensionarse
  al crecer: cada cambio de tamaño reasigna su búfer.
- El riesgo real está en el **encuadre y el tamaño por carta**: es donde se rompen estos cambios.
  Cada animador migrado hay que mirarlo en partida antes de seguir con el siguiente.
- Los estados globales del renderer se contaminan entre efectos si alguno olvida fijar los suyos.

## Plan por fases

1. **Hecha.** `src/components/sharedVfxRenderer.ts` abre el contexto único y `GrowthBuffAnimator`
   dibuja a través de él. Falta la comprobación en partida: el efecto debe verse igual y su línea
   debe desaparecer del warning.
2. **Hecha.** `BuffSurgeAnimator` y `HeavyCreatureLanding`, los otros animadores que multiplicaban
   contextos por carta, dibujan a través del renderer compartido. El warning debería desaparecer
   del todo; falta confirmarlo en partida con un Campo poblado.
3. **En curso.** `BloodSiphonAnimator`, `DrainEssenceAnimator` y `FinalBanquetAnimator` ya están
   migrados; falta `BurnAnimator`.

La lista de migrados vive en `tests/uiPresentation.test.js` (`SHARED_RENDERER_ANIMATORS`): al mover
un animador de una lista a la otra, la regresión exige que deje de abrir contexto propio.

Cada fase es verificable por separado: si el warning no baja como se espera, el diagnóstico está
incompleto y hay que parar antes de seguir migrando.

## Invariantes

- Ningún animador llama a `forceContextLoss()`. Cubierto por regresión.
- Ningún animador crea su propio `WebGLRenderer` una vez migrado; pide el compartido.
- Cada efecto sigue liberando sus geometrías, materiales y texturas al terminar.
- El contexto compartido no se destruye entre beats ni entre partidas.

## Verificación

- `tsc -b` y `node --test scripts/run-engine-tests.mjs`, como cualquier cambio.
- En partida, con la consola abierta: el warning `Too many active WebGL contexts` no debe aparecer
  con un tablero lleno de criaturas buffándose.
- Revisión visual por animador migrado: mismo encuadre, mismo tamaño y mismo ritmo que antes.
