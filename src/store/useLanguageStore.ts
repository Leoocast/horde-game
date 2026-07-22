import { create } from "zustand";
import type { AppLanguage } from "../i18n/translations";

export const LANGUAGE_STORAGE_KEY = "horde-game-language";

type LanguageStore = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
};

const initialLanguage = readInitialLanguage();
applyDocumentLanguage(initialLanguage);

export const useLanguageStore = create<LanguageStore>((set) => ({
  language: initialLanguage,
  setLanguage: (language) => {
    if (typeof window !== "undefined") window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    applyDocumentLanguage(language);
    set({ language });
  },
}));

function readInitialLanguage(): AppLanguage {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === "en" || stored === "es") return stored;
  return window.navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

function applyDocumentLanguage(language: AppLanguage): void {
  if (typeof document !== "undefined") document.documentElement.lang = language;
}
