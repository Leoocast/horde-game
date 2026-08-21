import { summarizeAttempt } from "../../src/history/attemptNarrative";

const localized = (es, en) => Object.freeze({ es, en });

export const ATTEMPT_NARRATIVE_FIXTURES = Object.freeze([
  Object.freeze({
    id: "elarion-graveless-defeat",
    title: "El Campo vacío antes del golpe",
    chroniclerDeck: "Pacto de Elarion",
    hostDeck: "Alzamiento de los Sinsepulcro",
    note: "Derrota con presión de combate; el resumidor no atribuye el desenlace a un solo Eco.",
    facts: Object.freeze({
      outcome: "defeat",
      turnNumber: 6,
      milestones: Object.freeze([
        Object.freeze({
          kind: "first-surge-field",
          turnNumber: 3,
          echoCount: 0,
          sourceCount: 2,
        }),
        Object.freeze({
          kind: "unblocked-attack",
          turnNumber: 6,
          attackerCount: 1,
          totalDamage: 5,
          attackerName: localized("Titán Sinsepulcro", "Graveless Titan"),
        }),
        Object.freeze({
          kind: "direct-life-loss",
          turnNumber: 5,
          amount: 4,
        }),
        Object.freeze({ kind: "unused-reserve", amount: 2 }),
      ]),
    }),
  }),
  Object.freeze({
    id: "court-varka-defeat",
    title: "Un intento sin un momento que contar",
    chroniclerDeck: "Corte del Eclipse Carmesí",
    hostDeck: "Legión de Varka",
    note: "Derrota ordinaria sin una gran jugada; la Crónica guarda silencio cuando sólo conoce la Reserva.",
    facts: Object.freeze({
      outcome: "defeat",
      turnNumber: 5,
      milestones: Object.freeze([
        Object.freeze({ kind: "unused-reserve", amount: 3 }),
      ]),
    }),
  }),
  Object.freeze({
    id: "elarion-graveless-victory",
    title: "Cierre de Vaelor",
    chroniclerDeck: "Pacto de Elarion",
    hostDeck: "Alzamiento de los Sinsepulcro",
    note: "Victoria con una fuente de cierre explícita y dos hitos anteriores comprobables.",
    facts: Object.freeze({
      outcome: "victory",
      turnNumber: 9,
      milestones: Object.freeze([
        Object.freeze({
          kind: "victory-source",
          sourceKind: "archive-attack",
          sourceName: localized("Vaelor, Guardián Esmeralda", "Vaelor, Emerald Guardian"),
          amount: 3,
          turnNumber: 9,
        }),
        Object.freeze({
          kind: "multi-target-effect",
          sourceName: localized("El Juicio de Elarion", "The Judgment of Elarion"),
          targetCount: 3,
          effect: "destroy",
          turnNumber: 7,
        }),
        Object.freeze({
          kind: "host-archive-threshold",
          remainingEchoes: 4,
          turnNumber: 8,
        }),
      ]),
    }),
  }),
  Object.freeze({
    id: "court-varka-victory",
    title: "La Corte sostuvo cuatro combates",
    chroniclerDeck: "Corte del Eclipse Carmesí",
    hostDeck: "Legión de Varka",
    note: "Victoria que prioriza el cierre, un efecto múltiple y una secuencia de combate.",
    facts: Object.freeze({
      outcome: "victory",
      turnNumber: 8,
      milestones: Object.freeze([
        Object.freeze({
          kind: "combat-streak",
          echoName: localized("Duelista del Eclipse", "Duelist of the Eclipse"),
          count: 4,
          action: "won",
          turnNumber: 7,
        }),
        Object.freeze({
          kind: "multi-target-effect",
          sourceName: localized("Drenar la Esencia", "Drain Essence"),
          targetCount: 3,
          effect: "minus-one-counters",
          turnNumber: 6,
        }),
        Object.freeze({
          kind: "victory-source",
          sourceKind: "echo-effect",
          sourceName: localized(
            "Mirevna, Condesa del Eclipse Carmesí",
            "Mirevna, Countess of the Crimson Eclipse",
          ),
          turnNumber: 8,
        }),
      ]),
    }),
  }),
  Object.freeze({
    id: "court-graveless-victory",
    title: "Una victoria sin protagonista nombrado",
    chroniclerDeck: "Corte del Eclipse Carmesí",
    hostDeck: "Alzamiento de los Sinsepulcro",
    note: "Partida ordinaria cuyo cierre sólo conoce el tipo y la cantidad del ataque final.",
    facts: Object.freeze({
      outcome: "victory",
      turnNumber: 7,
      milestones: Object.freeze([
        Object.freeze({
          kind: "victory-source",
          sourceKind: "archive-attack",
          amount: 2,
          turnNumber: 7,
        }),
        Object.freeze({
          kind: "host-archive-threshold",
          remainingEchoes: 2,
          turnNumber: 6,
        }),
      ]),
    }),
  }),
  Object.freeze({
    id: "elarion-varka-defeat",
    title: "La mayor pérdida directa",
    chroniclerDeck: "Pacto de Elarion",
    hostDeck: "Legión de Varka",
    note: "Derrota con dos golpes importantes, sin afirmar que explican por sí solos el resultado.",
    facts: Object.freeze({
      outcome: "defeat",
      turnNumber: 7,
      milestones: Object.freeze([
        Object.freeze({
          kind: "direct-life-loss",
          amount: 6,
          sourceName: localized("¡Liberen a la Legión!", "Unleash the Legion!"),
          turnNumber: 7,
        }),
        Object.freeze({
          kind: "unblocked-attack",
          attackerCount: 2,
          totalDamage: 5,
          turnNumber: 6,
        }),
      ]),
    }),
  }),
  Object.freeze({
    id: "elarion-varka-interrupted",
    title: "Historia interrumpida con hechos previos",
    chroniclerDeck: "Pacto de Elarion",
    hostDeck: "Legión de Varka",
    note: "Un cierre inesperado conserva hitos observados, pero nunca inventa victoria o derrota.",
    facts: Object.freeze({
      outcome: "interrupted",
      turnNumber: 4,
      milestones: Object.freeze([
        Object.freeze({
          kind: "first-surge-field",
          echoCount: 2,
          sourceCount: 3,
          turnNumber: 3,
        }),
        Object.freeze({
          kind: "multi-target-effect",
          sourceName: localized("Vaelor, Guardián Esmeralda", "Vaelor, Emerald Guardian"),
          targetCount: 2,
          effect: "damage",
          turnNumber: 4,
        }),
        Object.freeze({
          kind: "host-archive-threshold",
          remainingEchoes: 8,
          turnNumber: 4,
        }),
      ]),
    }),
  }),
  Object.freeze({
    id: "court-graveless-interrupted-fallback",
    title: "Interrupción sin hitos claros",
    chroniclerDeck: "Corte del Eclipse Carmesí",
    hostDeck: "Alzamiento de los Sinsepulcro",
    note: "Caso mínimo para comprobar que siempre existe una salida honesta.",
    facts: Object.freeze({
      outcome: "interrupted",
      turnNumber: 2,
      milestones: Object.freeze([]),
    }),
  }),
]);

