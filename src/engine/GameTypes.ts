import type { CardKind, CardModifier, Trait } from "./hostfallVocabulary";
import type { ZoneName } from "./hostfallZones";

export type { ZoneName } from "./hostfallZones";

export type Side = "player" | "horde";
export type DifficultyMode = "easy" | "normal" | "hard";
// `chaos` is retained only for legacy saves/tests. The experiment is deprecated and no longer
// exposed by the main menu; do not extend it while it remains parked.
export type GameMode = "standard" | "chaos";
export type Phase = "untap" | "draw" | "main" | "combat" | "end" | "horde";
export type Color = "G" | "R" | "U" | "W" | "B" | "C";
/** @deprecated Field names still say keyword until L4.6; values are Hostfall Traits from L4.1. */
export type Keyword = Trait;

export type ManaPool = {
  green: number;
  red: number;
  blue: number;
  white: number;
  black: number;
  colorless: number;
};

export type EffectDefinition = {
  type: string;
  [key: string]: unknown;
};

export type ActionCost = {
  tap?: boolean;
  sacrificeSelf?: boolean;
  genericMana?: number;
  coloredMana?: Partial<Record<Color, number>>;
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
  requiresNoSummoningSickness?: boolean;
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
  cardTypes?: CardKind[];
  subtypes?: string[];
  keywords?: Trait[];
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
  manaCost?: string;
  manaValue?: number;
  colors?: Color[];
  cardTypes?: CardKind[];
  modifiers?: CardModifier[];
  subtypes?: string[];
  power?: number | null;
  toughness?: number | null;
  keywords?: Trait[];
  /** Player-facing text shown when a Horde trigger of this card resolves. Kept as card data so
   * new Horde cards don't need a branch in useGameStore's trigger-message switch. */
  triggerMessage?: string;
  entersTapped?: boolean;
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
  asEnters?: Array<{ type: string; storeAs: string; defaultForThisDeck?: Color }>;
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
  /** Raw per-deck horde rules from the deck JSON; parsed by buildHordeRules at game start. */
  rulesProfile?: Record<string, unknown>;
};

/** Per-deck Horde behavior. Defaults (HordeRules.ts) reproduce the classic Zombie-mode rules;
 *  a horde deck overrides them from its JSON `rulesProfile` — never from code. */
export type HordeRulesProfile = {
  /** Cards revealed on a normal Horde turn. */
  revealCount: number;
  /** Stop the normal reveal early when a non-token card is revealed. */
  stopOnNonToken: boolean;
  /** One-time extra reveals on this Horde turn (0 disables). */
  miniSurgeTurn: number;
  miniSurgeExtraReveals: number;
  /** Permanent surge from this Horde turn on. */
  surgeTurn: number;
  surgeTurnChaos: number;
  surgeExtraReveals: number;
  /** Optional stat bonus while in surge, e.g. the Zombie deck's +1/+0 to Zombies. */
  surgeBonus?: { power: number; toughness: number; subtypes: string[] };
  /** Combat damage the player must deal to mill one Horde card. */
  damagePerMill: number;
  /** Poison counters consumed to mill one Horde card at end of turn. */
  poisonPerMill: number;
  hordeCreaturesHaveHaste: boolean;
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
  manaCost: string;
  manaValue: number;
  colors: Color[];
  cardTypes: CardKind[];
  modifiers: CardModifier[];
  subtypes: string[];
  basePower: number;
  baseToughness: number;
  keywords: Keyword[];
  chaosKeywords: Keyword[];
  triggerMessage?: string;
  effects: EffectDefinition[];
  additionalCost?: ActionCost;
  activatedAbilities: ActivatedAbility[];
  requiresTargets: TargetRequirement[];
  tapped: boolean;
  entersTapped: boolean;
  summoningSickness: boolean;
  /** Controller turn in which this permanent most recently entered the battlefield.
   *  Used by pure battlefield layout to keep later Horde copies in a new visual stack. */
  battlefieldEntryTurn?: number;
  /** Number of player combats this permanent has actually attacked in. */
  attacksMade?: number;
  activatedThisTurn: boolean;
  damageMarked: number;
  lethalDamage: boolean;
  counters: Record<string, number>;
  temporaryPower: number;
  temporaryToughness: number;
  /** Stats that survive end-step cleanup and expire when the next player turn begins. */
  untilNextPlayerTurnPower?: number;
  untilNextPlayerTurnToughness?: number;
  temporaryKeywords: Keyword[];
  chosenColor?: Color;
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
  manaPool: ManaPool;
  pendingStoredMana: number;
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

export type BattlefieldEntryRecord = {
  instanceId: string;
  controller: Side;
  cardTypes: CardKind[];
  subtypes: string[];
};

export type GameState = {
  seed: string;
  difficulty: DifficultyMode;
  gameMode: GameMode;
  hordeRules: HordeRulesProfile;
  chaosMutations: Record<Side, Record<string, Keyword[]>>;
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
  battlefieldEntriesThisTurn: BattlefieldEntryRecord[];
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
