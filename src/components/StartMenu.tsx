import { AlertTriangle, ArrowLeft, Construction, Copy, Eye, Github, Play, RefreshCw, Settings, Shield, Skull, Swords, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { InspectableDeck, NewDeckCard } from "../data/deckCatalog";
import { useAudioStore } from "../store/useAudioStore";
import { useToastStore } from "../store/useToastStore";
import { useDeckCardDetails } from "../utils/deckCardImages";
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

const modes: Array<{ id: DifficultyMode; label: string; setupTurns: number }> = [
  { id: "easy", label: "Adventurer", setupTurns: 4 },
  { id: "normal", label: "Veteran", setupTurns: 3 },
  { id: "hard", label: "Doomed", setupTurns: 2 },
];

const DEVELOPER_MODE_STORAGE_KEY = "horde-game-developer-mode";

export function StartMenu({ decks, selectedDeckId, onSelectDeck, onOpenDeck, onViewDeck, hordeDecks, selectedHordeDeckId, onSelectHordeDeck, onViewHordeDeck, initialScreen = "home", preserveMusicOnMount = false, onStart }: Props) {
  const [playerName, setPlayerName] = useState("Arky");
  const [mode, setMode] = useState<DifficultyMode>("normal");
  const [seed, setSeed] = useState(() => generateRandomSeed());
  const [developerMode, setDeveloperMode] = useState(() => readStoredDeveloperMode());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [setupClosing, setSetupClosing] = useState(false);
  const [showTutorialConfirm, setShowTutorialConfirm] = useState(false);
  const [showDeveloperWarning, setShowDeveloperWarning] = useState(false);
  const [menuScreen, setMenuScreen] = useState<"home" | "setup" | "decks" | "settings">(initialScreen);
  const startMenuMusic = useAudioStore((state) => state.startMenuMusic);
  const playSfx = useAudioStore((state) => state.playSfx);
  const pushToast = useToastStore((state) => state.pushToast);
  const selectedMode = modes.find((item) => item.id === mode) ?? modes[1];
  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId) ?? decks[0];
  const selectedHordeDeck = hordeDecks.find((deck) => deck.id === selectedHordeDeckId) ?? hordeDecks[0];
  const effectiveSeed = developerMode ? "developer" : seed;

  useEffect(() => {
    if (!preserveMusicOnMount) startMenuMusic();
  }, [preserveMusicOnMount, startMenuMusic]);

  useEffect(() => {
    if (!setupClosing) return;
    const timeout = window.setTimeout(() => {
      setMenuScreen("home");
      setSetupClosing(false);
    }, 330);
    return () => window.clearTimeout(timeout);
  }, [setupClosing]);

  async function copySeed() {
    try {
      await navigator.clipboard.writeText(effectiveSeed);
      pushToast({ title: "Seed copied", message: effectiveSeed, tone: "success" });
    } catch {
      pushToast({ title: "Could not copy seed", message: effectiveSeed, tone: "warning" });
    }
  }

  function startGame() {
    if (launching) return;
    persistDeveloperMode(developerMode);
    setLaunching(true);
    onStart({
      playerName: playerName.trim() || "Player",
      mode,
      setupTurns: selectedMode.setupTurns,
      seed: effectiveSeed.trim() || generateRandomSeed(),
    });
  }

  function changeDifficulty(nextMode: DifficultyMode) {
    if (nextMode === mode) return;
    playSfx("playLand", { volume: 0.72 });
    setMode(nextMode);
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
    <main className={`main-menu-shell h-screen overflow-hidden text-[#f6e6b8] ${menuScreen === "setup" ? "expedition-active" : ""}`}>
      <MenuFireflies />
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
        <ExpeditionSetup
          playerDeck={selectedDeck}
          playerDecks={decks}
          selectedPlayerDeckId={selectedDeckId}
          onSelectPlayerDeck={onSelectDeck}
          onInspectPlayerDeck={onViewDeck}
          hordeDeck={selectedHordeDeck}
          hordeDecks={hordeDecks}
          selectedHordeDeckId={selectedHordeDeckId}
          onSelectHordeDeck={onSelectHordeDeck}
          onInspectHordeDeck={onViewHordeDeck}
          mode={mode}
          onModeChange={changeDifficulty}
          selectedMode={selectedMode}
          showAdvanced={showAdvanced}
          onToggleAdvanced={() => setShowAdvanced((value) => !value)}
          seed={effectiveSeed}
          developerMode={developerMode}
          onSeedChange={setSeed}
          onCopySeed={copySeed}
          onRegenerateSeed={() => {
            if (developerMode) updateDeveloperMode(false);
            setSeed(generateRandomSeed());
          }}
          onToggleDeveloperMode={toggleDeveloperMode}
          onBack={() => setSetupClosing(true)}
          onStart={startGame}
          launching={launching}
          closing={setupClosing}
        />
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
      
      {menuScreen !== "setup" && <div className="main-menu-credits fixed z-[300] text-[10px] font-bold uppercase tracking-wide text-[#66776f]">
        <div className="mb-0.5">Version: ALPHA 4.0-HAND-UPDATE</div>
        <a href="https://github.com/Leoocast" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 transition hover:text-[#e6c36f]" data-audio-click="valid">
          <span>Developed by</span>
          <Github size={11} className="-mt-[1px]" />
          <span>Leoocast</span>
        </a>
      </div>}

      <ToastStack variant="menu" />
    </main>
  );
}

function MenuFireflies() {
  return (
    <div className="menu-fireflies" aria-hidden="true">
      {Array.from({ length: 18 }, (_, index) => (
        <span
          key={index}
          style={{
            "--firefly-left": `${8 + ((index * 47) % 86)}%`,
            "--firefly-top": `${12 + ((index * 83) % 76)}%`,
            "--firefly-size": `${2 + (index % 3)}px`,
            "--firefly-duration": `${8 + (index % 6) * 1.1}s`,
            "--firefly-delay": `${index * -0.73}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

type ExpeditionSetupProps = {
  playerDeck?: InspectableDeck;
  playerDecks: InspectableDeck[];
  selectedPlayerDeckId: string;
  onSelectPlayerDeck: (deckId: string) => void;
  onInspectPlayerDeck: () => void;
  hordeDeck?: InspectableDeck;
  hordeDecks: InspectableDeck[];
  selectedHordeDeckId: string;
  onSelectHordeDeck: (deckId: string) => void;
  onInspectHordeDeck: () => void;
  mode: DifficultyMode;
  onModeChange: (mode: DifficultyMode) => void;
  selectedMode: (typeof modes)[number];
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  seed: string;
  developerMode: boolean;
  onSeedChange: (seed: string) => void;
  onCopySeed: () => void;
  onRegenerateSeed: () => void;
  onToggleDeveloperMode: () => void;
  onBack: () => void;
  onStart: () => void;
  launching: boolean;
  closing: boolean;
};

function ExpeditionSetup(props: ExpeditionSetupProps) {
  return (
    <section className={`expedition-setup ${props.closing ? "is-closing" : ""}`} aria-label="Prepare expedition">
      <header className="expedition-header">
        <button className="expedition-back" type="button" onClick={props.onBack}>
          <ArrowLeft size={17} /> Main menu
        </button>
        <div>
          <h1>Prepare the expedition</h1>
        </div>
        <div className="expedition-step"><span>01</span> Party setup</div>
      </header>

      <div className="expedition-body">
        <div className="expedition-combatants">
          <SetupCombatant
            eyebrow="Your champion"
            side="player"
            deck={props.playerDeck}
            decks={props.playerDecks}
            selectedDeckId={props.selectedPlayerDeckId}
            onSelectDeck={props.onSelectPlayerDeck}
            onInspect={props.onInspectPlayerDeck}
          />

          <div className="expedition-versus" aria-hidden="true"><span /><Swords size={27} /><strong>VS</strong><span /></div>

          <SetupCombatant
            eyebrow="The adversary"
            side="horde"
            deck={props.hordeDeck}
            decks={props.hordeDecks}
            selectedDeckId={props.selectedHordeDeckId}
            onSelectDeck={props.onSelectHordeDeck}
            onInspect={props.onInspectHordeDeck}
          />
        </div>

        <section className="expedition-difficulty" aria-labelledby="difficulty-heading">
          <div className="expedition-section-heading">
            <div><p>Choose your fate</p><h2 id="difficulty-heading">Difficulty</h2></div>
            <HordeAwakening turns={props.selectedMode.setupTurns} />
          </div>
          <div className="expedition-mode-grid">
            {modes.map((item) => (
              <button key={item.id} className={`expedition-mode ${item.id === props.mode ? "is-selected" : ""}`} type="button" aria-pressed={item.id === props.mode} onClick={() => props.onModeChange(item.id)} data-audio-click="off">
                <span className="expedition-mode-glyph">{item.id === "easy" ? <Shield size={20} /> : item.id === "normal" ? <Swords size={20} /> : <Skull size={20} />}</span>
                <span><strong>{item.label}</strong></span>
              </button>
            ))}
          </div>
        </section>

        <section className={`expedition-advanced ${props.showAdvanced ? "is-open" : ""}`}>
          <button className="expedition-advanced-toggle" type="button" onClick={props.onToggleAdvanced} aria-expanded={props.showAdvanced}>
            <Settings size={16} /> Advanced settings <span>{props.showAdvanced ? "Hide" : "Seed & developer tools"}</span>
          </button>
          {props.showAdvanced && (
            <div className="expedition-advanced-content">
              <div>
                <label htmlFor="expedition-seed">Seed</label>
                <div className="expedition-seed-field">
                  <input id="expedition-seed" value={props.seed} disabled={props.developerMode} onChange={(event) => props.onSeedChange(event.target.value)} />
                  <button type="button" onClick={props.onCopySeed} title="Copy seed"><Copy size={16} /></button>
                  <button type="button" onClick={props.onRegenerateSeed} title="New seed"><RefreshCw size={16} /></button>
                </div>
              </div>
              <div className="expedition-developer-setting">
                <span><strong>Developer Mode</strong><small>Testing tools and deterministic opening</small></span>
                <button className={`main-settings-toggle ${props.developerMode ? "is-on" : ""}`} type="button" role="switch" aria-checked={props.developerMode} onClick={props.onToggleDeveloperMode}><span /></button>
              </div>
            </div>
          )}
        </section>
      </div>

      <footer className="expedition-footer">
        <button className="expedition-begin" type="button" onClick={props.onStart} disabled={props.launching}>
          <span><small>Begin the</small> Expedition</span><Play size={29} />
        </button>
      </footer>

    </section>
  );
}

function HordeAwakening({ turns }: { turns: number }) {
  const previousTurns = useRef(turns);
  const [direction, setDirection] = useState<"idle" | "easier" | "harder">("idle");

  useEffect(() => {
    const previous = previousTurns.current;
    previousTurns.current = turns;
    if (turns === previous) return;
    setDirection(turns > previous ? "easier" : "harder");
    const timeout = window.setTimeout(() => setDirection("idle"), 650);
    return () => window.clearTimeout(timeout);
  }, [turns]);

  return (
    <div className={`expedition-awakening ${direction !== "idle" ? `is-${direction}` : ""} ${turns === 2 ? "is-doomed" : turns === 4 ? "is-safe" : ""}`} aria-live="polite">
      <span>The Horde awakens after</span>
      <strong key={`${turns}-${direction}`}>{turns}</strong>
      <span>turns</span>
    </div>
  );
}

function SetupCombatant({ eyebrow, side, deck, decks, selectedDeckId, onSelectDeck, onInspect }: {
  eyebrow: string;
  side: "player" | "horde";
  deck?: InspectableDeck;
  decks: InspectableDeck[];
  selectedDeckId: string;
  onSelectDeck: (deckId: string) => void;
  onInspect: () => void;
}) {
  const keyCard = deck ? findSetupKeyCard(deck) : undefined;
  const details = useDeckCardDetails(deck?.id ?? "missing", keyCard, deck?.images ?? { cards: {} });
  return (
    <article className={`expedition-combatant ${side === "horde" ? "expedition-combatant-horde" : "expedition-combatant-player"}`}>
      <div className="expedition-combatant-heading"><span>{side === "player" ? <Shield size={14} /> : <Skull size={14} />}{eyebrow}</span><button type="button" onClick={onInspect}><Eye size={14} /> Inspect deck</button></div>
      <div className="expedition-deck-feature">
        <div className="expedition-deck-art">
          {details.imageUrl ? <img src={details.imageUrl} alt={keyCard?.name ?? deck?.label} draggable={false} /> : <span>{side === "player" ? <Shield size={35} /> : <Skull size={35} />}</span>}
        </div>
        <div className="expedition-deck-copy">
          <small>{deck?.deck.deckSize ?? deck?.deck.cards.length ?? 0} cards</small>
          <h2>{deck?.deck.name ?? "Choose a deck"}</h2>
          <p>{deckDescription(deck?.id)}</p>
        </div>
      </div>
      <div className="expedition-deck-options" role="listbox" aria-label={`${eyebrow} deck`}>
        {decks.map((item) => <button key={item.id} className={item.id === selectedDeckId ? "is-selected" : ""} type="button" role="option" aria-selected={item.id === selectedDeckId} onClick={() => onSelectDeck(item.id)}>{item.deck.name}</button>)}
      </div>
    </article>
  );
}

const SETUP_KEY_CARD_IDS: Record<string, string> = {
  mono_green_ramp: "sunshower_druid",
  horde_zombies: "zombie_token",
  goblin_assault_horde: "goblin_token_1_1_red",
};

function findSetupKeyCard(deck: InspectableDeck): NewDeckCard | undefined {
  const cards = [...(deck.deck.tokens ?? []), ...deck.deck.cards];
  return cards.find((card) => card.id === SETUP_KEY_CARD_IDS[deck.id]) ?? cards[0];
}

function deckDescription(deckId?: string): string {
  if (deckId === "mono_green_ramp") return "Build an ancient mana engine and awaken overwhelming creatures.";
  if (deckId === "goblin_assault_horde") return "A warband of fire, haste, and numbers that never stops advancing.";
  return "An endless host that returns from the grave and consumes the fallen.";
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
