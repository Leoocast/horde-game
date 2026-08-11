# Marcos de Hostfall — laboratorio

Carpeta independiente. **No toca `Desktop/HordeGame`**: el repo sólo se leyó para respetar su
gramática visual. Las fuentes están copiadas aquí (`fonts/`) para que la carpeta abra sola.

Dos marcos hermanos sobre el mismo arte:

- **Común** (`preview/comun.png`) — el marco metálico y las bandas de siempre, con el arte a
  sangre por detrás en vez de un recuadro de 540 px. El texto va sobre **papel claro con tinta
  negra**. El recuadro tiene alto mínimo (430 px) para que todas las comunes compartan silueta
  aunque el texto sea corto.
- **Full art · Crónica** (`preview/cronica.png`) — sin marco: filo de oro, humo desde abajo y
  tipografía grabada directamente sobre el arte.

En los dos, los stats viven en la franja de arte y la línea de tipo separa el arte del texto.

## Decisiones de esta versión

- **Id de coleccionista:** `HFA001`.
- **Pie de carta:** `HFA001 · © HOSTFALL 2026` abajo a la izquierda y `ARTE · DEAN SPENCER` abajo
  a la derecha, con la misma tipografía. Nunca comparten línea con el texto de reglas.
- **Stats:** una sola chapa para los dos marcos (`.stats` en la base del CSS), teñida con el
  verde de la carta y borde de oro, en la esquina derecha del arte justo encima de la banda de
  tipo.
- **Cuadro de texto:** medidas del estudio (`padding: 34px 39px 55px`, efecto `43px/1.35`, lore
  `36px/1.42`), un `.effect-paragraph` por regla con `0.36em` entre ellas, y el separador con su
  ◆ exactamente como `.tcg-divider` (`margin: 23px 0 20px`, línea al 56 %, rombo al 72 %).
- **H de Hostfall:** en las dos, `700 350px "Cinzel Decorative"` centrada y casi transparente,
  igual que en `legion_of_varka` y `uprising_of_the_graveless`.
- **Cabecera de la común:** la banda del nombre empieza a la derecha del orbe y su borde lo
  rodea. El orbe (90 px, centro en `(84, 83)`) queda por fuera; la banda lleva una máscara
  radial concéntrica de radio 54 que se come el relleno y el borde recto, y el arco de oro lo
  dibuja `.card--comun .head::before` (anillo de radio 55–57, recortado por el `overflow` de la
  banda). Mover el orbe es mover esos tres números a la vez.
- **Orbe de coste:** sin el aro interior; queda sólo el borde exterior azul.
- La opción del relicario (arco ojival y pergamino recortado) se eliminó.

## Qué hay

| Archivo | Para qué |
| --- | --- |
| `index.html` | Los datos de la carta y las dos plantillas. Abrir en el navegador para verlas. |
| `full-art.css` | Base compartida + un bloque por marco (`.card--comun`, `.card--cronica`). |
| `render.cjs` | `node render.cjs` → PNG 976×1360 de cada marco en `preview/`. |
| `art.jpg` | El arte (600×840, casi la misma proporción que la carta: entra a sangre sin recortar nada). |

## La carta de prueba

Inventada, pero escrita con el vocabulario del juego (`docs/reference/game_vocabulary.md`):

- **Ilvara, Filo del Juramento** · coste 6 · 5/5
- Tipo: `Eco — Humano Caballero` en la común, `Eco de Crónica — Humano Caballero` en la full art
- Texto: `Ímpetu. Letal.` / `Cuando Invocas este Eco, destierra un Eco enemigo con Aguante 4 o menos.`
- Lore: *Juró arder antes que dejarse olvidar. El Archivo la recuerda ardiendo.*

Todo se cambia en el objeto `card` de `index.html`.

## Paleta

El arte manda: llama verde jade sobre cielo frío y campo carmesí. El acento es `--jade: #2f7d58`
con `--jade-bright: #9ff0b2` (y `--jade-ink: #123a2b` para las palabras clave sobre papel), más
el oro y el metal del estudio. El orbe de coste sigue siendo el azul de siempre, como en el repo,
donde el coste nunca se recolorea por tema.

## Si termina gustando

Portarlo al estudio es añadir un perfil en `LAYOUT_PROFILES` (`deck-card-studio.js`) más su
bloque en `deck-card-studio.css`, igual que ya hacen `court_of_the_crimson_eclipse` y `legion_of_varka`. Ojo
con el contrato de exportación: hashear `public/cards/**/*.png` antes, re-exportar después y
exigir cero diferencias en los decks que no se tocaron.
