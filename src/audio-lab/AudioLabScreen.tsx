import {
  ArrowLeft,
  Download,
  FileJson,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Search,
  Square,
  Upload,
  Volume2,
  Waves,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import "./AudioLabScreen.css";
import { audioEngine } from "../audio/AudioEngine";
import {
  MAX_AUDIO_TRIM_DB,
  MIN_AUDIO_TRIM_DB,
  clampAudioTrimDb,
  cloneAudioMix,
  dbToGain,
  dbToTrimPositionPercent,
  parseAudioMix,
  projectAudioMix,
  serializeAudioMix,
  type AudioMixConfig,
} from "../audio/audioMix";
import {
  musicCollectionIds,
  musicCollections,
  type MusicCollectionId,
  type MusicVariant,
} from "../audio/musicManifest";
import {
  sfxGroups,
  sfxManifest,
  sfxMetadata,
  type SfxGroupId,
  type SfxId,
} from "../audio/soundManifest";
import { useAudioStore } from "../store/useAudioStore";

type AudioLabTab = "sfx" | "music";
type Notice = { tone: "ok" | "warning"; message: string };
type MusicRow = {
  key: string;
  collectionId: MusicCollectionId;
  variant: MusicVariant | "both";
  label: string;
  url: string;
};

const sfxIds = Object.keys(sfxManifest) as SfxId[];
const PROJECT_JSON = serializeAudioMix(projectAudioMix);

const musicRows: MusicRow[] = musicCollectionIds.reduce<MusicRow[]>((rows, collectionId) => {
  const collection = musicCollections[collectionId];
  if (collection.battle === collection.climax) {
    rows.push({
      key: `${collectionId}:track`,
      collectionId,
      variant: "both",
      label: collection.label,
      url: collection.battle,
    });
    return rows;
  }
  for (const variant of ["battle", "climax"] as MusicVariant[]) {
    rows.push({
      key: `${collectionId}:${variant}`,
      collectionId,
      variant,
      label: collection.label,
      url: collection[variant],
    });
  }
  return rows;
}, []);

type AudioLabScreenProps = {
  onReturnToMenu: () => void;
};

export function AudioLabScreen({ onReturnToMenu }: AudioLabScreenProps) {
  const [tab, setTab] = useState<AudioLabTab>("sfx");
  const [draft, setDraft] = useState<AudioMixConfig>(() => cloneAudioMix(projectAudioMix));
  const [search, setSearch] = useState("");
  const [activeSfxId, setActiveSfxId] = useState<SfxId>();
  const [activeMusicKey, setActiveMusicKey] = useState<string>();
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const importRef = useRef<HTMLInputElement>(null);
  const sequenceRef = useRef(0);
  const sequenceTimersRef = useRef<number[]>([]);
  const originalSettingsRef = useRef<{
    enabled: boolean;
    sfxVolume: number;
    musicEnabled: boolean;
    musicVolume: number;
  } | undefined>(undefined);

  const dirty = serializeAudioMix(draft) !== PROJECT_JSON;
  const normalizedSearch = search.trim().toLowerCase();

  const visibleSfxByGroup = useMemo(() => {
    const result = new Map<SfxGroupId, SfxId[]>();
    for (const group of sfxGroups) result.set(group.id, []);
    for (const id of sfxIds) {
      const metadata = sfxMetadata[id];
      const haystack = `${id} ${metadata.label} ${fileName(sfxManifest[id])}`.toLowerCase();
      if (normalizedSearch && !haystack.includes(normalizedSearch)) continue;
      result.get(metadata.group)?.push(id);
    }
    return result;
  }, [normalizedSearch]);

  const visibleMusicRows = useMemo(() => musicRows.filter((row) => {
    const collection = musicCollections[row.collectionId];
    const haystack = `${row.collectionId} ${row.label} ${row.variant} ${collection.category} ${fileName(row.url)}`.toLowerCase();
    return !normalizedSearch || haystack.includes(normalizedSearch);
  }), [normalizedSearch]);

  const visibleSfxCount = useMemo(() => (
    Array.from(visibleSfxByGroup.values()).reduce((total, ids) => total + ids.length, 0)
  ), [visibleSfxByGroup]);
  const visibleCount = tab === "sfx" ? visibleSfxCount : visibleMusicRows.length;
  const totalCount = tab === "sfx" ? sfxIds.length : musicRows.length;

  useEffect(() => {
    const audio = useAudioStore.getState();
    originalSettingsRef.current = {
      enabled: audio.enabled,
      sfxVolume: audio.sfxVolume,
      musicEnabled: audio.musicEnabled,
      musicVolume: audio.musicVolume,
    };
    audioEngine.stopAllSfx();
    audioEngine.stopMusic();
    // Fixed reference masters keep every authoring session comparable. They are not exported.
    audioEngine.configure({ enabled: true, sfxVolume: 1, musicEnabled: true, musicVolume: 0.6 });

    return () => {
      cancelSfxSequence();
      audioEngine.stopAllSfx();
      audioEngine.stopMusic();
      audioEngine.resetMix();
      if (originalSettingsRef.current) audioEngine.configure(originalSettingsRef.current);
    };
  }, []);

  useEffect(() => {
    audioEngine.setMix(draft);
  }, [draft]);

  function cancelSfxSequence() {
    sequenceRef.current += 1;
    for (const timer of sequenceTimersRef.current) window.clearTimeout(timer);
    sequenceTimersRef.current = [];
    audioEngine.stopAllSfx();
    setActiveSfxId(undefined);
  }

  function playOneSfx(id: SfxId) {
    cancelSfxSequence();
    setActiveSfxId(id);
    const instance = audioEngine.playSfx(id);
    instance?.addEventListener("ended", () => setActiveSfxId((current) => current === id ? undefined : current), { once: true });
  }

  function playSfxSequence(ids: SfxId[]) {
    cancelSfxSequence();
    if (ids.length === 0) return;
    const sequence = sequenceRef.current;

    const playAt = (index: number) => {
      if (sequenceRef.current !== sequence) return;
      const id = ids[index];
      if (!id) {
        setActiveSfxId(undefined);
        return;
      }
      setActiveSfxId(id);
      const instance = audioEngine.playSfx(id);
      if (!instance) return;
      let advanced = false;
      const advance = () => {
        if (advanced || sequenceRef.current !== sequence) return;
        advanced = true;
        playAt(index + 1);
      };
      instance.addEventListener("ended", advance, { once: true });
      instance.addEventListener("error", advance, { once: true });
      const fallbackMs = Number.isFinite(instance.duration) && instance.duration > 0
        ? Math.ceil((instance.duration + 0.25) * 1000)
        : 5000;
      sequenceTimersRef.current.push(window.setTimeout(advance, fallbackMs));
    };

    playAt(0);
  }

  function setSfxTrim(id: SfxId, value: number) {
    const trimDb = clampAudioTrimDb(value);
    setDraft((current) => ({ ...current, sfx: { ...current.sfx, [id]: trimDb } }));
  }

  function setMusicTrim(row: MusicRow, value: number) {
    const trimDb = clampAudioTrimDb(value);
    setDraft((current) => {
      const collection = { ...current.music[row.collectionId] };
      if (row.variant === "both") {
        collection.battle = trimDb;
        collection.climax = trimDb;
      } else {
        collection[row.variant] = trimDb;
      }
      return { ...current, music: { ...current.music, [row.collectionId]: collection } };
    });
  }

  function playMusic(row: MusicRow) {
    const variant = row.variant === "both" ? "battle" : row.variant;
    audioEngine.playCollection(row.collectionId, variant);
    setActiveMusicKey(row.key);
    setMusicPlaying(true);
  }

  function toggleMusic() {
    if (!activeMusicKey) {
      const first = visibleMusicRows[0] ?? musicRows[0];
      if (first) playMusic(first);
      return;
    }
    if (musicPlaying) {
      audioEngine.pauseMusic();
      setMusicPlaying(false);
    } else {
      audioEngine.resumeMusic();
      setMusicPlaying(true);
    }
  }

  function stopAllAudio() {
    cancelSfxSequence();
    audioEngine.stopMusic();
    setActiveMusicKey(undefined);
    setMusicPlaying(false);
  }

  function restoreProjectMix() {
    setDraft(cloneAudioMix(projectAudioMix));
    setNotice({ tone: "ok", message: "Restored the audioMix.json currently included in the project." });
  }

  function exportMix() {
    const url = URL.createObjectURL(new Blob([serializeAudioMix(draft)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "audioMix.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice({ tone: "ok", message: "Exported audioMix.json. Replace src/audio/audioMix.json and reload the game." });
  }

  function importMix(file: File) {
    void file.text().then((contents) => {
      const parsed = parseAudioMix(contents);
      if (!parsed.config) {
        setNotice({ tone: "warning", message: parsed.problems.join(" ") });
        return;
      }
      setDraft(parsed.config);
      setNotice(parsed.problems.length > 0
        ? { tone: "warning", message: `Imported with corrections: ${parsed.problems.join(" ")}` }
        : { tone: "ok", message: `Imported ${file.name}.` });
    });
  }

  return (
    <main className="audio-lab-shell" data-audio-click="off">
      <header className="audio-lab-topbar">
        <button className="audio-lab-button audio-lab-back" type="button" onClick={onReturnToMenu}>
          <ArrowLeft size={16} />
          <span>Volver</span>
        </button>

        <div className="audio-lab-brand">
          <span className="audio-lab-brand-mark" aria-hidden="true"><Waves size={18} /></span>
          <h1>Audio Lab <span>/ Mezcla y balance</span></h1>
        </div>

        <div className="audio-lab-top-actions">
          <button className={`audio-lab-button ${musicPlaying ? "is-active" : ""}`} type="button" onClick={toggleMusic} title={musicPlaying ? "Pause reference music" : "Play reference music"}>
            {musicPlaying ? <Pause size={15} /> : <Play size={15} />}
            <span>{musicPlaying ? "Pause music" : "Play music"}</span>
          </button>
          <button className="audio-lab-button" type="button" onClick={stopAllAudio}><Square size={14} /><span>Stop all</span></button>
        </div>
      </header>

      <div className="audio-lab-workbench">
        <aside className="audio-lab-sidebar">
          <section className="audio-lab-sidebar-section">
            <div className="audio-lab-section-kicker">Mix file</div>
            <div className="audio-lab-file-card">
              <FileJson size={24} />
              <div>
                <strong>audioMix.json</strong>
                <span>src/audio/audioMix.json</span>
              </div>
              <span className={`audio-lab-dirty ${dirty ? "is-dirty" : ""}`}>{dirty ? "Edited" : "Project"}</span>
            </div>
            <p>Export this file, replace the project JSON, then reload. The game reads these values directly.</p>
          </section>

          <section className="audio-lab-sidebar-section">
            <div className="audio-lab-section-kicker">File actions</div>
            <div className="audio-lab-sidebar-actions">
              <button type="button" onClick={() => importRef.current?.click()}><Upload size={15} /> Import JSON</button>
              <button className="is-primary" type="button" onClick={exportMix}><Download size={15} /> Export JSON</button>
              <button type="button" disabled={!dirty} onClick={restoreProjectMix}><RotateCcw size={15} /> Restore project</button>
            </div>
            <input
              ref={importRef}
              hidden
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) importMix(file);
                event.target.value = "";
              }}
            />
          </section>

          <section className="audio-lab-sidebar-section">
            <div className="audio-lab-section-kicker">Reference balance</div>
            <dl className="audio-lab-reference">
              <div><dt>SFX master</dt><dd>100%</dd></div>
              <div><dt>Music master</dt><dd>60%</dd></div>
              <div><dt>Trim range</dt><dd>−30 to 0 dB</dd></div>
            </dl>
            <p>The reference masters are fixed for consistent comparisons and are never exported.</p>
          </section>
        </aside>

        <section className="audio-lab-main">
          <div className="audio-lab-controls">
            <div className="audio-lab-view-summary">
              <span>{tab === "sfx" ? "Sound effects" : "Music library"}</span>
              <strong>{visibleCount} of {totalCount}</strong>
            </div>
            <nav className="audio-lab-tabs" aria-label="Audio categories">
              <button className={tab === "sfx" ? "is-active" : ""} type="button" onClick={() => setTab("sfx")}>
                <Volume2 size={16} /> SFX <span>{sfxIds.length}</span>
              </button>
              <button className={tab === "music" ? "is-active" : ""} type="button" onClick={() => setTab("music")}>
                <Music2 size={16} /> Music <span>{musicRows.length}</span>
              </button>
            </nav>
            <label className="audio-lab-search">
              <Search size={15} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${tab === "sfx" ? "sounds" : "music"}`} />
              {search && <button type="button" onClick={() => setSearch("")}>Clear</button>}
            </label>
          </div>

          {notice && (
            <div className={`audio-lab-notice is-${notice.tone}`}>
              <span>{notice.message}</span>
              <button type="button" onClick={() => setNotice(undefined)}>Dismiss</button>
            </div>
          )}

          <div className="audio-lab-scroll old-scrollbar">
            {tab === "sfx" ? (
              <div className="audio-lab-groups">
                {visibleSfxCount === 0 && <AudioLabEmptyState query={search} />}
                {sfxGroups.map((group) => {
                  const visibleIds = visibleSfxByGroup.get(group.id) ?? [];
                  if (visibleIds.length === 0) return null;
                  const allGroupIds = sfxIds.filter((id) => sfxMetadata[id].group === group.id);
                  return (
                    <section className="audio-lab-group" key={group.id}>
                      <header>
                        <div>
                          <h2>{group.label}</h2>
                          <span>{allGroupIds.length} sounds</span>
                        </div>
                        <button type="button" onClick={() => playSfxSequence(allGroupIds)}><Play size={13} /> Play group</button>
                      </header>
                      <div className="audio-lab-list">
                        {visibleIds.map((id) => (
                          <AudioTrimRow
                            key={id}
                            active={activeSfxId === id}
                            id={id}
                            label={sfxMetadata[id].label}
                            file={fileName(sfxManifest[id])}
                            trimDb={draft.sfx[id]}
                            onPlay={() => playOneSfx(id)}
                            onChange={(value) => setSfxTrim(id, value)}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="audio-lab-list audio-lab-music-list">
                {visibleMusicRows.length === 0 && <AudioLabEmptyState query={search} />}
                {visibleMusicRows.map((row) => {
                  const trimDb = row.variant === "both"
                    ? draft.music[row.collectionId].battle
                    : draft.music[row.collectionId][row.variant];
                  const collection = musicCollections[row.collectionId];
                  const variantLabel = row.variant === "both" ? "Track" : row.variant;
                  return (
                    <AudioTrimRow
                      key={row.key}
                      active={activeMusicKey === row.key && musicPlaying}
                      id={row.collectionId}
                      label={`${row.label} · ${variantLabel}`}
                      file={fileName(row.url)}
                      meta={collection.category}
                      trimDb={trimDb}
                      onPlay={() => playMusic(row)}
                      onChange={(value) => setMusicTrim(row, value)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function AudioTrimRow({ active, id, label, file, meta, trimDb, onPlay, onChange }: {
  active: boolean;
  id: string;
  label: string;
  file: string;
  meta?: string;
  trimDb: number;
  onPlay: () => void;
  onChange: (value: number) => void;
}) {
  const percent = Math.round(dbToGain(trimDb) * 100);
  const sliderPositionPercent = dbToTrimPositionPercent(trimDb);
  return (
    <article className={`audio-lab-row ${active ? "is-playing" : ""}`}>
      <button className="audio-lab-play" type="button" onClick={onPlay} title={`Play ${label}`}>
        {active ? <Waves size={17} /> : <Play size={16} />}
      </button>
      <div className="audio-lab-row-identity">
        <strong>{label}</strong>
        <span>{file}</span>
        <code>{id}</code>
      </div>
      {meta && <span className="audio-lab-row-meta">{meta}</span>}
      <div className="audio-lab-trim">
        <input
          type="range"
          min={MIN_AUDIO_TRIM_DB}
          max={MAX_AUDIO_TRIM_DB}
          step={0.5}
          value={trimDb}
          style={{ "--audio-lab-position": `${sliderPositionPercent}%` } as CSSProperties}
          aria-label={`${label} trim in decibels`}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <DbNumberInput label={label} value={trimDb} onChange={onChange} />
        <span className="audio-lab-percent">{percent}%</span>
        <button type="button" disabled={trimDb === 0} onClick={() => onChange(0)} title="Reset to 0 dB"><RotateCcw size={13} /></button>
      </div>
    </article>
  );
}

function AudioLabEmptyState({ query }: { query: string }) {
  return (
    <div className="audio-lab-empty">
      <Search size={24} />
      <strong>No audio matches “{query}”</strong>
      <span>Try a file name, label, category, or internal id.</span>
    </div>
  );
}

function DbNumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value));

  useEffect(() => setText(String(value)), [value]);

  function commit() {
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      setText(String(value));
      return;
    }
    const next = clampAudioTrimDb(parsed);
    setText(String(next));
    onChange(next);
  }

  return (
    <label>
      <input
        type="number"
        min={MIN_AUDIO_TRIM_DB}
        max={MAX_AUDIO_TRIM_DB}
        step={0.5}
        value={text}
        aria-label={`${label} numeric trim in decibels`}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setText(String(value));
            event.preventDefault();
          }
        }}
      />
      <span>dB</span>
    </label>
  );
}

function fileName(url: string) {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? url);
  } catch {
    return url;
  }
}
