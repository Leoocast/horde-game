import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useToastStore, type ToastTone } from "../store/useToastStore";

const toneStyles: Record<ToastTone, { icon: typeof Info; className: string }> = {
  info: {
    icon: Info,
    className: "toast-tone-info",
  },
  warning: {
    icon: AlertTriangle,
    className: "toast-tone-warning",
  },
  success: {
    icon: CheckCircle2,
    className: "toast-tone-success",
  },
  danger: {
    icon: XCircle,
    className: "toast-tone-danger",
  },
  horde: {
    icon: AlertTriangle,
    className: "toast-tone-horde",
  },
};

export function ToastStack({ variant = "game" }: { variant?: "game" | "menu" }) {
  const toasts = useToastStore((state) => state.toasts);
  const dismissToast = useToastStore((state) => state.dismissToast);
  const stackClassName = variant === "menu" ? "toast-stack-menu" : "toast-stack-game";

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={`toast-stack ${stackClassName}`}>
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const tone = toneStyles[toast.tone];
          const Icon = tone.icon;
          return (
            <motion.button
              key={toast.id}
              layout
              initial={variant === "menu" ? { opacity: 0, x: 46, y: 30, scale: 0.96 } : { opacity: 0, y: 34, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
              exit={variant === "menu" ? { opacity: 0, x: 28, y: 18, scale: 0.97 } : { opacity: 0, y: 18, scale: 0.96 }}
              transition={{ duration: 0.16, ease: "easeOut", layout: { type: "spring", stiffness: 520, damping: 38 } }}
              className={`game-toast ${tone.className}`}
              onClick={() => dismissToast(toast.id)}
            >
              <span className="game-toast-icon"><Icon size={19} /></span>
              <span className="game-toast-copy">
                <span className="game-toast-title">{toast.title}</span>
                {toast.message && <span className="game-toast-message">{toast.message}</span>}
              </span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
