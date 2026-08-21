import { ExternalLink, Home, RefreshCcw, RotateCcw, X } from "lucide-react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DeckInspectorDetailsModal } from "../components/DeckInspector";
import { DestinyRewriteControl } from "../components/DestinyRewriteControl";
import { GameConfirmationDialog } from "../components/GameConfirmationDialog";
import { GameOutcomeDialog } from "../components/GameOutcomeDialog";
import { GraveyardDetailsModal, GraveyardViewerModal } from "../components/GraveyardViewerModal";
import { HandLimitModal } from "../components/HandLimitOverlay";
import { LearnToPlayIntroModal } from "../components/LearnToPlayIntroModal";
import {
  LearnToPlayDefeatNarrativeDialog,
  LearnToPlayDefeatOutcomeDialog,
} from "../components/LearnToPlayDefeatModal";
import { OpeningHandModal } from "../components/OpeningHandOverlay";
import { SettingsMenu } from "../components/SettingsMenu";
import { ChroniclerNameModal, SetupDeckDrawer } from "../components/StartMenu";
import { hostInspectableDecks, playerInspectableDecks } from "../data/deckCatalog";
import type { CardInstance, GameState } from "../engine/GameTypes";
import { useTranslation } from "../i18n/useTranslation";
import { UI_REFERENCE_CATALOG, type UiReferenceStatus } from "./uiReferenceCatalog";

type ModalSpecimenId =
  | "chronicler-required"
  | "chronicler-edit"
  | "deck-drawer-player"
  | "deck-drawer-host"
  | "settings-normal"
  | "settings-tutorial"
  | "settings-journey"
  | "destiny"
  | "confirmation-return"
  | "confirmation-interrupted"
  | "confirmation-restart"
  | "opening-hand"
  | "hand-limit"
  | "graveyard-viewer"
  | "graveyard-details"
  | "deck-details"
  | "learn-intro"
  | "outcome-victory"
  | "outcome-defeat"
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
  { id: "chronicler-required", entryId: "chronicler-name-modal", label: "Nombre del Cronista", variant: "Primer ingreso · requerido" },
  { id: "chronicler-edit", entryId: "chronicler-name-modal", label: "Nombre del Cronista", variant: "Edición desde Home" },
  { id: "deck-drawer-player", entryId: "setup-deck-drawer", label: "Selector lateral", variant: "Crónica" },
  { id: "deck-drawer-host", entryId: "setup-deck-drawer", label: "Selector lateral", variant: "Hueste" },
  { id: "settings-normal", entryId: "settings-menu-modal", label: "Ajustes de partida", variant: "Sesión normal" },
  { id: "settings-tutorial", entryId: "settings-menu-modal", label: "Ajustes de tutorial", variant: "Primera Semilla" },
  { id: "settings-journey", entryId: "settings-menu-modal", label: "Ajustes de recorrido", variant: "Aprender a jugar" },
  { id: "destiny", entryId: "destiny-rewrite-dialog", label: "Reescribir Futuro", variant: "Decisión de Destino" },
  { id: "confirmation-return", entryId: "game-confirmation-dialog", label: "Confirmación", variant: "Volver al menú" },
  { id: "confirmation-interrupted", entryId: "game-confirmation-dialog", label: "Confirmación", variant: "Tutorial interrumpido" },
  { id: "confirmation-restart", entryId: "game-confirmation-dialog", label: "Confirmación", variant: "Reiniciar sesión" },
  { id: "opening-hand", entryId: "opening-hand", label: "Mano inicial", variant: "Aceptar o cambiar" },
  { id: "hand-limit", entryId: "hand-limit-modal", label: "Límite de Mano", variant: "Descarte obligatorio" },
  { id: "graveyard-viewer", entryId: "graveyard-viewer-modal", label: "Memoria", variant: "Colección" },
  { id: "graveyard-details", entryId: "graveyard-details-modal", label: "Memoria", variant: "Detalle de carta" },
  { id: "deck-details", entryId: "deck-inspector-details-modal", label: "Inspector de mazo", variant: "Detalle de carta" },
  { id: "learn-intro", entryId: "learn-intro", label: "Aprender a jugar", variant: "Introducción narrativa" },
  { id: "outcome-victory", entryId: "victory-outcome-dialog", label: "Resultado", variant: "Victoria · sólo UI" },
  { id: "outcome-defeat", entryId: "defeat-outcome-dialog", label: "Resultado", variant: "Derrota · sólo UI" },
  { id: "outcome-learn", entryId: "learn-defeat-outcome-dialog", label: "Resultado pedagógico", variant: "Veredicto" },
  { id: "learn-defeat-narrative", entryId: "learn-defeat-narrative-dialog", label: "Resultado pedagógico", variant: "Explicación narrativa" },
];

