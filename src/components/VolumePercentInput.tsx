type Props = {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  ariaLabel: string;
};

export function VolumePercentInput({ value, onChange, className = "", ariaLabel }: Props) {
  return (
    <label className={`volume-percent-input ${className}`.trim()}>
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        aria-label={ariaLabel}
        inputMode="numeric"
      />
      <span aria-hidden="true">%</span>
    </label>
  );
}
