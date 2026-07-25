import {
  Activity,
  ExternalLink,
  FlaskConical,
  Gamepad2,
  Home,
  Layers3,
  ListVideo,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Board } from "../components/Board";
import { useGameStore } from "../store/useGameStore";
import { useToastStore } from "../store/useToastStore";
import { ActionsPanel } from "./panels/ActionsPanel";
import { BoardPanel } from "./panels/BoardPanel";
import { CardsPanel } from "./panels/CardsPanel";
import { ScenarioPanel } from "./panels/ScenarioPanel";
import { TimelinePanel } from "./panels/TimelinePanel";
import {
  deleteStoredBoard,
  deleteStoredReplay,
  listStoredBoards,
  listStoredReplays,
  parseBoardFile,
  saveStoredBoard,
  saveStoredReplay,
  toBoardFile,
  type StoredBoard,
  type StoredReplay,
} from "./scenarioStorage";
import {
  BLANK_SCENARIO,
  buildScenarioGame,
  cloneScenario,
  snapshotBoard,
  validateScenario,
  type ScenarioCard,
  type ScenarioDefinition,
} from "./scenario";
import { executeStep, isPlaygroundBusy, isWaitingForInput, type TimelineStep } from "./timeline";
import { openPlaygroundToolsWindow, trackToolsWindowBounds } from "./toolsWindow";

type PlaygroundTab = "scenario" | "cards" | "board" | "actions" | "timeline";

const TABS: Array<{ id: PlaygroundTab; label: string; description: string; icon: LucideIcon }> = [
  { id: "scenario", label: "Setup", description: "Seed, decks and Horde queue", icon: SlidersHorizontal },
  { id: "cards", label: "Cards", description: "Find, play or place cards", icon: Search },
  { id: "board", label: "Board", description: "Selection and saved states", icon: Layers3 },
  { id: "actions", label: "Actions", description: "Turn flow and energy", icon: Gamepad2 },
  { id: "timeline", label: "Replay", description: "Record and replay sequences", icon: ListVideo },
];

const REPLAY_POLL_MS = 120;
const REPLAY_STEP_GAP_MS = 220;
const TOOLS_ROOT_ID = "playground-tools-root";
const COPIED_STYLE_ATTRIBUTE = "data-playground-style-copy";

type PlaygroundScreenProps = {
  onReturnToMenu: () => void;
  onToolsWindowChange?: (popup: Window | null) => void;
  /** Opened synchronously by the menu click so popup blockers see a direct user gesture. */
  initialToolsWindow?: Window | null;
};

