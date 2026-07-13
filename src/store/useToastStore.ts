import { create } from "zustand";

export type ToastTone = "info" | "warning" | "success" | "danger" | "horde";

export type ToastMessage = {
  id: string;
  title: string;
  message?: string;
  tone: ToastTone;
};

type ToastStore = {
  toasts: ToastMessage[];
  pushToast: (toast: Omit<ToastMessage, "id">) => void;
  dismissToast: (id: string) => void;
};

const TOAST_DURATION_MS = 2800;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  pushToast: (toast) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }].slice(-4) }));
    window.setTimeout(() => get().dismissToast(id), TOAST_DURATION_MS);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
