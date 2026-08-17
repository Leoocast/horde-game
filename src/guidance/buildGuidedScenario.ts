import type { ContentCatalog } from "../content/ContentCatalog";
import { STORED_ENERGY_CAP } from "../engine/EnergySystem";
import { createCardInstance, createInitialGame } from "../engine/GameState";
import type { CardInstance, GameState, Side, ZoneName } from "../engine/GameTypes";
import { hashSeed } from "../engine/RNG";
import type {
  GuidedCardAlias,
  GuidedCardSpec,
  GuidedScenarioDefinition,
  GuidedScenarioZones,
} from "./contracts";
import { assertGuidedScenarioValid } from "./validation";

type GuidedZoneKey = keyof GuidedScenarioZones;

export type GuidedCardBinding = Readonly<{
  alias: GuidedCardAlias;
  instanceId: string;
  cardKey: string;
  side: Side;
  zone: GuidedZoneKey;
  index: number;
}>;

export type BuiltGuidedScenario = Readonly<{
  game: GameState;
  playerDeckKey: string;
  hostDeckKey: string;
  bindings: Readonly<Record<GuidedCardAlias, GuidedCardBinding>>;
}>;

const ZONE_ORDER: readonly GuidedZoneKey[] = [
  "openingDeal",
  "playerArchiveTopToBottom",
  "playerField",
  "playerMemory",
  "playerOblivion",
  "hostArchiveTopToBottom",
  "hostField",
  "hostMemory",
  "hostOblivion",
];

const ZONE_META: Readonly<Record<GuidedZoneKey, Readonly<{ side: Side; runtimeZone: ZoneName }>>> = {
  openingDeal: { side: "player", runtimeZone: "hand" },
  playerArchiveTopToBottom: { side: "player", runtimeZone: "archive" },
  playerField: { side: "player", runtimeZone: "field" },
  playerMemory: { side: "player", runtimeZone: "memory" },
  playerOblivion: { side: "player", runtimeZone: "oblivion" },
  hostArchiveTopToBottom: { side: "host", runtimeZone: "archive" },
  hostField: { side: "host", runtimeZone: "field" },
  hostMemory: { side: "host", runtimeZone: "memory" },
  hostOblivion: { side: "host", runtimeZone: "oblivion" },
};

/**
 * Builds a mutable engine GameState from exact authored inputs. No unused deck card survives the
 * build and no shuffle determines zone order. The recipe seed only initializes future RNG effects.
 */
