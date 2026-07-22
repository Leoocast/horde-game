import { useCallback } from "react";
import { useLanguageStore } from "../store/useLanguageStore";
import { translate, type TranslationKey } from "./translations";

type TranslationParams = Record<string, string | number>;

export function useTranslation() {
  const language = useLanguageStore((state) => state.language);
  return useCallback((key: TranslationKey, params?: TranslationParams) => translate(language, key, params), [language]);
}
