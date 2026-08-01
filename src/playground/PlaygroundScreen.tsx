import {
  Activity,
  Gamepad2,
  Home,
  Layers3,
  ListVideo,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Search,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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

type PlaygroundTab = "scenario" | "cards" | "board" | "actions" | "timeline";

const TABS: Array<{ id: PlaygroundTab; label: string; description: string; icon: LucideIcon }> = [
  { id: "scenario", label: "Setup", description: "Seed, decks and Host queue", icon: SlidersHorizontal },
  { id: "cards", label: "Cards", description: "Find, play or place cards", icon: Search },
  { id: "board", label: "Board", description: "Selection and saved states", icon: Layers3 },
  { id: "actions", label: "Actions", description: "Turn flow and energy", icon: Gamepad2 },
  { id: "timeline", label: "Replay", description: "Record and replay sequences", icon: ListVideo },
];

const REPLAY_POLL_MS = 120;
const REPLAY_STEP_GAP_MS = 220;

type PlaygroundScreenProps = {
  onReturnToMenu: () => void;
};

export function PlaygroundScreen({ onReturnToMenu }: PlaygroundScreenProps) {
  const loadScenario = useGameStore((state) => state.loadScenario);
  const gameSessionId = useGameStore((state) => state.gameSessionId);
  const game = useGameStore((state) => state.game);
  const pushToast = useToastStore((state) => state.pushToast);
  const [draft, setDraft] = useState<ScenarioDefinition>(() => cloneScenario(BLANK_SCENARIO));
  const [launch, setLaunch] = useState<ScenarioDefinition>();
  const [hostQueue, setHostQueue] = useState<ScenarioCard[]>([]);
  const [tab, setTab] = useState<PlaygroundTab>("scenario");
  const [steps, setSteps] = useState<TimelineStep[]>([]);
  const [recording, setRecording] = useState(true);
  const [replayCursor, setReplayCursor] = useState<number | undefined>();
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [boards, setBoards] = useState<StoredBoard[]>(() => listStoredBoards());
  const [replays, setReplays] = useState<StoredReplay[]>(() => listStoredReplays());
  const [toolsOpen, setToolsOpen] = useState(true);
  const startedRef = useRef(false);

  const reportError = useCallback(
    (message: string) => pushToast({ title: "Playground", message, tone: "warning" }),
    [pushToast],
  );

  const buildBoard = useCallback(
    (definition: ScenarioDefinition) => {
      const problems = validateScenario(definition);
      if (problems.length > 0) {
        reportError(problems.join(" "));
        return false;
      }
      const snapshot = cloneScenario(definition);
      loadScenario(buildScenarioGame(snapshot), {
        playerDeckId: snapshot.playerDeckId,
        hostDeckId: snapshot.hordeDeckId,
      });
      setLaunch(snapshot);
      setReplayCursor(undefined);
      setAutoPlaying(false);
      return true;
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
      setToolsOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    document.body.classList.add("playground-active");
    document.body.classList.toggle("playground-panel-open", toolsOpen);
    return () => {
      document.body.classList.remove("playground-active");
      document.body.classList.remove("playground-panel-open");
    };
  }, [toolsOpen]);

  function dispatch(step: TimelineStep) {
    const outcome = executeStep(step);
    if (!outcome.ok) reportError(outcome.reason ?? "That action is not available right now.");
    if (outcome.ok && recording && replayCursor === undefined) setSteps((current) => [...current, step]);
    return outcome;
  }

  function executeHostTurn() {
    if (useGameStore.getState().hostDeckId !== draft.hordeDeckId && !buildBoard(draft)) return;
    dispatch(
      hostQueue.length > 0
        ? { kind: "hordeTurnExact", entries: structuredClone(hostQueue) }
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
      const definition = cloneScenario(board.definition);
      setDraft(definition);
      buildBoard(definition);
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
        <header className="playground-tools-topbar">
          <div className="playground-tools-brand">
            <span className="playground-tools-brand-mark"><Activity size={17} /></span>
            <div>
              <div className="playground-dock-kicker">Hostfall</div>
              <div className="playground-dock-title">Playground</div>
            </div>
          </div>

          <div className="playground-tools-topbar-actions">
            <button className="playground-rail-button" type="button" title="Return to main menu" onClick={onReturnToMenu}>
              <Home size={15} />
              <span>Menu</span>
            </button>
            <button className="playground-rail-button" type="button" title="Collapse Playground panel (F2)" onClick={() => setToolsOpen(false)}>
              <PanelLeftClose size={15} />
              <span>Close</span>
            </button>
          </div>
        </header>

        <section className="playground-tools-main">
          <header className="playground-dock-header">
            <div className="playground-tools-heading">
              <h2 className="playground-dock-title">{activeTab.label}</h2>
            </div>

            <div className="playground-launch" role="group" aria-label="Board controls">
              <button className="playground-launch-button is-active" type="button" disabled={!launch} onClick={() => launch && buildBoard(launch)}>
                <RotateCcw size={14} />
                <span>Restart</span>
              </button>
            </div>
          </header>

          <nav className="playground-tabs playground-tools-top-tabs" aria-label="Playground sections">
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
                  <Icon size={15} />
                  <span>{entry.label}</span>
                </button>
              );
            })}
          </nav>

          <div className={`playground-dock-body is-${tab} old-scrollbar`}>
            {tab === "scenario" && (
              <ScenarioPanel
                draft={draft}
                queue={hostQueue}
                onChangeQueue={setHostQueue}
                onChange={(definition) => {
                  if (definition.hordeDeckId !== draft.hordeDeckId) setHostQueue([]);
                  setDraft(definition);
                }}
                onUpdate={() => buildBoard(draft)}
                onExecuteHostTurn={executeHostTurn}
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
    <div className={`playground-shell ${toolsOpen ? "is-tools-open" : ""}`}>
      <div className="playground-stage">
        <Board key={gameSessionId} playerName="Playground" setupTurns={0} onReturnToMenu={onReturnToMenu} />
      </div>

      <div className="playground-dock-host" aria-hidden={!toolsOpen} inert={!toolsOpen}>
        {tools}
      </div>
      <button
        className="playground-dock-handle"
        type="button"
        title={`${toolsOpen ? "Close" : "Open"} Playground tools (F2)`}
        aria-label={`${toolsOpen ? "Close" : "Open"} Playground tools`}
        onClick={() => setToolsOpen((open) => !open)}
      >
        {toolsOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        <span>{toolsOpen ? "Hide Playground" : "Open Playground"}</span>
      </button>
    </div>
  );
}
