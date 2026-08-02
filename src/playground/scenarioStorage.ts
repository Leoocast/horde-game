import { BLANK_SCENARIO, SCENARIO_VERSION, cloneScenario, validateScenario, type ScenarioDefinition } from "./scenario";
import type { TimelineStep } from "./timeline";

const BOARD_STORAGE_KEY = "hostfall-playground-boards:v3";
const REPLAY_STORAGE_KEY = "hostfall-playground-replays:v3";
const BOARD_FILE_VERSION = 3;

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

/** A saved Playground flow and the Hostfall-native board state it starts from. */
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
  const wrapped = typeof source.definition === "object" && source.definition !== null;
  if (wrapped && source.version !== BOARD_FILE_VERSION) {
    return { problems: [`Board file version ${String(source.version)} is retired; this build requires ${BOARD_FILE_VERSION}.`] };
  }
  const definition = (wrapped ? source.definition : source) as ScenarioDefinition;
  if (typeof definition.version !== "number" || typeof definition.seed !== "string" || typeof definition.zones !== "object" || definition.zones === null) {
    return { problems: ["That file does not look like a Playground board."] };
  }
  const problems = validateScenario(definition);
  if (problems.length > 0) return { problems };

  const boardDefinition: ScenarioDefinition = {
    ...cloneScenario(definition),
    turnNumber: 1,
    hostTurnNumber: 0,
    phase: "main",
    activeSide: "player",
    player: { life: BLANK_SCENARIO.player.life, energy: 0, storedEnergy: 0 },
    host: { poisonCounters: 0 },
    zones: {
      playerHand: definition.zones.playerHand,
      playerField: definition.zones.playerField,
      hostField: definition.zones.hostField,
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
  return readEntries<StoredReplay>(REPLAY_STORAGE_KEY, isStoredReplay);
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
  if (typeof definition.version !== "number" || typeof definition.seed !== "string" || typeof definition.zones !== "object" || definition.zones === null) {
    return { problems: ["That file does not look like a playground scenario."] };
  }

  const problems = validateScenario(definition);
  if (problems.length > 0) return { problems };
  if (Array.isArray(source.steps) && !source.steps.every(isTimelineStep)) {
    return { problems: ["That scenario contains retired or invalid replay steps."] };
  }

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
  return isCurrentScenarioDefinition(definition);
}

function isStoredReplay(value: unknown): value is StoredReplay {
  if (!isStoredEntry(value)) return false;
  const entry = value as Record<string, unknown>;
  return isCurrentScenarioDefinition(entry.definition) && Array.isArray(entry.steps) && entry.steps.every(isTimelineStep);
}

function isCurrentScenarioDefinition(value: unknown): value is ScenarioDefinition {
  if (typeof value !== "object" || value === null) return false;
  const definition = value as Record<string, unknown>;
  return definition.version === SCENARIO_VERSION && typeof definition.zones === "object" && definition.zones !== null;
}

const TIMELINE_STEP_KINDS = new Set<TimelineStep["kind"]>([
  "advancePhase", "endTurn", "hostTurn", "hostTurnExact", "resolveNextEvent", "resolveAllEvents",
  "draw", "addEnergySource", "refillEnergy", "addStoredEnergy", "drainEnergy", "place", "playCard",
  "play", "destroy", "toGraveyard", "clearBattlefield",
]);

function isTimelineStep(value: unknown): value is TimelineStep {
  if (typeof value !== "object" || value === null) return false;
  const step = value as Record<string, unknown>;
  if (typeof step.kind !== "string" || !TIMELINE_STEP_KINDS.has(step.kind as TimelineStep["kind"])) return false;
  if ((step.kind === "playCard" || step.kind === "clearBattlefield") && step.side !== "player" && step.side !== "host") return false;
  return true;
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
