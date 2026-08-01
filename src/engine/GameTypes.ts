import type { CardKind, CardModifier, Trait } from "./hostfallVocabulary";
import type { ZoneName } from "./hostfallZones";

export type { Trait } from "./hostfallVocabulary";
export type { ZoneName } from "./hostfallZones";

export type Side = "player" | "horde";
export type DifficultyMode = "easy" | "normal" | "hard";
// `chaos` is retained only for legacy saves/tests. The experiment is deprecated and no longer
// exposed by the main menu; do not extend it while it remains parked.
export type GameMode = "standard" | "chaos";
export type Phase = "untap" | "draw" | "main" | "combat" | "end" | "horde";
export type EnergyPool = {
  /** Energy already produced this turn but not yet spent. */
  available: number;
  /** Persistent reserve, capped by STORED_ENERGY_CAP. */
  stored: number;
};

export type EffectDefinition = {
  type: string;
  [key: string]: unknown;
};

export type ActionCost = {
  exhaust?: boolean;
  sacrificeSelf?: boolean;
  energy?: number;
  life?: number | {
    type: "CURRENT_LIFE_FRACTION";
    numerator: number;
    denominator: number;
    rounding: "UP" | "DOWN";
  };
};

export type ActivatedAbility = {
  id: string;
  cost?: ActionCost;
  requiresStabilized?: boolean;
  requiresTargets?: TargetRequirement[];
  effect: EffectDefinition;
};

export type TargetRequirement = {
  id: string;
  type: string;
  controller?: "SELF" | "OPPONENT" | "ANY";
  minTargets?: number;
  maxTargets?: number;
  targetRequired?: boolean;
  filterAny?: CardFilter[];
  [key: string]: unknown;
};

export type CardFilter = {
  kinds?: CardKind[];
  subtypes?: string[];
  traits?: Trait[];
  excludeSelf?: boolean;
  isToken?: boolean;
};

export type CardDefinition = {
  id: string;
  name: string;
  displayNameEs?: string;
  gameText?: {
    en?: string;
    es?: string;
  };
  quantity?: number;
  isToken?: boolean;
  energyCost?: number;
  kinds?: CardKind[];
  modifiers?: CardModifier[];
  subtypes?: string[];
  power?: number | null;
  endurance?: number | null;
  traits?: Trait[];
  /** Player-facing text shown when a Horde trigger of this card resolves. Kept as card data so
   * new Horde cards don't need a branch in useGameStore's trigger-message switch. */
  triggerMessage?: string;
  entersExhausted?: boolean;
  entersWithCounters?: Array<{ counterType: string; amount?: number; amountFormula?: EffectDefinition }>;
  additionalCost?: ActionCost;
  activatedAbilities?: ActivatedAbility[];
  effects?: EffectDefinition[];
  requiresTargets?: TargetRequirement[];
  requiresDistribution?: {
    counterType: string;
    totalAmount: number;
    eachTargetMinimum?: number;
  };
  variableCost?: { hasX?: boolean; xChosenOnCast?: boolean };
  attachTo?: { targetRef: string };
  flags?: Record<string, boolean>;
};

export type DeckList = {
  id: string;
  name: string;
  side: Side;
  deckSize: number;
  /** Player decks may opt into a different runtime land count than the default nine. */
  gameplayLandCount?: number;
  cards: CardDefinition[];
  tokens?: CardDefinition[];
  /** Raw per-deck Host rules from the deck JSON; parsed by buildHostRules at game start. */
  rulesProfile?: Record<string, unknown>;
};

/** Per-deck Host behavior. Defaults (HostRules.ts) reproduce the current Zombie-mode rules;
 *  a Host deck overrides them from its JSON `rulesProfile` — never from code. */
export type HostRulesProfile = {
  /** Cards revealed on a normal Host turn. */
  revealCount: number;
  /** Stop the normal reveal early when a non-token card is revealed. */
  stopOnNonToken: boolean;
  /** One-time extra reveals on this Horde turn (0 disables). */
  miniSurgeTurn: number;
  miniSurgeExtraReveals: number;
  /** Permanent surge from this Host turn on. */
  surgeTurn: number;
  surgeTurnChaos: number;
  surgeExtraReveals: number;
  /** Optional stat bonus while in surge, e.g. the Zombie deck's +1/+0 to Zombies. */
  surgeBonus?: { power: number; endurance: number; subtypes: string[] };
  /** Combat damage the Chronicler must deal to discard one Host Archive card. */
  damagePerArchiveDiscard: number;
  /** Poison counters consumed to discard one Host Archive card at end of turn. */
  poisonPerArchiveDiscard: number;
  hostEchosHaveImpetus: boolean;
  /** Token subtypes grouped/ordered by arrival wave (board layout and attack order). */
  swarmTokenSubtypes: string[];
};

