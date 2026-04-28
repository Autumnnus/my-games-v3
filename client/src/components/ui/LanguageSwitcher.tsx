import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
] as const;

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  function handleChange(code: string) {
    i18n.changeLanguage(code);
  }

  const currentLang = LANGUAGES.find((l) => l.code === i18n.resolvedLanguage) ?? LANGUAGES[0];

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
        {t('settings.language')}
      </span>
      <div className="flex items-center gap-1">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => handleChange(lang.code)}
            className={`px-2 py-1 rounded-lg text-xs transition-colors ${
              currentLang.code === lang.code
                ? 'bg-white/10'
                : 'hover:bg-white/5'
            }`}
            style={{
              color:
                currentLang.code === lang.code
                  ? 'var(--theme-text-primary)'
                  : 'var(--theme-text-muted)',
            }}
            aria-label={lang.label}
          >
            {lang.flag} {lang.code.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