export function buildGuidedScenario(
  definition: GuidedScenarioDefinition,
  catalog: ContentCatalog,
): BuiltGuidedScenario {
  assertGuidedScenarioValid(definition, catalog);
  const recipe = definition.scenario;
  const playerDeck = catalog.requireDeck(recipe.playerDeckKey, "player").deck;
  const hostDeck = catalog.requireDeck(recipe.hostDeckKey, "host").deck;
  const game = createInitialGame(
    playerDeck,
    hostDeck,
    recipe.seed,
    recipe.setupTurnsRemaining,
    recipe.difficulty,
    "standard",
  );

  game.seed = recipe.seed;
  game.difficulty = recipe.difficulty;
  game.gameMode = "standard";
  game.currentRandomState = hashSeed(recipe.seed);
  game.activeSide = recipe.activeSide;
  game.phase = recipe.phase;
  game.turnNumber = recipe.turnNumber;
  game.hostTurnNumber = recipe.hostTurnNumber;
  game.setupTurnsRemaining = recipe.setupTurnsRemaining;
  game.setupCompletePendingHost = recipe.setupCompletePendingHost;
  game.openingHandAccepted = recipe.openingHandAccepted;
  game.mulligansTaken = recipe.mulligansTaken;
  game.player = {
    life: recipe.player.life,
    archive: [],
    hand: [],
    field: [],
    memory: [],
    oblivion: [],
    energyPool: {
      available: recipe.player.availableEnergy,
      stored: Math.min(recipe.player.storedEnergy, STORED_ENERGY_CAP),
    },
    pendingStoredEnergy: recipe.player.pendingStoredEnergy,
    energyActionUsedThisTurn: recipe.player.energyActionUsedThisTurn,
    lifePaidThisTurn: recipe.player.lifePaidThisTurn,
    lifeLostThisTurn: recipe.player.lifeLostThisTurn,
  };
  game.host = {
    archive: [],
    field: [],
    memory: [],
    oblivion: [],
    poisonCounters: recipe.host.poisonCounters,
  };
  game.combat = { playerAttackers: [], hostAttackers: [], blockers: {}, pendingDamageVolleys: [] };
  game.fieldEntriesThisTurn = [];
  game.eventQueue = [];
  game.log = [];
  delete game.lastActionResult;
  delete game.winner;

  const bindings: Record<GuidedCardAlias, GuidedCardBinding> = {};
  for (const zone of ZONE_ORDER) {
    const aliases = recipe.zones[zone];
    aliases.forEach((alias, index) => {
      const spec = definition.cards[alias];
      const record = catalog.findDefinitionRecord(spec.cardKey);
      if (!record) throw new Error(`Validated guided card "${spec.cardKey}" disappeared from ContentCatalog.`);
      const { side, runtimeZone } = ZONE_META[zone];
      const card = createCardInstance(record.definition, side, guidedInstanceId(definition.id, alias));
      applyCardState(card, spec, runtimeZone, recipe.turnNumber, recipe.hostTurnNumber);
      zoneArray(game, side, runtimeZone).push(card);
      if (spec.state?.enteredThisTurn) {
        game.fieldEntriesThisTurn.push({
          instanceId: card.instanceId,
          controller: card.controller,
          kinds: [...card.kinds],
          subtypes: [...card.subtypes],
        });
      }
      bindings[alias] = Object.freeze({
        alias,
        instanceId: card.instanceId,
        cardKey: record.qualifiedCardKey,
        side,
        zone,
        index,
      });
    });
  }

  game.combat.playerAttackers = recipe.combat.playerAttackers.map((alias) => bindings[alias].instanceId);
  game.combat.hostAttackers = recipe.combat.hostAttackers.map((alias) => bindings[alias].instanceId);
  game.combat.blockers = Object.fromEntries(
    Object.entries(recipe.combat.blockers).map(([attacker, blockers]) => [
      bindings[attacker].instanceId,
      blockers.map((alias) => bindings[alias].instanceId),
    ]),
  );
  game.hostDeckOrderHash = game.host.archive.map((card) => card.definitionId).join("|");

  return Object.freeze({
    game,
    playerDeckKey: recipe.playerDeckKey,
    hostDeckKey: recipe.hostDeckKey,
    bindings: Object.freeze(bindings),
  });
}

function guidedInstanceId(lessonId: string, alias: string): string {
  return `guided:${lessonId}:${alias}`;
}

function applyCardState(
  card: CardInstance,
  spec: GuidedCardSpec,
  zone: ZoneName,
  playerTurn: number,
  hostTurn: number,
): void {
  const state = spec.state;
  card.zone = zone;
  card.exhausted = state?.exhausted ?? false;
  card.stabilizing = state?.stabilizing ?? false;
  card.activatedThisTurn = state?.activatedThisTurn ?? false;
  card.damageMarked = state?.damageMarked ?? 0;
  card.attacksMade = state?.attacksMade ?? 0;
  if (state?.counters) card.counters = { ...state.counters };
  if (state?.flags) card.flags = { ...card.flags, ...state.flags };
  if (zone === "field" && state?.enteredThisTurn) {
    card.fieldEntryTurn = card.controller === "host" ? hostTurn : playerTurn;
  } else {
    delete card.fieldEntryTurn;
  }
}

function zoneArray(game: GameState, side: Side, zone: ZoneName): CardInstance[] {
  if (side === "player") {
    if (zone === "hand") return game.player.hand;
    if (zone === "archive") return game.player.archive;
    if (zone === "field") return game.player.field;
    if (zone === "memory") return game.player.memory;
    return game.player.oblivion;
  }
  if (zone === "archive") return game.host.archive;
  if (zone === "field") return game.host.field;
  if (zone === "memory") return game.host.memory;
  return game.host.oblivion;
}
