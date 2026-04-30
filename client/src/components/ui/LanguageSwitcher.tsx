import { cn } from "@/lib/cn";
import { useTranslation } from "react-i18next";

const LANGUAGES = [
  { code: "tr", label: "Türkçe", flag: "🇹🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
] as const;

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const currentLang =
    LANGUAGES.find((l) => l.code === i18n.resolvedLanguage) ?? LANGUAGES[0];

  return (
    <div className="flex items-center gap-1 px-3 py-1.5">
      <span className="text-xs text-text-muted">
        {t("translation:settings.language")}
      </span>
      <div className="flex items-center gap-1 ml-auto">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => i18n.changeLanguage(lang.code)}
            className={cn(
              "px-2 py-1 rounded-lg text-xs transition-colors",
              currentLang.code === lang.code
                ? "bg-glass-surface-hover text-text-primary"
                : "text-text-muted hover:bg-glass-surface hover:text-text-secondary",
            )}
            aria-label={lang.label}
          >
            {lang.flag} {lang.code.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
