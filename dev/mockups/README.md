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

- `ui/ui-typography.html` — diez conjuntos tipográficos sobre la piel actual, con muestras EN/ES y una
  prueba de encaje que mide cada cadena contra el ancho real de su hueco en `src/styles.css`.
- `ui/ui-kit.html` — seis pieles completas (botones, modales, paneles, controles, HUD).
- `ui/ui-actual-lacquer.html` — los componentes reales del juego en la piel actual y en laca azul.

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