function renderOutput(output) {
  const lines = [output.paragraph];
  if (output.marks.length > 0) {
    lines.push("", ...output.marks.map((mark) => `- ${mark}`));
  }
  return lines.join("\n");
}

export function renderAttemptNarrativeReviewDocument() {
  const lines = [
    "# Muestras del prototipo narrativo de Semillas del Destino",
    "",
    "> Fase 1 aislada. Estas salidas se generan sólo con hechos estructurados de prueba; todavía no se conectan a logs, partidas, historial ni UI.",
    "",
    "Cada ejemplo muestra el mismo conjunto de hechos en español e inglés. El idioma cambia las plantillas, no qué hitos fueron seleccionados.",
    "",
  ];

  ATTEMPT_NARRATIVE_FIXTURES.forEach((fixture, index) => {
    const spanish = summarizeAttempt(fixture.facts, "es");
    const english = summarizeAttempt(fixture.facts, "en");
    lines.push(
      `## ${index + 1}. ${fixture.title}`,
      "",
      `**Enfrentamiento:** ${fixture.chroniclerDeck} vs. ${fixture.hostDeck}`,
      "",
      fixture.note,
      "",
      "### Español",
      "",
      renderOutput(spanish),
      "",
      "### English",
      "",
      renderOutput(english),
      "",
    );
  });

  lines.push(
    "## Decisión pendiente",
    "",
    "Después de leer principalmente la sección en español, elegir una opción:",
    "",
    "1. **Relato aprobado:** conservar párrafo y marcas.",
    "2. **Hitos factuales:** conservar sólo las marcas como bullets.",
    "3. **Descartado:** mostrar únicamente resultado, fecha, turno y estado final disponibles.",
    "",
  );

  return lines.join("\n");
}
