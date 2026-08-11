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

## Contenido

- `main-menu.html` — tres direcciones para el menú principal, conmutables desde la barra superior.

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
