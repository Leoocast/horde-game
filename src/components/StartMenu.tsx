import { AlertTriangle, ArrowLeft, AudioLines, BookOpen, ChevronLeft, ChevronRight, Construction, Copy, Dices, Eye, Feather, Github, PanelsTopLeft, Play, RefreshCw, RotateCcw, ScanSearch, Settings, Shield, Skull, Sparkles, Swords, Trash2, X } from "lucide-react";
import { AnimatePresence, motion, useIsPresent } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { contentCatalog } from "../content/bootstrap";
import {
  createCanonMatchOrigin,
  createOpaqueMatchOrigin,
  generateCanonSeedEntropy,
  importCanonMatchOrigin,
  matchOriginVisualSeed,
  type MatchOrigin,
} from "../content/MatchOrigin";
import { findDeckKeyCard, type InspectableDeck } from "../data/deckCatalog";
import type { DifficultyMode } from "../engine/GameTypes";
import { localizedCardName } from "../i18n/cardLocalization";
import { useTranslation } from "../i18n/useTranslation";
import { openExternalLink, writeClipboardText } from "../platform/desktopBridge";
import { useAudioStore } from "../store/useAudioStore";
import { useLanguageStore } from "../store/useLanguageStore";
import { useToastStore } from "../store/useToastStore";
import { useDeckCardDetails } from "../utils/deckCardImages";
import { futureCodeFromSeed } from "../utils/futureIdentity";
import { clearAppAssetCache, completeOnboarding, persistDeveloperMode, readStoredDeveloperMode, readStoredPlayerName, resetOnboarding } from "../utils/appPersistence";
import { APP_VERSION } from "../version";
import { AudioControls } from "./AudioControls";
import { DeckKeyCard, DecksView } from "./DecksView";
import { DisplayControls } from "./DisplayControls";
import { LanguageSelector } from "./LanguageSelector";
import { SeedsOfDestinyScreen } from "./SeedsOfDestinyScreen";
import { TemporalBackdrop } from "./TemporalBackdrop";
import { ToastStack } from "./ToastStack";
import type { HowToPlayCatalogEntry } from "../guidance/howToPlayCatalog";

export type HowToPlayMenuEntry = HowToPlayCatalogEntry & Readonly<{
  onLaunch?: () => void;
}>;

type Props = {
  decks: InspectableDeck[];
  selectedDeckId: string;
  onSelectDeck: (deckId: string) => void;
  onOpenDeck: (deckId: string) => void;
  onViewDeck: (returnScreen?: "setup" | "chaos") => void;
  hostDecks: InspectableDeck[];
  selectedHostDeckId: string;
  onSelectHostDeck: (deckId: string) => void;
  onViewHostDeck: (returnScreen?: "setup" | "chaos") => void;
  initialScreen?: MenuScreen;
  preserveMusicOnMount?: boolean;
  requestInitialName?: boolean;
  onNameSaved?: (name: string) => void;
  onRestartFirstTime?: () => void;
  /** Only provided in development builds; the menu entry does not exist without it. */
  onOpenPlayground?: () => void;
  /** Only provided in development builds; edits the checked-in per-file audio mix. */
  onOpenAudioLab?: () => void;
  /** Only provided in development builds; searches deterministic Canon futures. */
  onOpenSeedExplorer?: () => void;
  /** Only provided in development builds; inventories the real player-facing runtime UI. */
  onOpenUiReference?: () => void;
  howToPlayEntries: readonly HowToPlayMenuEntry[];
  resumeEnabled?: boolean;
  resumeStatus?: "none" | "available" | "recovered" | "corrupt";
  onContinue?: () => void;
  continueDisabled?: boolean;
  onDiscardResume?: () => void;
  onStart: (options: { playerName: string; origin: MatchOrigin }) => void;
};

type MenuScreen = "home" | "setup" | "chaos" | "chronicles" | "hosts" | "seeds" | "howToPlay" | "settings";
type ClosingMenuScreen = Extract<MenuScreen, "chronicles" | "hosts" | "seeds" | "howToPlay" | "settings">;

const modes: Array<{ id: DifficultyMode; setupTurns: number }> = [
  { id: "easy", setupTurns: 4 },
  { id: "normal", setupTurns: 3 },
  { id: "hard", setupTurns: 2 },
];

