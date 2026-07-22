import type { GameState, Side } from "../engine/GameTypes";
import { localizedCardName } from "../i18n/cardLocalization";
import { useLanguageStore } from "../store/useLanguageStore";
import { Zone } from "./Zone";

export function Graveyard({ game, side }: { game: GameState; side: Side }) {
  const language = useLanguageStore((state) => state.language);
  const graveyard = game[side].graveyard;
  const exile = game[side].exile;
  return (
    <div className="grid grid-cols-2 gap-2">
      <Zone title={`${side} Graveyard`} count={graveyard.length}>
        <div className="zone-stack">{graveyard[0] ? localizedCardName(graveyard[0], language) : "Empty"}</div>
      </Zone>
      <Zone title={`${side} Exile`} count={exile.length}>
        <div className="zone-stack">{exile[0] ? localizedCardName(exile[0], language) : "Empty"}</div>
      </Zone>
    </div>
  );
}
