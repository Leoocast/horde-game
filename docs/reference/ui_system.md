# Sistema de UI player-facing

Esta referencia fija el contrato visual de la interfaz que ve el jugador. La fuente de verdad es el
runtime vigente dentro de `src/`: no se toman decisiones visuales desde mockups, VFX ni desde la piel
de otras herramientas de desarrollo.

## Fuentes canónicas

En orden:

1. `src/ui-system.css` define tokens y primitivas compartidas (`hf-ui-*`). Son estilos runtime y se
   cargan tanto en development como en release.
2. Los componentes reales de `src/components/` definen su composición y sus variantes semánticas.
3. `src/ui-reference/UIReferenceScreen.tsx` monta esos mismos componentes y
   `uiReferenceCatalog.ts` documenta el archivo y los lugares reales donde se usan.

La sección **Modales y diálogos** abre cada superficie a tamaño real desde
`RuntimeModalGallery.tsx`. Las muestras controladas (`GameConfirmationDialog`, `OpeningHandModal`,
`HandLimitModal` y los paneles de resultado) también son consumidas por sus wrappers runtime: no son
copias creadas para la herramienta. Sólo puede haber una muestra modal abierta a la vez.

UI Reference no debe contener una copia de un componente para que se le parezca. Si una superficie
no puede montarse sin mutar una partida o sin inventar estado, se registra como **Revisar en
contexto** y se valida en su pantalla runtime.

## Alcance

Incluye:

- navegación y ajustes player-facing;
- mazos, cartas y sus átomos;
- tablero, HUD, overlays, feedback y tutorial;
- variantes de producto que realmente se alcanzan desde `App`.

Excluye explícitamente:

- `dev/mockups` y cualquier otro mockup;
- VFX, shaders, materiales, animadores y tratamiento cinematográfico;
- Playground, Audio Lab, Seed Explorer y el aspecto de sus herramientas;
- exports sin consumidor runtime. `InfoMenu`, `PhaseControls` y `GameStatusBadge` no son canónicos
  mientras sigan inalcanzables.

`CardContextMenu` y `CardDetailsModal` tampoco forman parte del inventario mientras ningún flujo
runtime los monte. Que el archivo exista no lo convierte en UI vigente.

## Abrir la referencia

En development, abrir **UI Reference** desde el dock de herramientas del home. Es una pantalla lazy
e independiente, eliminada por compilación en release. No existe una query string ni una ruta
oculta para abrirla en producción.

Cada ficha visible debe mostrar siempre:

- nombre del componente o primitiva;
- archivo fuente;
- **Dónde se usa** con las pantallas o paneles runtime;
- estado: **Canónico**, **Variante de producto** o **Revisar en contexto**.

Los resultados abren únicamente su panel de UI compartido. Las secuencias cinematográficas de
victoria/derrota siguen perteneciendo al runtime, pero sus animadores y VFX no se ejecutan ni se
catalogan aquí. Los diálogos tutoriales que dependen de anchors vivos de Board aparecen registrados
como **Revisar en contexto** en vez de falsificar su posición.

## Material compartido

La base vigente es carbón frío y negro verdoso, línea de oro apagado, texto marfil/dorado y esquinas
de 2 px. `hf-ui-panel`, `hf-ui-panel-soft`, `hf-ui-title`, `hf-ui-button` y `hf-ui-divider` son
independientes de `.game-screen`; de ese modo un portal o un montaje aislado no puede recuperar el
skin marrón anterior por accidente.

No usar `old-panel`, `old-panel-soft`, `old-title`, `old-button`, `old-input` ni `old-select` en UI
nueva. Las definiciones legacy permanecen sólo como compatibilidad temporal para código no
canónico o trabajo existente todavía en migración.

Los CTA de expedición, acción primaria de diálogo y continuar tutorial comparten
`--hf-ui-action-primary`. Sus tamaños pueden variar por contexto, pero el material no se redefine.

## Variantes deliberadas

Homologar material, borde, tipografía, foco y elevación no significa borrar semántica. Se conservan
como variantes explícitas:

- Cronista frente a Hueste;
- colores de Crónica/Hueste y temas de deck;
- energía, vida, daño, ataque/defensa, buff/debuff y Rasgos;
- confirmación, cancelación, peligro y tonos de toast;
- tooltip, popover y modal como elevaciones distintas;
- pantallas rituales, resultados y superficies impresas de carta.

Si una diferencia no responde a uno de esos roles, se considera drift y debe converger al material
compartido.

## Flujo para cambios

Al crear o cambiar UI player-facing reutilizable:

1. localizar todos sus consumidores runtime;
2. reutilizar tokens/primitivas de `ui-system.css` en el componente real;
3. añadir o actualizar su entrada en `UI_REFERENCE_CATALOG`, incluido **Dónde se usa**;
4. montar el componente real como specimen cuando sea seguro; si no, marcarlo para revisión en
   contexto sin fabricar un mockup;
5. verificar TypeScript, la suite y el build/audit de release cuando cambie el gate dev-only.

El CSS de `UIReferenceScreen.css` sólo organiza el catálogo y debe permanecer namespaceado con
`.ui-reference-*`. Nunca puede redefinir una clase player-facing global: el chunk lazy permanece
cargado al volver al menú durante la misma sesión.
