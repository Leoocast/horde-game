import { create } from "zustand";
import { createInitialGame } from "../engine/GameState";
import type { AbilityOptions, CastOptions, GameState, Phase } from "../engine/GameTypes";
import { playerDeck, hordeDeck } from "../data/decks";
import { advancePhase, endPlayerTurn } from "../engine/PhaseManager";
import { castCard, playLand, tapForMana, toggleTap, activateAbility } from "../engine/GameActions";
import { declareBlocker, prepareHordeAttackers, resolveHordeCombat, resolvePlayerCombat, togglePlayerAttacker } from "../engine/CombatResolver";
import { finishHordeTurn, runFullHordeTurn } from "../engine/HordeController";

type GameStore = {
  game: GameState;
  selectedHandId?: string;
  selectedPlayerCreatureId?: string;
  selectedHordeCreatureId?: string;
  hoveredCardId?: string;
  focusedCardId?: string;
  seed: string;
  reset: (seed?: string, setupTurns?: number) => void;
  setSeed: (seed: string) => void;
  selectHand: (id?: string) => void;
  selectPlayerCreature: (id?: string) => void;
  selectHordeCreature: (id?: string) => void;
  setHoveredCardId: (id?: string) => void;
  setFocusedCardId: (id?: string) => void;
  advancePhase: (phase?: Phase) => void;
  endPlayerTurn: () => void;
  playLand: (id: string) => void;
  castCard: (id: string, options?: CastOptions) => void;
  tapForMana: (id: string) => void;
  toggleTap: (id: string) => void;
  activateAbility: (id: string, abilityId: string, options?: AbilityOptions) => void;
  toggleAttacker: (id: string) => void;
  resolvePlayerCombat: () => void;
  finishPlayerCombat: () => void;
  runHordeMain: () => void;
  prepareHordeAttackers: () => void;
  declareBlocker: (blockerId: string, attackerId: string) => void;
  resolveHordeCombat: () => void;
  finishHordeTurn: () => void;
};

const defaultSeed = "horde-mvp-001";

export const useGameStore = create<GameStore>((set, get) => ({
  game: createInitialGame(playerDeck, hordeDeck, defaultSeed, 3),
  seed: defaultSeed,
  reset: (seed = get().seed, setupTurns = 3) =>
    set({
      game: createInitialGame(playerDeck, hordeDeck, seed, setupTurns),
      selectedHandId: undefined,
      selectedPlayerCreatureId: undefined,
      selectedHordeCreatureId: undefined,
      hoveredCardId: undefined,
      focusedCardId: undefined,
    }),
  setSeed: (seed) => set({ seed }),
  selectHand: (id) => set({ selectedHandId: id }),
  selectPlayerCreature: (id) => set({ selectedPlayerCreatureId: id }),
  selectHordeCreature: (id) => set({ selectedHordeCreatureId: id }),
  setHoveredCardId: (id) => set({ hoveredCardId: id }),
  setFocusedCardId: (id) => set({ focusedCardId: id }),
  advancePhase: (phase) => set(({ game }) => ({ game: advancePhase(game, phase) })),
  endPlayerTurn: () => set(({ game }) => ({ game: endPlayerTurn(game) })),
  playLand: (id) => set(({ game }) => ({ game: playLand(game, id), selectedHandId: undefined, focusedCardId: undefined })),
  castCard: (id, options) => set(({ game }) => ({ game: castCard(game, id, options), selectedHandId: undefined, focusedCardId: undefined })),
  tapForMana: (id) => set(({ game }) => ({ game: tapForMana(game, id) })),
  toggleTap: (id) => set(({ game }) => ({ game: toggleTap(game, id) })),
  activateAbility: (id, abilityId, options) => set(({ game }) => ({ game: activateAbility(game, id, abilityId, options) })),
  toggleAttacker: (id) => set(({ game }) => ({ game: togglePlayerAttacker(game, id) })),
  resolvePlayerCombat: () => set(({ game }) => ({ game: resolvePlayerCombat(game) })),
  finishPlayerCombat: () => set(({ game }) => ({ game: endPlayerTurn(resolvePlayerCombat(game)), selectedPlayerCreatureId: undefined })),
  runHordeMain: () => set(({ game }) => ({ game: runFullHordeTurn(game), selectedHordeCreatureId: undefined, selectedPlayerCreatureId: undefined })),
  prepareHordeAttackers: () => set(({ game }) => ({ game: prepareHordeAttackers(game) })),
  declareBlocker: (blockerId, attackerId) => set(({ game }) => ({ game: declareBlocker(game, blockerId, attackerId) })),
  resolveHordeCombat: () => set(({ game }) => ({ game: resolveHordeCombat(game) })),
  finishHordeTurn: () => set(({ game }) => ({ game: finishHordeTurn(game) })),
}));
