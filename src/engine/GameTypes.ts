export type Side = "player" | "horde";
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
};

export type CardInstance = {
  instanceId: string;
  definitionId: string;
  name: string;
  displayName: string;
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
};

export type CombatState = {
  playerAttackers: string[];
  hordeAttackers: string[];
  blockers: Record<string, string[]>;
};

export type EventItem = {
  id: string;
  type: string;
  sourceId?: string;
  payload?: Record<string, unknown>;
  /** Limits a deferred event to the controller whose triggers still need to resolve. */
  triggerController?: Side;
};

export type GameState = {
  seed: string;
  currentRandomState: number;
  hordeDeckOrderHash?: string;
  activeSide: Side;
  phase: Phase;
  turnNumber: number;
  hordeTurnNumber: number;
  setupTurnsRemaining: number;
  setupCompletePendingHorde: boolean;
  player: PlayerState;
  horde: HordeState;
  combat: CombatState;
  eventQueue: EventItem[];
  log: string[];
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
