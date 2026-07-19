import { Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import type { CardInstance, GameState } from "../engine/GameTypes";

type LogKind = "combat" | "spell" | "death" | "life" | "draw" | "turn" | "system";

const KIND_LABELS: Record<LogKind, string> = {
  combat: "Combat",
  spell: "Magic",
  death: "Fallen",
  life: "Vitality",
  draw: "Cards",
  turn: "Turn",
  system: "Event",
};

export function GameLog({ game, className = "", variant = "panel" }: { game: GameState; className?: string; variant?: "panel" | "embedded" }) {
  const [query, setQuery] = useState("");
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const suggestionsId = `game-log-card-suggestions-${useId().replace(/:/g, "")}`;
  const cardNames = useMemo(() => collectCardNames(game), [game]);
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
  const visibleLog = game.log.slice(0, 80);
  const matchCount = selectedCard
    ? visibleLog.filter((entry) => entry.toLocaleLowerCase().includes(selectedCard.toLocaleLowerCase())).length
    : 0;

  useEffect(() => setActiveSuggestion(0), [query]);

  function selectCard(name: string) {
    setQuery(name);
    setSelectedCard(name);
    setSuggestionsOpen(false);
  }

  function clearSearch() {
    setQuery("");
    setSelectedCard(null);
    setSuggestionsOpen(false);
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setSuggestionsOpen(true);
      setActiveSuggestion((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setSuggestionsOpen(true);
      setActiveSuggestion((current) => (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" && suggestionsOpen && suggestions[activeSuggestion]) {
      event.preventDefault();
      selectCard(suggestions[activeSuggestion]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      suggestionsOpen ? setSuggestionsOpen(false) : clearSearch();
    }
  }

  const search = (
    <div
      className="game-log-search-wrap"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSuggestionsOpen(false);
      }}
    >
      <div className={["game-log-search", selectedCard ? "has-selection" : ""].join(" ")}>
        <Search size={14} aria-hidden="true" />
        <input
          value={query}
          type="text"
          role="combobox"
          aria-label="Find a card in the chronicle"
          aria-autocomplete="list"
          aria-expanded={suggestionsOpen && suggestions.length > 0}
          aria-controls={suggestionsId}
          aria-activedescendant={suggestionsOpen && suggestions[activeSuggestion] ? `${suggestionsId}-option-${activeSuggestion}` : undefined}
          placeholder="Find a card..."
          autoComplete="off"
          onFocus={() => setSuggestionsOpen(query.trim().length > 0)}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedCard(null);
            setSuggestionsOpen(true);
          }}
          onKeyDown={handleSearchKeyDown}
        />
        {query && (
          <button type="button" onClick={clearSearch} aria-label="Clear card search" title="Clear search">
            <X size={13} />
          </button>
        )}
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
          )) : (
            <div className="game-log-no-results">No card names found</div>
          )}
        </div>
      )}
    </div>
  );

  const entries = (
    <ol className="game-log-list">
      {visibleLog.map((entry, index) => {
        const label = chroniclerLabel(entry);
        const kind = classifyLogEntry(entry);
        const matches = Boolean(selectedCard && label.toLocaleLowerCase().includes(selectedCard.toLocaleLowerCase()));
        return (
          <li key={`${entry}-${index}`} className={matches ? "is-card-match" : ""}>
            <div className="game-log-entry-meta">
              <span className={`game-log-kind game-log-kind-${kind}`}>{KIND_LABELS[kind]}</span>
              <span className="game-log-entry-index">{index === 0 ? "Latest" : `-${index}`}</span>
            </div>
            <div className="game-log-entry-text">{selectedCard ? highlightText(label, selectedCard) : label}</div>
          </li>
        );
      })}
      {visibleLog.length === 0 && <li className="game-log-empty">The chronicle has not begun.</li>}
    </ol>
  );

  if (variant === "embedded") {
    return (
      <div className={`game-log-embedded min-h-0 ${className}`}>
        <div className="game-log-tools">
          {search}
          <div className={["game-log-match-count", selectedCard ? "is-visible" : ""].join(" ")} aria-live="polite">
            {selectedCard ? `${matchCount} ${matchCount === 1 ? "entry" : "entries"}` : `${visibleLog.length} events`}
          </div>
        </div>
        <div className="game-log-scroll old-scrollbar">{entries}</div>
      </div>
    );
  }

  return (
    <aside className={`game-log-panel old-panel-soft flex min-h-0 flex-col ${className}`}>
      <div className="game-log-panel-title old-title">Chronicle <span>{visibleLog.length}</span></div>
      <div className="game-log-panel-search">{search}</div>
      <div className="game-log-scroll old-scrollbar">{entries}</div>
    </aside>
  );
}

function collectCardNames(game: GameState): string[] {
  const cards: CardInstance[] = [
    ...game.player.library,
    ...game.player.hand,
    ...game.player.battlefield,
    ...game.player.graveyard,
    ...game.player.exile,
    ...game.horde.library,
    ...game.horde.battlefield,
    ...game.horde.graveyard,
    ...game.horde.exile,
    ...(game.horde.pendingCard ? [game.horde.pendingCard] : []),
  ];
  return [...new Set(cards.map((card) => card.name).filter(Boolean))];
}

function classifyLogEntry(entry: string): LogKind {
  const value = entry.toLocaleLowerCase();
  if (/attack|block|combat|damage|deals/.test(value)) return "combat";
  if (/cast|activat|counter|gets \+|creates|enters the battlefield/.test(value)) return "spell";
  if (/dies|destroy|sacrifice|discard|mills|exile/.test(value)) return "death";
  if (/life|poison/.test(value)) return "life";
  if (/draw|reveal/.test(value)) return "draw";
  if (/turn|untap|phase|setup/.test(value)) return "turn";
  return "system";
}

function highlightText(text: string, search: string): React.ReactNode {
  const needle = search.trim();
  if (!needle) return text;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, index) => part.toLocaleLowerCase() === needle.toLocaleLowerCase()
    ? <mark key={`${part}-${index}`}>{part}</mark>
    : part);
}

function chroniclerLabel(entry: string): string {
  return entry.replace(/\bPlayer\b/g, "Chronicler").replace(/\bplayer\b/g, "Chronicler");
}
