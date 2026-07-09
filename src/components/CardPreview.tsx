import { X } from "lucide-react";
import type { CardInstance } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";
import { useCardDetails } from "../utils/cardImages";
import { cleanReminderText, renderCardText } from "../utils/cardTextSymbols";
import { effectSummary, typeLine } from "../utils/cardText";
import { cardKeywords, cardStats } from "../utils/selectors";

export function CardPreview() {
  const game = useGameStore((state) => state.game);
  const hoveredCardId = useGameStore((state) => state.hoveredCardId);
  const focusedCardId = useGameStore((state) => state.focusedCardId);
  const setFocusedCardId = useGameStore((state) => state.setFocusedCardId);

  const activeId = focusedCardId ?? hoveredCardId;
  const card = activeId ? findCard(game, activeId) : undefined;
  const details = useCardDetails(card?.definitionId ?? "");
  if (!card) {
    return (
      <aside className="flex h-[calc(100vh-288px)] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-white/15 bg-stone-950/55 text-white shadow-2xl shadow-black/25 backdrop-blur-md">
        <div className="border-b border-white/10 p-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-200">Card Info</h2>
        </div>
        <div className="flex min-h-72 flex-1 items-center justify-center p-6 text-center text-sm text-stone-300">Hover a card to inspect it.</div>
      </aside>
    );
  }

  const stats = cardStats(game, card);
  const keywords = cardKeywords(game, card);
  const text = cleanReminderText(details.oracleText ?? effectSummary(card));

  return (
    <aside className="flex h-[calc(100vh-288px)] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-white/15 bg-stone-950/60 text-white shadow-2xl shadow-black/25 backdrop-blur-md">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 p-3">
        <div>
          <h2 className="text-base font-bold leading-tight text-white">{card.displayName}</h2>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-stone-300">{typeLine(card)}</p>
        </div>
        {focusedCardId && (
          <button className="icon-button" title="Close preview" onClick={() => setFocusedCardId(undefined)}>
            <X size={15} />
          </button>
        )}
      </div>
      <div className="min-h-0 space-y-3 overflow-auto p-3">
        {details.imageUrl && <img src={details.imageUrl} alt={card.name} className="mx-auto w-full max-w-64 rounded border border-stone-700/80" />}
        <div className="flex items-center justify-between gap-2">
          {keywords && <p className="text-sm font-semibold text-emerald-300">{keywords}</p>}
          {stats && <span className="ml-auto rounded border border-white/20 bg-white/10 px-2 py-1 text-sm font-bold">{stats}</span>}
        </div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-stone-100">{renderCardText(text)}</p>
      </div>
    </aside>
  );
}

function findCard(game: ReturnType<typeof useGameStore.getState>["game"], id: string): CardInstance | undefined {
  return [
    ...game.player.hand,
    ...game.player.battlefield,
    ...game.player.graveyard,
    ...game.player.exile,
    ...game.horde.battlefield,
    ...game.horde.graveyard,
    ...game.horde.exile,
  ].find((card) => card.instanceId === id);
}
