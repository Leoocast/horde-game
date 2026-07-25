export type Side = "player" | "horde";
export type DifficultyMode = "easy" | "normal" | "hard";
export type GameMode = "standard" | "chaos";
export type ZoneName = "library" | "hand" | "battlefield" | "graveyard" | "exile";
export type Phase = "untap" | "draw" | "main" | "combat" | "end" | "horde";
export type Color = "G" | "R" | "U" | "W" | "B" | "C";
export type Keyword =
  | "FLYING"
  | "REACH"
  | "VIGILANCE"
  | "MENACE"
  | "DEATHTOUCH"
  | "TRAMPLE"
  | "HEXPROOF"
  | "HASTE"
  | "SKULK"
  | string;

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

export type ActivatedAbility = {
  id: string;
  cost?: Record<string, unknown>;
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
  cardTypes?: string[];
  subtypes?: string[];
  keywords?: Keyword[];
  excludeSelf?: boolean;
  isToken?: boolean;
};

export type CardDefinition = {
  id: string;
  name: string;
  displayNameEs?: string;
  quantity?: number;
  isToken?: boolean;
  manaCost?: string;
  manaValue?: number;
  colors?: Color[];
  cardTypes?: string[];
  subtypes?: string[];
  power?: number | null;
  toughness?: number | null;
  keywords?: Keyword[];
  /** Player-facing text shown when a Horde trigger of this card resolves. Kept as card data so
   * new Horde cards don't need a branch in useGameStore's trigger-message switch. */
  triggerMessage?: string;
  entersTapped?: boolean;
  entersWithCounters?: Array<{ counterType: string; amount?: number; amountFormula?: EffectDefinition }>;
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
  owner: Side;
  controller: Side;
  zone: ZoneName;
  isToken: boolean;
  manaCost: string;
  manaValue: number;
  colors: Color[];
  cardTypes: string[];
  subtypes: string[];
  basePower: number;
  baseToughness: number;
  keywords: Keyword[];
  chaosKeywords: Keyword[];
  triggerMessage?: string;
  effects: EffectDefinition[];
  activatedAbilities: ActivatedAbility[];
  requiresTargets: TargetRequirement[];
  tapped: boolean;
  entersTapped: boolean;
  summoningSickness: boolean;
  activatedThisTurn: boolean;
  damageMarked: number;
  deathtouchDamage: boolean;
  counters: Record<string, number>;
  temporaryPower: number;
  temporaryToughness: number;
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
  library: CardInstance[];
  hand: CardInstance[];
  battlefield: CardInstance[];
  graveyard: CardInstance[];
  exile: CardInstance[];
  manaPool: ManaPool;
  pendingStoredMana: number;
  energyActionUsedThisTurn: boolean;
};

export type HordeState = {
  library: CardInstance[];
  battlefield: CardInstance[];
  graveyard: CardInstance[];
  exile: CardInstance[];
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
  cardTypes: string[];
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
  deferReactiveTriggers?: boolean;
};

export type AbilityOptions = {
  targets?: Record<string, string | string[]>;
};
