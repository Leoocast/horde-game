import { Languages } from "lucide-react";
import { useTranslation } from "../i18n/useTranslation";
import { useLanguageStore } from "../store/useLanguageStore";

type Props = {
  variant?: "screen" | "panel";
};

export function LanguageSelector({ variant = "screen" }: Props) {
  const t = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const options = [
    { id: "en" as const, label: t("language.english") },
    { id: "es" as const, label: t("language.spanish") },
  ];

  const buttons = (
    <div className="language-selector" role="radiogroup" aria-label={t("language.title")}>
      {options.map((option) => (
        <button
          key={option.id}
          className={`language-selector-option ${language === option.id ? "is-selected" : ""}`}
          type="button"
          role="radio"
          aria-checked={language === option.id}
          onClick={() => setLanguage(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  if (variant === "panel") {
    return (
      <section className="old-panel-soft p-4">
        <div className="game-settings-section-title flex items-center gap-2"><Languages size={15} /> {t("language.title")}</div>
        <p className="mt-2 text-xs leading-relaxed text-[#8d9a94]">{t("language.description")}</p>
        <div className="mt-3">{buttons}</div>
      </section>
    );
  }

  return (
    <section className="main-settings-section main-settings-language-section">
      <div className="main-settings-section-title">{t("language.title")}</div>
      <div className="main-settings-row">
        <div>
          <div className="main-settings-label flex items-center gap-2"><Languages size={18} /> {t("language.title")}</div>
          <div className="main-settings-description">{t("language.description")}</div>
        </div>
        {buttons}
      </div>
    </section>
  );
}
