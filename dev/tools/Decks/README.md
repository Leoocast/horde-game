# Estudios de cartas

Los estudios producen los PNG completos que consume el juego. No son una segunda fuente editable
de reglas.

## Flujo de datos

Para un deck jugable:

```text
src/data/decks/**/<deck>.json        reglas, nombre, coste, stats, cantidad y flavor
dev/tools/Decks/<deck>/studio.config.json
                                      arte, línea de tipo y ajustes visuales
scripts/card-studio-data.mjs          combina y valida ambas fuentes
deck-data.generated.js                proyección generada; no se edita
index.html                            renderer visual
public/cards/<deck>/*.png             salida consumida por el juego
dev/tools/Decks/generation-manifest.json hashes de entradas y salidas; no se distribuye
```

Los cinco estudios comparten un solo renderer, `deck-card-studio.js`, y una sola hoja estructural,
`deck-card-studio.css`. La geometría, tipografía y jerarquía visual son el diseño final de
`test_full_Art`; los decks sólo cambian variables de color, motivo e insignia. Añadir un deck no
implica copiar HTML, JavaScript ni CSS de carta.

`hunters` todavía es un preview sin deck runtime. Por eso su `studio.config.json` conserva sus
definiciones completas hasta que se implemente como deck jugable.

Cada carta de un deck jugable declara `flavorText.en`, `flavorText.es` y `showFlavorText` en su JSON
runtime. El estudio siempre recibe el flavor desde allí. Si `showFlavorText` es `false`, el texto
permanece en la proyección generada pero el renderer no lo imprime para dejar espacio a reglas
extensas. `studio.config.json` no puede declarar `flavorTextEs` ni `lore` para un deck runtime.

El JSON runtime también declara el `collectorId` impreso. Para el Acto I la serie es continua:
`HFA1001`, `HFA1002`, etc. El pie de carta muestra ese ID junto a `© HOSTFALL 2026`. El crédito de
ilustración se coloca por separado dentro del borde inferior del arte con un icono de imagen y el
nombre del artista, para que el artista no parezca autor o propietario del juego. El nombre por defecto vive en
`defaultArtist` dentro de `studio.config.json`; una carta puede reemplazarlo con `artist`.

El renderer deriva tres variantes sin duplicar markup por deck:

- carta común: marco metálico, panel de reglas y motivo del deck;
- *full art*: sin marco metálico ni motivo; se reserva a Ecos con el modificador runtime
  `CHRONICLE` y a tokens seleccionados;
- token: no imprime reglas ni flavor y coloca los stats más abajo.

Un token se selecciona como *full art* con `"fullArt": true` en su entrada del manifest de imágenes
runtime (`src/data/decks/**/*_images.json`). Esa excepción es visual; `TOKEN` y `CHRONICLE` siguen
siendo propiedades de reglas del JSON runtime. Cazadores, mientras siga siendo sólo un preview sin
JSON runtime, declara `isChronicle` y `fullArt` en su configuración de presentación.

## Card Studio

El editor visual vive en una sola página para todos los decks. Necesita un servidor local
porque una página abierta con `file://` no puede escribir en disco:

```powershell
node dev/tools/Decks/studio-server.cjs
```

Después, abrir `http://127.0.0.1:5178/dev/tools/Decks/studio.html`. Permite elegir deck y carta,
cargar la imagen de una carta, encuadrarla dentro de su marco (arrastrar para mover, rueda para
zoom, o los campos en píxeles) y desplazar el motivo de cabecera, banda de tipo, gema y stats.

Lo que se guarda son datos, no HTML:

- `artFrame` por carta en `studio.config.json`: `{ "zoom": 1.35, "x": 24, "y": -18 }`.
  Los píxeles son los de la carta a tamaño real (976×1360), no los del preview.
- `motif` por deck, con los slots `head`, `gem`, `band` y `stats`.

Una carta sin ajustes no emite datos de encuadre. El estudio no toca los `index.html`: la vista previa es un iframe con el mismo documento
que fotografía el exportador, así que preview y PNG no pueden divergir.

La imagen que se carga se escribe en `public/cards/<deck>/art/<carta>.<ext>` y `artCrop` pasa a
apuntar ahí. Si el arte anterior tenía otra extensión, el archivo viejo se conserva: hay que
borrarlo a mano si sobra. Una carta sin arte se dibuja con un marcador y el exportador se niega a
generarla hasta que se le cargue una imagen.

Si se edita un nombre, un coste o una regla en `src/data/decks/`, basta con el botón *Releer JSON*
(o recargar la página): el servidor vuelve a proyectar los datos y regenera
`deck-data.generated.js` antes de responder, así que la lista y la carta nunca muestran versiones
distintas. Con el estudio abierto no hace falta `card-studio-data.mjs --write` a mano.

El servidor sólo sirve para editar. La exportación no lo necesita.

## Comandos

Actualizar las proyecciones después de editar un deck o su presentación:

```powershell
node scripts/card-studio-data.mjs --write
```

Comprobar que las proyecciones y los PNG coinciden con sus fuentes:

```powershell
node scripts/card-studio-data.mjs --check
node scripts/check-card-assets.mjs
```

Exportar un deck:

```powershell
node dev/tools/Decks/export_cards.cjs last_rain
```

El exportador actualiza tanto `exported-png/` como `public/cards/` y registra la huella del lote.
No necesita servidor ni datos remotos.

## Contrato del arte

El arte fuente debe ser local y estar separado del PNG final, normalmente bajo
`public/cards/<deck>/art/`. El exportador se niega a trabajar si una carta apunta a un PNG de la
raíz de su propia carpeta de salida: eso produciría una carta anidada y destruiría la fuente al
sobrescribir el archivo.

Los cuatro decks jugables cumplen el contrato y pasan la verificación de frescura. Sus estudios no
apuntan a los PNG completos. Cazadores conserva también sus fuentes locales, aunque todavía es un
preview sin deck runtime ni lote de PNG finales.
