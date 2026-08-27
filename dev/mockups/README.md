# Maquetas de interfaz

Material de decisión visual. **Nada de esta carpeta se importa desde `src/` ni entra al paquete de
Steam**: son documentos HTML sueltos que se abren aparte del juego, igual que Card Studio vive fuera
del runtime.

## Ver las maquetas

```bash
node dev/mockups/serve.mjs
```

Sirve esta carpeta en `http://127.0.0.1:4321`. También hay una entrada `mockups` en
`.claude/launch.json`. Los archivos se pueden abrir directamente con doble clic, pero el servidor
evita las restricciones de `file://`.

Las maquetas que suben una imagen como textura WebGL **sólo funcionan servidas**: una imagen cargada
desde `file://` tiene origen opaco y `texImage2D` la rechaza. Por eso `serve.mjs` expone además el
alias de sólo lectura `/vendor/three.min.js`, que resuelve al Three.js de `node_modules`: la ruta
relativa `../../../node_modules/...` sirve al abrir con doble clic, pero cae fuera de la raíz del
servidor. Las maquetas WebGL prueban las dos rutas en ese orden.

## Estructura

```text
index.html          hub con todas las maquetas
serve.mjs           servidor estático
assets/fonts/       woff2 usados por las maquetas (subsets latin)
assets/ui_references/  capturas de referencia visual aportadas por el usuario
ui/                 exploraciones de interfaz
hud/                decisiones de HUD y disposición
vfx/                exploraciones de efectos
```

## Contenido

- `ui/play-entry-futures.html` — la bifurcación de **Jugar** en tres profundidades (capa sobre el menú,
  pantalla completa y sin menú intermedio), **Preparación** sin campo de Canon Seed con el número de Futuro
  como protagonista —duelo central y estandarte— y el modal de inscripción en dos formas, con su latido de
  confirmación y el choque simplificado a los tiempos reales de `EncounterTransition`. Reimplementa
  `hashSeed`, `futureCodeFromSeed` y el formato `HF1-PPP-HHH-XXD-XXX`, así que cada Futuro que muestra es el
  que produciría el juego; cambiar dificultad o Hueste recompone el número, igual que hará el runtime.
- `ui/chronicler-name-modal.html` — siete reemplazos interactivos de `ChroniclerNameModal`, construidos sólo
  con los tokens vigentes (`--hf-ui-*` y el material del menú principal) para retirar la paleta oliva del
  modal actual. Cada variante se escribe, se enfoca, se confirma y se vuelve a abrir sobre una silueta del
  menú; la barra superior cambia idioma, alterna primera apertura/reapertura y repite las entradas.
  La dirección elegida es **G · Umbral grabado**: la composición sin panel de F con el grabado de letra de B.
  Sus chispas se colocan midiendo el texto con `measureText` más `letter-spacing` y alineación, no con una
  estimación por número de caracteres; su selector superior compara en vivo las alternativas a la línea
  «Antes de la primera página».
- `ui/ui-typography.html` — diez conjuntos tipográficos sobre la piel actual, con muestras EN/ES y una
  prueba de encaje que mide cada cadena contra el ancho real de su hueco en `src/styles.css`.
- `ui/ui-kit.html` — seis pieles completas (botones, modales, paneles, controles, HUD).
- `ui/ui-actual-lacquer.html` — los componentes reales del juego en la piel actual y en laca azul.
- `ui/keyword-icons.html` — los once Rasgos y el icono de reserva con SVG propios, comparados contra
  el icono de `lucide-react` en uso, en tres familias de trazo y en el tamaño real de la insignia de
  24 px y de la píldora del preview.

- `vfx/surge-ember.html` — segunda ronda sobre la brasa elegida: cinco posiciones que apoyan el fuego en el
  estandarte en vez de colgarlo del hueco del medallón, cuatro direcciones no relacionadas con el fuego y un
  selector de palabra para comparar «Oleada» con Embate, Tromba, Avalancha, Estampida, Asalto, Desborde y el
  «Surge» inglés en el tamaño real del cartel.
- `vfx/surge-crest.html` — la Oleada sin el medallón de la calavera: seis remates para el canto superior
  del estandarte (vacío, muesca del propio marco, la grieta clavada, los rombos de la placa de Futuro, marcas
  de cuenta y una brasa viva), cada uno con su entrada afinada, reloj y control de velocidad. Comparte escenario
  con las rondas anteriores `surge-entrance`, `surge-current-variations`, `surge-variants` y `surge-typographic`.

### Fuentes

`assets/fonts/` contiene dos grupos. Los `*-latin.woff2` son copias de
`public/fonts/pact-of-elarion/`, las que el juego ya empaqueta. El resto son candidatas descargadas de
Google Fonts, **todas OFL o Apache 2.0**, subset latin (cubre ñ, tildes, ¿ ¡ « »): Marcellus,
Marcellus SC, Cormorant Garamond, Cormorant SC, Alegreya, Alegreya SC, EB Garamond, Spectral,
Spectral SC, IM Fell English SC, Almendra SC, Cardo, Barlow Condensed, Archivo Narrow,
Fira Sans Condensed y Bebas Neue. Si alguna se adopta, hay que copiar su woff2 a `public/fonts/` y
añadir el `OFL.txt` correspondiente al paquete: la licencia exige distribuir su texto junto al
archivo de fuente.

## Cómo están construidas

Sin un solo archivo de imagen, para no comprometer arte que todavía no existe:

- Las superficies (piedra, cuero, oro martillado, pergamino) salen de filtros SVG procedurales:
  `feTurbulence` genera el ruido y `feDiffuseLighting` lo ilumina como mapa de relieve.
- Los marcos ornamentados son `border-image` en 9-slice con SVG en data URI, así que las esquinas
  no se deforman al cambiar el ancho.
- Las fuentes reales del juego —Cinzel Decorative, Cinzel, Lora, Oswald— van empotradas en base64
  para que la maqueta se vea igual en cualquier máquina.
- El fondo es un marcador procedural, **no** el `background.jpg` actual, que es provisional.
- La paleta es la de `src/styles.css`: `#d6a44c`, `#f0e5c4`, `#8f2e16`, `#4d7f1d`.

Contexto y justificación de la técnica en
[`docs/plans/generated_look_remediation_plan.md`](../../docs/plans/generated_look_remediation_plan.md).

## Regenerar

`main-menu.html` se compila desde una plantilla más la incrustación de fuentes. El archivo publicado
ya es autónomo: para retocarlo, editarlo directamente y, si hace falta rehacerlo desde cero, el
paso de incrustación sólo reemplaza los marcadores `__CINZEL__`, `__CINZEL_DEC__`, `__LORA__` y
`__OSWALD__` por el base64 de `public/fonts/pact-of-elarion/`.
