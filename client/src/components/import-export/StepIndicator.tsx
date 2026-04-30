import { Check } from "lucide-react";

interface StepIndicatorProps {
  steps: string[];
  currentStep: number; // 1-indexed
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-0 mb-6">
      {steps.map((step, idx) => {
        const stepNum = idx + 1;
        const isCompleted = stepNum < currentStep;
        const isCurrent = stepNum === currentStep;
        const isFuture = stepNum > currentStep;

        return (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200"
                style={{
                  background: isCompleted
                    ? "rgba(34,197,94,0.2)"
                    : isCurrent
                      ? "var(--theme-accent-soft)"
                      : "var(--theme-glass-border)",
                  border: isCompleted
                    ? "1.5px solid rgba(34,197,94,0.5)"
                    : isCurrent
                      ? "1.5px solid var(--theme-accent)"
                      : "1.5px solid var(--theme-glass-border)",
                  color: isCompleted
                    ? "rgba(34,197,94,0.9)"
                    : isCurrent
                      ? "rgba(168,85,247,1)"
                      : "var(--theme-text-muted)",
                }}
              >
                {isCompleted ? <Check size={14} strokeWidth={2.5} /> : stepNum}
              </div>
              <span
                className="text-[10px] font-medium whitespace-nowrap"
                style={{
                  color: isCurrent
                    ? "var(--theme-accent)"
                    : isCompleted
                      ? "rgba(34,197,94,0.7)"
                      : "var(--theme-text-muted)",
                }}
              >
                {step}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className="w-8 sm:w-12 h-px mx-1 mb-4"
                style={{
                  background: isCompleted
                    ? "rgba(34,197,94,0.4)"
                    : "var(--theme-glass-border)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
