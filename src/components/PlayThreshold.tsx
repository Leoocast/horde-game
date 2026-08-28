import { ArrowLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { importCanonMatchOrigin, matchOriginVisualSeed, type MatchOrigin } from "../content/MatchOrigin";
import type { InspectableDeck } from "../data/deckCatalog";
import { useTranslation } from "../i18n/useTranslation";
import { futureCodeFromSeed } from "../utils/futureIdentity";

/** A Canon code is always `HF1-PPP-HHH-XXD-XXX`: below that length it is still being written. */
const CANON_CODE_LENGTH = 19;

type DecodedDraft =
  | Readonly<{ status: "empty" }>
  | Readonly<{ status: "partial" }>
  | Readonly<{ status: "invalid" }>
  | Readonly<{ status: "ready"; origin: MatchOrigin; playerDeck: InspectableDeck; hostDeck: InspectableDeck }>;

type Props = Readonly<{
  playerDecks: readonly InspectableDeck[];
  hostDecks: readonly InspectableDeck[];
  closing: boolean;
  onNewFuture: () => void;
  onInscribedFuture: (origin: MatchOrigin) => void;
  onBack: () => void;
}>;

/**
 * The fork behind **Play**: a new future the Destiny shuffles, or one already inscribed.
 * It owns the whole screen but never remounts the menu behind it — the background art and
 * the TemporalBackdrop stay exactly where they were, only a shade lower.
 */
export function PlayThreshold({ playerDecks, hostDecks, closing, onNewFuture, onInscribedFuture, onBack }: Props) {
  const t = useTranslation();
  const [inscribing, setInscribing] = useState(false);
  const [inscribeClosing, setInscribeClosing] = useState(false);
  const [draft, setDraft] = useState("");
  const gatesRef = useRef<HTMLDivElement>(null);

  const decoded = useMemo<DecodedDraft>(() => {
    const code = draft.trim();
    if (!code) return { status: "empty" };
    try {
      const imported = importCanonMatchOrigin(code);
      const playerDeck = playerDecks.find((deck) => deck.id === imported.playerDeckId);
      const hostDeck = hostDecks.find((deck) => deck.id === imported.hostDeckId);
      if (!playerDeck || !hostDeck) return { status: "invalid" };
      return { status: "ready", origin: imported, playerDeck, hostDeck };
    } catch {
      return { status: code.length >= CANON_CODE_LENGTH ? "invalid" : "partial" };
    }
  }, [draft, hostDecks, playerDecks]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (inscribing) closeInscribe();
        else onBack();
        return;
      }
      if (inscribing) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const gates = Array.from(gatesRef.current?.querySelectorAll<HTMLButtonElement>("[data-gate]") ?? []);
      if (gates.length < 2) return;
      const current = gates.findIndex((gate) => gate === document.activeElement);
      const step = event.key === "ArrowLeft" ? -1 : 1;
      event.preventDefault();
      gates[(Math.max(current, 0) + step + gates.length) % gates.length].focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function openInscribe() {
    setInscribeClosing(false);
    setInscribing(true);
  }

  function closeInscribe() {
    if (inscribeClosing) return;
    setInscribeClosing(true);
    window.setTimeout(() => {
      setInscribing(false);
      setInscribeClosing(false);
    }, 200);
  }

  function confirmInscribed() {
    if (decoded.status !== "ready") return;
    onInscribedFuture(decoded.origin);
  }

  /* The aura follows the pointer inside its own door; the other one steps back. */
  function trackAura(event: React.PointerEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--gate-pointer-x", `${((event.clientX - bounds.left) / bounds.width) * 100}%`);
    event.currentTarget.style.setProperty("--gate-pointer-y", `${((event.clientY - bounds.top) / bounds.height) * 100}%`);
  }

  const difficultyLabel = decoded.status === "ready"
    ? t(decoded.origin.difficulty === "easy" ? "setup.adventurer" : decoded.origin.difficulty === "normal" ? "setup.veteran" : "setup.doomed")
    : "";

  return (
    <section className={`play-threshold ${closing ? "is-closing" : ""}`} aria-label={t("threshold.aria")}>
      <div className="play-threshold-veil" aria-hidden="true" />

      <button className="play-threshold-back expedition-back" type="button" onClick={onBack}>
        <ArrowLeft size={18} /> {t("common.mainMenu")}
      </button>

      <div className="play-threshold-body">
        <header className="play-threshold-head">
          <h1 className="play-threshold-title">{t("threshold.title")}</h1>
          <p className="play-threshold-lead">{t("threshold.lead")}</p>
        </header>

        <div className="play-threshold-gates" ref={gatesRef}>
          {/* La costura: la única línea de la composición, y sólo separa las cartas. */}
          <span className="play-threshold-seam" aria-hidden="true" />

          <button className="play-threshold-gate" data-gate="new" type="button" autoFocus onClick={onNewFuture} onPointerMove={trackAura}>
            <span className="play-threshold-gate-head">
              <span className="play-threshold-gate-kicker">{t("threshold.newKicker")}</span>
              <span className="play-threshold-gate-title">{t("threshold.newTitle")}</span>
            </span>
            <span className="play-threshold-gate-copy">{t("threshold.newDescription")}</span>
            <span className="play-threshold-gate-action">{t("threshold.newAction")}<ChevronRight size={17} aria-hidden="true" /></span>
          </button>

          <button className="play-threshold-gate" data-gate="inscribed" type="button" onClick={openInscribe} onPointerMove={trackAura}>
            <span className="play-threshold-gate-head">
              <span className="play-threshold-gate-kicker">{t("threshold.inscribedKicker")}</span>
              <span className="play-threshold-gate-title">{t("threshold.inscribedTitle")}</span>
            </span>
            <span className="play-threshold-gate-copy">{t("threshold.inscribedDescription")}</span>
            <span className="play-threshold-gate-action">{t("threshold.inscribedAction")}<ChevronRight size={17} aria-hidden="true" /></span>
          </button>
        </div>
      </div>

      {inscribing && (
        <div
          className={`play-inscribe-backdrop game-home-backdrop ${inscribeClosing ? "is-closing" : ""}`}
          role="presentation"
          onPointerDown={(event) => { if (event.target === event.currentTarget) closeInscribe(); }}
        >
          <form
            className={`play-inscribe-dialog hf-ui-panel game-dialog game-home-dialog ${inscribeClosing ? "is-closing" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="play-inscribe-title"
            autoComplete="off"
            onSubmit={(event) => { event.preventDefault(); confirmInscribed(); }}
          >
            <button className="play-inscribe-close" type="button" onClick={closeInscribe} title={t("common.close")} aria-label={t("common.close")}>
              <X size={16} />
            </button>

            <p className="game-dialog-kicker">{t("threshold.inscribeKicker")}</p>
            <h2 id="play-inscribe-title" className="hf-ui-title">{t("threshold.inscribeTitle")}</h2>
            <p className="play-inscribe-lead">{t("threshold.inscribeDescription")}</p>

            <label className="sr-only" htmlFor="play-inscribe-code">{t("setup.canonSeed")}</label>
            <input
              id="play-inscribe-code"
              className="play-inscribe-input game-seed-input"
              value={draft}
              placeholder="HF1-ELA-GRV-XX1-XXX"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
              onChange={(event) => setDraft(event.currentTarget.value.toUpperCase())}
            />

            <div className="play-inscribe-decoded">
              <div className={`play-inscribe-cell ${decoded.status === "ready" ? "is-known" : ""}`}>
                <span>{t("setup.playerSide")}</span>
                <strong>{decoded.status === "ready" ? decoded.playerDeck.deck.name : "· · ·"}</strong>
              </div>
              <div className={`play-inscribe-cell ${decoded.status === "ready" ? "is-known" : ""}`}>
                <span>{t("setup.difficulty")}</span>
                <strong>{decoded.status === "ready" ? difficultyLabel : "· · ·"}</strong>
              </div>
              <div className={`play-inscribe-cell ${decoded.status === "ready" ? "is-known" : ""}`}>
                <span>{t("setup.hostSide")}</span>
                <strong>{decoded.status === "ready" ? decoded.hostDeck.deck.name : "· · ·"}</strong>
              </div>
            </div>

            <div className="play-inscribe-result" aria-live="polite">
              {decoded.status === "ready" ? (
                <>
                  <p className="play-inscribe-result-label">{t("threshold.thisFutureIs")}</p>
                  <p className="play-threshold-future">{futureCodeFromSeed(matchOriginVisualSeed(decoded.origin))}</p>
                </>
              ) : decoded.status === "invalid" ? (
                <p className="play-inscribe-error" role="alert">{t("setup.canonInvalid")}</p>
              ) : (
                <p className="play-inscribe-note">{t("threshold.awaitingIdentity")}</p>
              )}
            </div>

            <div className="play-inscribe-actions">
              <button className="game-dialog-action play-inscribe-action" type="button" onClick={closeInscribe}>{t("common.cancel")}</button>
              <button
                className="game-dialog-action game-dialog-action-primary play-inscribe-action"
                type="submit"
                disabled={decoded.status !== "ready"}
              >
                {t("threshold.openFuture")}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
