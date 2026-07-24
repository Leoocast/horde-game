import { Download, FolderOpen, Save, Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import type { StoredScenario } from "../scenarioStorage";

type Props = {
  entries: StoredScenario[];
  onSave: () => void;
  onLoad: (entry: StoredScenario) => void;
  onDelete: (id: string) => void;
  onExport: (entry: StoredScenario) => void;
  onImport: (file: File) => void;
};

export function LibraryPanel({ entries, onSave, onLoad, onDelete, onExport, onImport }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="playground-group">
      <header className="playground-group-head">
        <span className="playground-group-title">Saved scenarios</span>
        <span className="playground-group-badge">{entries.length} stored</span>
      </header>
      <div className="playground-button-row">
        <button className="playground-button" type="button" onClick={onSave}>
          <Save size={13} /> Save
        </button>
        <button className="playground-button" type="button" onClick={() => fileInput.current?.click()}>
          <Upload size={13} /> Import
        </button>
      </div>
      <input
        ref={fileInput}
        className="playground-file-input"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImport(file);
          // Reset so importing the same file twice still fires a change event.
          event.target.value = "";
        }}
      />

      {entries.length === 0 ? (
        <p className="playground-note">No saved scenarios. Save stores the current draft and its recorded steps together.</p>
      ) : (
        <ul className="playground-library-list">
          {entries.map((entry) => (
            <li key={entry.id} className="playground-library-entry">
              <div className="playground-library-info">
                <strong>{entry.name}</strong>
                <span>
                  {new Date(entry.savedAt).toLocaleString()} · {entry.steps.length} step{entry.steps.length === 1 ? "" : "s"}
                </span>
              </div>
              <button className="playground-icon-button" type="button" title="Load" onClick={() => onLoad(entry)}>
                <FolderOpen size={13} />
              </button>
              <button className="playground-icon-button" type="button" title="Export as JSON" onClick={() => onExport(entry)}>
                <Download size={13} />
              </button>
              <button className="playground-icon-button" type="button" title="Delete" onClick={() => onDelete(entry.id)}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
