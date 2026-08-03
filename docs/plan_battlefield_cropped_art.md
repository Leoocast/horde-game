# Plan para 2026-08-03: encuadre de arte en cartas recortadas

Estado: propuesto, todavía no implementado.

## Objetivo

Permitir que cada carta recortada del campo use el arte fuente cargado en Card Studio y tenga su
propio zoom y traslación. El encuadre se editará al lado de la carta imprimible, se guardará como
datos y se aplicará de forma consistente dentro del juego.

Este cambio no debe alterar el diseño imprimible, la exportación a PNG ni los encuadres actuales de
mano, hover, detalles o colección.

## Estado actual confirmado

- El arte fuente ya se guarda en `public/cards/<deck>/art/`; no hace falta copiarlo a otra carpeta.
- `studio.config.json` conserva `artCrop` y el encuadre de impresión `artFrame`.
- El juego consume `imageUrl` desde los manifests `*_images.json`. Actualmente esas rutas apuntan
  al PNG de la carta completa, no al arte fuente.
- Todos los Ecos del campo se muestran recortados porque
  `ALWAYS_CROP_BATTLEFIELD_CREATURE_CARDS` está activo.
- El recorte actual aplica el mismo CSS a todas las cartas: imagen al `140%` y una traslación fija.
  Esa regla global es la causa de que algunos sujetos queden mal encuadrados.
- La verificación de PNG usa hashes estrictos. Mezclar un ajuste exclusivo del juego con los datos
  de impresión haría que una carta apareciera como obsoleta aunque su PNG no haya cambiado.

## Diseño recomendado

### Una imagen fuente, dos encuadres independientes

Se reutilizará `artCrop` como único bitmap fuente, pero habrá dos marcos:

- `artFrame`: encuadre de la carta imprimible, ya existente.
- `battlefieldArtFrame`: encuadre de la carta recortada dentro del campo.

Modificar uno nunca debe mover el otro.

### Persistencia sin romper los hashes de impresión

Guardar `battlefieldArtFrame` en un sidecar por deck, administrado por el mismo Card Studio:

```text
dev/tools/Decks/<deck>/game-art.config.json
```

Ejemplo:

```json
{
  "schemaVersion": "1.0.0",
  "cards": {
    "first_dew_gatherers": {
      "battlefieldArtFrame": { "zoom": 1, "x": 0, "y": 0 }
    }
  }
}
```

El usuario seguirá guardando todo con el mismo botón del taller. El servidor validará y escribirá
el config de impresión y este sidecar como una sola operación lógica. El sidecar no formará parte
de la huella de los PNG imprimibles.

Card Studio generará además una proyección comprobable para runtime, por ejemplo:

```text
src/data/generated/card-studio-game-art.generated.json
```

Esa proyección contendrá por carta la URL pública de `artCrop` y `battlefieldArtFrame`. El juego no
leerá archivos bajo `dev/` en runtime.

### Coordenadas estables

La vista recortada actual tiene una proporción aproximada de `488 × 434` (`1 / 0.89`). Esa será la
ventana canónica del editor.

- `zoom`: multiplicador sobre un `cover` inicial.
- `x` y `y`: píxeles de referencia dentro de la ventana canónica.
- Runtime convertirá esos píxeles a proporciones mediante una función pura para que el encuadre se
  conserve cuando la carta cambie de tamaño.
- Valores por defecto: `{ "zoom": 1, "x": 0, "y": 0 }`.
- No se escribirá un override mientras la carta conserve esos valores.

Esto mantiene controles familiares en píxeles sin introducir un desplazamiento distinto según la
resolución de pantalla.

## UX de Card Studio

En el escenario central aparecerán dos vistas claramente etiquetadas:

1. `Carta impresa`: el preview actual, sin cambios.
2. `En juego`: una ventana horizontal con la misma proporción que la carta recortada del campo.

La segunda vista mostrará el arte fuente, el header compacto y los stats como guías de las zonas
que deben permanecer legibles. No será un segundo renderer de reglas ni de la carta imprimible.

Dentro de la pestaña `Arte` habrá dos grupos:

- `Encuadre impreso`: Zoom, Horizontal y Vertical actuales.
- `Encuadre en juego`: Zoom, Horizontal, Vertical y Restablecer.

Comportamiento:

- Arrastrar sobre `Carta impresa` modifica sólo `artFrame`.
- Arrastrar sobre `En juego` modifica sólo `battlefieldArtFrame`.
- La rueda aplica zoom a la vista bajo el cursor.
- Cambiar de carta o deck refresca ambas vistas.
- Cargar otra imagen actualiza las dos vistas porque comparten el mismo arte.
- En pantallas estrechas, `En juego` baja debajo de la carta para no devolver el overflow al panel
  central.

## Flujo de datos propuesto

