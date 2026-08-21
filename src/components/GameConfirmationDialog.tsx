import type { ReactNode } from "react";

export type GameConfirmationAction = Readonly<{
  label: ReactNode;
  onClick: () => void;
  icon?: ReactNode;
  primary?: boolean;
}>;

type Props = Readonly<{
  titleId: string;
  title: ReactNode;
  body: ReactNode;
  actions: readonly GameConfirmationAction[];
  detail?: ReactNode;
  closing?: boolean;
}>;

/** Shared player-facing confirmation surface used by Board and Settings. */
export function GameConfirmationDialog({
  titleId,
  title,
  body,
  actions,
  detail,
  closing = false,
}: Props) {
  return (
    <section
      className={["hf-ui-panel game-dialog game-home-dialog w-full max-w-md p-6", closing ? "is-closing" : ""].filter(Boolean).join(" ")}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className="hf-ui-title text-xl font-medium uppercase tracking-[0.08em]">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-[#8d9a94]">{body}</p>
      {detail}
      <div className={`mt-5 grid gap-3 ${actions.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {actions.map((action, index) => (
          <button
            key={index}
            className={[
              "game-dialog-action flex h-11 items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.14em]",
              action.primary ? "game-dialog-action-primary" : "",
            ].filter(Boolean).join(" ")}
            type="button"
            onClick={action.onClick}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}
