import { ExternalLink, Home, X } from "lucide-react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DeckInspectorDetailsModal } from "../components/DeckInspector";
import { DestinyRewriteControl } from "../components/DestinyRewriteControl";
import { GameConfirmationDialog } from "../components/GameConfirmationDialog";
import { GameOutcomeDialog } from "../components/GameOutcomeDialog";
import { GraveyardDetailsModal, GraveyardViewerModal } from "../components/GraveyardViewerModal";
import { HandLimitModal } from "../components/HandLimitOverlay";
import { GuidedTutorialDialog } from "../components/GuidedTutorialDialog";
import { LearnToPlayIntroModal } from "../components/LearnToPlayIntroModal";
import {
  LearnToPlayDefeatNarrativeDialog,
  LearnToPlayDefeatOutcomeDialog,
} from "../components/LearnToPlayDefeatDialogs";
import { OpeningHandModal } from "../components/OpeningHandOverlay";
import { SettingsMenu } from "../components/SettingsMenu";
import { ChroniclerNameModal, SetupDeckDrawer } from "../components/StartMenu";
import { TemporalBackdrop } from "../components/TemporalBackdrop";
import { createCanonMatchOrigin } from "../content/MatchOrigin";
import { hostInspectableDecks, playerInspectableDecks } from "../data/deckCatalog";
import type { CardInstance, GameState } from "../engine/GameTypes";
import { useTranslation } from "../i18n/useTranslation";
import { UI_REFERENCE_CATALOG, type UiReferenceStatus } from "./uiReferenceCatalog";

type ModalSpecimenId =
  | "chronicler-name"
  | "deck-drawer"
  | "settings"
  | "destiny"
  | "confirmation"
  | "opening-hand"
  | "hand-limit"
  | "graveyard-viewer"
  | "graveyard-details"
  | "deck-details"
  | "learn-intro"
  | "guided-tutorial"
  | "outcome"
  | "outcome-learn"
  | "learn-defeat-narrative";

type ModalSpecimen = Readonly<{
  id: ModalSpecimenId;
  entryId: string;
  label: string;
  variant: string;
}>;

const STATUS_LABELS: Record<UiReferenceStatus, string> = {
  canonical: "Canónico",
  "product-variant": "Variante de producto",
  "context-only": "Revisar en contexto",
};

const MODAL_SPECIMENS: readonly ModalSpecimen[] = [
  { id: "chronicler-name", entryId: "chronicler-name-modal", label: "Nombre del Cronista", variant: "Primer ingreso y edición" },
  { id: "deck-drawer", entryId: "setup-deck-drawer", label: "Selector lateral", variant: "Crónica y Hueste" },
  { id: "settings", entryId: "settings-menu-modal", label: "Ajustes", variant: "Normal, tutorial y recorrido" },
  { id: "destiny", entryId: "destiny-rewrite-dialog", label: "Reescribir Futuro", variant: "Decisión de Destino" },
  { id: "confirmation", entryId: "game-confirmation-dialog", label: "Confirmación", variant: "Salir, interrumpir o reiniciar" },
  { id: "opening-hand", entryId: "opening-hand", label: "Mano inicial", variant: "Aceptar o cambiar" },
  { id: "hand-limit", entryId: "hand-limit-modal", label: "Límite de Mano", variant: "Descarte obligatorio" },
  { id: "graveyard-viewer", entryId: "graveyard-viewer-modal", label: "Memoria", variant: "Colección" },
  { id: "graveyard-details", entryId: "graveyard-details-modal", label: "Memoria", variant: "Detalle de carta" },
  { id: "deck-details", entryId: "deck-inspector-details-modal", label: "Inspector de mazo", variant: "Detalle de carta" },
  { id: "learn-intro", entryId: "learn-intro", label: "Aprender a jugar", variant: "Introducción narrativa" },
  { id: "guided-tutorial", entryId: "guided-tutorial-dialog", label: "Diálogo guiado", variant: "Aprender a jugar · ornamento" },
  { id: "outcome", entryId: "game-outcome-dialog", label: "Resultado", variant: "Victoria y derrota · sólo UI" },
  { id: "outcome-learn", entryId: "learn-defeat-outcome-dialog", label: "Resultado pedagógico", variant: "Veredicto" },
  { id: "learn-defeat-narrative", entryId: "learn-defeat-narrative-dialog", label: "Resultado pedagógico", variant: "Explicación narrativa" },
];