export function PlaygroundScreen({ onReturnToMenu, onToolsWindowChange, initialToolsWindow }: PlaygroundScreenProps) {
  const loadScenario = useGameStore((state) => state.loadScenario);
  const gameSessionId = useGameStore((state) => state.gameSessionId);
  const game = useGameStore((state) => state.game);
  const pushToast = useToastStore((state) => state.pushToast);
  const [draft, setDraft] = useState<ScenarioDefinition>(() => cloneScenario(BLANK_SCENARIO));
  const [launch, setLaunch] = useState<ScenarioDefinition>();
  const [hordeQueue, setHordeQueue] = useState<ScenarioCard[]>([]);
  const [tab, setTab] = useState<PlaygroundTab>("scenario");
  const [steps, setSteps] = useState<TimelineStep[]>([]);
  const [recording, setRecording] = useState(true);
  const [replayCursor, setReplayCursor] = useState<number | undefined>();
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [boards, setBoards] = useState<StoredBoard[]>(() => listStoredBoards());
  const [replays, setReplays] = useState<StoredReplay[]>(() => listStoredReplays());
  const [toolsRoot, setToolsRoot] = useState<HTMLElement | null>(null);
  const startedRef = useRef(false);
  const toolsWindowRef = useRef<Window | null>(
    initialToolsWindow && !initialToolsWindow.closed ? initialToolsWindow : null,
  );

  const reportError = useCallback(
    (message: string) => pushToast({ title: "Playground", message, tone: "warning" }),
    [pushToast],
  );

  const attachToolsWindow = useCallback((popup: Window) => {
    prepareToolsDocument(popup);
    copyPlaygroundStyles(document, popup.document);
    toolsWindowRef.current = popup;
    onToolsWindowChange?.(popup);
    setToolsRoot(popup.document.getElementById(TOOLS_ROOT_ID));
    popup.focus();
  }, [onToolsWindowChange]);

  const openToolsWindow = useCallback(() => {
    const current = toolsWindowRef.current;
    if (current && !current.closed) {
      current.focus();
      return;
    }
    const popup = openPlaygroundToolsWindow(current);
    if (!popup) {
      reportError("The browser blocked the Playground tools window. Allow popups and try again.");
      return;
    }
    attachToolsWindow(popup);
  }, [attachToolsWindow, reportError]);

  const closeToolsWindow = useCallback(() => {
    const popup = toolsWindowRef.current;
    toolsWindowRef.current = null;
    onToolsWindowChange?.(null);
    setToolsRoot(null);
    if (popup && !popup.closed) popup.close();
  }, [onToolsWindowChange]);

  useEffect(() => {
    const popup = toolsWindowRef.current;
    if (popup && !popup.closed) attachToolsWindow(popup);
  }, [attachToolsWindow]);

  useEffect(() => {
    const popup = toolsWindowRef.current;
    if (!popup || popup.closed) return;
    const onToolsWindowClosed = () => {
      toolsWindowRef.current = null;
      onToolsWindowChange?.(null);
      setToolsRoot(null);
    };
    popup.addEventListener("pagehide", onToolsWindowClosed);
    return () => popup.removeEventListener("pagehide", onToolsWindowClosed);
  }, [onToolsWindowChange, toolsRoot]);

  useEffect(() => {
    const popup = toolsWindowRef.current;
    if (!popup || popup.closed) return;
    const observer = new MutationObserver(() => copyPlaygroundStyles(document, popup.document));
    observer.observe(document.head, { attributes: true, childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [toolsRoot]);

  useEffect(() => {
    const popup = toolsWindowRef.current;
    if (!popup || popup.closed) return;
    return trackToolsWindowBounds(popup);
  }, [toolsRoot]);

  const buildBoard = useCallback(
    (definition: ScenarioDefinition) => {
      const problems = validateScenario(definition);
      if (problems.length > 0) {
        reportError(problems.join(" "));
        return;
      }
      const snapshot = cloneScenario(definition);
      loadScenario(buildScenarioGame(snapshot), {
        playerDeckId: snapshot.playerDeckId,
        hordeDeckId: snapshot.hordeDeckId,
      });
      setLaunch(snapshot);
      setReplayCursor(undefined);
      setAutoPlaying(false);
    },
    [loadScenario, reportError],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    buildBoard(draft);
  }, [draft, buildBoard]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F2") return;
      event.preventDefault();
      openToolsWindow();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openToolsWindow]);

  function dispatch(step: TimelineStep) {
    const outcome = executeStep(step);
    if (!outcome.ok) reportError(outcome.reason ?? "That action is not available right now.");
    if (outcome.ok && recording && replayCursor === undefined) setSteps((current) => [...current, step]);
    return outcome;
  }

  function executeHordeTurn() {
    dispatch(
      hordeQueue.length > 0
        ? { kind: "hordeTurnExact", entries: structuredClone(hordeQueue) }
        : { kind: "hordeTurn" },
    );
  }

  function beginReplay(auto: boolean) {
    if (!launch || steps.length === 0) return;
    buildBoard(launch);
    setReplayCursor(0);
    setAutoPlaying(auto);
  }

  function stopReplay() {
    setReplayCursor(undefined);
    setAutoPlaying(false);
  }

  useEffect(() => {
    if (replayCursor === undefined || !autoPlaying) return;
    if (replayCursor >= steps.length) {
      setAutoPlaying(false);
      return;
    }
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (isWaitingForInput()) {
        setAutoPlaying(false);
        return;
      }
      if (isPlaygroundBusy()) {
        timer = window.setTimeout(tick, REPLAY_POLL_MS);
        return;
      }
      runStepAt(replayCursor);
    };
    let timer = window.setTimeout(tick, REPLAY_STEP_GAP_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [autoPlaying, replayCursor, steps]);

  function runStepAt(index: number) {
    const step = steps[index];
    if (!step) return;
    const outcome = executeStep(step);
    if (!outcome.ok) reportError(`Step ${index + 1}: ${outcome.reason ?? "unavailable"}.`);
    setReplayCursor(index + 1);
  }

  function stepOnce() {
    if (replayCursor === undefined) {
      beginReplay(false);
      return;
    }
    if (replayCursor >= steps.length) return;
    if (isPlaygroundBusy()) {
      reportError("The board is still animating.");
      return;
    }
    runStepAt(replayCursor);
  }

  function saveBoard(name: string) {
    const snapshot = snapshotBoard(useGameStore.getState().game, { ...draft, name });
    setDraft(snapshot);
    saveStoredBoard(snapshot);
    setBoards(listStoredBoards());
  }

  function loadBoard(board: StoredBoard) {
    const definition = cloneScenario(board.definition);
    setDraft(definition);
    buildBoard(definition);
  }

  function removeBoard(id: string) {
    deleteStoredBoard(id);
    setBoards(listStoredBoards());
  }

  function exportBoard(board: StoredBoard) {
    const url = URL.createObjectURL(new Blob([toBoardFile(board)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${board.name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "board"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importBoard(file: File) {
    void file.text().then((contents) => {
      const { board, problems } = parseBoardFile(contents);
      if (!board) {
        reportError(problems.join(" "));
        return;
      }
      // A JSON load is a one-off preview until Build board is pressed. Restart therefore returns
      // to the previous checkpoint instead of getting silently rebound to the imported file.
      const definition = cloneScenario(board.definition);
      setDraft(definition);
      loadScenario(buildScenarioGame(definition), {
        playerDeckId: definition.playerDeckId,
        hordeDeckId: definition.hordeDeckId,
      });
      setReplayCursor(undefined);
      setAutoPlaying(false);
    });
  }

  function saveReplay(name: string) {
    if (!launch || steps.length === 0) return;
    saveStoredReplay(name, launch, steps);
    setReplays(listStoredReplays());
  }

  function loadReplay(replay: StoredReplay) {
    const definition = cloneScenario(replay.definition);
    setDraft(definition);
    setSteps(structuredClone(replay.steps));
    buildBoard(definition);
  }

  function removeReplay(id: string) {
    deleteStoredReplay(id);
    setReplays(listStoredReplays());
  }

  const activeTab = TABS.find((entry) => entry.id === tab) ?? TABS[0];

  const tools = (
    <aside className="playground-dock" aria-label="Playground tools">
      <div className="playground-tools-layout">
        <aside className="playground-tools-rail">
          <div className="playground-tools-brand">
            <span className="playground-tools-brand-mark"><Activity size={17} /></span>
            <div>
              <div className="playground-dock-kicker">Hostfall</div>
              <div className="playground-dock-title">Lab</div>
            </div>
          </div>

          <nav className="playground-tabs" aria-label="Playground sections">
            {TABS.map((entry) => {
              const Icon = entry.icon;
              return (
                <button
                  key={entry.id}
                  className={`playground-tab ${tab === entry.id ? "is-active" : ""}`}
                  type="button"
                  title={`${entry.label}: ${entry.description}`}
                  aria-current={tab === entry.id ? "page" : undefined}
                  onClick={() => setTab(entry.id)}
                >
                  <Icon size={16} />
                  <span>{entry.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="playground-tools-rail-actions">
            <button className="playground-rail-button" type="button" title="Return to main menu" onClick={onReturnToMenu}>
              <Home size={15} />
              <span>Menu</span>
            </button>
            <button className="playground-rail-button" type="button" title="Close tools window" onClick={closeToolsWindow}>
              <X size={15} />
              <span>Close</span>
            </button>
          </div>
        </aside>

        <section className="playground-tools-main">
          <header className="playground-dock-header">
            <div className="playground-tools-heading">
              <div className="playground-dock-kicker">Developer playground</div>
              <h2 className="playground-dock-title">{activeTab.label}</h2>
              <p>{activeTab.description}</p>
            </div>

            <div className="playground-launch" role="group" aria-label="Board controls">
              <button className="playground-launch-button is-active" type="button" onClick={() => buildBoard(draft)}>
                <FlaskConical size={14} />
                <span>Build board</span>
              </button>
              <button className="playground-launch-button" type="button" disabled={!launch} onClick={() => launch && buildBoard(launch)}>
                <RotateCcw size={14} />
                <span>Restart</span>
              </button>
            </div>
          </header>

          <div className="playground-live" aria-label="Live game state">
            <LiveReadout label="Turn" value={String(game.turnNumber)} />
            <LiveReadout label="Side" value={game.activeSide} />
            <LiveReadout label="Phase" value={game.phase} />
            <LiveReadout label="Hand" value={String(game.player.hand.length)} />
            <LiveReadout label="Events" value={String(game.eventQueue.length)} busy={game.eventQueue.length > 0} />
          </div>

          <div className={`playground-dock-body is-${tab} old-scrollbar`}>
            {tab === "scenario" && (
              <ScenarioPanel
                draft={draft}
                queue={hordeQueue}
                onChangeQueue={setHordeQueue}
                onChange={setDraft}
                onUpdate={() => buildBoard(draft)}
                onExecuteHordeTurn={executeHordeTurn}
              />
            )}
            {tab === "cards" && <CardsPanel onDispatch={dispatch} />}
            {tab === "board" && (
              <BoardPanel
                onDispatch={dispatch}
                onInvalid={reportError}
                boards={boards}
                initialName={draft.name}
                onSaveBoard={saveBoard}
                onLoadBoard={loadBoard}
                onExportBoard={exportBoard}
                onImportBoard={importBoard}
                onDeleteBoard={removeBoard}
              />
            )}
            {tab === "actions" && <ActionsPanel onDispatch={dispatch} />}
            {tab === "timeline" && (
              <TimelinePanel
                steps={steps}
                recording={recording}
                cursor={replayCursor}
                autoPlaying={autoPlaying}
                canReplay={Boolean(launch) && steps.length > 0}
                replays={replays}
                onToggleRecording={() => setRecording((current) => !current)}
                onRemoveStep={(index) => setSteps((current) => current.filter((_, position) => position !== index))}
                onClear={() => {
                  setSteps([]);
                  stopReplay();
                }}
                onStepOnce={stepOnce}
                onToggleAuto={() => (autoPlaying ? setAutoPlaying(false) : beginReplay(true))}
                onStopReplay={stopReplay}
                onSaveReplay={saveReplay}
                onLoadReplay={loadReplay}
                onDeleteReplay={removeReplay}
              />
            )}
          </div>
        </section>
      </div>
    </aside>
  );

  return (
    <div className="playground-shell">
      <div className="playground-stage">
        <Board key={gameSessionId} playerName="Playground" setupTurns={0} onReturnToMenu={onReturnToMenu} />
      </div>

      {toolsRoot ? createPortal(tools, toolsRoot) : (
        <button className="playground-dock-handle" type="button" title="Open Playground tools (F2)" onClick={openToolsWindow}>
          <ExternalLink size={16} />
          <span>Open tools</span>
        </button>
      )}
    </div>
  );
}

function LiveReadout({ label, value, busy = false }: { label: string; value: string; busy?: boolean }) {
  return (
    <div className={`playground-readout ${busy ? "is-busy" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function prepareToolsDocument(popup: Window) {
  if (!popup.document.getElementById(TOOLS_ROOT_ID)) {
    popup.document.open();
    popup.document.write(`<!doctype html><html><head><meta charset="UTF-8"><title>Hostfall — Playground</title></head><body class="playground-tools-window-body"><div id="${TOOLS_ROOT_ID}"></div></body></html>`);
    popup.document.close();
    const base = popup.document.createElement("base");
    base.href = document.baseURI;
    popup.document.head.prepend(base);
  }
  popup.document.documentElement.lang = document.documentElement.lang;
  popup.document.body.className = "playground-tools-window-body";
}

function copyPlaygroundStyles(source: Document, target: Document) {
  target.head.querySelectorAll(`[${COPIED_STYLE_ATTRIBUTE}]`).forEach((node) => node.remove());
  source.head.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style').forEach((node) => {
    const copy = node.cloneNode(true) as HTMLLinkElement | HTMLStyleElement;
    copy.setAttribute(COPIED_STYLE_ATTRIBUTE, "true");
    if (node.tagName === "LINK") {
      (copy as HTMLLinkElement).href = (node as HTMLLinkElement).href;
    }
    target.head.appendChild(copy);
  });
}