```text
arte cargado en public/cards/<deck>/art/
        +
studio.config.json (artCrop y artFrame imprimible)
        +
game-art.config.json (battlefieldArtFrame)
        |
        v
proyección runtime generada y validada
        |
        v
cardImages.ts -> Battlefield -> Card
        |
        v
arte fuente recortado + header/stats actuales del juego
```

El PNG final seguirá usándose en mano, hover, detalles, colección, animadores y cualquier contexto
que hoy presenta la carta completa.

## Trabajo de implementación

### 1. Contrato de datos

- Definir y validar `BattlefieldArtFrame`.
- Crear lectura/escritura de `game-art.config.json` por deck.
- Normalizar defaults y rechazar `NaN`, zoom no positivo o traslaciones fuera de límites seguros.
- Crear la proyección runtime y añadirla al modo `--check` de los datos del estudio.

### 2. Integración de assets

- Convertir cada `artCrop` relativo a su URL pública `/cards/<deck>/art/<archivo>`.
- Extender `CardDetails` con `battlefieldArtUrl` y `battlefieldArtFrame`.
- Validar que toda URL sea local y que el archivo exista.
- Mantener `imageUrl` como el PNG completo vigente.

### 3. Renderer del campo

- Hacer que sólo los Ecos dentro de la fila recortada usen `battlefieldArtUrl`.
- Aplicar `cover`, zoom y traslación mediante variables CSS derivadas de una función pura.
- Separar la clase de chrome recortado de `card-image-native-hd`; el header y los stats no deben
  depender de si el bitmap es un PNG completo o arte fuente.
- Conservar overlays, estados, daño, buffs, targeting, tap, vuelo y animaciones existentes.
- Mantener el PNG completo como fallback si una carta todavía no tiene arte fuente válido.

### 4. UI del taller

- Añadir el preview `En juego` junto al preview imprimible.
- Incorporar controles y drag/rueda independientes.
- Guardar, descartar y detectar cambios por deck igual que los controles actuales.
- Hacer que el servidor guarde ambos configs de manera segura y regenere la proyección runtime.

### 5. Migración y revisión visual

- Crear defaults para las 61 cartas vigentes sin escribir overrides innecesarios.
- Revisar los cuatro decks, incluidos Ecos full art y tokens.
- Ajustar manualmente sólo las cartas cuyo sujeto no quede bien con `cover` centrado.
- Confirmar la presentación en al menos tres anchos de ventana.

### 6. Pruebas y protecciones

- Test de normalización y round-trip de `BattlefieldArtFrame`.
- Test de conversión de píxeles canónicos a variables proporcionales.
- Test de que la proyección runtime coincide con `artCrop` y encuentra cada archivo.
- Test de que una modificación exclusiva de `game-art.config.json` no vuelve obsoletos los PNG.
- Regresiones de fallback y de selección exclusiva para Ecos recortados.
- Ejecutar `card-studio-data --check`, `check-card-assets`, deck lint, TypeScript, suite completa y
  build.
- QA manual del campo de ambos bandos; el proyecto no tiene tests DOM ni snapshots visuales.

## Criterios de aceptación

- El preview `En juego` coincide con el encuadre visible en el campo a distintos tamaños.
- Cada carta puede guardar zoom, X e Y independientes.
- El juego usa el arte subido al taller, sin duplicarlo.
- El header, stats y estados runtime permanecen nítidos y por encima del arte.
- Mano, hover, detalles, colección y animadores siguen usando el PNG completo.
- Las full art impresas no requieren una ruta especial en el campo.
- Guardar sólo un encuadre de juego no altera ni invalida la exportación imprimible.
- Una carta sin configuración usa un default seguro; una carta sin arte usa el PNG completo.

## Preguntas para confirmar antes de implementar

1. ¿El nuevo arte recortado debe aplicarse únicamente a los Ecos en el campo? Recomendación: sí;
   Energías y otros permanentes conservan su presentación actual.
2. ¿Mano, hover y ventana de detalles deben seguir mostrando el PNG completo? Recomendación: sí,
   para conservar toda la información imprimible.
3. ¿Está bien que los controles muestren píxeles sobre una referencia fija de `488 × 434` aunque
   internamente el juego los convierta a proporciones? Recomendación: sí, porque mantiene la edición
   precisa y el resultado responsive.

## Sugerencias adicionales

- Añadir un botón `Copiar encuadre` sólo después de probar la primera tanda; por la diferencia de
  proporciones, copiar `artFrame` directamente probablemente no produzca un buen resultado.
- Mantener una sola imagen fuente y dos encuadres. Generar otro bitmap recortado por carta añadiría
  assets, hashes y riesgo de divergencia sin aportar calidad visible.
- No reutilizar el `140%` y la traslación fija actuales como default. Con arte fuente, `cover`
  centrado es un punto de partida más predecible y cada excepción quedará explícita en datos.
