import type { GameState, Side } from "../engine/GameTypes";
import { Zone } from "./Zone";

export function Graveyard({ game, side }: { game: GameState; side: Side }) {
  const graveyard = game[side].graveyard;
  const exile = game[side].exile;
  return (
    <div className="grid grid-cols-2 gap-2">
      <Zone title={`${side} Graveyard`} count={graveyard.length}>
        <div className="zone-stack">{graveyard[0]?.displayName ?? "Empty"}</div>
      </Zone>
      <Zone title={`${side} Exile`} count={exile.length}>
        <div className="zone-stack">{exile[0]?.displayName ?? "Empty"}</div>
      </Zone>
    </div>
  );
}
