import { ArrowLeft, Copy } from "lucide-react";
import { useMemo, useState } from "react";

import { chronicleSigilPlan } from "./chronicleSigilGeometry";
import { decodeCanonSeed } from "../content/CanonSeed";
import type { InspectableDeck } from "../data/deckCatalog";
import { findDeckKeyCard } from "../data/deckCatalog";
import { localizedCardName } from "../i18n/cardLocalization";
import { useTranslation } from "../i18n/useTranslation";
import type { AppLanguage, TranslationKey } from "../i18n/translations";
import { useLanguageStore } from "../store/useLanguageStore";
import { writeClipboardText } from "../platform/desktopBridge";
import { useToastStore } from "../store/useToastStore";
import { useDeckCardDetails } from "../utils/deckCardImages";
import { futureCodeFromSeed } from "../utils/futureIdentity";
import {
  SEEDS_OF_DESTINY_FIXTURE,
  type SeedAttemptFixture,
  type SeedFutureFixture,
} from "./seedsOfDestinyMockData";

/**
 * Archivo de Semillas del Destino.
 *
 * MAQUETA: la pantalla monta el diseño aprobado sobre datos falsos de
 * `seedsOfDestinyMockData`. No lee partidas, no persiste intentos y sus dos
 * salidas todavía no ejecutan nada. La maqueta de decisión es
 * `dev/mockups/ui/claude-seeds-of-destiny-menu.html`.
 */

type Props = Readonly<{
  decks: readonly InspectableDeck[];
  hostDecks: readonly InspectableDeck[];
  onBack: () => void;
  closing?: boolean;
}>;

const ATTEMPT_LABEL_KEYS = [
  "seeds.attemptFirst",
  "seeds.attemptSecond",
  "seeds.attemptThird",
  "seeds.attemptFourth",
  "seeds.attemptFifth",
] as const satisfies readonly TranslationKey[];

const DIFFICULTY_KEYS = {
  easy: "setup.adventurer",
  normal: "setup.veteran",
  hard: "setup.doomed",
} as const satisfies Record<string, TranslationKey>;

