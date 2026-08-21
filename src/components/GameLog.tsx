import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CardInstance, GameState, Side } from "../engine/GameTypes";
import { canonicalizeLogText } from "../i18n/rulesText";
import type { TranslationKey } from "../i18n/translations";
import { useTranslation } from "../i18n/useTranslation";
import { useLanguageStore } from "../store/useLanguageStore";
import { useCardDetails } from "../utils/cardImages";
import { GraveyardDetailsModal } from "./GraveyardViewerModal";

type LogKind = "combat" | "spell" | "death" | "life" | "draw" | "turn" | "system";
type LogEntry = { text: string; sourceIndex: number; turn: number; side: Side };
type PreviewPosition = { left: number; top: number };

const CARD_PREVIEW_WIDTH = 270;
const CARD_PREVIEW_ASPECT_RATIO = 680 / 488;

const KIND_LABELS: Record<LogKind, TranslationKey> = {
  combat: "log.kindBattle",
  spell: "log.kindAction",
  death: "log.kindFallen",
  life: "log.kindLife",
  draw: "log.kindCards",
  turn: "log.kindTurn",
  system: "log.kindEvent",
};

export function GameLog({ game, className = "", variant = "panel" }: { game: GameState; className?: string; variant?: "panel" | "embedded" }) {
  const t = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const [query, setQuery] = useState("");
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [activeMatch, setActiveMatch] = useState(0);
  const [previewCard, setPreviewCard] = useState<CardInstance>();
  const [previewPosition, setPreviewPosition] = useState<PreviewPosition>();
  const [detailsCard, setDetailsCard] = useState<CardInstance>();
  const [detailsFontSize, setDetailsFontSize] = useState(20);
  const matchRefs = useRef(new Map<number, HTMLLIElement>());
  const suggestionsId = `game-log-card-suggestions-${useId().replace(/:/g, "")}`;
  const cards = useMemo(() => collectCards(game), [game]);
  const cardNames = useMemo(() => [...new Set(cards.map((card) => card.name).filter(Boolean))], [cards]);
  const visibleLog = useMemo(() => annotateLog(game.log.slice(0, 80), game, language), [game, language]);
  const previewDetails = useCardDetails(previewCard?.definitionId ?? "");
  const suggestions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return [];
    return cardNames
      .filter((name) => name.toLocaleLowerCase().includes(needle))
      .sort((a, b) => {
        const aStarts = a.toLocaleLowerCase().startsWith(needle);
        const bStarts = b.toLocaleLowerCase().startsWith(needle);
        return aStarts === bStarts ? a.localeCompare(b) : aStarts ? -1 : 1;
      })
      .slice(0, 7);
  }, [cardNames, query]);
  const matchingIndices = useMemo(() => selectedCard
    ? visibleLog.filter((entry) => entry.text.toLocaleLowerCase().includes(selectedCard.toLocaleLowerCase())).map((entry) => entry.sourceIndex)
    : [], [selectedCard, visibleLog]);

  useEffect(() => setActiveSuggestion(0), [query]);
  useEffect(() => {
    setActiveMatch(0);
    if (!selectedCard || matchingIndices.length === 0) return;
    window.requestAnimationFrame(() => matchRefs.current.get(matchingIndices[0])?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }, [matchingIndices, selectedCard]);

  function selectCard(name: string) {
    setQuery(name);
    setSelectedCard(name);
    setSuggestionsOpen(false);
  }

  function clearSearch() {
    setQuery("");
    setSelectedCard(null);
    setSuggestionsOpen(false);
    setActiveMatch(0);
  }

  function navigateMatches(direction: -1 | 1) {
    if (matchingIndices.length === 0) return;
    const next = (activeMatch + direction + matchingIndices.length) % matchingIndices.length;
    setActiveMatch(next);
    matchRefs.current.get(matchingIndices[next])?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && suggestionsOpen && suggestions.length > 0) {
      event.preventDefault();
      setActiveSuggestion((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && suggestionsOpen && suggestions.length > 0) {
      event.preventDefault();
      setActiveSuggestion((current) => (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" && suggestionsOpen && suggestions[activeSuggestion]) {
      event.preventDefault();
      selectCard(suggestions[activeSuggestion]);
    } else if (event.key === "Enter" && selectedCard && matchingIndices.length > 0) {
      event.preventDefault();
      navigateMatches(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      suggestionsOpen ? setSuggestionsOpen(false) : clearSearch();
    }
  }

  function showCardPreview(event: React.SyntheticEvent<HTMLButtonElement>, card: CardInstance) {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = CARD_PREVIEW_WIDTH;
    const height = width * CARD_PREVIEW_ASPECT_RATIO;
    const left = rect.right + 12 + width < window.innerWidth ? rect.right + 12 : Math.max(12, rect.left - width - 12);
    const top = Math.min(window.innerHeight - height - 12, Math.max(12, rect.top - height * 0.42));
    setPreviewCard(card);
    setPreviewPosition({ left, top });
  }

  const search = (
    <div className="game-log-search-wrap" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSuggestionsOpen(false);
    }}>
      <div className={["game-log-search", selectedCard ? "has-selection" : ""].join(" ")}>
        <Search size={14} aria-hidden="true" />
        <input
          value={query}
          type="text"
          role="combobox"
          aria-label={t("log.searchAria")}
          aria-autocomplete="list"
          aria-expanded={suggestionsOpen && suggestions.length > 0}
          aria-controls={suggestionsId}
          aria-activedescendant={suggestionsOpen && suggestions[activeSuggestion] ? `${suggestionsId}-option-${activeSuggestion}` : undefined}
          placeholder={t("log.searchPlaceholder")}
          autoComplete="off"
          onFocus={() => setSuggestionsOpen(query.trim().length > 0 && !selectedCard)}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedCard(null);
            setSuggestionsOpen(true);
          }}
          onKeyDown={handleSearchKeyDown}
        />
        {query && <button type="button" onClick={clearSearch} aria-label={t("log.clearSearch")} title={t("log.clearSearch")}><X size={13} /></button>}
      </div>
      {suggestionsOpen && query.trim() && (
        <div id={suggestionsId} className="game-log-suggestions" role="listbox">
          {suggestions.length > 0 ? suggestions.map((name, index) => (
            <button
              id={`${suggestionsId}-option-${index}`}
              key={name}
              type="button"
              role="option"
              aria-selected={index === activeSuggestion}
              className={index === activeSuggestion ? "is-active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveSuggestion(index)}
              onClick={() => selectCard(name)}
            >
              <span className="game-log-card-glyph" aria-hidden="true">+</span>
              <span>{highlightText(name, query)}</span>
            </button>
          )) : <div className="game-log-no-results">{t("log.noCardNames")}</div>}
        </div>
      )}
    </div>
  );

  const matchNavigator = selectedCard ? (
    <div className="game-log-match-nav" aria-live="polite">
      <span>{matchingIndices.length > 0 ? t("log.matchCount", { current: activeMatch + 1, total: matchingIndices.length }) : t("log.noMatches")}</span>
      <button type="button" disabled={matchingIndices.length === 0} onClick={() => navigateMatches(-1)} title={t("log.previousMatch")} aria-label={t("log.previousMatch")}><ChevronUp size={14} /></button>
      <button type="button" disabled={matchingIndices.length === 0} onClick={() => navigateMatches(1)} title={t("log.nextMatch")} aria-label={t("log.nextMatch")}><ChevronDown size={14} /></button>
    </div>
  ) : <div className="game-log-match-count">{t("log.eventCount", { count: visibleLog.length })}</div>;

  let previousGroup = "";
  const entries = (
    <ol className="game-log-list">
      {visibleLog.map((entry) => {
        const kind = classifyLogEntry(entry.text);
        const matchPosition = matchingIndices.indexOf(entry.sourceIndex);
        const matches = matchPosition >= 0;
        const group = `${entry.turn}-${entry.side}`;
        const showDivider = group !== previousGroup;
        previousGroup = group;
        return (
          <li
            key={`${entry.text}-${entry.sourceIndex}`}
            ref={(node) => { node ? matchRefs.current.set(entry.sourceIndex, node) : matchRefs.current.delete(entry.sourceIndex); }}
            className={[matches ? "is-card-match" : "", matches && matchPosition === activeMatch ? "is-active-match" : ""].filter(Boolean).join(" ")}
          >
            {showDivider && (
              <div className="game-log-turn-divider">
                <span>{t("log.turn", { turn: entry.turn })}</span>
                <i>{entry.side === "player" ? t("setup.playerSide") : t("setup.hostSide")}</i>
              </div>
            )}
            <div className="game-log-entry-body">
              <div className="game-log-entry-meta"><span className={`game-log-kind game-log-kind-${kind}`}>{t(KIND_LABELS[kind])}</span></div>
              <div className="game-log-entry-text">
                {renderEntryText(entry.text, cards, selectedCard, showCardPreview, () => {
                  setPreviewCard(undefined);
                  setPreviewPosition(undefined);
                }, (card) => {
                  setPreviewCard(undefined);
                  setDetailsCard(card);
                }, t("common.openDetails"))}
              </div>
            </div>
          </li>
        );
      })}
      {visibleLog.length === 0 && <li className="game-log-empty">{t("log.empty")}</li>}
    </ol>
  );

  const overlays = typeof document !== "undefined" ? createPortal(
    <>
      {previewCard && previewPosition && previewDetails.imageUrl && !detailsCard && (
        <div className="game-log-card-preview" style={previewPosition} aria-hidden="true">
          <img src={previewDetails.imageUrl} alt="" />
        </div>
      )}
      {detailsCard && (
        <GraveyardDetailsModal
          game={game}
          card={detailsCard}
          fontSize={detailsFontSize}
          setFontSize={setDetailsFontSize}
          transition="idle"
          closing={false}
          onClose={() => setDetailsCard(undefined)}
          position={1}
          total={1}
          contextLabel={t("log.cardContext")}
          backdropClassName="game-log-details-backdrop"
        />
      )}
    </>, document.body) : null;

  if (variant === "embedded") {
    return (
      <div className={`game-log-embedded min-h-0 ${className}`}>
        <div className="game-log-tools">{search}{matchNavigator}</div>
        <div className="game-log-scroll old-scrollbar">{entries}</div>
        {overlays}
      </div>
    );
  }

  return (
    <aside className={`game-log-panel hf-ui-panel-soft flex min-h-0 flex-col ${className}`}>
      <div className="game-log-panel-title hf-ui-title">{t("log.title")} <span>{visibleLog.length}</span></div>
      <div className="game-log-panel-search">{search}{matchNavigator}</div>
      <div className="game-log-scroll old-scrollbar">{entries}</div>
      {overlays}
    </aside>
  );
}

function collectCards(game: GameState): CardInstance[] {
  return [
    ...game.player.archive, ...game.player.hand, ...game.player.field, ...game.player.memory, ...game.player.oblivion,
    ...game.host.archive, ...game.host.field, ...game.host.memory, ...game.host.oblivion,
    ...(game.host.pendingCard ? [game.host.pendingCard] : []),
  ];
}

function annotateLog(entries: string[], game: GameState, language: "en" | "es"): LogEntry[] {
  let turn = game.turnNumber;
  let side = game.activeSide;
  return entries.map((text, sourceIndex) => {
    let entrySide = side;
    if (/^Host turn ends/i.test(text)) {
      entrySide = "host";
      side = "host";
    } else if (/Player starts the turn/i.test(text)) {
      entrySide = "player";
      const setupTransition = entries[sourceIndex - 1]?.includes("Setup turn complete");
      side = setupTransition ? "player" : "host";
    } else if (/^(Player ends turn|Setup complete)/i.test(text)) {
      entrySide = "player";
      side = "player";
    } else if (/^Host readies/i.test(text)) {
      entrySide = "host";
      side = "host";
    }
    const entryTurn = /^Host turn ends/i.test(text) ? turn - 1 : turn;
    const annotated = { text: canonicalizeLogText(text, language), sourceIndex, turn: Math.max(1, entryTurn), side: entrySide };
    if (/Player starts the turn/i.test(text)) turn -= 1;
    return annotated;
  });
}

function renderEntryText(
  text: string,
  cards: CardInstance[],
  selectedCard: string | null,
  onEnter: (event: React.SyntheticEvent<HTMLButtonElement>, card: CardInstance) => void,
  onLeave: () => void,
  onOpen: (card: CardInstance) => void,
  openTitle: string,
): React.ReactNode {
  const cardByName = new Map<string, CardInstance>();
  for (const card of cards) if (!cardByName.has(card.name.toLocaleLowerCase())) cardByName.set(card.name.toLocaleLowerCase(), card);
  const names = [...cardByName.keys()].sort((a, b) => b.length - a.length);
  if (names.length === 0) return selectedCard ? highlightText(text, selectedCard) : text;
  const matcher = new RegExp(`(${names.map(escapeRegExp).join("|")})`, "gi");
  return text.split(matcher).map((part, index) => {
    const card = cardByName.get(part.toLocaleLowerCase());
    if (!card) return <span key={`${part}-${index}`}>{selectedCard ? highlightText(part, selectedCard) : part}</span>;
    const active = selectedCard?.toLocaleLowerCase() === card.name.toLocaleLowerCase();
    return (
      <button
        key={`${part}-${index}`}
        type="button"
        className="game-log-card-link"
        data-card-id={card.instanceId}
        onMouseEnter={(event) => onEnter(event, card)}
        onMouseLeave={onLeave}
        onFocus={(event) => onEnter(event, card)}
        onBlur={onLeave}
        onClick={() => onOpen(card)}
        title={`${openTitle}: ${card.displayName}`}
      >
        {active ? <mark>{part}</mark> : part}
      </button>
    );
  });
}

function classifyLogEntry(entry: string): LogKind {
  const value = entry.toLocaleLowerCase();
  if (/attack|block|combat|damage|deals/.test(value)) return "combat";
  if (/play|action|reaction|counter|gets \+|invoke|invoca/.test(value)) return "spell";
  if (/dies|muere|destroy|destruye|sacrifice|sacrifica|discard|descarta|banish|destierra/.test(value)) return "death";
  if (/life|poison/.test(value)) return "life";
  if (/draw|reveal/.test(value)) return "draw";
  if (/turn|turno|ready|prepara|phase|fase|setup/.test(value)) return "turn";
  return "system";
}

function highlightText(text: string, search: string): React.ReactNode {
  const needle = search.trim();
  if (!needle) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(needle)})`, "gi"));
  return parts.map((part, index) => part.toLocaleLowerCase() === needle.toLocaleLowerCase() ? <mark key={`${part}-${index}`}>{part}</mark> : part);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
