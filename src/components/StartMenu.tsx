import { AlertTriangle, ChevronDown, Construction, Github, GraduationCap, Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { InspectableDeck } from "../data/deckCatalog";
import { useAudioStore } from "../store/useAudioStore";
import { useToastStore } from "../store/useToastStore";
import { AppHeader } from "./AppHeader";
import { AudioControls } from "./AudioControls";
import { DecksView } from "./DecksView";
import { ToastStack } from "./ToastStack";

export type DifficultyMode = "easy" | "normal" | "hard";

type Props = {
  decks: InspectableDeck[];
  selectedDeckId: string;
  onSelectDeck: (deckId: string) => void;
  onOpenDeck: (deckId: string) => void;
  onViewDeck: () => void;
  hordeDecks: InspectableDeck[];
  selectedHordeDeckId: string;
  onSelectHordeDeck: (deckId: string) => void;
  onViewHordeDeck: () => void;
  initialScreen?: "home" | "setup" | "decks" | "settings";
  preserveMusicOnMount?: boolean;
  onStart: (options: { playerName: string; mode: DifficultyMode; setupTurns: number; seed: string }) => void;
};

const modes: Array<{ id: DifficultyMode; label: string; setupTurns: number; description: string }> = [
  { id: "easy", label: "Easy", setupTurns: 4, description: "4 extra setup turns" },
  { id: "normal", label: "Normal", setupTurns: 3, description: "3 extra setup turns" },
  { id: "hard", label: "Hard", setupTurns: 2, description: "2 extra setup turns" },
];

const DEVELOPER_MODE_STORAGE_KEY = "horde-game-developer-mode";

export function StartMenu({ decks, selectedDeckId, onSelectDeck, onOpenDeck, onViewDeck, hordeDecks, selectedHordeDeckId, onSelectHordeDeck, onViewHordeDeck, initialScreen = "home", preserveMusicOnMount = false, onStart }: Props) {
  const [playerName, setPlayerName] = useState("Arky");
  const [mode, setMode] = useState<DifficultyMode>("normal");
  const [seed, setSeed] = useState(() => generateRandomSeed());
  const [developerMode, setDeveloperMode] = useState(() => readStoredDeveloperMode());
  const [deckOpen, setDeckOpen] = useState(false);
  const [hordeDeckOpen, setHordeDeckOpen] = useState(false);
  const [showTutorialConfirm, setShowTutorialConfirm] = useState(false);
  const [showDeveloperWarning, setShowDeveloperWarning] = useState(false);
  const [menuScreen, setMenuScreen] = useState<"home" | "setup" | "decks" | "settings">(initialScreen);
  const startMenuMusic = useAudioStore((state) => state.startMenuMusic);
  const pushToast = useToastStore((state) => state.pushToast);
  const selectedMode = modes.find((item) => item.id === mode) ?? modes[1];
  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId) ?? decks[0];
  const selectedHordeDeck = hordeDecks.find((deck) => deck.id === selectedHordeDeckId) ?? hordeDecks[0];
  const effectiveSeed = developerMode ? "developer" : seed;

  useEffect(() => {
    if (!preserveMusicOnMount) startMenuMusic();
  }, [preserveMusicOnMount, startMenuMusic]);

  async function copySeed() {
    try {
      await navigator.clipboard.writeText(effectiveSeed);
      pushToast({ title: "Seed copied", message: effectiveSeed, tone: "success" });
    } catch {
      pushToast({ title: "Could not copy seed", message: effectiveSeed, tone: "warning" });
    }
  }

  function startGame() {
    persistDeveloperMode(developerMode);
    onStart({ playerName: playerName.trim() || "Player", mode, setupTurns: selectedMode.setupTurns, seed: effectiveSeed.trim() || generateRandomSeed() });
  }

  function toggleDeveloperMode() {
    if (developerMode) {
      updateDeveloperMode(false);
      return;
    }
    setShowDeveloperWarning(true);
  }

  function updateDeveloperMode(enabled: boolean) {
    setDeveloperMode(enabled);
    pushToast({
      title: enabled ? "Developer Mode enabled" : "Developer Mode disabled",
      message: enabled ? "Developer testing seed is active." : "New games will use the selected seed.",
      tone: enabled ? "warning" : "success",
    });
  }

  return (
    <main className={`h-screen overflow-hidden text-[#f6e6b8] ${menuScreen !== "setup" ? "main-menu-shell" : "duel-table"}`}>
      {menuScreen !== "setup" ? (
        <div className="main-menu-stage">
        <div className="main-menu-layout">
          <div className="main-menu-brand">
            <div className="main-menu-kicker">Chronicles of the Shattered Realms</div>
            <h1 className="main-menu-title">Hostfall</h1>
            <div className="main-menu-subtitle"><span /> Act I — The Dead Awaken</div>
          </div>

          <nav className="main-menu-nav" aria-label="Main menu">
            <button className="main-menu-entry group" type="button" onClick={() => setMenuScreen("setup")}>
              <span className="main-menu-entry-mark" />
              <span>Play</span>
            </button>
            <button className={`main-menu-entry group ${menuScreen === "decks" ? "is-active" : ""}`} type="button" onClick={() => setMenuScreen("decks")}>
              <span className="main-menu-entry-mark" />
              <span>Decks</span>
            </button>
            <button className="main-menu-entry group" type="button" onClick={() => setShowTutorialConfirm(true)}>
              <span className="main-menu-entry-mark" />
              <span>How to Play</span>
            </button>
            <button className={`main-menu-entry group ${menuScreen === "settings" ? "is-active" : ""}`} type="button" onClick={() => setMenuScreen("settings")}>
              <span className="main-menu-entry-mark" />
              <span>Settings</span>
            </button>
          </nav>

        </div>
        {menuScreen === "settings" && (
          <section className="main-settings-screen" aria-label="Settings">
            <header className="main-settings-header">
              <h2>Settings</h2>
              <span>Customize audio and game configuration.</span>
            </header>

            <div className="main-settings-content old-scrollbar">
              <AudioControls variant="screen" />

              <section className="main-settings-section">
                <div className="main-settings-section-title">Game</div>
                <div className="main-settings-row">
                  <div>
                    <label className="main-settings-label" htmlFor="main-settings-seed">Seed</label>
                    <div className="main-settings-description">Replay the exact same game configuration</div>
                  </div>
                  <div className="main-settings-seed-control">
                    <input
                      id="main-settings-seed"
                      value={developerMode ? "developer" : seed}
                      onChange={(event) => setSeed(event.target.value)}
                      disabled={developerMode}
                      className="main-settings-input"
                    />
                    <button className="main-settings-action" type="button" onClick={copySeed}>Copy</button>
                    <button
                      className="main-settings-action"
                      type="button"
                      onClick={() => {
                        if (developerMode) updateDeveloperMode(false);
                        setSeed(generateRandomSeed());
                      }}
                    >
                      New
                    </button>
                  </div>
                </div>
                <div className="main-settings-row">
                  <div>
                    <div className="main-settings-label">Developer Mode</div>
                    <div className="main-settings-description">Testing tools for cards and unfinished effects</div>
                  </div>
                  <button className={`main-settings-toggle ${developerMode ? "is-on" : ""}`} type="button" role="switch" aria-checked={developerMode} onClick={toggleDeveloperMode}>
                    <span />
                  </button>
                </div>
              </section>
            </div>
          </section>
        )}
        {menuScreen === "decks" && (
          <DecksView playerDecks={decks} hordeDecks={hordeDecks} onOpenDeck={onOpenDeck} />
        )}
        </div>
      ) : (
        <>
      <AppHeader
        left={<button className="pl-3 text-sm font-black uppercase tracking-[0.18em] text-[#d8c99f] transition hover:text-[#fff3cb]" type="button" onClick={() => setMenuScreen("home")}>← Main Menu</button>}
        center={<div className="old-panel-soft px-4 py-2 text-sm font-black uppercase tracking-wide text-[#fff0b2]">New Game</div>}
        newGameSeedSettings={{
          seed,
          developerMode,
          onSeedChange: setSeed,
          onCopySeed: copySeed,
          onRegenerateSeed: () => {
            if (developerMode) updateDeveloperMode(false);
            setSeed(generateRandomSeed());
          },
          onToggleDeveloperMode: toggleDeveloperMode,
        }}
      />
      <div className="flex h-[calc(100vh-56px)] items-center justify-center p-6">
        <section className="old-panel relative w-full max-w-lg p-6">
        <div className="mb-6">
          <p className="old-title text-xs font-bold uppercase tracking-[0.28em]">Horde Magic PvE</p>
          <h1 className="old-title mt-2 text-4xl font-black leading-tight">New Game</h1>
        </div>

        <label className="block text-xs font-bold uppercase tracking-wide text-[#d6b879]" htmlFor="player-name">
          Name
        </label>
        <input
          id="player-name"
          value={playerName}
          onChange={(event) => setPlayerName(event.target.value)}
          className="old-input mt-2 h-11 w-full px-3 outline-none transition placeholder:text-[#85633b] focus:border-[#f4cc74]"
          placeholder="Player"
        />

        <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-[#d6b879]" htmlFor="player-deck">
          Player Deck
        </label>
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
          <div className="relative min-w-0">
            {deckOpen && <button aria-label="Close deck selector" className="fixed inset-0 z-10 cursor-default bg-transparent" onClick={() => setDeckOpen(false)} />}
            <button
              id="player-deck"
              className="old-select relative z-20 flex h-11 w-full min-w-0 items-center justify-between gap-3 px-3 pr-2 text-left text-sm font-bold outline-none transition"
              onClick={() => setDeckOpen((value) => !value)}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={deckOpen}
            >
              <span className="truncate">{selectedDeck?.label ?? "Select deck"}</span>
              <ChevronDown className={`shrink-0 text-[#f0c46f] transition ${deckOpen ? "rotate-180" : ""}`} size={18} />
            </button>
            {deckOpen && (
              <div className="old-panel old-scrollbar absolute left-0 right-0 top-full z-30 mt-2 max-h-56 overflow-auto p-1 shadow-2xl shadow-black/60" role="listbox" aria-labelledby="player-deck">
                {decks.map((deck) => {
                  const selected = deck.id === selectedDeckId;
                  return (
                    <button
                      key={deck.id}
                      className={[
                        "w-full rounded-md px-3 py-2 text-left text-sm font-bold transition",
                        selected ? "bg-[#8a5b20]/65 text-[#fff0b2] shadow-[inset_0_0_0_1px_rgba(246,211,132,0.38)]" : "text-[#d6b879] hover:bg-[#4d3018]/80 hover:text-[#ffe6aa]",
                      ].join(" ")}
                      onClick={() => {
                        onSelectDeck(deck.id);
                        setDeckOpen(false);
                      }}
                      role="option"
                      aria-selected={selected}
                      type="button"
                    >
                      <span className="block truncate">{deck.label}</span>
                      <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-[#a88956]">{deck.deck.deckSize ?? deck.deck.cards.length} cards</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button className="old-button h-11 px-4 text-sm font-black uppercase tracking-wide" onClick={onViewDeck}>
            View
          </button>
        </div>

        <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-[#d6b879]" htmlFor="horde-deck">
          Horde Deck
        </label>
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
          <div className="relative min-w-0">
            {hordeDeckOpen && <button aria-label="Close horde deck selector" className="fixed inset-0 z-10 cursor-default bg-transparent" onClick={() => setHordeDeckOpen(false)} />}
            <button
              id="horde-deck"
              className="old-select relative z-20 flex h-11 w-full min-w-0 items-center justify-between gap-3 px-3 pr-2 text-left text-sm font-bold outline-none transition"
              onClick={() => setHordeDeckOpen((value) => !value)}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={hordeDeckOpen}
            >
              <span className="truncate">{selectedHordeDeck?.label ?? "Select horde deck"}</span>
              <ChevronDown className={`shrink-0 text-[#f0c46f] transition ${hordeDeckOpen ? "rotate-180" : ""}`} size={18} />
            </button>
            {hordeDeckOpen && (
              <div className="old-panel old-scrollbar absolute left-0 right-0 top-full z-30 mt-2 max-h-56 overflow-auto p-1 shadow-2xl shadow-black/60" role="listbox" aria-labelledby="horde-deck">
                {hordeDecks.map((deck) => {
                  const selected = deck.id === selectedHordeDeckId;
                  return (
                    <button
                      key={deck.id}
                      className={[
                        "w-full rounded-md px-3 py-2 text-left text-sm font-bold transition",
                        selected ? "bg-[#8a5b20]/65 text-[#fff0b2] shadow-[inset_0_0_0_1px_rgba(246,211,132,0.38)]" : "text-[#d6b879] hover:bg-[#4d3018]/80 hover:text-[#ffe6aa]",
                      ].join(" ")}
                      onClick={() => {
                        onSelectHordeDeck(deck.id);
                        setHordeDeckOpen(false);
                      }}
                      role="option"
                      aria-selected={selected}
                      type="button"
                    >
                      <span className="block truncate">{deck.label}</span>
                      <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-[#a88956]">{deck.deck.deckSize ?? deck.deck.cards.length} cards</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button className="old-button h-11 px-4 text-sm font-black uppercase tracking-wide" onClick={onViewHordeDeck}>
            View
          </button>
        </div>

        <div className="mt-5">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#d6b879]">Mode</div>
          <div className="grid grid-cols-3 gap-2">
            {modes.map((item) => {
              const selected = item.id === mode;
              return (
                <button
                  key={item.id}
                  onClick={() => setMode(item.id)}
                  className={[
                    "old-panel-soft px-3 py-3 text-left transition hover:brightness-125",
                    selected ? "outline outline-2 outline-[#e6c36f] text-[#fff0b8]" : "text-[#d2bc83]",
                  ].join(" ")}
                >
                  <div className="text-sm font-black uppercase tracking-wide">{item.label}</div>
                  <div className="mt-1 text-[11px] leading-snug text-[#bda574]">{item.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-[1fr_auto] gap-2">
          <button
            className="old-button-green flex h-12 w-full items-center justify-center gap-2 text-sm font-black uppercase tracking-wide transition"
            onClick={startGame}
          >
            <Play size={18} />
            Start
          </button>
          <button
            className="old-button flex h-12 items-center justify-center gap-2 px-4 text-sm font-black uppercase tracking-wide transition"
            type="button"
            onClick={() => setShowTutorialConfirm(true)}
            title="How to play"
          >
            <GraduationCap size={18} />
            How to play
          </button>
        </div>
        </section>
      </div>
        </>
      )}

      {showTutorialConfirm && (
        <TutorialUnderConstructionModal onClose={() => setShowTutorialConfirm(false)} />
      )}

      {showDeveloperWarning && (
        <DeveloperWarningModal
          onClose={() => setShowDeveloperWarning(false)}
          onEnable={() => {
            updateDeveloperMode(true);
            setShowDeveloperWarning(false);
          }}
        />
      )}
      
      <div className="main-menu-credits fixed z-[300] text-[10px] font-bold uppercase tracking-wide text-[#66776f]">
        <div className="mb-0.5">Version: ALPHA 4.0-HAND-UPDATE</div>
        <a href="https://github.com/Leoocast" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 transition hover:text-[#e6c36f]" data-audio-click="valid">
          <span>Developed by</span>
          <Github size={11} className="-mt-[1px]" />
          <span>Leoocast</span>
        </a>
      </div>

      <ToastStack variant="menu" />
    </main>
  );
}

function TutorialUnderConstructionModal({ onClose }: { onClose: () => void }) {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!closing) return;
    const timeout = window.setTimeout(onClose, 160);
    return () => window.clearTimeout(timeout);
  }, [closing, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setClosing(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div
      className={`tutorial-construction-backdrop ${closing ? "is-closing" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setClosing(true);
      }}
    >
      <section className="tutorial-construction-modal" role="dialog" aria-modal="true" aria-labelledby="tutorial-construction-title">
        <button className="tutorial-construction-close" type="button" onClick={() => setClosing(true)} title="Close">
          <X size={18} />
        </button>
        <div className="tutorial-construction-icon" aria-hidden="true">
          <Construction size={30} />
        </div>
        <p className="tutorial-construction-kicker">How to Play · Feature locked</p>
        <h2 id="tutorial-construction-title">Under Construction</h2>
        <div className="tutorial-construction-rule" />
        <p className="tutorial-construction-copy">
          The chronicles are still being written. How to Play will become available in a future update.
        </p>
        <button className="tutorial-construction-action" type="button" onClick={() => setClosing(true)}>
          Return to Hostfall
        </button>
      </section>
    </div>
  );
}

function DeveloperWarningModal({ onClose, onEnable }: { onClose: () => void; onEnable: () => void }) {
  const [closingAction, setClosingAction] = useState<"cancel" | "enable" | null>(null);

  useEffect(() => {
    if (!closingAction) return;
    const timeout = window.setTimeout(() => {
      if (closingAction === "enable") onEnable();
      else onClose();
    }, 160);
    return () => window.clearTimeout(timeout);
  }, [closingAction, onClose, onEnable]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setClosingAction("cancel");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const isClosing = closingAction !== null;

  return (
    <div
      data-preserve-settings-menu="true"
      className={`tutorial-construction-backdrop ${isClosing ? "is-closing" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setClosingAction("cancel");
      }}
    >
      <section className="tutorial-construction-modal developer-warning-modal" role="dialog" aria-modal="true" aria-labelledby="developer-warning-title">
        <button className="tutorial-construction-close" type="button" onClick={() => setClosingAction("cancel")} title="Close">
          <X size={18} />
        </button>
        <div className="tutorial-construction-icon developer-warning-icon" aria-hidden="true">
          <AlertTriangle size={30} />
        </div>
        <p className="tutorial-construction-kicker">Developer Mode · Restricted tools</p>
        <h2 id="developer-warning-title">Enter the Workshop?</h2>
        <div className="tutorial-construction-rule" />
        <p className="tutorial-construction-copy">
          Developer Mode may disrupt the intended experience. Use it to test cards, effects, and unfinished features.
        </p>
        <div className="developer-warning-actions">
          <button className="tutorial-construction-action is-secondary" type="button" onClick={() => setClosingAction("cancel")}>Cancel</button>
          <button className="tutorial-construction-action" type="button" onClick={() => setClosingAction("enable")}>Enable Developer Mode</button>
        </div>
      </section>
    </div>
  );
}

function generateRandomSeed(): string {
  const cryptoRandom = new Uint32Array(2);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(cryptoRandom);
  } else {
    cryptoRandom[0] = Math.floor(Math.random() * 0xffffffff);
    cryptoRandom[1] = Math.floor(Math.random() * 0xffffffff);
  }
  return `horde-${Date.now().toString(36)}-${cryptoRandom[0].toString(36)}${cryptoRandom[1].toString(36)}`;
}

function readStoredDeveloperMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DEVELOPER_MODE_STORAGE_KEY) === "true";
}

function persistDeveloperMode(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEVELOPER_MODE_STORAGE_KEY, String(enabled));
}
