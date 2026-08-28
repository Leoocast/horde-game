import { AlertTriangle, ArrowLeft, ChevronDown, Copy, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import type { MatchOrigin } from "../content/MatchOrigin";
import type { InspectableDeck } from "../data/deckCatalog";
import { findDeckKeyCard } from "../data/deckCatalog";
import { summarizeAttempt } from "../history/attemptNarrative";
import type { HistoryHealth } from "../history/historyService";
import { productHistoryRuntime } from "../history/historyRuntime";
import {
  buildHistoryLibraryViewModel,
  type HistoryLibraryAttemptViewModel,
  type HistoryLibraryFutureViewModel,
} from "../history/historyViewModel";
import { localizedCardName } from "../i18n/cardLocalization";
import type { TranslationKey } from "../i18n/translations";
import { useTranslation } from "../i18n/useTranslation";
import { writeClipboardText } from "../platform/desktopBridge";
import { useLanguageStore } from "../store/useLanguageStore";
import { useToastStore } from "../store/useToastStore";
import { useDeckCardDetails } from "../utils/deckCardImages";
import { chronicleSigilPlan } from "./chronicleSigilGeometry";
import { GameConfirmationDialog } from "./GameConfirmationDialog";

type Props = Readonly<{
  decks: readonly InspectableDeck[];
  hostDecks: readonly InspectableDeck[];
  onBack: () => void;
  onPlay: () => void;
  onReplay: (origin: MatchOrigin) => void;
  closing?: boolean;
}>;

const ATTEMPT_LABEL_KEYS = [
  "seeds.attemptFirst",
  "seeds.attemptSecond",
] as const satisfies readonly TranslationKey[];

const DIFFICULTY_KEYS = {
  easy: "setup.adventurer",
  normal: "setup.veteran",
  hard: "setup.doomed",
} as const satisfies Record<string, TranslationKey>;

const subscribeHistory = (listener: () => void) => productHistoryRuntime.subscribe(listener);
const readHistory = () => productHistoryRuntime.snapshot();

/** Real, factual library backed by the same HistoryService authority that records matches. */
export function SeedsOfDestinyScreen({ decks, hostDecks, onBack, onPlay, onReplay, closing = false }: Props) {
  const t = useTranslation();
  const pushToast = useToastStore((state) => state.pushToast);
  const snapshot = useSyncExternalStore(subscribeHistory, readHistory, readHistory);
  const library = useMemo(() => buildHistoryLibraryViewModel(snapshot), [snapshot]);
  const [selectedKey, setSelectedKey] = useState("");
  const [openAttempt, setOpenAttempt] = useState<string>();
  const [resetPrompt, setResetPrompt] = useState<"confirm" | "unrecoverable">();
  const [resetting, setResetting] = useState(false);
  const future = library.futures.find((entry) => entry.key === selectedKey) ?? library.futures[0];

  useEffect(() => {
    if (!future) {
      if (selectedKey) setSelectedKey("");
      if (openAttempt) setOpenAttempt(undefined);
      return;
    }
    if (future.key !== selectedKey) {
      setSelectedKey(future.key);
      setOpenAttempt(latestAttemptId(future));
    }
  }, [future, openAttempt, selectedKey]);

  function selectFuture(key: string) {
    if (key !== selectedKey) {
      const nextFuture = library.futures.find((entry) => entry.key === key);
      setOpenAttempt(latestAttemptId(nextFuture));
    }
    setSelectedKey(key);
  }

  async function resetHistory(allowWithoutDiagnostic: boolean) {
    if (resetting) return;
    setResetting(true);
    try {
      const result = await productHistoryRuntime.reset(allowWithoutDiagnostic);
      if (result.requiresUnrecoverableConfirmation) setResetPrompt("unrecoverable");
      else if (result.reset) setResetPrompt(undefined);
      else pushToast({ title: t("seeds.resetFailedTitle"), message: t("seeds.resetFailedBody"), tone: "warning" });
    } catch {
      pushToast({ title: t("seeds.resetFailedTitle"), message: t("seeds.resetFailedBody"), tone: "warning" });
    } finally {
      setResetting(false);
    }
  }

  return (
    <section
      className={`main-settings-screen seeds-panel ${closing ? "is-closing" : ""}`}
      aria-label={t("menu.seedsOfDestiny")}
    >
      <header className="expedition-header seeds-header">
        <button className="menu-screen-back expedition-back" type="button" onClick={onBack}>
          <ArrowLeft size={18} /> {t("common.mainMenu")}
        </button>
        <div>
          <h1>{t("menu.seedsOfDestiny")}</h1>
        </div>
      </header>

      <HistoryHealthBanner
        health={library.health}
        dirty={library.dirty}
        resetting={resetting}
        onRetry={() => void productHistoryRuntime.retryDurability()}
        onReset={() => setResetPrompt("confirm")}
      />

      {library.phase === "loading" || library.phase === "empty" ? (
        <EmptyLibraryState onPlay={onPlay} />
      ) : future ? (
        <div className="seeds-book">
          <div className="seeds-index">
            <p className="seeds-index-label" id="seeds-index-label">{t("seeds.indexLabel")}</p>
            <ul className="seeds-index-list" aria-labelledby="seeds-index-label">
              {library.futures.map((entry, position) => (
                <SeedIndexEntry
                  key={entry.key}
                  future={entry}
                  decks={decks}
                  hostDecks={hostDecks}
                  current={entry.key === future.key}
                  onSelect={() => selectFuture(entry.key)}
                  onMove={(offset) => {
                    const next = library.futures[position + offset];
                    if (next) selectFuture(next.key);
                  }}
                />
              ))}
            </ul>
          </div>

          <SeedFuturePage
            future={future}
            decks={decks}
            hostDecks={hostDecks}
            openAttempt={openAttempt}
            onToggleAttempt={(attemptId) => setOpenAttempt((current) =>
              current === attemptId ? undefined : attemptId)}
            onReplay={onReplay}
          />
        </div>
      ) : null}

      {resetPrompt && createPortal(
        <div className="game-settings-popover game-system-confirmation-layer game-home-backdrop fixed inset-0 flex items-center justify-center p-6 text-[#e4ddc2]">
          <GameConfirmationDialog
            titleId="history-reset-title"
            title={t(resetPrompt === "confirm" ? "seeds.resetTitle" : "seeds.resetUnrecoverableTitle")}
            body={t(resetPrompt === "confirm" ? "seeds.resetBody" : "seeds.resetUnrecoverableBody")}
            actions={[
              { label: t("common.cancel"), onClick: () => setResetPrompt(undefined) },
              {
                label: resetting ? t("seeds.resetting") : t("seeds.resetAction"),
                icon: <RotateCcw size={16} />,
                onClick: () => void resetHistory(resetPrompt === "unrecoverable"),
                primary: true,
              },
            ]}
          />
        </div>,
        document.body,
      )}
    </section>
  );
}

function HistoryHealthBanner({
  health,
  dirty,
  resetting,
  onRetry,
  onReset,
}: Readonly<{
  health: HistoryHealth;
  dirty: boolean;
  resetting: boolean;
  onRetry: () => void;
  onReset: () => void;
}>) {
  const t = useTranslation();
  if (health === "healthy") return null;
  const resettable = health === "full" || health === "corrupt";
  const titleKey = `seeds.health.${health}Title` as TranslationKey;
  const bodyKey = `seeds.health.${health}Body` as TranslationKey;
  return (
    <aside className={`seeds-health seeds-health-${health}`} role={health === "recovered" ? "status" : "alert"}>
      <AlertTriangle size={19} aria-hidden="true" />
      <span><strong>{t(titleKey)}</strong><small>{t(bodyKey)}</small></span>
      {health === "degraded" && dirty && (
        <button type="button" onClick={onRetry}>{t("seeds.retrySave")}</button>
      )}
      {resettable && (
        <button type="button" onClick={onReset} disabled={resetting}>{t("seeds.resetAction")}</button>
      )}
    </aside>
  );
}

function EmptyLibraryState({ onPlay }: Readonly<{ onPlay: () => void }>) {
  const t = useTranslation();

  return (
    <div className="seeds-library-state seeds-library-empty" aria-labelledby="seeds-empty-title">
      <h2 id="seeds-empty-title">{t("seeds.emptyTitle")}</h2>
      <p>{t("seeds.emptyBody")}</p>
      <button className="seeds-empty-action" type="button" onClick={onPlay}>
        <span>{t("seeds.emptyAction")}</span>
      </button>
    </div>
  );
}

function SeedIndexEntry({
  future,
  decks,
  hostDecks,
  current,
  onSelect,
  onMove,
}: Readonly<{
  future: HistoryLibraryFutureViewModel;
  decks: readonly InspectableDeck[];
  hostDecks: readonly InspectableDeck[];
  current: boolean;
  onSelect: () => void;
  onMove: (offset: number) => void;
}>) {
  const t = useTranslation();
  const { chronicle, host } = findFutureDecks(future, decks, hostDecks);
  return (
    <li>
      <button
        type="button"
        className="seeds-index-entry"
        aria-current={current}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); onMove(1); }
          if (event.key === "ArrowUp") { event.preventDefault(); onMove(-1); }
        }}
      >
        <DestinySeal state={future.status} size={34} />
        <span className="seeds-entry-identity">
          <span className="seeds-entry-code">{future.code}</span>
          {future.collision && (
            <small>{chronicle?.label ?? future.playerDeckKey} · {host?.label ?? future.hostDeckKey} · {future.identityRevision}</small>
          )}
        </span>
        <span className={`seeds-entry-word seeds-state-${future.status}`}>{t(statusLabelKey(future.status))}</span>
      </button>
    </li>
  );
}

