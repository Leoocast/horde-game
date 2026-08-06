# Efectos visuales y Three.js

Referencia tecnica para efectos de cartas, particulas y overlays. Este documento registra tanto
los contratos actuales como librerias o ejemplos que vale la pena reevaluar en el futuro.

## Enfoque actual

El proyecto usa Three.js directamente desde React; no usa React Three Fiber. Los animadores son
presentacion: reciben el estado y los anclajes que ya decidieron engine/store, reproducen el efecto
y notifican el momento de impacto y el final. Nunca deben decidir objetivos, dano, curacion ni
otros resultados del juego.

Implementaciones utiles como referencia:

- `BloodPactAnimator.tsx`: sprites y materiales Three.js para manchar y consumir una carta.
- `DrainEssenceBiteAnimator.tsx`: reutiliza los colmillos y la sangre de Drenar sobre la carta
  recortada objetivo; el cierre de la mordida marca el mismo instante en que se resuelve la
  curacion. `DrainEssenceAnimator.tsx` conserva el humo procedural anterior para cartas futuras
  que declaren `animation: "ESSENCE_SMOKE"`.
- `FinalBanquetAnimator.tsx`: combina gotas Three.js para el pago de Vida con relampagos violetas
  ramificados entre la carta y el objetivo, nucleo electrico, resplandor aditivo, chispas y anillos
  de impacto. La carta lanzada permanece visible y la criatura conserva el fade de muerte normal
  del campo.
- `GrowthBuffAnimator.tsx`: canvas Three.js local anclado al slot de una criatura. El patron
  vigente es `frame`: dos ramas salen de la base, trepan por el borde de la carta y cierran en una
  flor sobre el canto superior, con zarcillos cortos hacia afuera y hojas que brotan siempre del
  lado exterior (`leafSide`), de modo que arte, stats y badges de Estado siguen legibles durante el
  beat. Tiene intensidades preview, suave, fuerte y feral sin modificar el `transform` que pertenece
  al battlefield. El patron `growth` anterior —raices gruesas que atraviesan y se abren sobre la
  carta— queda disponible en el mismo animador para un efecto futuro que si quiera cubrirla.
  `frameRootPathSpecs` y `frameLeafRootIndex` son puras y estan cubiertas en
  `tests/uiPresentation.test.js`.
- `NatureShieldAnimator.tsx`: conserva la variante de raices que envuelve y cierra el contorno de
  la carta. No esta conectada a ninguna carta: queda lista para un futuro efecto de resistencia,
  proteccion, hexproof o indestructible.
- `ManaFlowAnimator.tsx`: usa SVG y Framer Motion para alinear un ribbon vegetal entre una
  criatura de ramp y el socket de mana almacenado. El store difiere la ganancia hasta que la
  semilla llega al HUD; no requiere Three.js porque ambos extremos son elementos de interfaz.
- `BurnAnimator.tsx`: un canvas persistente y un contexto WebGL creado de forma diferida al primer
  Burn dibujan carga, proyectil, estela
  depositada e impacto con `ShaderMaterial` sobre planos y `THREE.Camera` sin proyeccion. Cada
  pasada admite seis rutas; una descarga mayor se divide en varias pasadas dentro del mismo render
  y ninguna ruta explicita se descarta. El renderer se conserva entre Burns consecutivos y solo se
  libera al desmontar el campo; su overlay queda oculto cuando no hay un Burn activo, mientras
  geometria y materiales se renuevan por efecto. El GLSL
  vive aparte en `burnFireball.ts` y deriva sus constantes del reloj de
  `burnPresentation.ts`, asi que el material de cada bando es solo una rampa de color. El destello
  de pantalla, el numero de dano y la chamusquina de la carta siguen siendo DOM porque deben
  alinearse con la interfaz. Las rutas son rectas salvo la descarga de entrada de Vaelor.
  `ClassicBurnAnimator.tsx` conserva el renderer DOM/CSS anterior exclusivamente para excepciones
  registradas como Todos contra uno. Detalles de forma y estela en `docs/animation_contracts.md`.

Para cualquier efecto nuevo:

- Mantener separados el momento de resolucion y el momento de completar la animacion.
- Anclar la geometria a rectangulos DOM reales y recalcularla si cambia el viewport.
- Actualizar por delta time, con un limite razonable, para conservar forma y velocidad a 60 Hz,
  144 Hz y superiores.
