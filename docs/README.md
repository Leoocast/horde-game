# Documentación de Hostfall

Este índice separa contratos vigentes, contenido, planes todavía abiertos y registros generados.
`CLAUDE.md` sigue siendo la guía canónica para trabajar en el repositorio.

## Guías operativas

- [`guides/adding_cards.md`](guides/adding_cards.md) — flujo para añadir decks, cartas, reglas,
  presentación y assets.
- [`guides/testing.md`](guides/testing.md) — comandos, runner y cobertura automática.

## Referencias vigentes

- [`reference/game_vocabulary.md`](reference/game_vocabulary.md) — vocabulario público y técnico.
- [`reference/card_text_rules.md`](reference/card_text_rules.md) — redacción normativa de cartas.
- [`reference/animation_contracts.md`](reference/animation_contracts.md) — orden de beats, combate y VFX.
- [`reference/vfx_and_threejs.md`](reference/vfx_and_threejs.md) — implementación visual y referencias
  técnicas.

## Contenido jugable y previews

- [`content/chronicle_pact_of_elarion.md`](content/chronicle_pact_of_elarion.md) — identidad vigente de
  El Pacto de Elarion.
- [`content/host_uprising_of_the_graveless.md`](content/host_uprising_of_the_graveless.md) — identidad
  vigente de El Alzamiento de los Sinsepulcro.
- [`content/host_legion_of_varka.md`](content/host_legion_of_varka.md) — identidad vigente de La Legión
  de Varka.
- [`content/goblin_cards.md`](content/goblin_cards.md) — contratos PvE específicos de la Legión.
- [`content/previews/hunter_deck_preview.json`](content/previews/hunter_deck_preview.json) — concepto
  incompleto de Cazadores para Card Studio; no es un deck runtime.

La Corte del Eclipse Carmesí es un deck runtime jugable, pero su antiguo documento de preview fue
retirado. Su fuente de verdad es el JSON del deck.

## Planes abiertos

Estos documentos se conservan porque contienen decisiones o validaciones sin terminar:

- [`plans/learn_to_play_tutorial.md`](plans/learn_to_play_tutorial.md) — documento vivo del nuevo
  onboarding **Aprender a jugar**; fija el prólogo hasta su derrota predeterminada y el salto a una
  partida real preparada, y conserva las decisiones abiertas antes del análisis de implementación.
- [`plans/guided_tutorial_system_plan.md`](plans/guided_tutorial_system_plan.md) — framework escalable
  de pausa, bloqueo, resaltado y explicación; sus fases están cerradas y la primera versión jugable
  de la Primera Semilla se encuentra en QA e iteración pedagógica.
- [`plans/generated_look_remediation_plan.md`](plans/generated_look_remediation_plan.md) — corrección
  de las señales visuales que hacen leer la UI como generada; no iniciado.
- [`plans/seeds_of_destiny.md`](plans/seeds_of_destiny.md) — narrativa y persistencia futura.
- [`plans/game_modes.md`](plans/game_modes.md) — variantes futuras y compatibilidad de Chaos.
- [`plans/webgl_context_budget.md`](plans/webgl_context_budget.md) — migración implementada con QA
  visual final todavía pendiente.

## Registro de planes cerrados

- [`plans/ui_core_rules_clarity_plan.md`](plans/ui_core_rules_clarity_plan.md) — Fases 0 a 6
  implementadas y cerradas tras QA visual el 2026-08-11; sus contratos vigentes están resumidos en
  `CLAUDE.md`, `guides/testing.md` y `reference/animation_contracts.md`.

## Electron y release

- [`electron/migration_plan.md`](electron/migration_plan.md) — arquitectura y fases 0-6.
- [`electron/migration_tracking.md`](electron/migration_tracking.md) — estado operativo y blockers.
- [`electron/persistence.md`](electron/persistence.md) — contrato vigente de preferencias y resume.
- [`electron/release.md`](electron/release.md) — packaging Windows y gates comerciales pendientes.

## Datos documentales

Estos JSON no son notas sueltas: scripts o tests los consumen.

- `data/generated/` — inventarios reproducibles generados por scripts.
