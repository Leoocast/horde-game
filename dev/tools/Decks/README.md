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

`hunters` todavía es un preview sin deck runtime. Por eso su `studio.config.json` conserva sus
definiciones completas hasta que se implemente como deck jugable.

Cada carta de un deck jugable declara `flavorText.en`, `flavorText.es` y `showFlavorText` en su JSON
runtime. El estudio siempre recibe el flavor desde allí. Si `showFlavorText` es `false`, el texto
permanece en la proyección generada pero el renderer no lo imprime para dejar espacio a reglas
extensas. `studio.config.json` no puede declarar `flavorTextEs` ni `lore` para un deck runtime.

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
node dev/tools/Decks/export_cards.cjs monogreen
```

El exportador actualiza tanto `exported-png/` como `public/cards/` y registra la huella del lote.
No necesita servidor ni datos remotos.

## Contrato del arte

El arte fuente debe ser local y estar separado del PNG final, normalmente bajo
`public/cards/<deck>/art/`. El exportador se niega a trabajar si una carta apunta a un PNG de la
raíz de su propia carpeta de salida: eso produciría una carta anidada y destruiría la fuente al
sobrescribir el archivo.

Mono Green, Vampiros y Cazadores cumplen el contrato. Zombies y Trasgos permanecen bloqueados:
su arte original nunca se guardó localmente y sus configuraciones todavía apuntan a los PNG
completos. Esos dos lotes no deben exportarse hasta recibir arte fuente separado o ser sustituidos
durante la migración de contenido y procedencia.
