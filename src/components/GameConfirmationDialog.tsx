import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

export type GameConfirmationAction = Readonly<{
  label: ReactNode;
  onClick: () => void;
  icon?: ReactNode;
  primary?: boolean;
}>;

type Props = Readonly<{
  titleId: string;
  kicker: ReactNode;
  title: ReactNode;
  body: ReactNode;
  actions: readonly GameConfirmationAction[];
  detail?: ReactNode;
  icon?: ReactNode;
  closing?: boolean;
}>;

/** Shared player-facing confirmation surface used by Board and Settings. */
export function GameConfirmationDialog({
  titleId,
  kicker,
  title,
  body,
  actions,
  detail,
  icon = <AlertTriangle size={20} />,
  closing = false,
}: Props) {
  return (
    <section
      className={["hf-ui-panel game-dialog game-home-dialog w-full max-w-md p-6", closing ? "is-closing" : ""].filter(Boolean).join(" ")}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="flex items-start gap-3">
        <div className="game-dialog-icon flex h-10 w-10 shrink-0 items-center justify-center">{icon}</div>
        <div>
          <div className="game-dialog-kicker">{kicker}</div>
          <h2 id={titleId} className="hf-ui-title mt-1 text-xl font-medium uppercase tracking-[0.08em]">{title}</h2>
          <p className="mt-2 text-sm text-[#8d9a94]">{body}</p>
          {detail}
        </div>
      </div>
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