export function StartMenu({ decks, selectedDeckId, onSelectDeck, onOpenDeck, onViewDeck, hostDecks, selectedHostDeckId, onSelectHostDeck, onViewHostDeck, initialScreen = "home", preserveMusicOnMount = false, requestInitialName = false, onNameSaved, onRestartFirstTime, onOpenPlayground, onOpenAudioLab, onOpenSeedExplorer, onOpenUiReference, howToPlayEntries, resumeEnabled = false, resumeStatus = "none", onContinue, continueDisabled = false, onDiscardResume, onStart }: Props) {
  const t = useTranslation();
  const [playerName, setPlayerName] = useState(() => readStoredPlayerName());
  const [mode, setMode] = useState<DifficultyMode>("easy");
  const [seedKind, setSeedKind] = useState<"canon" | "opaque">("canon");
  const [canonEntropy, setCanonEntropy] = useState(() => generateCanonSeedEntropy());
  const [canonDraft, setCanonDraft] = useState("");
  const [canonImportError, setCanonImportError] = useState<string>();
  const [opaqueSeed, setOpaqueSeed] = useState(() => generateRandomSeed());
  const [developerMode, setDeveloperMode] = useState(() => readStoredDeveloperMode());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [setupClosing, setSetupClosing] = useState(false);
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
  /* Pantallas que sustituyen al menú entero en vez de abrirse a su derecha. */
  const fullScreenMenu = menuScreen === "setup" || menuScreen === "chaos" || menuScreen === "seeds";
  const playableDecks = decks.filter((deck) => deck.presentation.playable !== false);
  const selectedDeck = playableDecks.find((deck) => deck.id === selectedDeckId) ?? playableDecks[0];
  const selectedHostDeck = hostDecks.find((deck) => deck.id === selectedHostDeckId) ?? hostDecks[0];
  const canonOrigin = useMemo(() => createCanonMatchOrigin({
    entropy: canonEntropy,
    playerDeckKey: contentCatalog.requireDeck(selectedDeckId, "player").qualifiedDeckKey,
    hostDeckKey: contentCatalog.requireDeck(selectedHostDeckId, "host").qualifiedDeckKey,
    difficulty: mode,
  }), [canonEntropy, mode, selectedDeckId, selectedHostDeckId]);
  const activeOrigin = useMemo<MatchOrigin>(() => {
    if (!developerMode && menuScreen !== "chaos" && seedKind === "canon") return canonOrigin;
    return createOpaqueMatchOrigin({
      rngSeed: developerMode ? "developer" : opaqueSeed,
      playerDeckKey: contentCatalog.requireDeck(selectedDeckId, "player").qualifiedDeckKey,
      hostDeckKey: contentCatalog.requireDeck(selectedHostDeckId, "host").qualifiedDeckKey,
      difficulty: menuScreen === "chaos" ? "normal" : mode,
      preparationTurns: menuScreen === "chaos" ? 0 : selectedMode.setupTurns,
      gameMode: menuScreen === "chaos" ? "chaos" : "standard",
    });
  }, [canonOrigin, developerMode, menuScreen, mode, opaqueSeed, seedKind, selectedDeckId, selectedHostDeckId, selectedMode.setupTurns]);
  const preserveMusicOnInitialMount = useRef(preserveMusicOnMount);

  useEffect(() => {
    if (!preserveMusicOnInitialMount.current) startMenuMusic();
  }, [startMenuMusic]);

  useEffect(() => {
    if (!setupClosing) return;
    // Must outlast the reverse stagger: last piece leaves at 330ms, backdrop fades until 340ms.
    const timeout = window.setTimeout(() => {
      setMenuScreen("home");
      setSetupClosing(false);
    }, 345);
    return () => window.clearTimeout(timeout);
  }, [setupClosing]);

  useEffect(() => {
    if (!closingMenuScreen) return;
    // El Archivo se retira por partes como la Expedición, así que necesita el
    // mismo margen: la última pieza sale a 340ms y el fondo la acompaña.
    const duration = closingMenuScreen === "seeds" ? 345 : 210;
    const timeout = window.setTimeout(() => {
      setMenuScreen("home");
      setClosingMenuScreen(undefined);
    }, duration);
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
      if (showDeveloperWarning) return;
      if (menuScreen === "home") return;
      // The setup screen owns Escape itself: an open deck drawer has to swallow it before we leave.
      if (menuScreen === "setup" || menuScreen === "chaos") return;
      event.preventDefault();
      closeMenuPanel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuScreen, nameEditorClosing, nameRequired, showDeveloperWarning, showNameEditor]);

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
    playSfx("playLand");
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
    if (menuScreen === "chronicles" || menuScreen === "hosts" || menuScreen === "seeds" || menuScreen === "howToPlay" || menuScreen === "settings") setClosingMenuScreen(menuScreen);
  }

  async function copyCanonIdentity() {
    if (activeOrigin.seedKind !== "canon") return;
    try {
      await writeClipboardText(activeOrigin.canonCode);
      pushToast({ title: t("destiny.identityCopied"), message: activeOrigin.canonCode, tone: "success" });
    } catch {
      pushToast({ title: t("destiny.identityCopyFailed"), message: activeOrigin.canonCode, tone: "warning" });
    }
  }

  async function copyInternalSeed() {
    if (!developerMode) return;
    try {
      await writeClipboardText(activeOrigin.rngSeed);
      pushToast({ title: t("setup.internalSeedCopied"), message: activeOrigin.rngSeed, tone: "success" });
    } catch {
      pushToast({ title: t("setup.internalSeedCopyFailed"), message: activeOrigin.rngSeed, tone: "warning" });
    }
  }

  function useCanonSeed() {
    try {
      const imported = importCanonMatchOrigin(canonDraft);
      if (!playableDecks.some((deck) => deck.id === imported.playerDeckId)) throw new Error("Chronicle unavailable");
      if (!hostDecks.some((deck) => deck.id === imported.hostDeckId)) throw new Error("Host unavailable");
      onSelectDeck(imported.playerDeckId);
      onSelectHostDeck(imported.hostDeckId);
      setMode(imported.difficulty);
      setCanonEntropy(imported.rngSeed);
      setSeedKind("canon");
      setCanonDraft(imported.canonCode);
      setCanonImportError(undefined);
      if (developerMode) updateDeveloperMode(false);
      pushToast({ title: t("setup.canonApplied"), message: imported.canonCode, tone: "success" });
    } catch {
      setCanonImportError(t("setup.canonInvalid"));
    }
  }

  function startGame() {
    if (launching) return;
    persistDeveloperMode(developerMode);
    setLaunching(true);
    const origin = activeOrigin.seedKind === "opaque" && !activeOrigin.rngSeed.trim()
      ? createOpaqueMatchOrigin({
        ...activeOrigin,
        rngSeed: generateRandomSeed(),
      })
      : activeOrigin;
    onStart({
      playerName: playerName.trim() || "Chronicler",
      origin,
    });
  }

  function changeDifficulty(nextMode: DifficultyMode) {
    if (nextMode === mode) return;
    const rate = nextMode === "easy" ? 1.08 : nextMode === "hard" ? 0.9 : 1;
    playSfx("playLand", { rate });
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
    <main className={`main-menu-shell h-screen overflow-hidden text-[#f6e6b8] ${menuScreen === "setup" || menuScreen === "chaos" ? "expedition-active" : ""} ${menuScreen === "seeds" ? "menu-fullscreen-active" : ""} ${menuScreen === "chaos" ? "chaos-active" : ""}`}>
      <TemporalBackdrop />
      {!fullScreenMenu ? (
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
            <h1 className="main-menu-title hostfall-wordmark">HOstfAll</h1>
            <div className="main-menu-subtitle"><span /> {t("menu.act")}</div>
          </div>

          <nav className="main-menu-nav" aria-label={t("menu.mainAria")}>
            {resumeEnabled && (resumeStatus === "available" || resumeStatus === "recovered") && (
              <button
                className={`main-menu-entry group ${continueDisabled || !onContinue ? "is-disabled" : ""}`}
                type="button"
                onClick={continueDisabled ? undefined : onContinue}
                disabled={continueDisabled || !onContinue}
                title={continueDisabled ? t("menu.continueUnavailable") : undefined}
              >
                <span className="main-menu-entry-mark" />
                <span>{resumeStatus === "recovered" ? t("menu.continueRecovered") : t("menu.continue")}</span>
              </button>
            )}
            {resumeEnabled && resumeStatus === "corrupt" && onDiscardResume && (
              <button className="main-menu-entry group" type="button" onClick={onDiscardResume} title={t("menu.corruptSaveDescription")}>
                <span className="main-menu-entry-mark" />
                <span>{t("menu.discardCorruptSave")}</span>
              </button>
            )}
            <button className="main-menu-entry group" type="button" onClick={() => setMenuScreen("setup")}>
              <span className="main-menu-entry-mark" />
              <span>{t("menu.play")}</span>
            </button>
            <button className={`main-menu-entry group ${menuScreen === "chronicles" ? "is-active" : ""}`} type="button" onClick={() => { setClosingMenuScreen(undefined); setMenuScreen("chronicles"); }}>
              <span className="main-menu-entry-mark" />
              <span>{t("menu.chronicles")}</span>
            </button>
            <button className={`main-menu-entry group ${menuScreen === "hosts" ? "is-active" : ""}`} type="button" onClick={() => { setClosingMenuScreen(undefined); setMenuScreen("hosts"); }}>
              <span className="main-menu-entry-mark" />
              <span>{t("menu.hosts")}</span>
            </button>
            <button className="main-menu-entry group" type="button" onClick={() => { setClosingMenuScreen(undefined); setMenuScreen("seeds"); }}>
              <span className="main-menu-entry-mark" />
              <span>{t("menu.seedsOfDestiny")}</span>
            </button>
            <button className={`main-menu-entry group ${menuScreen === "howToPlay" ? "is-active" : ""}`} type="button" onClick={() => { setClosingMenuScreen(undefined); setMenuScreen("howToPlay"); }}>
              <span className="main-menu-entry-mark" />
              <span>{t("menu.howToPlay")}</span>
            </button>
            <button className={`main-menu-entry group ${menuScreen === "settings" ? "is-active" : ""}`} type="button" onClick={() => { setClosingMenuScreen(undefined); setMenuScreen("settings"); }}>
              <span className="main-menu-entry-mark" />
              <span>{t("menu.settings")}</span>
            </button>
          </nav>

        </div>
        {import.meta.env.DEV && menuScreen === "home" && (onOpenPlayground || onOpenAudioLab || onOpenSeedExplorer || onOpenUiReference) && (
          <aside className="main-menu-developer-tools" aria-label="Developer tools">
            <span className="main-menu-developer-label">Dev tools</span>
            <div className="main-menu-developer-actions">
              {onOpenPlayground && (
                <button className="main-menu-developer-tool" type="button" onClick={onOpenPlayground} title="Developer playground">
                  <Construction size={15} aria-hidden="true" />
                  <span>Playground</span>
                </button>
              )}
              {onOpenAudioLab && (
                <button className="main-menu-developer-tool" type="button" onClick={onOpenAudioLab} title="Audio mix authoring tool">
                  <AudioLines size={15} aria-hidden="true" />
                  <span>Audio Lab</span>
                </button>
              )}
              {onOpenSeedExplorer && (
                <button className="main-menu-developer-tool" type="button" onClick={onOpenSeedExplorer} title="Canon Seed Explorer">
                  <ScanSearch size={15} aria-hidden="true" />
                  <span>Seed Explorer</span>
                </button>
              )}
              {onOpenUiReference && (
                <button className="main-menu-developer-tool" type="button" onClick={onOpenUiReference} title="Player UI reference">
                  <PanelsTopLeft size={15} aria-hidden="true" />
                  <span>UI Reference</span>
                </button>
              )}
            </div>
          </aside>
        )}
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
              <DisplayControls variant="screen" />

              <section className="main-settings-section">
                <div className="main-settings-section-title">{t("settings.game")}</div>
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
        {menuScreen === "howToPlay" && (
          <section className={`main-settings-screen how-to-play-screen ${closingMenuScreen === "howToPlay" ? "is-closing" : ""}`} aria-label={t("menu.howToPlay")}>
            <header className="main-settings-header">
              <button className="menu-screen-back" type="button" onClick={closeMenuPanel}><ArrowLeft size={16} /> {t("common.back")}</button>
              <h2>{t("menu.howToPlay")}</h2>
              <span>{t("howToPlay.description")}</span>
            </header>

            <div className="main-settings-content old-scrollbar">
              <section className="main-settings-section how-to-play-lessons">
                <div className="main-settings-section-title">{t("howToPlay.tutorials")}</div>
                {howToPlayEntries.map((entry) => {
                  const Icon = entry.icon === "learn" ? Sparkles : BookOpen;
                  return (
                    <button
                      key={entry.id}
                      className="how-to-play-lesson"
                      type="button"
                      disabled={!entry.onLaunch}
                      onClick={entry.onLaunch}
                    >
                      <span className="how-to-play-lesson-icon" aria-hidden="true"><Icon size={25} /></span>
                      <span className="how-to-play-lesson-copy">
                        <small>{t(entry.kickerKey)}</small>
                        <strong>{t(entry.titleKey)}</strong>
                        <span>{t(entry.descriptionKey)}</span>
                      </span>
                      <span className={`how-to-play-lesson-status ${entry.onLaunch ? "is-ready" : ""}`}>
                        {t(entry.onLaunch ? "howToPlay.start" : "howToPlay.comingSoon")}
                      </span>
                    </button>
                  );
                })}
              </section>
            </div>
          </section>
        )}
        {menuScreen === "chronicles" && (
          <DecksView collection="chronicles" decks={decks} onOpenDeck={onOpenDeck} onBack={closeMenuPanel} closing={closingMenuScreen === "chronicles"} />
        )}
        {menuScreen === "hosts" && (
          <DecksView collection="hosts" decks={hostDecks} onOpenDeck={onOpenDeck} onBack={closeMenuPanel} closing={closingMenuScreen === "hosts"} />
        )}
        </div>
      ) : menuScreen === "seeds" ? (
        /* Maqueta dentro del juego: monta el Archivo sobre datos falsos y no persiste nada. */
        <SeedsOfDestinyScreen decks={decks} hostDecks={hostDecks} onBack={closeMenuPanel} closing={closingMenuScreen === "seeds"} />
      ) : (
        <ExpeditionSetup
          playerDeck={selectedDeck}
          playerDecks={playableDecks}
          selectedPlayerDeckId={selectedDeckId}
          onSelectPlayerDeck={onSelectDeck}
          onInspectPlayerDeck={() => onViewDeck(menuScreen === "chaos" ? "chaos" : "setup")}
          hostDeck={selectedHostDeck}
          hostDecks={hostDecks}
          selectedHostDeckId={selectedHostDeckId}
          onSelectHostDeck={onSelectHostDeck}
          onInspectHostDeck={() => onViewHostDeck(menuScreen === "chaos" ? "chaos" : "setup")}
          chaos={menuScreen === "chaos"}
          mode={mode}
          onModeChange={changeDifficulty}
          selectedMode={selectedMode}
          showAdvanced={showAdvanced}
          onToggleAdvanced={() => setShowAdvanced((value) => !value)}
          origin={activeOrigin}
          seedKind={seedKind}
          canonDraft={canonDraft}
          canonImportError={canonImportError}
          developerMode={developerMode}
          onSeedKindChange={setSeedKind}
          onCanonDraftChange={(value) => { setCanonDraft(value); setCanonImportError(undefined); }}
          onUseCanonSeed={useCanonSeed}
          onCopyCanonIdentity={copyCanonIdentity}
          onRegenerateCanon={() => setCanonEntropy(generateCanonSeedEntropy())}
          onOpaqueSeedChange={setOpaqueSeed}
          onRegenerateOpaqueSeed={() => setOpaqueSeed(generateRandomSeed())}
          onCopyInternalSeed={copyInternalSeed}
          onToggleDeveloperMode={toggleDeveloperMode}
          onBack={() => setSetupClosing(true)}
          onStart={startGame}
          launching={launching}
          closing={setupClosing}
          overlayOpen={showDeveloperWarning || showNameEditor}
        />
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
      
      {!fullScreenMenu && <div className="main-menu-credits fixed z-[300] text-[10px] font-bold uppercase tracking-wide text-[#66776f]">
        <div className="mb-0.5">Version: {APP_VERSION}</div>
        <button type="button" onClick={() => void openExternalLink("credits")} className="flex items-center gap-1.5 transition hover:text-[#e6c36f]" data-audio-click="valid">
          <span>{t("common.developedBy")}</span>
          <Github size={11} className="-mt-[1px]" />
          <span>Leoocast</span>
        </button>
      </div>}

      <ToastStack variant="menu" />
    </main>
  );
}

export function ChroniclerNameModal({ value, onChange, onClose, onSave, closing, required }: { value: string; onChange: (value: string) => void; onClose: () => void; onSave: () => void; closing: boolean; required: boolean }) {
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


/** Ambient motes that rise inside the setup screen; the menu fireflies stay behind its blur. */
function SetupEmbers() {
  return (
    <div className="expedition-embers" aria-hidden="true">
      {Array.from({ length: 20 }, (_, index) => <span key={index} style={emberStyle(index)} />)}
    </div>
  );
}

function emberStyle(index: number): React.CSSProperties {
  const random = (salt: number) => {
    const value = Math.sin((index + 1) * (9.317 + salt * 23.71)) * 24634.6345;
    return value - Math.floor(value);
  };
  return {
    "--ember-left": `${2 + random(1) * 96}%`,
    "--ember-size": `${1.2 + random(2) * 2.3}px`,
    "--ember-duration": `${12 + random(3) * 11}s`,
    "--ember-delay": `${-random(4) * 22}s`,
    "--ember-drift": `${-40 + random(5) * 80}px`,
    "--ember-rise": `${-58 - random(6) * 30}vh`,
    "--ember-peak": `${0.22 + random(7) * 0.38}`,
  } as React.CSSProperties;
}

type ExpeditionSetupProps = {
  chaos: boolean;
  playerDeck?: InspectableDeck;
  playerDecks: InspectableDeck[];
  selectedPlayerDeckId: string;
  onSelectPlayerDeck: (deckId: string) => void;
  onInspectPlayerDeck: () => void;
  hostDeck?: InspectableDeck;
  hostDecks: InspectableDeck[];
  selectedHostDeckId: string;
  onSelectHostDeck: (deckId: string) => void;
  onInspectHostDeck: () => void;
  mode: DifficultyMode;
  onModeChange: (mode: DifficultyMode) => void;
  selectedMode: (typeof modes)[number];
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  origin: MatchOrigin;
  seedKind: "canon" | "opaque";
  canonDraft: string;
  canonImportError?: string;
  developerMode: boolean;
  onSeedKindChange: (kind: "canon" | "opaque") => void;
  onCanonDraftChange: (seed: string) => void;
  onUseCanonSeed: () => void;
  onCopyCanonIdentity: () => void;
  onRegenerateCanon: () => void;
  onOpaqueSeedChange: (seed: string) => void;
  onRegenerateOpaqueSeed: () => void;
  onCopyInternalSeed: () => void;
  onToggleDeveloperMode: () => void;
  onBack: () => void;
  onStart: () => void;
  launching: boolean;
  closing: boolean;
  /** A modal is stacked above the screen, so it owns Escape instead. */
  overlayOpen: boolean;
};

function ExpeditionSetup(props: ExpeditionSetupProps) {
  const t = useTranslation();
  const [openDeckSide, setOpenDeckSide] = useState<"player" | "host" | null>(null);
  const futureCode = futureCodeFromSeed(matchOriginVisualSeed(props.origin));

  const closeDeckDrawer = () => {
    const closingSide = openDeckSide;
    setOpenDeckSide(null);
    if (closingSide) {
      window.requestAnimationFrame(() => document.getElementById(`expedition-${closingSide}-change-deck`)?.focus());
    }
  };

  // Escape peels one layer at a time: the deck drawer first, only then the screen itself.
  useEffect(() => {
    if (props.overlayOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (openDeckSide) closeDeckDrawer();
      else props.onBack();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [openDeckSide, props.overlayOpen, props.onBack]);

  return (
    <section className={`expedition-setup ${props.chaos ? "chaos-setup" : ""} ${props.closing ? "is-closing" : ""}`} aria-label={props.chaos ? t("setup.prepareChaosAria") : t("setup.prepareAria")}>
      {props.chaos && <ChaosSigils />}
      <SetupEmbers />
      <header className="expedition-header" inert={openDeckSide !== null}>
        <button className="expedition-back" type="button" onClick={props.onBack}>
          <ArrowLeft size={17} /> {t("common.mainMenu")}
        </button>
        <div>
          {props.chaos && <p className="chaos-header-kicker">{t("setup.chaosKicker")}</p>}
          <h1>{props.chaos ? t("setup.invokeChaos") : t("setup.prepare")}</h1>
          {!props.chaos && props.origin.seedKind === "canon" && (
            <p className="expedition-future-identity"><Sparkles size={13} aria-hidden="true" /> {t("destiny.future", { code: futureCode })}</p>
          )}
        </div>
      </header>

      <div className="expedition-body" inert={openDeckSide !== null}>
        <div className="expedition-combatants">
          <SetupCombatant
            eyebrow={t("setup.playerSide")}
            side="player"
            deck={props.playerDeck}
            onInspect={props.onInspectPlayerDeck}
            drawerOpen={openDeckSide === "player"}
            onChangeDeck={() => setOpenDeckSide("player")}
          />

          <div className="expedition-versus" aria-hidden="true"><span /><Swords size={27} /><strong>VS</strong><span /></div>

          <SetupCombatant
            eyebrow={t("setup.hostSide")}
            side="host"
            deck={props.hostDeck}
            onInspect={props.onInspectHostDeck}
            drawerOpen={openDeckSide === "host"}
            onChangeDeck={() => setOpenDeckSide("host")}
            accessory={props.chaos ? undefined : <HostAwakening turns={props.selectedMode.setupTurns} />}
          />
        </div>

        {props.chaos ? (
          <ChaosRules />
        ) : (
          <section className="expedition-difficulty" aria-labelledby="difficulty-heading">
            <div className="expedition-section-heading">
              <div><p>{t("setup.chooseFate")}</p><h2 id="difficulty-heading">{t("setup.difficulty")}</h2></div>
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
              {!props.chaos && !props.developerMode && (
                <div className="expedition-seed-kind">
                  <div className="expedition-seed-kind-actions">
                    <button className={`main-settings-action ${props.seedKind === "canon" ? "is-active" : ""}`} type="button" onClick={() => props.onSeedKindChange("canon")}>{t("setup.canonSeed")}</button>
                    <button className={`main-settings-action ${props.seedKind === "opaque" ? "is-active" : ""}`} type="button" onClick={() => props.onSeedKindChange("opaque")}>{t("setup.freeSeed")}</button>
                  </div>
                </div>
              )}
              {!props.chaos && !props.developerMode && props.seedKind === "canon" && props.origin.seedKind === "canon" && (
                <div>
                  <label htmlFor="expedition-canon-seed">{t("setup.canonSeed")}</label>
                  <div className="expedition-seed-field">
                    <input id="expedition-canon-seed" value={props.origin.canonCode} readOnly />
                    <button type="button" onClick={props.onCopyCanonIdentity} title={t("destiny.copyIdentity")}><Copy size={16} /></button>
                    <button type="button" onClick={props.onRegenerateCanon} title={t("common.new")}><RefreshCw size={16} /></button>
                  </div>
                  <label className="mt-3" htmlFor="expedition-canon-import">{t("setup.importCanon")}</label>
                  <div className="expedition-seed-field is-import">
                    <input id="expedition-canon-import" value={props.canonDraft} placeholder="HF1-ELA-GRV-XX1-XXX" onChange={(event) => props.onCanonDraftChange(event.target.value)} />
                    <button type="button" onClick={props.onUseCanonSeed}>{t("setup.useCanon")}</button>
                  </div>
                  {props.canonImportError && <p className="expedition-seed-error" role="alert">{props.canonImportError}</p>}
                </div>
              )}
              {(props.chaos || (!props.developerMode && props.seedKind === "opaque")) && (
                <div>
                  <label htmlFor="expedition-free-seed">{t("setup.freeSeed")}</label>
                  <div className="expedition-seed-field is-single-action">
                    <input id="expedition-free-seed" value={props.origin.rngSeed} onChange={(event) => props.onOpaqueSeedChange(event.target.value)} />
                    <button type="button" onClick={props.onRegenerateOpaqueSeed} title={t("common.new")}><RefreshCw size={16} /></button>
                  </div>
                  <p className="expedition-seed-note">{t("setup.freeSeedDescription")}</p>
                </div>
              )}
              {props.developerMode && (
                <div>
                  <label>{t("setup.internalSeed")}</label>
                  <div className="expedition-seed-field is-single-action">
                    <input value={props.origin.rngSeed} readOnly />
                    <button type="button" onClick={props.onCopyInternalSeed} title={t("setup.copyInternalSeed")}><Copy size={16} /></button>
                  </div>
                </div>
              )}
              <div className="expedition-developer-setting">
                <span><strong>{t("settings.developerMode")}</strong><small>{t("setup.developerDescription")}</small></span>
                <button className={`main-settings-toggle ${props.developerMode ? "is-on" : ""}`} type="button" role="switch" aria-checked={props.developerMode} onClick={props.onToggleDeveloperMode}><span /></button>
              </div>
            </div>
          )}
        </section>
      </div>

      <footer className="expedition-footer" inert={openDeckSide !== null}>
        <div className="expedition-footer-summary">
          <span>{t("setup.playerSide")}</span>
          <strong>{props.playerDeck?.deck.name ?? "—"}</strong>
          <i aria-hidden="true">◆</i>
          <span>{t("setup.hostSide")}</span>
          <strong>{props.hostDeck?.deck.name ?? "—"}</strong>
          {!props.chaos && (
            <>
              <i aria-hidden="true">◆</i>
              <span>{t("setup.difficulty")}</span>
              <strong>{t(props.mode === "easy" ? "setup.adventurer" : props.mode === "normal" ? "setup.veteran" : "setup.doomed")}</strong>
            </>
          )}
        </div>
        <button className="expedition-begin" type="button" onClick={props.onStart} disabled={props.launching}>
          <span>{props.chaos ? t("setup.unleashChaos") : t("setup.beginChronicle")}</span>
          {props.chaos ? <Dices size={22} /> : <Play size={22} />}
        </button>
      </footer>

      <AnimatePresence>
        {openDeckSide && (
          <motion.div key={openDeckSide} className="expedition-deck-drawer-layer" initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0.999 }} transition={{ duration: 0.4 }}>
            <motion.button
              className="expedition-deck-drawer-scrim"
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={closeDeckDrawer}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
            />
            <SetupDeckDrawer
              side={openDeckSide}
              eyebrow={t(openDeckSide === "player" ? "setup.playerSide" : "setup.hostSide")}
              decks={openDeckSide === "player" ? props.playerDecks : props.hostDecks}
              selectedDeckId={openDeckSide === "player" ? props.selectedPlayerDeckId : props.selectedHostDeckId}
              onSelectDeck={openDeckSide === "player" ? props.onSelectPlayerDeck : props.onSelectHostDeck}
              onClose={closeDeckDrawer}
            />
          </motion.div>
        )}
      </AnimatePresence>

    </section>
  );
}

function ChaosRules() {
  const t = useTranslation();
  const rules = [
    { value: "2", label: t("chaos.cardsDrawn"), detail: t("chaos.eachTurn") },
    { value: "0", label: t("chaos.preparation"), detail: t("chaos.noWait") },
    { value: "VIII", label: t("chaos.surge"), detail: t("chaos.hostTurn") },
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

function HostAwakening({ turns }: { turns: number }) {
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

function SetupCombatant({ eyebrow, side, deck, onInspect, drawerOpen, onChangeDeck, accessory }: {
  eyebrow: string;
  side: "player" | "host";
  deck?: InspectableDeck;
  onInspect: () => void;
  drawerOpen: boolean;
  onChangeDeck: () => void;
  /** Rendered as a strip at the foot of the panel; the Host uses it for its awakening clock. */
  accessory?: React.ReactNode;
}) {
  const t = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const keyCard = deck ? findDeckKeyCard(deck) : undefined;
  const details = useDeckCardDetails(keyCard, deck?.images ?? { cards: {} });
  const keyCardName = localizedCardName(keyCard, language);
  const deckTheme = deck?.presentation.theme ?? "ramp";
  return (
    <article
      data-audio-click="valid"
      className={`expedition-combatant expedition-combatant-${side} deck-theme-${deckTheme}`}
      // Anywhere on the panel opens the drawer; the heading's own buttons keep their meaning.
      onClick={(event) => {
        if (!(event.target instanceof Element) || event.target.closest("button")) return;
        onChangeDeck();
      }}
    >
      <div className="expedition-combatant-heading">
        <span>{side === "player" ? <Shield size={14} /> : <Skull size={14} />}{eyebrow}</span>
        <div className="expedition-combatant-actions">
          <button type="button" onClick={onInspect}><Eye size={14} /> {t("common.inspectDeck")}</button>
          <button id={`expedition-${side}-change-deck`} className={drawerOpen ? "is-active" : ""} type="button" onClick={onChangeDeck} aria-expanded={drawerOpen} aria-controls={`expedition-${side}-deck-drawer`}>
            {side === "player" ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}{t("common.change")}
          </button>
        </div>
      </div>
      <div className="expedition-deck-feature">
        <div className="expedition-deck-art" key={`setup-art-${deck?.id ?? "empty"}`}>
          {details.imageUrl ? <img src={details.imageUrl} alt={keyCardName || deck?.label} draggable={false} /> : <span>{side === "player" ? <Shield size={35} /> : <Skull size={35} />}</span>}
        </div>
        <div className="expedition-deck-copy">
          <small>{deck?.deck.deckSize ?? deck?.deck.cards.length ?? 0} {t("common.cards")}</small>
          <div className="expedition-deck-current" key={`setup-copy-${deck?.id ?? "empty"}`} aria-live="polite">
            <h2>{deck?.deck.name ?? t("common.chooseDeck")}</h2>
            <p>{deck ? t(deck.presentation.descriptionKey) : ""}</p>
          </div>
        </div>
      </div>
      {accessory}
    </article>
  );
}

export function SetupDeckDrawer({ side, eyebrow, decks, selectedDeckId, onSelectDeck, onClose }: {
  side: "player" | "host";
  eyebrow: string;
  decks: InspectableDeck[];
  selectedDeckId: string;
  onSelectDeck: (deckId: string) => void;
  onClose: () => void;
}) {
  const t = useTranslation();
  const isPresent = useIsPresent();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = `expedition-${side}-deck-drawer-title`;
  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId) ?? decks[0];
  const deckTheme = selectedDeck?.presentation.theme ?? "ramp";

  useEffect(() => {
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus({ preventScroll: true }), 460);
    return () => window.clearTimeout(focusTimer);
  }, []);

  return (
    <aside
      id={`expedition-${side}-deck-drawer`}
      className={`expedition-deck-drawer expedition-deck-drawer-${side} deck-theme-${deckTheme} ${isPresent ? "is-entering" : "is-leaving"}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={side === "player" ? { left: 0, right: "auto" } : { left: "auto", right: 0 }}
    >
      <header>
        <div><small>{eyebrow}</small><h2 id={titleId}>{t(side === "player" ? "menu.chronicles" : "menu.hosts")}</h2></div>
        <button ref={closeButtonRef} type="button" aria-label={t("common.close")} onClick={onClose}><X size={20} /></button>
      </header>
      <div className="expedition-deck-drawer-cards" role="group" aria-label={`${eyebrow}: ${t("common.chooseDeck")}`}>
        {decks.map((item) => (
          <DeckKeyCard
            key={item.id}
            deck={item}
            selected={item.id === selectedDeckId}
            actionLabel={`${t("common.chooseDeck")}: ${item.deck.name}`}
            onOpen={() => {
              onSelectDeck(item.id);
              onClose();
            }}
          />
        ))}
      </div>
    </aside>
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
      className={`notice-modal-backdrop ${isClosing ? "is-closing" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setClosingAction("cancel");
      }}
    >
      <section className="notice-modal developer-warning-modal" role="dialog" aria-modal="true" aria-labelledby="developer-warning-title">
        <button className="notice-modal-close" type="button" onClick={() => setClosingAction("cancel")} title={t("common.close")}>
          <X size={18} />
        </button>
        <div className="notice-modal-icon developer-warning-icon" aria-hidden="true">
          <AlertTriangle size={30} />
        </div>
        <p className="notice-modal-kicker">{t("developer.kicker")}</p>
        <h2 id="developer-warning-title">{t("developer.title")}</h2>
        <div className="notice-modal-rule" />
        <p className="notice-modal-copy">
          {t("developer.copy")}
        </p>
        <div className="developer-warning-actions">
          <button className="notice-modal-action is-secondary" type="button" onClick={() => setClosingAction("cancel")}>{t("common.cancel")}</button>
          <button className="notice-modal-action" type="button" onClick={() => setClosingAction("enable")}>{t("developer.enable")}</button>
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
