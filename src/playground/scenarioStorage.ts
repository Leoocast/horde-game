import { BLANK_SCENARIO, SCENARIO_VERSION, cloneScenario, validateScenario, type ScenarioDefinition } from "./scenario";
import type { TimelineStep } from "./timeline";

const BOARD_STORAGE_KEY = "hostfall-playground-boards:v1";
const REPLAY_STORAGE_KEY = "hostfall-playground-replays:v1";
const LEGACY_STORAGE_KEY = "hostfall-playground-scenarios:v1";
const BOARD_FILE_VERSION = 1;

export type StoredBoard = {
  id: string;
  name: string;
  savedAt: string;
  definition: ScenarioDefinition;
};

export type StoredReplay = {
  id: string;
  name: string;
  savedAt: string;
  definition: ScenarioDefinition;
  steps: TimelineStep[];
};

/** Backward-compatible exported-file shape used by older saved playground scenarios. */
export type StoredScenario = StoredReplay;

export function listStoredBoards(): StoredBoard[] {
  return readEntries<StoredBoard>(BOARD_STORAGE_KEY, isStoredBoard);
}

export function saveStoredBoard(definition: ScenarioDefinition): StoredBoard {
  const entries = listStoredBoards();
  const existing = entries.find((entry) => entry.name === definition.name);
  const saved: StoredBoard = {
    id: existing?.id ?? makeId("board"),
    name: definition.name,
    savedAt: new Date().toISOString(),
    definition: cloneScenario(definition),
  };
  writeEntries(BOARD_STORAGE_KEY, [...entries.filter((entry) => entry.id !== saved.id), saved]);
  return saved;
}

export function deleteStoredBoard(id: string): void {
  writeEntries(BOARD_STORAGE_KEY, listStoredBoards().filter((entry) => entry.id !== id));
}

export function toBoardFile(entry: StoredBoard): string {
  return JSON.stringify(
    { ...entry, exportedBy: "hostfall-playground-board", version: BOARD_FILE_VERSION },
    null,
    2,
  );
}

export function parseBoardFile(json: string): { board?: StoredBoard; problems: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { problems: ["That board file is not valid JSON."] };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { problems: ["That file does not contain a board."] };
  }

  const source = parsed as Record<string, unknown>;
  const definition = (typeof source.definition === "object" && source.definition !== null ? source.definition : source) as ScenarioDefinition;
  if (typeof definition.seed !== "string" || typeof definition.zones !== "object" || definition.zones === null) {
    return { problems: ["That file does not look like a Playground board."] };
  }
  const problems = validateScenario(definition);
  if (problems.length > 0) return { problems };

  const boardDefinition: ScenarioDefinition = {
    ...cloneScenario(definition),
    turnNumber: 1,
    hordeTurnNumber: 0,
    phase: "main",
    activeSide: "player",
    player: { life: BLANK_SCENARIO.player.life, energy: 0, storedEnergy: 0 },
    horde: { poisonCounters: 0 },
    zones: {
      playerHand: definition.zones.playerHand,
      playerBattlefield: definition.zones.playerBattlefield,
      hordeBattlefield: definition.zones.hordeBattlefield,
    },
  };

  return {
    board: {
      id: typeof source.id === "string" ? source.id : makeId("imported-board"),
      name: boardDefinition.name || "Imported board",
      savedAt: typeof source.savedAt === "string" ? source.savedAt : new Date().toISOString(),
      definition: boardDefinition,
    },
    problems: [],
  };
}

export function listStoredReplays(): StoredReplay[] {
  const current = readEntries<StoredReplay>(REPLAY_STORAGE_KEY, isStoredReplay);
  const legacy = readEntries<StoredReplay>(LEGACY_STORAGE_KEY, isStoredReplay);
  const seen = new Set(current.map((entry) => entry.id));
  return [...current, ...legacy.filter((entry) => !seen.has(entry.id))]
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function saveStoredReplay(name: string, definition: ScenarioDefinition, steps: TimelineStep[]): StoredReplay {
  const entries = listStoredReplays();
  const existing = entries.find((entry) => entry.name === name);
  const saved: StoredReplay = {
    id: existing?.id ?? makeId("replay"),
    name,
    savedAt: new Date().toISOString(),
    definition: cloneScenario(definition),
    steps: structuredClone(steps),
  };
  writeEntries(REPLAY_STORAGE_KEY, [...entries.filter((entry) => entry.id !== saved.id), saved]);
  return saved;
}

export function deleteStoredReplay(id: string): void {
  writeEntries(REPLAY_STORAGE_KEY, listStoredReplays().filter((entry) => entry.id !== id));
  writeEntries(LEGACY_STORAGE_KEY, readEntries<StoredReplay>(LEGACY_STORAGE_KEY, isStoredReplay).filter((entry) => entry.id !== id));
}

export function toScenarioFile(entry: StoredScenario): string {
  return JSON.stringify({ ...entry, exportedBy: "hostfall-playground", version: SCENARIO_VERSION }, null, 2);
}

export function parseScenarioFile(json: string): { entry?: StoredScenario; problems: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { problems: ["That file is not valid JSON."] };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { problems: ["That file does not contain a scenario."] };
  }

  const source = parsed as Record<string, unknown>;
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

function readEntries<T>(key: string, guard: (value: unknown) => value is T): T[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(guard).sort((a, b) => readSavedAt(b).localeCompare(readSavedAt(a)));
  } catch {
    return [];
  }
}

function writeEntries(key: string, entries: unknown[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(entries));
}

function isStoredBoard(value: unknown): value is StoredBoard {
  if (!isStoredEntry(value)) return false;
  const definition = (value as Record<string, unknown>).definition;
  return typeof definition === "object" && definition !== null;
}

function isStoredReplay(value: unknown): value is StoredReplay {
  if (!isStoredEntry(value)) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.definition === "object" && Array.isArray(entry.steps);
}

function isStoredEntry(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === "string" && typeof entry.name === "string" && typeof entry.savedAt === "string";
}

function readSavedAt(value: unknown): string {
  if (typeof value !== "object" || value === null) return "";
  return String((value as Record<string, unknown>).savedAt ?? "");
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