const CONTEXT_ONLY_DIALOGS = ["contextual-tutorial-callout"] as const;
const UI_REFERENCE_MATCH_ORIGIN = createCanonMatchOrigin({
  entropy: "U1REF",
  playerDeckKey: "hostfall.core/pact_of_elarion",
  hostDeckKey: "hostfall.core/uprising_of_the_graveless",
  difficulty: "normal",
});

export function RuntimeModalGallery({ game }: { game: GameState }) {
  const [activeModal, setActiveModal] = useState<ModalSpecimenId>();
  const [chroniclerName, setChroniclerName] = useState("Evelyn");
  const [fontSize, setFontSize] = useState(20);
  const [deckCardIndex, setDeckCardIndex] = useState(0);
  const openingGame = useMemo(() => previewGameWithHand(game, 5), [game]);
  const handLimitGame = useMemo(() => previewGameWithHand(game, 8), [game]);
  const memoryCards = useMemo(
    () => game.player.memory.length > 0 ? game.player.memory : openingGame.player.hand.slice(0, 6),
    [game.player.memory, openingGame.player.hand],
  );
  const activeSpecimen = MODAL_SPECIMENS.find((specimen) => specimen.id === activeModal);

  return (
    <>
      <div className="ui-reference-modal-intro hf-ui-panel-soft">
        <div>
          <strong>Un modal activo a la vez</strong>
          <p>Cada botón monta la pieza runtime a tamaño real, fuera del layout de la herramienta.</p>
        </div>
        <span>Los resultados omiten su secuencia visual y muestran solamente el panel de UI compartido.</span>
      </div>

      <div className="ui-reference-modal-grid">
        {MODAL_SPECIMENS.map((specimen) => {
          const entry = UI_REFERENCE_CATALOG.find((candidate) => candidate.id === specimen.entryId);
          if (!entry) return null;
          return (
            <article className="ui-reference-modal-card hf-ui-panel-soft" key={specimen.id}>
              <div className="ui-reference-modal-card-heading">
                <span className={`ui-reference-status is-${entry.status}`}>{STATUS_LABELS[entry.status]}</span>
                <small>{specimen.variant}</small>
              </div>
              <h3>{entry.component}</h3>
              <code>{entry.source}</code>
              <div className="ui-reference-modal-card-usage">
                <strong>Dónde se usa</strong>
                <ul>{entry.usedIn.map((usage) => <li key={usage}>{usage}</li>)}</ul>
              </div>
              <button className="hf-ui-button ui-reference-modal-open" type="button" onClick={() => setActiveModal(specimen.id)}>
                <ExternalLink size={14} /> Abrir {specimen.label}
              </button>
            </article>
          );
        })}
      </div>

      <div className="ui-reference-context-dialogs hf-ui-panel-soft">
        <div>
          <strong>Diálogos que se revisan dentro de Board</strong>
          <p>No se aíslan porque su posición y contenido dependen de anchors y de una sesión tutorial viva.</p>
        </div>
        {CONTEXT_ONLY_DIALOGS.map((entryId) => {
          const entry = UI_REFERENCE_CATALOG.find((candidate) => candidate.id === entryId);
          return entry ? (
            <article key={entry.id}>
              <span className="ui-reference-status is-context-only">Revisar en contexto</span>
              <h3>{entry.component}</h3>
              <code>{entry.source}</code>
              <strong>Dónde se usa</strong>
              <ul>{entry.usedIn.map((usage) => <li key={usage}>{usage}</li>)}</ul>
            </article>
          ) : null;
        })}
      </div>

      {activeModal && typeof document !== "undefined" && createPortal(
        <div className="ui-reference-runtime-modal-root game-screen" data-ui-reference-modal={activeModal}>
          <div className="ui-reference-modal-safety" role="status">
            <span><b>UI Reference</b>{activeSpecimen ? ` · ${activeSpecimen.variant}` : ""}</span>
            <button type="button" onClick={() => setActiveModal(undefined)}><X size={15} /> Cerrar muestra</button>
          </div>
          <ActiveRuntimeModal
            id={activeModal}
            game={game}
            openingGame={openingGame}
            handLimitGame={handLimitGame}
            memoryCards={memoryCards}
            chroniclerName={chroniclerName}
            setChroniclerName={setChroniclerName}
            fontSize={fontSize}
            setFontSize={setFontSize}
            deckCardIndex={deckCardIndex}
            setDeckCardIndex={setDeckCardIndex}
            close={() => setActiveModal(undefined)}
          />
        </div>,
        document.body,
      )}
    </>
  );
}