const CONTEXT_ONLY_DIALOGS = ["guided-tutorial-overlay", "contextual-tutorial-callout"] as const;

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

  if (id === "chronicler-required" || id === "chronicler-edit") {
    return (
      <ChroniclerNameModal
        value={chroniclerName}
        onChange={setChroniclerName}
        onClose={close}
        onSave={close}
        closing={false}
        required={id === "chronicler-required"}
      />
    );
  }

  if (id === "deck-drawer-player" || id === "deck-drawer-host") {
    const side = id === "deck-drawer-player" ? "player" : "host";
    const decks = side === "player" ? playerInspectableDecks : hostInspectableDecks;
    return (
      <div className="ui-reference-drawer-runtime-layer expedition-deck-drawer-layer main-menu-shell">
        <button className="expedition-deck-drawer-scrim" type="button" tabIndex={-1} aria-hidden="true" onClick={close} />
        <SetupDeckDrawer
          side={side}
          eyebrow={side === "player" ? "Lado del Cronista" : "Lado de la Hueste"}
          decks={[...decks]}
          selectedDeckId={decks[0]?.id ?? ""}
          onSelectDeck={() => undefined}
          onClose={close}
        />
      </div>
    );
  }

  if (id === "settings-normal" || id === "settings-tutorial" || id === "settings-journey") {
    const sessionKind = id === "settings-normal" ? "normal" : id === "settings-tutorial" ? "tutorial" : "journey";
    return (
      <SettingsMenu
        key={id}
        sessionKind={sessionKind}
        restricted={sessionKind !== "normal"}
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
        seed={game.seed}
        onRewrite={close}
        onContemplateAnother={close}
        initiallyOpen
        hideLauncher
        onDismiss={close}
      />
    );
  }

  if (id === "confirmation-return" || id === "confirmation-interrupted" || id === "confirmation-restart") {
    const interrupted = id === "confirmation-interrupted";
    const restart = id === "confirmation-restart";
    return (
      <div className="game-settings-popover game-system-confirmation-layer game-home-backdrop fixed inset-0 flex items-center justify-center p-6 text-[#e4ddc2]" role="presentation">
        <GameConfirmationDialog
          titleId={`ui-reference-${id}-title`}
          kicker={t(interrupted ? "guided.lifecycle.interruptedKicker" : restart ? "guided.settings.restartKicker" : "game.leaveBattlefield")}
          title={t(interrupted ? "guided.lifecycle.interruptedTitle" : restart ? "guided.settings.restartTitle" : "game.returnHomeQuestion")}
          body={t(interrupted ? "guided.lifecycle.interruptedBody" : restart ? "guided.settings.restartBody" : "game.progressLost")}
          actions={interrupted
            ? [
              { label: t("guided.lifecycle.exit"), icon: <Home size={16} />, onClick: close },
              { label: t("guided.lifecycle.restart"), icon: <RotateCcw size={16} />, onClick: close, primary: true },
            ]
            : [
              { label: t("common.cancel"), onClick: close },
              {
                label: t(restart ? "common.restart" : "game.returnHome"),
                icon: restart ? <RefreshCcw size={16} /> : <Home size={16} />,
                onClick: close,
                primary: true,
              },
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

  if (id === "outcome-victory" || id === "outcome-defeat") {
    const tone = id === "outcome-victory" ? "victory" : "defeat";
    return (
      <div className={`game-result-overlay game-result-${tone} fixed inset-0 z-[140]`}>
        <GameOutcomeDialog game={game} tone={tone} onRewriteFuture={close} onContemplateFuture={close} />
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
