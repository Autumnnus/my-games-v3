import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { GlassButton } from "@/components/ui/GlassButton";
import { toast } from "sonner";
import type { Conflict, Resolution } from "@/api/steamSync";
import { useConflicts } from "@/hooks/useConflicts";
import { formatPlayTime } from "@/lib/formatters";

interface ConflictBannerProps {
  libraryEntryId: string;
  gameName: string;
  manualValue: number;
  steamValue: number;
}

export function ConflictBanner({
  libraryEntryId,
  gameName,
  manualValue,
  steamValue,
}: ConflictBannerProps) {
  const { conflicts, resolveConflict, resolveLoading } =
    useConflicts("pending");
  const conflict = conflicts.find((c) => c.libraryEntryId === libraryEntryId);
  const [resolved, setResolved] = useState(false);

  if (!conflict || resolved) return null;

  const diff = steamValue - manualValue;
  const diffSign = diff >= 0 ? "+" : "";

  async function handleResolve(resolution: Resolution) {
    try {
      await resolveConflict(conflict.id, resolution);
      toast.success("Çakışma çözüldü!");
      setResolved(true);
    } catch {
      toast.error("Çözüm uygulanamadı");
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="rounded-xl p-4 flex flex-col gap-3"
        style={{
          background: "rgba(251,191,36,0.08)",
          border: "1px solid rgba(251,191,36,0.25)",
        }}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={15} className="text-amber-400" />
          <span
            className="text-sm font-medium"
            style={{ color: "rgba(251,191,36,0.95)" }}
          >
            Bu oyunda Steam senkronizasyon çakışması var
          </span>
        </div>
        <p className="text-xs text-text-muted">
          Steam {formatPlayTime(steamValue)} kaydetmiş, sen{" "}
          {formatPlayTime(manualValue)} girdin. Fark: {diffSign}
          {formatPlayTime(Math.abs(diff))}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <GlassButton
            size="sm"
            variant="primary"
            loading={resolveLoading}
            onClick={() => handleResolve("take_steam")}
          >
            Steam'i Al
          </GlassButton>
          <GlassButton
            size="sm"
            loading={resolveLoading}
            onClick={() => handleResolve("keep_manual")}
          >
            Benimki Kalsın
          </GlassButton>
          <GlassButton
            size="sm"
            variant="ghost"
            loading={resolveLoading}
            onClick={() => handleResolve("ignore")}
          >
            Yoksay
          </GlassButton>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