function SeedFuturePage({
  future,
  decks,
  hostDecks,
  openAttempt,
  onToggleAttempt,
  onReplay,
}: Readonly<{
  future: HistoryLibraryFutureViewModel;
  decks: readonly InspectableDeck[];
  hostDecks: readonly InspectableDeck[];
  openAttempt?: string;
  onToggleAttempt: (attemptId: string) => void;
  onReplay: (origin: MatchOrigin) => void;
}>) {
  const t = useTranslation();
  const pushToast = useToastStore((state) => state.pushToast);
  const { chronicle, host } = findFutureDecks(future, decks, hostDecks);

  async function copyIdentity() {
    if (!future.copyIdentity) return;
    try {
      await writeClipboardText(future.copyIdentity);
      pushToast({ title: t("destiny.identityCopied"), message: t("destiny.future", { code: future.code }), tone: "success" });
    } catch {
      pushToast({ title: t("destiny.identityCopyFailed"), message: t("destiny.future", { code: future.code }), tone: "warning" });
    }
  }

  return (
    <div className="seeds-page">
      <div className="seeds-duel">
        {chronicle ? <SeedDuelCard deck={chronicle} side="player" /> : <span />}

        <div className="seeds-duel-center">
          <span className="seeds-duel-kicker">{t("destiny.futureWord")}</span>
          <h3 className="seeds-duel-code">{future.code}</h3>
          <span className={`seeds-duel-state seeds-state-${future.status}`}>
            <DestinySeal state={future.status} size={22} />
            {t(statusHeadlineKey(future.status))}
          </span>
          <p className="seeds-duel-match">
            <span>{chronicle?.label ?? future.playerDeckKey}</span>
            <span className="seeds-versus">{t("seeds.versus")}</span>
            <span className="seeds-host-side">{host?.label ?? future.hostDeckKey}</span>
          </p>
          <p className="seeds-duel-difficulty">
            {t(DIFFICULTY_KEYS[future.difficulty])}
          </p>
          {future.collision && <p className="seeds-identity-note">{t("seeds.collisionNote", { revision: future.identityRevision })}</p>}
          <div className="seeds-duel-copy">
            {future.copyIdentity ? (
              <button type="button" className="seeds-copy-chip" onClick={copyIdentity}>
                <Copy size={14} /> {t("seeds.copyIdentity")}
              </button>
            ) : (
              <p className="seeds-identity-note">{t("seeds.localOnly")}</p>
            )}
          </div>
        </div>

        {host ? <SeedDuelCard deck={host} side="host" /> : <span />}
      </div>

      <SeedThread future={future} openAttempt={openAttempt} onToggleAttempt={onToggleAttempt} />

      <footer className="seeds-page-actions">
        {!future.replayOrigin && (
          <p className="seeds-replay-unavailable">{t(replayUnavailableKey(future.replayUnavailableReason))}</p>
        )}
        <button
          type="button"
          className="seeds-action is-rewrite"
          disabled={!future.replayOrigin}
          onClick={() => future.replayOrigin && onReplay(future.replayOrigin)}
        >
          <strong>{t("destiny.contemplateThisAgain")}</strong>
        </button>
      </footer>
    </div>
  );
}

