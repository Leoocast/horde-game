import { SCENARIO_VERSION, cloneScenario, validateScenario, type ScenarioDefinition } from "./scenario";
import type { TimelineStep } from "./timeline";

const STORAGE_KEY = "hostfall-playground-scenarios:v1";

/** A saved scenario carries its recorded flow too: a flow without its starting state is not
 *  reproducible, so they are stored and exported as one unit. */
export type StoredScenario = {
  id: string;
  name: string;
  savedAt: string;
  definition: ScenarioDefinition;
  steps: TimelineStep[];
};

export function listStoredScenarios(): StoredScenario[] {
  const raw = readStorage();
  return [...raw].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Upserts by name: saving twice under the same name updates that entry instead of piling copies. */
export function saveStoredScenario(definition: ScenarioDefinition, steps: TimelineStep[]): StoredScenario {
  const entries = readStorage();
  const existing = entries.find((entry) => entry.name === definition.name);
  const saved: StoredScenario = {
    id: existing?.id ?? `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: definition.name,
    savedAt: new Date().toISOString(),
    definition: cloneScenario(definition),
    steps: structuredClone(steps),
  };
  writeStorage([...entries.filter((entry) => entry.id !== saved.id), saved]);
  return saved;
}

export function deleteStoredScenario(id: string): void {
  writeStorage(readStorage().filter((entry) => entry.id !== id));
}

export function toScenarioFile(entry: StoredScenario): string {
  return JSON.stringify({ ...entry, exportedBy: "hostfall-playground", version: SCENARIO_VERSION }, null, 2);
}

/**
 * Parses a scenario file. Everything here is untrusted input, so nothing is assumed: a file may be
 * a full export, a bare `ScenarioDefinition`, or garbage, and the caller always gets the problems
 * instead of a half-loaded scenario.
 */
export function parseScenarioFile(json: string): { entry?: StoredScenario; problems: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { problems: ["That file is not valid JSON."] };
  }
  if (typeof parsed !== "object" || parsed === null) return { problems: ["That file does not contain a scenario."] };

  const source = parsed as Record<string, unknown>;
  // A bare definition has `zones`; an export wraps it in `definition`.
  const definition = (typeof source.definition === "object" && source.definition !== null ? source.definition : source) as ScenarioDefinition;
  if (typeof definition.seed !== "string" || typeof definition.zones !== "object" || definition.zones === null) {
    return { problems: ["That file does not look like a playground scenario."] };
  }

  const problems = validateScenario(definition);
  if (problems.length > 0) return { problems };

  return {
    entry: {
      id: typeof source.id === "string" ? source.id : `imported-${Date.now()}`,
      name: definition.name || "Imported scenario",
      savedAt: typeof source.savedAt === "string" ? source.savedAt : new Date().toISOString(),
      definition,
      steps: Array.isArray(source.steps) ? (source.steps as TimelineStep[]) : [],
    },
    problems: [],
  };
}

function readStorage(): StoredScenario[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isStoredScenario) : [];
  } catch {
    // A corrupt entry must not take the whole screen down with it.
    return [];
  }
}

function writeStorage(entries: StoredScenario[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function isStoredScenario(value: unknown): value is StoredScenario {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === "string" && typeof entry.name === "string" && typeof entry.definition === "object" && entry.definition !== null;
}