export type CardInstance = {
  instanceId: string;
  definitionId: string;
  name: string;
  displayName: string;
  displayNameEs?: string;
  gameText?: {
    en?: string;
    es?: string;
  };
  owner: Side;
  controller: Side;
  zone: ZoneName;
  isToken: boolean;
  energyCost: number;
  kinds: CardKind[];
  modifiers: CardModifier[];
  subtypes: string[];
  basePower: number;
  baseEndurance: number;
  traits: Trait[];
  chaosTraits: Trait[];
  triggerMessage?: string;
  effects: EffectDefinition[];
  additionalCost?: ActionCost;
  activatedAbilities: ActivatedAbility[];
  requiresTargets: TargetRequirement[];
  exhausted: boolean;
  entersExhausted: boolean;
  stabilizing: boolean;
  /** Controller turn in which this permanent most recently entered the Field.
   *  Used by pure Field layout to keep later Host copies in a new visual stack. */
  fieldEntryTurn?: number;
  /** Number of player combats this permanent has actually attacked in. */
  attacksMade?: number;
  activatedThisTurn: boolean;
  damageMarked: number;
  lethalDamage: boolean;
  counters: Record<string, number>;
  temporaryPower: number;
  temporaryEndurance: number;
  /** Stats that survive end-step cleanup and expire when the next player turn begins. */
  untilNextPlayerTurnPower?: number;
  untilNextPlayerTurnEndurance?: number;
  temporaryTraits: Trait[];
  xValuePaid?: number;
  attachTo?: { targetRef: string };
  attachedTo?: string;
  flags: Record<string, boolean>;
  variableCost?: { hasX?: boolean; xChosenOnCast?: boolean };
};

export type PlayerState = {
  life: number;
  archive: CardInstance[];
  hand: CardInstance[];
  field: CardInstance[];
  memory: CardInstance[];
  oblivion: CardInstance[];
  energyPool: EnergyPool;
  pendingStoredEnergy: number;
  energyActionUsedThisTurn: boolean;
  /** Life paid as a cost during the current active turn. Reset whenever either side starts a turn. */
  lifePaidThisTurn: number;
  /** Life lost for any reason during the current active turn. Reset whenever either side starts a turn. */
  lifeLostThisTurn: number;
};

export type HordeState = {
  archive: CardInstance[];
  field: CardInstance[];
  memory: CardInstance[];
  oblivion: CardInstance[];
  poisonCounters: number;
  /** Bridge for cards (e.g. Smallpox) whose reveal needs a bespoke, player-interactive
   * multi-step resolution the store drives — parked here instead of resolved inline. */
  pendingCard?: CardInstance;
  /** Extra normal reveal rounds requested by a Horde spell. HordeController consumes these
   * inside the current turn; they never advance the Horde turn counter or add Surge reveals. */
  pendingRevealRounds?: number;
};

export type CombatState = {
  playerAttackers: string[];
  hordeAttackers: string[];
  blockers: Record<string, string[]>;
  /** Damage captured when attackers are declared but deliberately held until the animated Horde
   * attack sequence ends. Attacker ids make each attacker count once even with multiple blockers. */
  pendingDamageVolleys: Array<{
    sourceId?: string;
    attackerIds: string[];
    amountPerAttacker: number;
  }>;
};

export type EventItem = {
  id: string;
  type: string;
  sourceId?: string;
  payload?: Record<string, unknown>;
  /** Limits a deferred event to the controller whose triggers still need to resolve. */
  triggerController?: Side;
};

export type FieldEntryRecord = {
  instanceId: string;
  controller: Side;
  kinds: CardKind[];
  subtypes: string[];
};

export type GameState = {
  seed: string;
  difficulty: DifficultyMode;
  gameMode: GameMode;
  hostRules: HostRulesProfile;
  chaosMutations: Record<Side, Record<string, Trait[]>>;
  currentRandomState: number;
  hordeDeckOrderHash?: string;
  activeSide: Side;
  phase: Phase;
  turnNumber: number;
  hordeTurnNumber: number;
  setupTurnsRemaining: number;
  setupCompletePendingHorde: boolean;
  openingHandAccepted: boolean;
  mulligansTaken: number;
  player: PlayerState;
  horde: HordeState;
  combat: CombatState;
  /** Permanents that entered since the current turn began. Rules may count entries even if the
   * permanent later changes zones; presentation and logs must not be used as rules history. */
  fieldEntriesThisTurn: FieldEntryRecord[];
  eventQueue: EventItem[];
  log: string[];
  /** Outcome of the most recent player-initiated action. The store reads this instead of
   *  sniffing log strings; `reason` is the player-facing failure message. */
  lastActionResult?: { ok: boolean; reason?: string };
  winner?: Side;
};

export type CastOptions = {
  xValue?: number;
  targets?: Record<string, string | string[]>;
  distribution?: Record<string, number>;
  /** Leaves automatic player reactions in `eventQueue` so the store can present their source
   *  before committing the effect. Used by spells that cause life loss and trigger Blood Page. */
  deferPlayerTriggers?: boolean;
  deferReactiveTriggers?: boolean;
  /** Commits the cast and every non-fight effect, leaving the fight effect for a later
   *  presentation impact. The store must resolve the deferred effect before unlocking play. */
  deferFightResolution?: boolean;
};

export type AbilityOptions = {
  targets?: Record<string, string | string[]>;
  /** Leaves automatic player reactions in `eventQueue` so the store can present them one source
   *  at a time before committing their effects. Pure engine callers remain synchronous by default. */
  deferReactiveTriggers?: boolean;
};
