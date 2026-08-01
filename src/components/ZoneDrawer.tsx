import { Archive } from "lucide-react";
import type { CardInstance, GameState, Side } from "../engine/GameTypes";
import { localizedCardName } from "../i18n/cardLocalization";
import { useTranslation } from "../i18n/useTranslation";
import { useLanguageStore } from "../store/useLanguageStore";

export function ZoneDrawer({ game }: { game: GameState }) {
  const t = useTranslation();
  return (
    <section className="game-zone-panel old-panel-soft">
      <div className="game-zone-header flex w-full items-center justify-between px-4 py-3 text-sm font-bold">
        <span className="inline-flex items-center gap-2">
          <Archive size={16} />
          {t("zones.title")}
        </span>
      </div>
      <div className="game-zone-content space-y-4 p-3">
        <ZoneSide game={game} side="player" />
        <ZoneSide game={game} side="host" />
      </div>
    </section>
  );
}

function ZoneSide({ game, side }: { game: GameState; side: Side }) {
  const t = useTranslation();
  const state = game[side];
  return (
    <div className="game-zone-side">
      <h3>{side === "player" ? t("setup.playerSide") : t("zones.host")}</h3>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <ZoneMetric label={t("zones.deck")} count={state.archive.length} />
        {side === "player" && <ZoneMetric label={t("zones.hand")} count={game.player.hand.length} />}
        <ZoneMetric label={t("zones.memory")} count={state.memory.length} top={state.memory[0]} />
        <ZoneMetric label={t("zones.oblivion")} count={state.oblivion.length} top={state.oblivion[0]} />
      </div>
    </div>
  );
}

function ZoneMetric({ label, count, top }: { label: string; count: number; top?: CardInstance }) {
  const language = useLanguageStore((state) => state.language);
  return (
    <div className="game-zone-metric p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <strong>{count}</strong>
      </div>
      {top && <div className="game-zone-top mt-1 truncate text-[11px]">{localizedCardName(top, language)}</div>}
    </div>
  );
}
