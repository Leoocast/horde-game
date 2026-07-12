import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useToastStore, type ToastTone } from "../store/useToastStore";

const toneStyles: Record<ToastTone, { icon: typeof Info; className: string }> = {
  info: {
    icon: Info,
    className: "border-[#8db9ff]/70 bg-[#182842]/95 text-[#d9e8ff]",
  },
  warning: {
    icon: AlertTriangle,
    className: "border-[#e5b45c]/80 bg-[#3b2712]/95 text-[#ffe0a0]",
  },
  success: {
    icon: CheckCircle2,
    className: "border-[#9fda72]/75 bg-[#1b3416]/95 text-[#e5ffd6]",
  },
  danger: {
    icon: XCircle,
    className: "border-[#e06b52]/80 bg-[#3b1612]/95 text-[#ffd7cb]",
  },
};

export function ToastStack() {
  const toasts = useToastStore((state) => state.toasts);
  const dismissToast = useToastStore((state) => state.dismissToast);

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[160] flex w-[min(360px,calc(100vw-32px))] flex-col items-end gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const tone = toneStyles[toast.tone];
          const Icon = tone.icon;
          return (
            <motion.button
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 34, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.96 }}
              transition={{ duration: 0.22, ease: "easeOut", layout: { type: "spring", stiffness: 520, damping: 38 } }}
              className={`pointer-events-auto old-toast flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left shadow-2xl ${tone.className}`}
              onClick={() => dismissToast(toast.id)}
            >
              <Icon className="mt-0.5 shrink-0" size={18} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black uppercase tracking-wide">{toast.title}</span>
                {toast.message && <span className="mt-0.5 block text-xs leading-snug opacity-85">{toast.message}</span>}
              </span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