function findFutureDecks(
  future: HistoryLibraryFutureViewModel,
  decks: readonly InspectableDeck[],
  hostDecks: readonly InspectableDeck[],
) {
  return {
    chronicle: future.playerDeckId ? decks.find((deck) => deck.id === future.playerDeckId) : undefined,
    host: future.hostDeckId ? hostDecks.find((deck) => deck.id === future.hostDeckId) : undefined,
  };
}

function SeedDuelCard({ deck, side }: Readonly<{ deck: InspectableDeck; side: "player" | "host" }>) {
  const language = useLanguageStore((state) => state.language);
  const keyCard = findDeckKeyCard(deck);
  const details = useDeckCardDetails(keyCard, deck.images);
  const cardName = localizedCardName(keyCard, language) || deck.label;
  if (!details.imageUrl) return <span className={`seeds-duel-card seeds-duel-card-${side}`} />;
  return (
    <figure className={`seeds-duel-card seeds-duel-card-${side}`}>
      <img src={details.imageUrl} alt={cardName} draggable={false} />
    </figure>
  );
}

function SeedThread({
  future,
  openAttempt,
  onToggleAttempt,
}: Readonly<{
  future: HistoryLibraryFutureViewModel;
  openAttempt?: string;
  onToggleAttempt: (attemptId: string) => void;
}>) {
  const t = useTranslation();
  return (
    <div className="seeds-thread-wrap">
      <p className="seeds-thread-label">{t("seeds.threadLabel")}</p>
      <ol className="seeds-thread">
        {future.attempts.map((attempt) => (
          <SeedThreadItem
            key={attempt.attemptId}
            attempt={attempt}
            open={attempt.attemptId === openAttempt}
            onToggle={() => onToggleAttempt(attempt.attemptId)}
          />
        ))}
      </ol>
      <p className={`seeds-thread-seal seeds-state-${future.status}`}>
        {t(statusHeadlineKey(future.status))}.
        <small>{sealPhrase(future, t)}</small>
      </p>
    </div>
  );
}