- Limitar `devicePixelRatio`, particulas y draw calls segun lo que realmente se ve.
- Cancelar `requestAnimationFrame`, timers y listeners; liberar geometria, materiales, texturas y
  renderer al desmontar.
- Respetar la cola y el bloqueo descritos en `docs/animation_contracts.md`.

## Candidato futuro: three.quarks

Repositorio: [Alchemist0823/three.quarks](https://github.com/Alchemist0823/three.quarks)

Estado: **referencia para una evaluacion futura; no es dependencia del proyecto**.

Es una libreria TypeScript de particulas/VFX sobre Three.js. Lo mas interesante para Hostfall:

- `BatchedRenderer` para agrupar sistemas y reducir draw calls.
- Modos billboard, stretched billboard, mesh y trail.
- Emisores de punto, esfera, hemisferio, cono, circulo, superficie de mesh y grid.
- Comportamientos reutilizables: color, tamano y rotacion durante la vida, fuerzas, orbita,
  animacion de texturas, subemisores y extensiones propias.
- Editor visual con exportacion JSON, util para iterar humo, sangre, ceniza, impactos y trails sin
  codificar cada particula a mano.
- Instancias clonables y limpieza automatica para efectos de corta duracion.
- Licencia MIT.

Casos donde podria aportar mas que el sistema artesanal actual:

- Una biblioteca compartida de humo, chispas, sangre, ceniza y niebla.
- Rafagas con muchas instancias simultaneas.
- Trails de proyectiles y corrientes entre cartas.
- Efectos editables por artistas o diseñados en JSON.

### Compatibilidad que bloquea instalarlo hoy

A fecha de esta nota, `three.quarks` 0.17.1 declara `three >= 0.182.0` como peer dependency. El
proyecto usa `three 0.128.0` y `@types/three 0.128.0`. No se debe instalar la version actual de
Quarks sin evaluar primero la actualizacion de Three.js y sus shaders, tipos y animadores
existentes.

Ademas:

- La integracion oficial `quarks.r3f` no aporta valor mientras el proyecto no adopte React Three
  Fiber de forma deliberada.
- El render WebGPU aparece en el roadmap de la libreria principal; no debe asumirse como soporte
  estable actual. `quarks.nodes` incluye trabajo experimental separado.
- Quarks solo reemplazaria la capa de render de particulas. Los beats, impactos y resolucion del
  juego seguirian siendo responsabilidad del store y el engine.

### Plan de evaluacion

1. Crear un prototipo aislado, sin reemplazar un efecto vigente.
2. Confirmar una matriz de versiones de Three.js, tipos y Quarks compatible con Vite.
3. Probar un efecto representativo, por ejemplo humo corto o un trail, usando un
   `BatchedRenderer` compartido.
4. Medir draw calls, tiempo de frame y consistencia a 60/144 Hz con varias instancias.
5. Verificar replay, reset, unmount y disposicion de recursos sin residuos.
6. Adoptarlo solo si reduce complejidad o mejora rendimiento sin debilitar los contratos de
   animacion.

## Referencia DOM/canvas: ParticleEffectsButtons

Repositorio: [codrops/ParticleEffectsButtons](https://github.com/codrops/ParticleEffectsButtons/)

Estado: **inspiracion para efectos 2D ligados a la interfaz; no instalar ni copiar completo**.

Esta referencia desintegra o reconstruye un elemento HTML mediante particulas dibujadas en un
canvas colocado detras del elemento. Permite variar direccion, duracion, easing, cantidad,
oscilacion, velocidad, color y figuras simples como circulos, rectangulos o triangulos.

Puede inspirar:

- Cartas que se vuelven polvo, ceniza, sangre seca o fragmentos al consumirse.
- Una transicion visual para exiliar, sacrificar o destruir un permanente.
- Confirmaciones breves en botones, contadores, emblemas de vida o energia.
- Efectos de integracion para cartas o tokens que se materializan.

Para Hostfall conviene portar la idea, no la implementacion:

- El repositorio es una demo JavaScript de 2018 que depende de `anime.js`; el proyecto ya tiene
  React, TypeScript, GSAP y su propio reloj de animacion.
- Un componente actual puede usar el `getBoundingClientRect()` del objetivo y montar un canvas en
  el portal global, sin envolver ni reemplazar el DOM real de la carta.
- Hay que escalar el canvas por pixel ratio, actualizar movimiento por delta time y desmontarlo
  limpiamente al completar o resetear.
- Las particulas solo presentan la transicion. El store sigue decidiendo cuándo la carta cambia
  realmente de zona.
- Sus condiciones de uso no son una licencia MIT convencional: antes de reutilizar codigo o
  recursos debe revisarse el apartado `License` del repositorio y conservar la atribucion exigida.

Este enfoque 2D es preferible para un efecto local y alineado al DOM. Three.js o un futuro
three.quarks tienen mas sentido cuando hay profundidad, shaders, trails largos o muchas particulas
compartiendo una escena. El consumo actual de Pacto de Medianoche fue diseñado especificamente y no
debe reemplazarse solo por adoptar esta referencia.

## Referencia Three.js: DecorativeBackgrounds

Repositorio: [Mamboleoo/DecorativeBackgrounds](https://github.com/Mamboleoo/DecorativeBackgrounds/)

Estado: **coleccion de ideas para portar; no integrar el demo completo**.

Son seis fondos WebGL de Codrops construidos con una version antigua de Three.js, TweenMax y, en
varios ejemplos, ruido simplex. Entre las tecnicas reutilizables hay:

- Miles de `Points` con atributos de posicion, color y tamaño, mas lineas entre vecinos cercanos.
- Raycasting para hacer reaccionar particulas individuales al cursor.
- Nubes de puntos construidas desde los vertices de un icosaedro.
- Deformacion organica de meshes y wireframes mediante ruido simplex animado.
- Esferas formadas por anillos o lineas ondulantes en vez de superficies solidas.
- Movimiento escalonado segun la posicion de cada vertice, util para colapsos y expansiones.

Podrian inspirar portales, orbes de energia, fondos de jefes, escudos, corrupcion alrededor de una
carta o una visualizacion ambiental durante un beat importante. Tambien muestran que una forma
abstracta convincente puede salir de pocos primitives bien animados, sin necesitar un sistema
general de particulas.

Para adaptarlos:

- Reescribir con `BufferGeometry` y las APIs de la version de Three.js que use el proyecto; los
  demos dependen de `Geometry`, `vertices` y otras APIs legacy.
- Sustituir el ticker global de TweenMax por el ciclo de vida del componente y limpiar tweens,
  listeners y recursos al desmontar.
- Evitar la busqueda cuadratica de vecinos del primer demo si se escala el numero de puntos; usar
  una grilla espacial o precalcular conexiones.
- Aplicar delta time y limitar pixel ratio. Algunas velocidades originales avanzan por frame.
- Portar la idea visual y revisar la licencia/atribucion de Codrops antes de reutilizar codigo.

## Referencia pendiente: CodePen `vYReorP`

Enlace: [krautgti/vYReorP](https://codepen.io/krautgti/pen/vYReorP)

El enlace queda guardado, pero su resultado y codigo aun no fueron inspeccionados. Clasificarlo
cuando exista una captura o una exportacion HTML/CSS/JS accesible; no inferir la tecnica solo por
la URL.

## Referencias personales fuera de Hostfall

### Reveal de marca personal

Enlace: [fand/MWMBdbj](https://codepen.io/fand/pen/MWMBdbj)

Reservado como referencia para el reveal de la marca personal de Arky cuando desarrolle su propio
juego. No pertenece a Hostfall y no debe usarse para definir el lenguaje visual de sus cartas,
HUD o efectos. Conservar el enlace y esta intencion juntos para no perder su contexto.

Repositorio relacionado: [fand/vfx-js](https://github.com/fand/vfx-js)

VFX-JS aplica efectos WebGL a elementos HTML normales como imagenes y video. Incluye bindings para
React y efectos componibles, por lo que queda guardado como posible base tecnica para reproducir o
adaptar el reveal de marca anterior. Tiene licencia MIT. No es una dependencia de Hostfall ni debe
instalarse en este proyecto solo por conservar la referencia.

## Referencia de shader

[Three.js `webgpu_tsl_vfx_flames.html`](https://github.com/mrdoob/three.js/blob/master/examples/webgpu_tsl_vfx_flames.html)
es una buena referencia visual para ruido procedural desplazado por tiempo, mascaras suaves y
billboards organicos. Sus ideas se pueden portar a `ShaderMaterial` WebGL, como se hizo en Drenar
la Esencia; no se debe copiar su implementacion TSL/WebGPU directamente mientras el renderer
actual siga en WebGL.
