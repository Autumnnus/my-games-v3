import { useTranslation } from "react-i18next";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingSpinner({
  size = "md",
  className = "",
}: LoadingSpinnerProps) {
  const { t } = useTranslation();
  const sizeClass = { sm: "w-4 h-4", md: "w-5 h-5", lg: "w-8 h-8" }[size];
  return (
    <svg
      className={`animate-spin ${sizeClass} ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-label={t('common.aria.loading')}
    >
      <circle
        className="opacity-20"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
