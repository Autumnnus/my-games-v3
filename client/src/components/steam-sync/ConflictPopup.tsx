import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { GlassButton } from "@/components/ui/GlassButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { formatPlayTime } from "@/lib/formatters";
import type { Conflict, Resolution } from "@/api/steamSync";

interface ConflictPopupProps {
  conflicts: Conflict[];
  onResolve: (conflictId: string, resolution: Resolution) => Promise<void>;
  onDismiss: () => void;
  loading?: boolean;
}

function ConflictCard({
  conflict,
  onResolve,
  loading,
}: {
  conflict: Conflict;
  onResolve: (resolution: Resolution) => void;
  loading?: boolean;
}) {
  const diff = conflict.steamValue - conflict.manualValue;
  const diffSign = diff >= 0 ? "+" : "";

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: "var(--theme-surface-subtle)",
        border: "1px solid var(--theme-glass-border)",
      }}
    >
      {/* Game info */}
      <div className="flex items-center gap-3">
        {conflict.gameCoverUrl && (
          <img
            src={conflict.gameCoverUrl}
            alt={conflict.gameName}
            className="w-10 h-10 rounded-lg object-cover"
          />
        )}
        <p
          className="text-sm font-medium"
          style={{ color: "var(--theme-text-primary)" }}
        >
          🎮 {conflict.gameName}
        </p>
      </div>

      {/* Values */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
            Sen
          </span>
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--theme-text-secondary)" }}
          >
            {formatPlayTime(conflict.manualValue)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
            Steam
          </span>
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--theme-text-secondary)" }}
          >
            {formatPlayTime(conflict.steamValue)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
            Fark
          </span>
          <span
            className="text-sm font-semibold"
            style={{
              color:
                diff >= 0 ? "rgba(74,222,128,0.9)" : "rgba(252,129,129,0.9)",
            }}
          >
            {diffSign}
            {formatPlayTime(Math.abs(diff))}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <GlassButton
          size="sm"
          variant="primary"
          disabled={loading}
          onClick={() => onResolve("take_steam")}
        >
          Steam'i Al
        </GlassButton>
        <GlassButton
          size="sm"
          disabled={loading}
          onClick={() => onResolve("keep_manual")}
        >
          Benimki Kalsın
        </GlassButton>
        <GlassButton
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={() => onResolve("ignore")}
        >
          Yoksay
        </GlassButton>
      </div>
    </div>
  );
}

export function ConflictPopup({
  conflicts,
  onResolve,
  onDismiss,
  loading = false,
}: ConflictPopupProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="glass-card w-full max-w-lg p-6 flex flex-col gap-5"
          style={{ maxHeight: "calc(100dvh - 48px)", overflow: "hidden" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-400" />
              <h2
                className="text-base font-semibold"
                style={{ color: "var(--theme-text-primary)" }}
              >
                Steam Senkronizasyon Çakışmaları Tespit Edildi
              </h2>
            </div>
            <button
              onClick={onDismiss}
              className="shrink-0 p-1.5 rounded-lg transition-colors"
              style={{ color: "var(--theme-text-muted)" }}
              aria-label="Kapat"
            >
              <X size={16} />
            </button>
          </div>

          <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>
            Steam oynama süresi, manuel girdiğiniz değerlerden farklı. Her biri
            için nasıl çözmek istediğini seç.
          </p>

          {/* Conflict list */}
          <div className="flex flex-col gap-3 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : (
              conflicts.map((conflict) => (
                <ConflictCard
                  key={conflict.id}
                  conflict={conflict}
                  onResolve={(resolution) => onResolve(conflict.id, resolution)}
                  loading={loading}
                />
              ))
            )}
          </div>

          {/* Dismiss */}
          <div className="flex justify-end">
            <GlassButton size="sm" variant="ghost" onClick={onDismiss}>
              Hepsini Sonra Çöz
            </GlassButton>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