function ActiveRuntimeModal({
  id,
  game,
  openingGame,
  handLimitGame,
  memoryCards,
  chroniclerName,
  setChroniclerName,
  fontSize,
  setFontSize,
  deckCardIndex,
  setDeckCardIndex,
  close,
}: {
  id: ModalSpecimenId;
  game: GameState;
  openingGame: GameState;
  handLimitGame: GameState;
  memoryCards: CardInstance[];
  chroniclerName: string;
  setChroniclerName: (value: string) => void;
  fontSize: number;
  setFontSize: (value: number) => void;
  deckCardIndex: number;
  setDeckCardIndex: (value: number) => void;
  close: () => void;
}) {
  const t = useTranslation();
  const playerDeck = playerInspectableDecks[0];
  const hostDeck = hostInspectableDecks[0];
  const inspectorDeck = playerDeck ?? hostDeck;
  const inspectorCards = inspectorDeck ? [...(inspectorDeck.deck.tokens ?? []), ...inspectorDeck.deck.cards] : [];
  const inspectorCard = inspectorCards[deckCardIndex % Math.max(inspectorCards.length, 1)];
  const memoryCard = memoryCards[0];
  const selectedHandCard = handLimitGame.player.hand[0];

  if (id === "chronicler-name") {
    return (
      <div className="ui-reference-chronicler-name-context main-menu-shell chronicler-name-open">
        <TemporalBackdrop />
        <ChroniclerNameModal
          value={chroniclerName}
          onChange={setChroniclerName}
          onClose={close}
          onSave={close}
          closing={false}
          required={false}
        />
      </div>
    );
  }

  if (id === "deck-drawer") {
    const decks = playerInspectableDecks;
    return (
      <div className="ui-reference-drawer-runtime-layer expedition-deck-drawer-layer main-menu-shell">
        <button className="expedition-deck-drawer-scrim" type="button" tabIndex={-1} aria-hidden="true" onClick={close} />
        <SetupDeckDrawer
          side="player"
          eyebrow="Lado del Cronista"
          decks={[...decks]}
          selectedDeckId={decks[0]?.id ?? ""}
          onSelectDeck={() => undefined}
          onClose={close}
        />
      </div>
    );
  }

  if (id === "settings") {
    return (
      <SettingsMenu
        key={id}
        sessionKind="normal"
        restricted={false}
        initiallyOpen
        hideLauncher
        allowDeveloperActions={false}
        onReturnToMenu={close}
        onRestartTutorial={close}
        onDismiss={close}
      />
    );
  }

  if (id === "destiny") {
    return (
      <DestinyRewriteControl
        origin={UI_REFERENCE_MATCH_ORIGIN}
        onRewrite={close}
        onContemplateAnother={close}
        initiallyOpen
        hideLauncher
        onDismiss={close}
      />
    );
  }

  if (id === "confirmation") {
    return (
      <div className="game-settings-popover game-system-confirmation-layer game-home-backdrop fixed inset-0 flex items-center justify-center p-6 text-[#e4ddc2]" role="presentation">
        <GameConfirmationDialog
          titleId={`ui-reference-${id}-title`}
          title={t("game.returnHomeQuestion")}
          body={t("game.progressLost")}
          actions={[
            { label: t("common.cancel"), onClick: close },
            { label: t("game.returnHome"), icon: <Home size={16} />, onClick: close, primary: true },
          ]}
        />
      </div>
    );
  }

  if (id === "opening-hand") {
    return <OpeningHandModal game={openingGame} onAccept={close} onMulligan={() => undefined} />;
  }

  if (id === "hand-limit") {
    return (
      <HandLimitModal
        game={handLimitGame}
        selectedId={selectedHandCard?.instanceId}
        onClearSelection={() => undefined}
        onConfirm={close}
      />
    );
  }

  if (id === "graveyard-viewer") {
    return <GraveyardViewerModal game={game} title="Memoria del Cronista" cards={memoryCards} onClose={close} />;
  }

  if (id === "graveyard-details" && memoryCard) {
    return (
      <GraveyardDetailsModal
        game={game}
        card={memoryCard}
        fontSize={fontSize}
        setFontSize={setFontSize}
        transition="idle"
        closing={false}
        onClose={close}
        position={1}
        total={memoryCards.length}
        contextLabel="Memoria · UI Reference"
      />
    );
  }

  if (id === "deck-details" && inspectorDeck && inspectorCard) {
    return (
      <DeckInspectorDetailsModal
        deck={inspectorDeck}
        card={inspectorCard}
        position={deckCardIndex + 1}
        total={inspectorCards.length}
        fontSize={fontSize}
        setFontSize={setFontSize}
        onClose={close}
        onPrevious={() => setDeckCardIndex((deckCardIndex - 1 + inspectorCards.length) % inspectorCards.length)}
        onNext={() => setDeckCardIndex((deckCardIndex + 1) % inspectorCards.length)}
      />
    );
  }

  if (id === "learn-intro") {
    return <LearnToPlayIntroModal open chroniclerName={chroniclerName} onClose={close} onComplete={close} />;
  }

  if (id === "guided-tutorial") {
    const body = t("guided.learnToPlay.fourthSourceBriefingBody");
    return (
      <div
        className="guided-tutorial-overlay is-learn-to-play"
        data-mode="explain"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      >
        <GuidedTutorialDialog
          style={{ position: "relative", top: "auto", left: "auto", width: "min(560px, calc(100vw - 48px))" }}
          title={t("guided.learnToPlay.intro.evy")}
          body={body.split(/\n{2,}/u).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          isLearnToPlay
          ariaModal
          closeLabel={t("common.close")}
          showContinue
          continueLabel={t("guided.contextual.understood")}
          onClose={close}
          onContinue={close}
          titleId="ui-reference-guided-tutorial-title"
          bodyId="ui-reference-guided-tutorial-body"
        />
      </div>
    );
  }

  if (id === "outcome") {
    const tone = "victory";
    return (
      <div className={`game-result-overlay game-result-${tone} fixed inset-0 z-[140]`}>
        <GameOutcomeDialog game={game} matchOrigin={UI_REFERENCE_MATCH_ORIGIN} tone={tone} onRewriteFuture={close} onContemplateFuture={close} />
      </div>
    );
  }

  if (id === "outcome-learn") {
    return (
      <div className="game-result-overlay game-result-defeat fixed inset-0 z-[140]">
        <LearnToPlayDefeatOutcomeDialog narrativeOpen={false} narrativeAcknowledged onContemplateFuture={close} />
      </div>
    );
  }

  if (id === "learn-defeat-narrative") {
    return (
      <div className="game-result-overlay game-result-defeat fixed inset-0 z-[140]">
        <LearnToPlayDefeatNarrativeDialog onContinue={close} />
      </div>
    );
  }

  return (
    <div className="ui-reference-modal-unavailable hf-ui-panel">
      No hay datos runtime suficientes para montar esta muestra.
    </div>
  );
}

function previewGameWithHand(game: GameState, count: number): GameState {
  const playerCards = [
    ...game.player.hand,
    ...game.player.field,
    ...game.player.archive,
    ...game.player.memory,
    ...game.player.oblivion,
  ];
  if (playerCards.length === 0) return game;
  const hand = Array.from({ length: count }, (_, index) => {
    const source = playerCards[index % playerCards.length];
    return { ...source, instanceId: `${source.instanceId}-ui-reference-${index}` };
  });
  return {
    ...game,
    openingHandAccepted: false,
    player: { ...game.player, hand },
  };
}
