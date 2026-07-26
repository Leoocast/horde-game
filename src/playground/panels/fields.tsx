import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="playground-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <ClearableInput ariaLabel={label} value={value} onChange={onChange} />
    </Field>
  );
}

export function ClearableInput({
  value,
  ariaLabel,
  placeholder,
  className,
  type = "text",
  clearTitle = "Clear field",
  onChange,
}: {
  value: string;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  type?: "text" | "search";
  clearTitle?: string;
  onChange: (value: string) => void;
}) {
  const empty = value.length === 0;
  return (
    <div className="playground-clearable-input">
      <input
        className={className}
        type={type}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        className="playground-input-clear"
        type="button"
        aria-label={`${clearTitle}: ${ariaLabel}`}
        aria-hidden={empty}
        tabIndex={empty ? -1 : 0}
        title={clearTitle}
        onClick={() => onChange("")}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

export function SearchInput({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <ClearableInput
      className="playground-search"
      type="search"
      ariaLabel={placeholder}
      placeholder={placeholder}
      value={value}
      clearTitle="Clear search"
      onChange={onChange}
    />
  );
}

/**
 * Clamping on every keystroke made the field impossible to edit: deleting the last digit left an
 * empty string, which was immediately rewritten as `min`, so backspace never got you to a clean
 * field. The typed text is kept as-is while the field has focus and only committed — clamped — when
 * it parses. Leaving it empty falls back to `min` on blur.
 */
export function NumberField({
  label,
  value,
  min = 0,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));

  // Follow the outside world when it changes the value behind our back (loading a scenario, a
  // clamp applied elsewhere) — but not while the user is mid-edit on this very field.
  useEffect(() => {
    setText((current) => (Number(current) === value ? current : String(value)));
  }, [value]);

  const clamp = (raw: number) => Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, raw));

  return (
    <Field label={label}>
      <input
        type="number"
        min={min}
        max={max}
        value={text}
        onChange={(event) => {
          const raw = event.target.value;
          setText(raw);
          if (raw.trim() === "") return;
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) onChange(clamp(parsed));
        }}
        onBlur={() => {
          const parsed = Number(text);
          const settled = text.trim() === "" || !Number.isFinite(parsed) ? min : clamp(parsed);
          setText(String(settled));
          onChange(settled);
        }}
      />
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
