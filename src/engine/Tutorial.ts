import type { GameState } from "./GameTypes";

export type TutorialStepId = "play_land" | "cast_creature" | "advance_phase" | "attack" | "end_turn" | "defend" | "continue_turn" | "done";

export type TutorialSpotlight =
  | { zone: "hand"; definitionId: string }
  | { zone: "player-battlefield"; definitionId: string }
  | { zone: "defend-targets" }
  | { zone: "phase-orb" };

export function isTutorialSeed(game: GameState): boolean {
  return game.seed.trim().toLowerCase() === "tutorial";
}

export function getTutorialStepId(game: GameState): TutorialStepId {
  const landsInPlay = game.player.battlefield.filter((card) => card.cardTypes.includes("Land")).length;
  const hasLlanowarInPlay = game.player.battlefield.some((card) => card.definitionId === "llanowar_elves");
  if (landsInPlay < 3) return "play_land";
  if (!hasLlanowarInPlay) return "cast_creature";
  if (game.activeSide === "player" && game.phase === "main") return "advance_phase";
  // Turn 1 is pure setup (land + creature) — no attacking yet, straight through to ending the turn.
  // Beast-Kin Ranger's attack is introduced starting turn 2, once the player has seen the Horde attack once.
  if (game.activeSide === "player" && game.phase === "combat") return game.turnNumber === 1 ? "end_turn" : "attack";
  if (game.activeSide === "player" && game.phase === "end") return "end_turn";
  if (game.activeSide === "horde" && game.combat.hordeAttackers.length > 0) return "defend";
  if (game.activeSide === "horde") return "continue_turn";
  return "done";
}

// Every step shows an explanation + "Continue" first (no overlay), and only spotlights the real
// target (black fade + elevated card/button) once the player has acknowledged that step's intro.
// Returns every zone that should stay elevated right now — once a creature is "locked in" (chosen
// attacker, assigned blocker) it keeps its spotlight alongside the orb instead of dropping behind
// the fade the moment the orb becomes the next target.
export function getTutorialSpotlightZones(game: GameState, stepId: TutorialStepId, acknowledged: boolean): TutorialSpotlight[] {
  if (!acknowledged || stepId === "done") return [];
  switch (stepId) {
    case "play_land":
      return [{ zone: "hand", definitionId: "forest" }];
    case "cast_creature":
      return [{ zone: "hand", definitionId: "llanowar_elves" }];
    case "advance_phase":
      return [{ zone: "phase-orb" }];
    case "attack": {
      const zones: TutorialSpotlight[] = [{ zone: "player-battlefield", definitionId: "beast_kin_ranger" }];
      if (game.combat.playerAttackers.length > 0) zones.push({ zone: "phase-orb" });
      return zones;
    }
    case "end_turn":
      return [{ zone: "phase-orb" }];
    case "defend": {
      const zones: TutorialSpotlight[] = [{ zone: "defend-targets" }];
      const hasBlock = Object.values(game.combat.blockers).some((ids) => ids.length > 0);
      if (hasBlock) zones.push({ zone: "phase-orb" });
      return zones;
    }
    case "continue_turn":
      return [{ zone: "phase-orb" }];
  }
}

export function isTutorialOverlayActive(game: GameState, acknowledgedStepId: TutorialStepId | undefined): boolean {
  if (!isTutorialSeed(game)) return false;
  const stepId = getTutorialStepId(game);
  return getTutorialSpotlightZones(game, stepId, acknowledgedStepId === stepId).length > 0;
}

// True while the intro card for the current step is showing and hasn't been acknowledged yet —
// every gameplay action should be locked out during this window so players can't skip ahead of
// the guided flow before pressing Continue.
export function isTutorialAwaitingContinue(game: GameState, acknowledgedStepId: TutorialStepId | undefined): boolean {
  if (!isTutorialSeed(game)) return false;
  const stepId = getTutorialStepId(game);
  return stepId !== "done" && acknowledgedStepId !== stepId;
}