function SeedThreadItem({
  attempt,
  open,
  onToggle,
}: Readonly<{
  attempt: HistoryLibraryAttemptViewModel;
  open: boolean;
  onToggle: () => void;
}>) {
  const t = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const bodyId = `seed-attempt-${attempt.attemptId.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
  const label = attemptLabel(attempt.ordinal, t);
  const narrative = useMemo(() => summarizeAttempt({
    outcome: attempt.status,
    ...(attempt.turnNumber === undefined ? {} : { turnNumber: attempt.turnNumber }),
    milestones: attempt.milestones,
  }, language), [attempt, language]);
  const hasNarrative = !narrative.fallback;
  return (
    <li className={`seeds-thread-item is-${attempt.status}`}>
      <button
        type="button"
        className="seeds-thread-line"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <span className="seeds-thread-title">
          <b>{label}</b>{" — "}
          <span className="seeds-verdict-word">{t(attemptVerdictKey(attempt.status))}</span>{" "}
          {attempt.turnNumber === undefined ? "" : t("seeds.attemptTurn", { turn: attempt.turnNumber })}
        </span>
        <ChevronDown className="seeds-attempt-chevron" size={18} aria-hidden="true" />
      </button>
      <div className="seeds-attempt-detail" id={bodyId} hidden={!open}>
        {hasNarrative && <p className="seeds-attempt-body">{narrative.paragraph}</p>}
        {hasNarrative && narrative.marks.length > 0 && (
          <ul className="seeds-attempt-marks">
            {narrative.marks.map((mark, index) => (
              <li key={`${attempt.attemptId}:mark:${index}`}><span>{mark}</span></li>
            ))}
          </ul>
        )}
        {!hasNarrative && attempt.status === "interrupted" && (
          <p className="seeds-attempt-body">{t("seeds.interruptedAttempt")}</p>
        )}
        {attempt.finalFacts && (
          <ul className="seeds-attempt-marks seeds-attempt-facts">
            <li><span>{t("seeds.finalLife", { count: attempt.finalFacts.playerLife })}</span></li>
            <li><span>{t("seeds.finalHostArchive", { count: attempt.finalFacts.hostArchiveRemaining })}</span></li>
          </ul>
        )}
      </div>
    </li>
  );
}

function attemptLabel(
  ordinal: number,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  const key = ATTEMPT_LABEL_KEYS[ordinal - 1];
  return key ? t(key) : t("seeds.attemptNumbered", { number: ordinal });
}

function latestAttemptId(future: HistoryLibraryFutureViewModel | undefined): string | undefined {
  if (!future || future.attempts.length === 0) return undefined;
  return future.attempts[future.attempts.length - 1]?.attemptId;
}

function sealPhrase(
  future: HistoryLibraryFutureViewModel,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
) {
  if (future.status === "preserved") {
    const victory = future.attempts.find((attempt) => attempt.status === "victory");
    if (!victory || victory.ordinal === 1) return t("seeds.sealPreservedFirst");
    return t("seeds.sealPreservedOn", { label: attemptLabel(victory.ordinal, t) });
  }
  if (future.status === "interrupted") {
    return t(future.attempts.length === 1 ? "seeds.sealInterruptedOnce" : "seeds.sealInterruptedMany", {
      count: future.attempts.length,
    });
  }
  if (future.attempts.length === 1) return t("seeds.sealLostOnce");
  return t("seeds.sealLostMany", { count: future.attempts.length });
}

function statusLabelKey(status: HistoryLibraryFutureViewModel["status"]): TranslationKey {
  if (status === "preserved") return "seeds.statePreserved";
  if (status === "lost") return "seeds.stateLost";
  return "seeds.stateInterrupted";
}

function statusHeadlineKey(status: HistoryLibraryFutureViewModel["status"]): TranslationKey {
  if (status === "preserved") return "destiny.destinyPreserved";
  if (status === "lost") return "destiny.futureLost";
  return "seeds.historyInterrupted";
}

function attemptVerdictKey(status: HistoryLibraryAttemptViewModel["status"]): TranslationKey {
  if (status === "victory") return "seeds.verdictVictory";
  if (status === "defeat") return "seeds.verdictDefeat";
  return "seeds.verdictInterrupted";
}

function replayUnavailableKey(reason: HistoryLibraryFutureViewModel["replayUnavailableReason"]): TranslationKey {
  if (reason === "deck-unavailable") return "seeds.replayDeckUnavailable";
  if (reason === "identity-mismatch") return "seeds.replayIdentityMismatch";
  return "seeds.replayIncompatible";
}

const SEAL_RING_RADIUS = 100;
const SEAL_PLAN = chronicleSigilPlan(SEAL_RING_RADIUS, 1);
const SEAL_ROSE_PATH = `M${SEAL_PLAN.nodes
  .slice(0, 16)
  .map((node) => `${node.x.toFixed(2)} ${node.y.toFixed(2)}`)
  .join("L")}Z`;
const SEAL_INCISION_PATH = SEAL_PLAN.nodes
  .slice(0, 16)
  .filter((_, index) => index % 2 === 0)
  .map((node) => {
    const from = `${(node.x * 0.24).toFixed(2)} ${(node.y * 0.24).toFixed(2)}`;
    const to = `${(node.x * 0.68).toFixed(2)} ${(node.y * 0.68).toFixed(2)}`;
    return `M${from}L${to}`;
  })
  .join(" ");

function DestinySeal({
  state,
  size,
}: Readonly<{ state: HistoryLibraryFutureViewModel["status"]; size: number }>) {
  return (
    <svg
      className="seeds-seal"
      data-state={state}
      viewBox="-108 -108 216 216"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <path className="rose" d={SEAL_ROSE_PATH} />
      <path className="incision" d={SEAL_INCISION_PATH} />
      <circle className="heart" r={5} />
    </svg>
  );
}
