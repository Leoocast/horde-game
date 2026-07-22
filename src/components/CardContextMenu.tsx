import { Info, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CardInstance, GameState } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";
import { useTranslation } from "../i18n/useTranslation";
import { useLanguageStore } from "../store/useLanguageStore";
import { useCardDetails } from "../utils/cardImages";
import { cleanCardDescriptionText } from "../utils/cardTextSymbols";
import { effectSummary } from "../utils/cardText";
import { cardKeywords, cardStats } from "../utils/selectors";
import { CardDetailsModal } from "./CardPreview";

const MENU_WIDTH = 220;
const MENU_PADDING = 12;

export function CardContextMenu() {
  const t = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const game = useGameStore((state) => state.game);
  const menu = useGameStore((state) => state.cardContextMenu);
  const closeMenu = useGameStore((state) => state.closeCardContextMenu);
  const activateAbility = useGameStore((state) => state.activateAbility);
  const [detailsCardId, setDetailsCardId] = useState<string | undefined>();
  const [detailsFontSize, setDetailsFontSize] = useState(20);

  const card = menu ? findCard(game, menu.cardId) : undefined;
  const detailsCard = detailsCardId ? findCard(game, detailsCardId) : undefined;
  const details = useCardDetails(detailsCard?.definitionId ?? "");
  const keywords = detailsCard ? cardKeywords(game, detailsCard) : undefined;
  const stats = detailsCard ? cardStats(game, detailsCard) : undefined;
  const detailsText = detailsCard && !detailsCard.cardTypes.includes("Land") ? cleanCardDescriptionText(details.oracleText, details.flavorText, keywords, effectSummary(detailsCard)) : "";

  const position = useMemo(() => {
    if (!menu || typeof window === "undefined") return { left: 0, top: 0 };
    return {
      left: Math.min(menu.x, window.innerWidth - MENU_WIDTH - MENU_PADDING),
      top: Math.min(menu.y, window.innerHeight - 132),
    };
  }, [menu]);

  useEffect(() => {
    if (!menu) return;

    function close() {
      closeMenu();
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu();
    }

    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeMenu, menu]);

  if (!menu || !card) {
    return detailsCard ? (
      <CardDetailsModal
        card={detailsCard}
        imageUrl={details.imageUrl}
        displayName={details.displayName}
        typeLineText={details.typeLine && (language === "en" || details.language === "es") ? details.typeLine : undefined}
        keywords={keywords}
        stats={stats}
        text={detailsText}
        fontSize={detailsFontSize}
        setFontSize={setDetailsFontSize}
        onClose={() => setDetailsCardId(undefined)}
      />
    ) : null;
  }

  const firstAbility = card.activatedAbilities.find((ability) => !isManaAbility(ability));
  const hasActivatedEffect = Boolean(firstAbility);
  const canActivate = Boolean(firstAbility && canActivateNow(game, card));
  const activateLabel = firstAbility?.cost?.tap ? t("card.tapForEffect") : t("card.activateEffect");

  function openDetails() {
    setDetailsCardId(card?.instanceId);
    closeMenu();
  }

  function activateEffect() {
    if (!card || !firstAbility || !canActivate) return;
    activateAbility(card.instanceId, firstAbility.id);
    closeMenu();
  }

  return (
    <>
      <div
        className="old-panel game-context-menu fixed z-[260] w-[220px] overflow-hidden p-1.5 text-[#f6e6b8] shadow-2xl shadow-black/70"
        style={{ left: position.left, top: position.top }}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => {
          if (!event.shiftKey) event.preventDefault();
        }}
      >
        <button data-audio-click="valid" className="context-menu-item" onClick={openDetails}>
          <Info size={15} />
          {t("card.info")}
        </button>
        {hasActivatedEffect && (
          <button data-audio-click={canActivate ? "valid" : undefined} className="context-menu-item" disabled={!canActivate} onClick={activateEffect}>
            <Sparkles size={15} />
            {activateLabel}
          </button>
        )}
      </div>
      {detailsCard && (
        <CardDetailsModal
          card={detailsCard}
          imageUrl={details.imageUrl}
          displayName={details.displayName}
          typeLineText={details.typeLine && (language === "en" || details.language === "es") ? details.typeLine : undefined}
          keywords={keywords}
          stats={stats}
          text={detailsText}
          fontSize={detailsFontSize}
          setFontSize={setDetailsFontSize}
          onClose={() => setDetailsCardId(undefined)}
        />
      )}
    </>
  );
}

function canActivateNow(game: GameState, card: CardInstance): boolean {
  if (game.winner) return false;
  if (game.activeSide !== "player") return false;
  if (game.phase !== "main") return false;
  if (card.controller !== "player") return false;
  if (card.zone !== "battlefield") return false;
  if (card.tapped) return false;
  if (card.activatedThisTurn) return false;
  if (card.summoningSickness && card.cardTypes.includes("Creature")) return false;
  return card.activatedAbilities.some((ability) => ability.cost?.tap === true);
}

function isManaAbility(ability: CardInstance["activatedAbilities"][number]): boolean {
  return ability.effect.type === "ADD_MANA" || ability.effect.type === "ADD_MANA_DYNAMIC";
}

function findCard(game: GameState, id: string): CardInstance | undefined {
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