export function SeedsOfDestinyScreen({ decks, hostDecks, onBack, closing = false }: Props) {
  const t = useTranslation();
  const [selectedSeed, setSelectedSeed] = useState(SEEDS_OF_DESTINY_FIXTURE[0].seed);
  const [openAttempt, setOpenAttempt] = useState(-1);

  const future = SEEDS_OF_DESTINY_FIXTURE.find((entry) => entry.seed === selectedSeed)
    ?? SEEDS_OF_DESTINY_FIXTURE[0];

  function selectFuture(seed: string) {
    if (seed !== selectedSeed) setOpenAttempt(-1);
    setSelectedSeed(seed);
  }

  return (
    <section
      className={`main-settings-screen seeds-panel ${closing ? "is-closing" : ""}`}
      aria-label={t("menu.seedsOfDestiny")}
    >
      {/* Misma barra que la pantalla de Jugar: reutiliza `expedition-header` y
          `expedition-back` en lugar de copiar su material, para que las dos
          cabeceras sigan cambiando juntas. */}
      <header className="expedition-header seeds-header">
        <button className="expedition-back" type="button" onClick={onBack}>
          <ArrowLeft size={17} /> {t("common.mainMenu")}
        </button>
        <div>
          <h1>{t("menu.seedsOfDestiny")}</h1>
          <p className="seeds-intro">{t("seeds.intro")}</p>
        </div>
      </header>

      <div className="seeds-book">
        <div className="seeds-index">
          <p className="seeds-index-label" id="seeds-index-label">{t("seeds.indexLabel")}</p>
          <ul className="seeds-index-list" aria-labelledby="seeds-index-label">
            {SEEDS_OF_DESTINY_FIXTURE.map((entry, position) => (
              <SeedIndexEntry
                key={entry.seed}
                future={entry}
                current={entry.seed === selectedSeed}
                onSelect={() => selectFuture(entry.seed)}
                onMove={(offset) => {
                  const next = SEEDS_OF_DESTINY_FIXTURE[position + offset];
                  if (next) selectFuture(next.seed);
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
          onToggleAttempt={(index) => setOpenAttempt((current) => (current === index ? -1 : index))}
        />
      </div>
    </section>
  );
}

function useFutureDecks(
  future: SeedFutureFixture,
  decks: readonly InspectableDeck[],
  hostDecks: readonly InspectableDeck[],
) {
  const chronicle = decks.find((deck) => deck.id === future.chronicleDeckId);
  const host = hostDecks.find((deck) => deck.id === future.hostDeckId);
  return { chronicle, host };
}

/** La dificultad y el código salen de la propia Canon Seed, no del fixture. */
function useSeedIdentity(seed: string) {
  return useMemo(() => {
    const code = futureCodeFromSeed(seed);
    try {
      return { code, difficulty: decodeCanonSeed(seed).difficulty };
    } catch {
      return { code, difficulty: "normal" as const };
    }
  }, [seed]);
}

function SeedIndexEntry({
  future,
  current,
  onSelect,
  onMove,
}: Readonly<{
  future: SeedFutureFixture;
  current: boolean;
  onSelect: () => void;
  onMove: (offset: number) => void;
}>) {
  const t = useTranslation();
  const { code } = useSeedIdentity(future.seed);
  const stateWord = future.state === "preserved" ? t("seeds.statePreserved") : t("seeds.stateLost");

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
        <DestinySeal state={future.state} size={34} />
        <span className="seeds-entry-code">{code}</span>
        <span className={`seeds-entry-word seeds-state-${future.state}`}>{stateWord}</span>
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
}: Readonly<{
  future: SeedFutureFixture;
  decks: readonly InspectableDeck[];
  hostDecks: readonly InspectableDeck[];
  openAttempt: number;
  onToggleAttempt: (index: number) => void;
}>) {
  const t = useTranslation();
  const pushToast = useToastStore((state) => state.pushToast);
  const { code, difficulty } = useSeedIdentity(future.seed);
  const { chronicle, host } = useFutureDecks(future, decks, hostDecks);
  const preserved = future.state === "preserved";

  async function copyIdentity() {
    try {
      await writeClipboardText(future.seed);
      pushToast({ title: t("destiny.identityCopied"), message: t("destiny.future", { code }), tone: "success" });
    } catch {
      pushToast({ title: t("destiny.identityCopyFailed"), message: t("destiny.future", { code }), tone: "warning" });
    }
  }

  return (
    <div className="seeds-page">
      <div className="seeds-duel">
        {chronicle ? <SeedDuelCard deck={chronicle} side="player" /> : <span />}

        <div className="seeds-duel-center">
          <span className="seeds-duel-kicker">{t("destiny.futureWord")}</span>
          <h3 className="seeds-duel-code">{code}</h3>
          <span className={`seeds-duel-state seeds-state-${future.state}`}>
            <DestinySeal state={future.state} size={22} />
            {t(preserved ? "destiny.destinyPreserved" : "destiny.futureLost")}
          </span>
          <p className="seeds-duel-match">
            <span>{chronicle?.label ?? future.chronicleDeckId}</span>
            <span className="seeds-versus">{t("seeds.versus")}</span>
            <span className="seeds-host-side">{host?.label ?? future.hostDeckId}</span>
          </p>
          <p className="seeds-duel-difficulty">{t(DIFFICULTY_KEYS[difficulty])}</p>
          <div className="seeds-duel-copy">
            <button type="button" className="seeds-copy-chip" onClick={copyIdentity}>
              <Copy size={14} /> {t("seeds.copyIdentity")}
            </button>
          </div>
        </div>

        {host ? <SeedDuelCard deck={host} side="host" /> : <span />}
      </div>

      <SeedThread future={future} openAttempt={openAttempt} onToggleAttempt={onToggleAttempt} />

      <footer className="seeds-page-actions">
        {/* Maqueta: la salida todavía no ejecuta nada. */}
        <button type="button" className="seeds-action is-rewrite">
          <strong>{t("destiny.rewriteThis")}</strong>
        </button>
      </footer>
    </div>
  );
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
  future: SeedFutureFixture;
  openAttempt: number;
  onToggleAttempt: (index: number) => void;
}>) {
  const t = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const preserved = future.state === "preserved";

  return (
    <div className="seeds-thread-wrap">
      <p className="seeds-thread-label">{t("seeds.threadLabel")}</p>
      <ol className="seeds-thread">
        {future.attempts.map((attempt, index) => (
          <SeedThreadItem
            key={`${future.seed}:${index}`}
            attempt={attempt}
            index={index}
            seed={future.seed}
            language={language}
            open={index === openAttempt}
            onToggle={() => onToggleAttempt(index)}
          />
        ))}
      </ol>
      <p className={`seeds-thread-seal seeds-state-${future.state}`}>
        {t(preserved ? "destiny.destinyPreserved" : "destiny.futureLost")}.
        <small>{sealPhrase(future, t)}</small>
      </p>
    </div>
  );
}

function SeedThreadItem({
  attempt,
  index,
  seed,
  language,
  open,
  onToggle,
}: Readonly<{
  attempt: SeedAttemptFixture;
  index: number;
  seed: string;
  language: AppLanguage;
  open: boolean;
  onToggle: () => void;
}>) {
  const t = useTranslation();
  const victory = attempt.verdict === "victory";
  const bodyId = `seed-attempt-${seed}-${index}`;
  const label = t(ATTEMPT_LABEL_KEYS[Math.min(index, ATTEMPT_LABEL_KEYS.length - 1)]);
  const verdict = t(victory ? "seeds.verdictVictory" : "seeds.verdictDefeat");

  return (
    <li className={`seeds-thread-item ${victory ? "is-victory" : ""}`}>
      <button
        type="button"
        className="seeds-thread-line"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <span className="seeds-thread-title">
          <b>{label}</b>{" — "}
          <span className="seeds-verdict-word">{verdict}</span>{" "}
          {t("seeds.attemptTurn", { turn: attempt.turn })}
        </span>
      </button>
      <div className="seeds-attempt-detail" id={bodyId} hidden={!open}>
        <p className="seeds-attempt-body">{attempt.body[language]}</p>
        <ul className="seeds-attempt-marks">
          {attempt.marks.map((mark) => (
            <li key={mark.en}><span>{mark[language]}</span></li>
          ))}
        </ul>
      </div>
    </li>
  );
}

function sealPhrase(future: SeedFutureFixture, t: (key: TranslationKey, params?: Record<string, string | number>) => string) {
  if (future.state === "preserved") {
    const index = future.attempts.length - 1;
    if (index === 0) return t("seeds.sealPreservedFirst");
    const label = t(ATTEMPT_LABEL_KEYS[Math.min(index, ATTEMPT_LABEL_KEYS.length - 1)]);
    return t("seeds.sealPreservedOn", { label: label.toLocaleLowerCase() });
  }
  if (future.attempts.length === 1) return t("seeds.sealLostOnce");
  return t("seeds.sealLostMany", { count: future.attempts.length });
}

/* ============================================================================
   Sello del Futuro.

   No tiene geometría propia: es la misma rosa cardinal de
   `chronicleSigilGeometry`, la que la victoria enciende sobre el disco de
   grados. El interior se dibuja con incisiones sin área —de `axis * 0.24` a
   `axis * 0.68`—; rellenar cuñas macizas dibujaría una segunda estrella dentro
   de la rosa.
   ========================================================================= */

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

/**
 * El sello es sólo la rosa: preservada en oro, perdida en gris. No lleva aro,
 * quebradura ni recortes de trazo — las dos versiones son la misma figura y lo
 * único que cambia entre ellas es el color.
 */
function DestinySeal({ state, size }: Readonly<{ state: "preserved" | "lost"; size: number }>) {
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
