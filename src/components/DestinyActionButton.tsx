import { forwardRef, type ButtonHTMLAttributes } from "react";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & Readonly<{
  label: string;
}>;

/** Ornamented Destiny action first established by the Learn to Play outcome. */
export const DestinyActionButton = forwardRef<HTMLButtonElement, Props>(function DestinyActionButton(
  { className, label, type = "button", ...buttonProps },
  ref,
) {
  return (
    <button
      {...buttonProps}
      ref={ref}
      className={["destiny-command-button", "learn-to-play-contemplate-button", className].filter(Boolean).join(" ")}
      type={type}
    >
      <span className="destiny-command-copy">
        <strong>{label}</strong>
      </span>
      <span className="destiny-command-shimmer" aria-hidden="true" />
    </button>
  );
});
