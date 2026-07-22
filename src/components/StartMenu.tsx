import { AlertTriangle, ArrowLeft, Construction, Copy, Dices, Eye, Feather, Github, Play, RefreshCw, RotateCcw, Settings, Shield, Skull, Sparkles, Swords, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { InspectableDeck, NewDeckCard } from "../data/deckCatalog";
import type { DifficultyMode, GameMode } from "../engine/GameTypes";
import { localizedCardName } from "../i18n/cardLocalization";
import { useTranslation } from "../i18n/useTranslation";
import { useAudioStore } from "../store/useAudioStore";
import { useLanguageStore } from "../store/useLanguageStore";
import { useToastStore } from "../store/useToastStore";
import { useDeckCardDetails } from "../utils/deckCardImages";
import { clearAppAssetCache, completeOnboarding, persistDeveloperMode, readStoredDeveloperMode, readStoredPlayerName, resetOnboarding } from "../utils/appPersistence";
import { APP_VERSION } from "../version";
import { AudioControls } from "./AudioControls";
import { DecksView } from "./DecksView";
import { LanguageSelector } from "./LanguageSelector";
import { ToastStack } from "./ToastStack";

type Props = {
  decks: InspectableDeck[];
  selectedDeckId: string;
  onSelectDeck: (deckId: string) => void;
  onOpenDeck: (deckId: string) => void;
  onViewDeck: (returnScreen?: "setup" | "chaos") => void;
  hordeDecks: InspectableDeck[];
  selectedHordeDeckId: string;
  onSelectHordeDeck: (deckId: string) => void;
  onViewHordeDeck: (returnScreen?: "setup" | "chaos") => void;
  initialScreen?: MenuScreen;
  preserveMusicOnMount?: boolean;
  requestInitialName?: boolean;
  onNameSaved?: (name: string) => void;
  onRestartFirstTime?: () => void;
  onStart: (options: { playerName: string; mode: DifficultyMode; gameMode: GameMode; setupTurns: number; seed: string }) => void;
};

type MenuScreen = "home" | "setup" | "chaos" | "chronicles" | "hosts" | "settings";
type ClosingMenuScreen = Extract<MenuScreen, "chronicles" | "hosts" | "settings">;

const modes: Array<{ id: DifficultyMode; setupTurns: number }> = [
  { id: "easy", setupTurns: 4 },
  { id: "normal", setupTurns: 3 },
  { id: "hard", setupTurns: 2 },
];

export function StartMenu({ decks, selectedDeckId, onSelectDeck, onOpenDeck, onViewDeck, hordeDecks, selectedHordeDeckId, onSelectHordeDeck, onViewHordeDeck, initialScreen = "home", preserveMusicOnMount = false, requestInitialName = false, onNameSaved, onRestartFirstTime, onStart }: Props) {
  const t = useTranslation();
  const [playerName, setPlayerName] = useState(() => readStoredPlayerName());
  const [mode, setMode] = useState<DifficultyMode>("easy");
  const [seed, setSeed] = useState(() => generateRandomSeed());
  const [developerMode, setDeveloperMode] = useState(() => readStoredDeveloperMode());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [setupClosing, setSetupClosing] = useState(false);
  const [showTutorialConfirm, setShowTutorialConfirm] = useState(false);
  const [showDeveloperWarning, setShowDeveloperWarning] = useState(false);
  const [showNameEditor, setShowNameEditor] = useState(requestInitialName);
  const [nameEditorClosing, setNameEditorClosing] = useState(false);
  const [nameDraft, setNameDraft] = useState(requestInitialName ? "" : playerName);
  const [nameRequired, setNameRequired] = useState(requestInitialName);
  const [clearingCache, setClearingCache] = useState(false);
  const [menuScreen, setMenuScreen] = useState<MenuScreen>(initialScreen);
  const [closingMenuScreen, setClosingMenuScreen] = useState<ClosingMenuScreen | undefined>();
  const startMenuMusic = useAudioStore((state) => state.startMenuMusic);
  const playSfx = useAudioStore((state) => state.playSfx);
  const pushToast = useToastStore((state) => state.pushToast);
  const selectedMode = modes.find((item) => item.id === mode) ?? modes[0];
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

  useEffect(() => {
    if (!closingMenuScreen) return;
    const timeout = window.setTimeout(() => {
      setMenuScreen("home");
      setClosingMenuScreen(undefined);
    }, 210);
    return () => window.clearTimeout(timeout);
  }, [closingMenuScreen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (showNameEditor) {
        event.preventDefault();
        if (!nameRequired) closeNameEditor();
        return;
      }
      if (showTutorialConfirm || showDeveloperWarning) return;
      if (menuScreen === "home") return;
      event.preventDefault();
      if (menuScreen === "setup" || menuScreen === "chaos") setSetupClosing(true);
      else closeMenuPanel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuScreen, nameEditorClosing, nameRequired, showDeveloperWarning, showNameEditor, showTutorialConfirm]);

  function openNameEditor() {
    setNameDraft(playerName);
    setNameEditorClosing(false);
    setShowNameEditor(true);
  }

  function closeNameEditor() {
    if (nameRequired) return;
    if (nameEditorClosing) return;
    setNameEditorClosing(true);
    window.setTimeout(() => {
      setShowNameEditor(false);
      setNameEditorClosing(false);
    }, 200);
  }

  function savePlayerName() {
    const nextName = nameDraft.trim() || "Chronicler";
    setPlayerName(nextName);
    completeOnboarding(nextName);
    setNameRequired(false);
    onNameSaved?.(nextName);
    playSfx("playLand", { volume: 0.62 });
    setNameEditorClosing(true);
    window.setTimeout(() => {
      setShowNameEditor(false);
      setNameEditorClosing(false);
    }, 200);
  }

  async function clearCache() {
    if (clearingCache) return;
    setClearingCache(true);
    try {
      await clearAppAssetCache();
      pushToast({ title: t("toast.cacheCleared"), message: t("toast.cacheClearedMessage"), tone: "success" });
    } catch {
      pushToast({ title: t("toast.cacheFailed"), message: t("toast.cacheFailedMessage"), tone: "warning" });
    } finally {
      setClearingCache(false);
    }
  }

  function restartFirstTimeFlow() {
    resetOnboarding();
    onRestartFirstTime?.();
  }

  function closeMenuPanel() {
    if (menuScreen === "chronicles" || menuScreen === "hosts" || menuScreen === "settings") setClosingMenuScreen(menuScreen);
  }

  async function copySeed() {
    try {
      await navigator.clipboard.writeText(effectiveSeed);
      pushToast({ title: t("toast.seedCopied"), message: effectiveSeed, tone: "success" });
    } catch {
      pushToast({ title: t("toast.seedCopyFailed"), message: effectiveSeed, tone: "warning" });
    }
  }

  function startGame() {
    if (launching) return;
    persistDeveloperMode(developerMode);
    setLaunching(true);
    onStart({
      playerName: playerName.trim() || "Chronicler",
      mode: menuScreen === "chaos" ? "normal" : mode,
      gameMode: menuScreen === "chaos" ? "chaos" : "standard",
      setupTurns: menuScreen === "chaos" ? 0 : selectedMode.setupTurns,
      seed: effectiveSeed.trim() || generateRandomSeed(),
    });
  }

  function changeDifficulty(nextMode: DifficultyMode) {
    if (nextMode === mode) return;
    const rate = nextMode === "easy" ? 1.08 : nextMode === "hard" ? 0.9 : 1;
    playSfx("playLand", { volume: 0.76, rate });
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
    persistDeveloperMode(enabled);
    pushToast({
      title: enabled ? t("toast.developerEnabled") : t("toast.developerDisabled"),
      message: enabled ? t("toast.developerEnabledMessage") : t("toast.developerDisabledMessage"),
      tone: enabled ? "warning" : "success",
    });
  }

  return (
    <main className={`main-menu-shell h-screen overflow-hidden text-[#f6e6b8] ${menuScreen === "setup" || menuScreen === "chaos" ? "expedition-active" : ""} ${menuScreen === "chaos" ? "chaos-active" : ""}`}>
      <MenuFireflies />
      {menuScreen !== "setup" && menuScreen !== "chaos" ? (
        <div className="main-menu-stage">
        {menuScreen === "home" && (
          <div className="main-menu-chronicler" aria-label={t("menu.profileLabel")}>
            <span className="main-menu-chronicler-mark" aria-hidden="true" />
            <div>
              <strong className="main-menu-chronicler-name">{playerName || "Chronicler"}</strong>
              <span>Chronicler</span>
            </div>
            <button className="main-menu-chronicler-edit" type="button" onClick={openNameEditor} title={t("menu.editName")} aria-label={t("menu.editName")}>
              <Feather size={19} />
            </button>
          </div>
        )}
        <div className="main-menu-layout">
          <div className="main-menu-brand">
            <div className="main-menu-kicker">{t("menu.kicker")}</div>
            <h1 className="main-menu-title">Hostfall</h1>
            <div className="main-menu-subtitle"><span /> {t("menu.act")}</div>
          </div>

          <nav className="main-menu-nav" aria-label={t("menu.mainAria")}>
            <button className="main-menu-entry group" type="button" onClick={() => setMenuScreen("setup")}>
              <span className="main-menu-entry-mark" />
              <span>{t("menu.play")}</span>
            </button>
            <button className="main-menu-entry main-menu-entry-chaos group" type="button" onClick={() => setMenuScreen("chaos")}>
              <span className="main-menu-entry-mark" />
              <span><strong>{t("menu.chaosMode")}</strong><small>{t("menu.mutatedBattle")}</small></span>
              <Dices size={18} aria-hidden="true" />
            </button>
            <button className={`main-menu-entry group ${menuScreen === "chronicles" ? "is-active" : ""}`} type="button" onClick={() => { setClosingMenuScreen(undefined); setMenuScreen("chronicles"); }}>
              <span className="main-menu-entry-mark" />
              <span>{t("menu.chronicles")}</span>
            </button>
            <button className={`main-menu-entry group ${menuScreen === "hosts" ? "is-active" : ""}`} type="button" onClick={() => { setClosingMenuScreen(undefined); setMenuScreen("hosts"); }}>
              <span className="main-menu-entry-mark" />
              <span>{t("menu.hosts")}</span>
            </button>
            <button className="main-menu-entry group" type="button" onClick={() => setShowTutorialConfirm(true)}>
              <span className="main-menu-entry-mark" />
              <span>{t("menu.howToPlay")}</span>
            </button>
            <button className={`main-menu-entry group ${menuScreen === "settings" ? "is-active" : ""}`} type="button" onClick={() => { setClosingMenuScreen(undefined); setMenuScreen("settings"); }}>
              <span className="main-menu-entry-mark" />
              <span>{t("menu.settings")}</span>
            </button>
          </nav>

        </div>
        {menuScreen === "settings" && (
          <section className={`main-settings-screen ${closingMenuScreen === "settings" ? "is-closing" : ""}`} aria-label={t("menu.settings")}>
            <header className="main-settings-header">
              <button className="menu-screen-back" type="button" onClick={closeMenuPanel}><ArrowLeft size={16} /> {t("common.back")}</button>
              <h2>{t("menu.settings")}</h2>
              <span>{t("settings.description")}</span>
            </header>

            <div className="main-settings-content old-scrollbar">
              <LanguageSelector />
              <AudioControls variant="screen" />

              <section className="main-settings-section">
                <div className="main-settings-section-title">{t("settings.game")}</div>
                <div className="main-settings-row">
                  <div>
                    <label className="main-settings-label" htmlFor="main-settings-seed">{t("settings.seed")}</label>
                    <div className="main-settings-description">{t("settings.seedDescription")}</div>
                  </div>
                  <div className="main-settings-seed-control">
                    <input
                      id="main-settings-seed"
                      value={developerMode ? "developer" : seed}
                      onChange={(event) => setSeed(event.target.value)}
                      disabled={developerMode}
                      className="main-settings-input"
                    />
                    <button className="main-settings-action" type="button" onClick={copySeed}>{t("common.copy")}</button>
                    <button
                      className="main-settings-action"
                      type="button"
                      onClick={() => {
                        if (developerMode) updateDeveloperMode(false);
                        setSeed(generateRandomSeed());
                      }}
                    >
                      {t("common.new")}
                    </button>
                  </div>
                </div>
                <div className="main-settings-row">
                  <div>
                    <div className="main-settings-label">{t("settings.developerMode")}</div>
                    <div className="main-settings-description">{t("settings.developerDescription")}</div>
                  </div>
                  <button className={`main-settings-toggle ${developerMode ? "is-on" : ""}`} type="button" role="switch" aria-checked={developerMode} onClick={toggleDeveloperMode}>
                    <span />
                  </button>
                </div>
                <div className="main-settings-row">
                  <div>
                    <div className="main-settings-label">{t("settings.assetCache")}</div>
                    <div className="main-settings-description">{t("settings.assetCacheDescription")}</div>
                  </div>
                  <button className="main-settings-action main-settings-action-wide" type="button" onClick={clearCache} disabled={clearingCache}>
                    <Trash2 size={14} /> {clearingCache ? t("settings.clearing") : t("settings.clearCache")}
                  </button>
                </div>
                {developerMode && (
                  <div className="main-settings-row main-settings-developer-row">
                    <div>
                      <div className="main-settings-label">{t("settings.firstTimeFlow")}</div>
                      <div className="main-settings-description">{t("settings.firstTimeDescription")}</div>
                    </div>
                    <button className="main-settings-action main-settings-action-wide is-developer" type="button" onClick={restartFirstTimeFlow}>
                      <RotateCcw size={14} /> {t("settings.testFirstTime")}
                    </button>
                  </div>
                )}
              </section>
            </div>
          </section>
        )}
        {menuScreen === "chronicles" && (
          <DecksView collection="chronicles" decks={decks} onOpenDeck={onOpenDeck} onBack={closeMenuPanel} closing={closingMenuScreen === "chronicles"} />
        )}
        {menuScreen === "hosts" && (
          <DecksView collection="hosts" decks={hordeDecks} onOpenDeck={onOpenDeck} onBack={closeMenuPanel} closing={closingMenuScreen === "hosts"} />
        )}
        </div>
      ) : (
        <ExpeditionSetup
          playerDeck={selectedDeck}
          playerDecks={decks}
          selectedPlayerDeckId={selectedDeckId}
          onSelectPlayerDeck={onSelectDeck}
          onInspectPlayerDeck={() => onViewDeck(menuScreen === "chaos" ? "chaos" : "setup")}
          hordeDeck={selectedHordeDeck}
          hordeDecks={hordeDecks}
          selectedHordeDeckId={selectedHordeDeckId}
          onSelectHordeDeck={onSelectHordeDeck}
          onInspectHordeDeck={() => onViewHordeDeck(menuScreen === "chaos" ? "chaos" : "setup")}
          chaos={menuScreen === "chaos"}
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

      {showNameEditor && (
        <ChroniclerNameModal
          value={nameDraft}
          onChange={setNameDraft}
          onClose={closeNameEditor}
          onSave={savePlayerName}
          closing={nameEditorClosing}
          required={nameRequired}
        />
      )}
      
      {menuScreen !== "setup" && menuScreen !== "chaos" && <div className="main-menu-credits fixed z-[300] text-[10px] font-bold uppercase tracking-wide text-[#66776f]">
        <div className="mb-0.5">Version: {APP_VERSION}</div>
        <a href="https://github.com/Leoocast" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 transition hover:text-[#e6c36f]" data-audio-click="valid">
          <span>{t("common.developedBy")}</span>
          <Github size={11} className="-mt-[1px]" />
          <span>Leoocast</span>
        </a>
      </div>}

      <ToastStack variant="menu" />
    </main>
  );
}

function ChroniclerNameModal({ value, onChange, onClose, onSave, closing, required }: { value: string; onChange: (value: string) => void; onClose: () => void; onSave: () => void; closing: boolean; required: boolean }) {
  const t = useTranslation();
  const inputIdentity = useRef(`chronicle-alias-${crypto.randomUUID()}`);
  const inputId = `${inputIdentity.current}-field`;
  return (
    <div
      className={`chronicler-name-backdrop fixed inset-0 z-[520] flex items-center justify-center p-5 ${closing ? "is-closing" : ""}`}
      role="presentation"
      onPointerDown={(event) => {
        if (!required && event.target === event.currentTarget) onClose();
      }}
    >
      <form className="chronicler-name-modal" autoComplete="off" onSubmit={(event) => { event.preventDefault(); onSave(); }} role="dialog" aria-modal="true" aria-labelledby="chronicler-name-title">
        <span className="chronicler-name-ornament is-top" aria-hidden="true"><i /><b>◆</b><i /></span>
        {!required && <button className="chronicler-name-close" type="button" onClick={onClose} title={t("common.close")}><X size={17} /></button>}
        <p>{t("name.beforeFirstPage")}</p>
        <h2 id="chronicler-name-title">{t("name.claim")}</h2>
        <span className="chronicler-name-flourish" aria-hidden="true">❦</span>
        <label htmlFor={inputId}>{t("name.remembered")}</label>
        <div className="chronicler-name-input-shell">
          <input
            id={inputId}
            name={inputIdentity.current}
            value={value}
            maxLength={24}
            autoComplete="one-time-code"
            aria-autocomplete="none"
            data-form-type="other"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => onChange(event.currentTarget.value)}
            placeholder={t("name.placeholder")}
          />
          <Feather size={21} aria-hidden="true" />
        </div>
        <button className="chronicler-name-save" type="submit">{t("name.save")}</button>
        <span className="chronicler-name-ornament is-bottom" aria-hidden="true"><i /><b>◆</b><i /></span>
      </form>
    </div>
  );
}

function MenuFireflies() {
  return (
    <div className="menu-fireflies" aria-hidden="true">
      {Array.from({ length: 34 }, (_, index) => <span key={index} style={fireflyStyle(index)} />)}
    </div>
  );
}

function fireflyStyle(index: number): React.CSSProperties {
  const random = (salt: number) => {
    const value = Math.sin((index + 1) * (12.9898 + salt * 17.13)) * 43758.5453;
    return value - Math.floor(value);
  };
  const driftX = -45 + random(6) * 90;
  const driftY = -60 + random(7) * 80;
  return {
    "--firefly-left": `${3 + random(1) * 94}%`,
    "--firefly-top": `${5 + random(2) * 88}%`,
    "--firefly-size": `${1.5 + random(3) * 3}px`,
    "--firefly-duration": `${7 + random(4) * 8}s`,
    "--firefly-delay": `${-random(5) * 13}s`,
    "--firefly-mid-x": `${driftX * 0.55}px`,
    "--firefly-mid-y": `${driftY * 0.72}px`,
    "--firefly-drift-x": `${driftX}px`,
    "--firefly-drift-y": `${driftY}px`,
  } as React.CSSProperties;
}

type ExpeditionSetupProps = {
  chaos: boolean;
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
  const t = useTranslation();
  return (
    <section className={`expedition-setup ${props.chaos ? "chaos-setup" : ""} ${props.closing ? "is-closing" : ""}`} aria-label={props.chaos ? t("setup.prepareChaosAria") : t("setup.prepareAria")}>
      {props.chaos && <ChaosSigils />}
      <header className="expedition-header">
        <button className="expedition-back" type="button" onClick={props.onBack}>
          <ArrowLeft size={17} /> {t("common.mainMenu")}
        </button>
        <div>
          {props.chaos && <p className="chaos-header-kicker">{t("setup.chaosKicker")}</p>}
          <h1>{props.chaos ? t("setup.invokeChaos") : t("setup.prepare")}</h1>
        </div>
      </header>

      <div className="expedition-body">
        <div className="expedition-combatants">
          <SetupCombatant
            eyebrow={t("setup.playerSide")}
            side="player"
            deck={props.playerDeck}
            decks={props.playerDecks}
            selectedDeckId={props.selectedPlayerDeckId}
            onSelectDeck={props.onSelectPlayerDeck}
            onInspect={props.onInspectPlayerDeck}
          />

          <div className="expedition-versus" aria-hidden="true"><span /><Swords size={27} /><strong>VS</strong><span /></div>

          <SetupCombatant
            eyebrow={t("setup.hordeSide")}
            side="horde"
            deck={props.hordeDeck}
            decks={props.hordeDecks}
            selectedDeckId={props.selectedHordeDeckId}
            onSelectDeck={props.onSelectHordeDeck}
            onInspect={props.onInspectHordeDeck}
          />
        </div>

        {props.chaos ? (
          <ChaosRules />
        ) : (
          <section className="expedition-difficulty" aria-labelledby="difficulty-heading">
            <div className="expedition-section-heading">
              <div><p>{t("setup.chooseFate")}</p><h2 id="difficulty-heading">{t("setup.difficulty")}</h2></div>
              <HordeAwakening turns={props.selectedMode.setupTurns} />
            </div>
            <div className="expedition-mode-grid">
              {modes.map((item) => (
                <button key={item.id} data-difficulty={item.id} className={`expedition-mode ${item.id === props.mode ? "is-selected" : ""}`} type="button" aria-pressed={item.id === props.mode} onClick={() => props.onModeChange(item.id)} data-audio-click="off">
                  <span className="expedition-mode-glyph">{item.id === "easy" ? <Shield size={20} /> : item.id === "normal" ? <Swords size={20} /> : <Skull size={20} />}</span>
                  <span><strong>{t(item.id === "easy" ? "setup.adventurer" : item.id === "normal" ? "setup.veteran" : "setup.doomed")}</strong></span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className={`expedition-advanced ${props.showAdvanced ? "is-open" : ""}`}>
          <button className="expedition-advanced-toggle" type="button" onClick={props.onToggleAdvanced} aria-expanded={props.showAdvanced}>
            <Settings size={16} /> {t("setup.advanced")} <span>{props.showAdvanced ? t("setup.hide") : t("setup.seedTools")}</span>
          </button>
          {props.showAdvanced && (
            <div className="expedition-advanced-content">
              <div>
                <label htmlFor="expedition-seed">{t("settings.seed")}</label>
                <div className="expedition-seed-field">
                  <input id="expedition-seed" value={props.seed} disabled={props.developerMode} onChange={(event) => props.onSeedChange(event.target.value)} />
                  <button type="button" onClick={props.onCopySeed} title={t("common.copy")}><Copy size={16} /></button>
                  <button type="button" onClick={props.onRegenerateSeed} title={t("common.new")}><RefreshCw size={16} /></button>
                </div>
              </div>
              <div className="expedition-developer-setting">
                <span><strong>{t("settings.developerMode")}</strong><small>{t("setup.developerDescription")}</small></span>
                <button className={`main-settings-toggle ${props.developerMode ? "is-on" : ""}`} type="button" role="switch" aria-checked={props.developerMode} onClick={props.onToggleDeveloperMode}><span /></button>
              </div>
            </div>
          )}
        </section>
      </div>

      <footer className="expedition-footer">
        <button className="expedition-begin" type="button" onClick={props.onStart} disabled={props.launching}>
          <span><small>{props.chaos ? t("setup.shatterRules") : t("setup.beginThe")}</small>{props.chaos ? t("setup.unleashChaos") : t("setup.expedition")}</span>{props.chaos ? <Dices size={29} /> : <Play size={29} />}
        </button>
      </footer>

    </section>
  );
}

function ChaosRules() {
  const t = useTranslation();
  const rules = [
    { value: "2", label: t("chaos.cardsDrawn"), detail: t("chaos.eachTurn") },
    { value: "0", label: t("chaos.preparation"), detail: t("chaos.noWait") },
    { value: "VIII", label: t("chaos.surge"), detail: t("chaos.hordeTurn") },
    { value: "?", label: t("chaos.mutations"), detail: t("chaos.everyCreatureChanges") },
  ];
  return (
    <section className="chaos-rules" aria-labelledby="chaos-rules-heading">
      <div className="expedition-section-heading chaos-rules-heading">
        <div><p>{t("chaos.rulesKicker")}</p><h2 id="chaos-rules-heading">{t("chaos.effects")}</h2></div>
        <div className="chaos-energy-seal"><Sparkles size={16} /><span>{t("chaos.beginWith")}</span><strong>1</strong><span>{t("chaos.energy")}</span></div>
      </div>
      <div className="chaos-rule-grid">
        {rules.map((rule, index) => (
          <article key={rule.label} style={{ "--chaos-index": index } as React.CSSProperties}>
            <span>{rule.value}</span>
            <div><strong>{rule.label}</strong><small>{rule.detail}</small></div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ChaosSigils() {
  return (
    <div className="chaos-sigils" aria-hidden="true">
      <span>◇</span><span>✦</span><span>△</span><span>✧</span><span>◈</span><span>✦</span>
    </div>
  );
}

function HordeAwakening({ turns }: { turns: number }) {
  const t = useTranslation();
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
      <span>{t("setup.awakensAfter")}</span>
      <strong key={`${turns}-${direction}`}>{turns}</strong>
      <span>{t("setup.turns")}</span>
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
  const t = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const keyCard = deck ? findSetupKeyCard(deck) : undefined;
  const details = useDeckCardDetails(deck?.id ?? "missing", keyCard, deck?.images ?? { cards: {} });
  const keyCardName = language === "es" ? keyCard?.displayNameEs || details.displayName || localizedCardName(keyCard, language) : localizedCardName(keyCard, language);
  return (
    <article className={`expedition-combatant ${side === "horde" ? "expedition-combatant-horde" : "expedition-combatant-player"}`}>
      <div className="expedition-combatant-heading"><span>{side === "player" ? <Shield size={14} /> : <Skull size={14} />}{eyebrow}</span><button type="button" onClick={onInspect}><Eye size={14} /> {t("common.inspectDeck")}</button></div>
      <div className="expedition-deck-feature">
        <div className="expedition-deck-art">
          {details.imageUrl ? <img src={details.imageUrl} alt={keyCardName || deck?.label} draggable={false} /> : <span>{side === "player" ? <Shield size={35} /> : <Skull size={35} />}</span>}
        </div>
        <div className="expedition-deck-copy">
          <small>{deck?.deck.deckSize ?? deck?.deck.cards.length ?? 0} {t("common.cards")}</small>
          <h2>{deck?.deck.name ?? t("common.chooseDeck")}</h2>
          <p>{deckDescription(deck?.id, t)}</p>
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

function deckDescription(deckId: string | undefined, t: ReturnType<typeof useTranslation>): string {
  if (deckId === "mono_green_ramp") return t("setup.descriptionRamp");
  if (deckId === "goblin_assault_horde") return t("setup.descriptionGoblins");
  return t("setup.descriptionZombies");
}

function TutorialUnderConstructionModal({ onClose }: { onClose: () => void }) {
  const t = useTranslation();
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
        <button className="tutorial-construction-close" type="button" onClick={() => setClosing(true)} title={t("common.close")}>
          <X size={18} />
        </button>
        <div className="tutorial-construction-icon" aria-hidden="true">
          <Construction size={30} />
        </div>
        <p className="tutorial-construction-kicker">{t("tutorial.lockedKicker")}</p>
        <h2 id="tutorial-construction-title">{t("tutorial.underConstruction")}</h2>
        <div className="tutorial-construction-rule" />
        <p className="tutorial-construction-copy">
          {t("tutorial.copy")}
        </p>
        <button className="tutorial-construction-action" type="button" onClick={() => setClosing(true)}>
          {t("tutorial.return")}
        </button>
      </section>
    </div>
  );
}

function DeveloperWarningModal({ onClose, onEnable }: { onClose: () => void; onEnable: () => void }) {
  const t = useTranslation();
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
        <button className="tutorial-construction-close" type="button" onClick={() => setClosingAction("cancel")} title={t("common.close")}>
          <X size={18} />
        </button>
        <div className="tutorial-construction-icon developer-warning-icon" aria-hidden="true">
          <AlertTriangle size={30} />
        </div>
        <p className="tutorial-construction-kicker">{t("developer.kicker")}</p>
        <h2 id="developer-warning-title">{t("developer.title")}</h2>
        <div className="tutorial-construction-rule" />
        <p className="tutorial-construction-copy">
          {t("developer.copy")}
        </p>
        <div className="developer-warning-actions">
          <button className="tutorial-construction-action is-secondary" type="button" onClick={() => setClosingAction("cancel")}>{t("common.cancel")}</button>
          <button className="tutorial-construction-action" type="button" onClick={() => setClosingAction("enable")}>{t("developer.enable")}</button>
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
  return `hostfall-${Date.now().toString(36)}-${cryptoRandom[0].toString(36)}${cryptoRandom[1].toString(36)}`;
}
