import { useState } from "react";
import { motion } from "framer-motion";
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassSwitch } from "@/components/ui/GlassSwitch";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { toast } from "sonner";
import {
  useSteamSyncSettings,
  useUpdateSteamSyncSettings,
  useSteamSyncStatus,
  useTriggerSteamSync,
} from "@/hooks/useSteamSync";

const INTERVAL_OPTIONS = [
  { value: 1, label: "1 saat" },
  { value: 6, label: "6 saat" },
  { value: 12, label: "12 saat" },
  { value: 24, label: "24 saat (her gün)" },
  { value: 168, label: "1 hafta" },
];

function StatusIcon({
  status,
}: {
  status: "success" | "partial" | "failed" | null;
}) {
  if (!status) return null;
  const props = { size: 13 };
  if (status === "success")
    return <CheckCircle {...props} className="text-green-400" />;
  if (status === "partial")
    return <AlertCircle {...props} className="text-amber-400" />;
  if (status === "failed")
    return <XCircle {...props} className="text-red-400" />;
  return null;
}

export function SteamSyncSettings() {
  const { data: settings, isLoading: settingsLoading } = useSteamSyncSettings();
  const { data: status } = useSteamSyncStatus();
  const updateMutation = useUpdateSteamSyncSettings();
  const triggerMutation = useTriggerSteamSync();

  const [pendingEnabled, setPendingEnabled] = useState<boolean | null>(null);
  const [pendingInterval, setPendingInterval] = useState<number | null>(null);

  const enabled = pendingEnabled ?? settings?.enabled ?? false;
  const intervalHours = pendingInterval ?? settings?.intervalHours ?? 24;

  function handleToggleEnabled(value: boolean) {
    setPendingEnabled(value);
    updateMutation.mutate(
      { enabled: value },
      {
        onSuccess: () => {
          setPendingEnabled(null);
          toast.success(
            value
              ? "Otomatik senkronizasyon açıldı"
              : "Otomatik senkronizasyon kapatıldı",
          );
        },
        onError: () => {
          setPendingEnabled(null);
          toast.error("Ayarlar güncellenemedi");
        },
      },
    );
  }

  function handleIntervalChange(value: number) {
    setPendingInterval(value);
    updateMutation.mutate(
      { intervalHours: value },
      {
        onSuccess: () => {
          setPendingInterval(null);
          toast.success("Senkronizasyon aralığı güncellendi");
        },
        onError: () => {
          setPendingInterval(null);
          toast.error("Ayarlar güncellenemedi");
        },
      },
    );
  }

  function handleSyncNow() {
    triggerMutation.mutate(undefined, {
      onSuccess: (data) => {
        toast.success(data.message ?? "Senkronizasyon başlatıldı");
      },
      onError: () => {
        toast.error("Senkronizasyon başlatılamadı");
      },
    });
  }

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  const lastSyncLabel = settings?.lastSyncAt
    ? new Date(settings.lastSyncAt).toLocaleString("tr-TR", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Henüz senkronizasyon yapılmadı";

  const pendingCount = status?.pendingConflicts ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-5"
    >
      {/* Enable auto-sync */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span
            className="text-sm font-medium"
            style={{ color: "rgba(255,255,255,0.85)" }}
          >
            Otomatik Steam Senkronizasyonu
          </span>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
            Her gün Steam'den oynama süresini otomatik olarak çek
          </span>
        </div>
        <GlassSwitch
          checked={enabled}
          onChange={handleToggleEnabled}
          disabled={updateMutation.isPending}
        />
      </div>

      {enabled && (
        <>
          {/* Interval */}
          <div className="flex items-center justify-between gap-4">
            <span
              className="text-sm"
              style={{ color: "rgba(255,255,255,0.6)" }}
            >
              Senkronizasyon aralığı
            </span>
            <div className="w-48">
              <GlassSelect
                value={intervalHours}
                onChange={(e) => handleIntervalChange(Number(e.target.value))}
                disabled={updateMutation.isPending}
                options={INTERVAL_OPTIONS.map((o) => ({
                  value: String(o.value),
                  label: o.label,
                }))}
              />
            </div>
          </div>

          {/* Last sync status */}
          <div
            className="flex items-center justify-between p-3 rounded-xl"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="flex items-center gap-2">
              <Clock size={13} style={{ color: "rgba(255,255,255,0.4)" }} />
              <span
                className="text-xs"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                Son senkronizasyon:
              </span>
              <span
                className="text-xs"
                style={{ color: "rgba(255,255,255,0.8)" }}
              >
                {lastSyncLabel}
              </span>
            </div>
            {settings?.lastSyncStatus && (
              <StatusIcon status={settings.lastSyncStatus} />
            )}
          </div>

          {/* Pending conflicts warning */}
          {pendingCount > 0 && (
            <div
              className="flex items-center gap-2 p-3 rounded-xl"
              style={{
                background: "rgba(251,191,36,0.08)",
                border: "1px solid rgba(251,191,36,0.2)",
              }}
            >
              <AlertCircle size={14} className="text-amber-400" />
              <span
                className="text-xs"
                style={{ color: "rgba(251,191,36,0.9)" }}
              >
                {pendingCount} çözülmemiş çakışma var — uygulamayı açtığında
                karşına çıkacak
              </span>
            </div>
          )}

          {/* Sync now */}
          <div className="flex justify-end">
            <GlassButton
              size="sm"
              variant="primary"
              leftIcon={<RefreshCw size={13} />}
              loading={triggerMutation.isPending}
              onClick={handleSyncNow}
            >
              Şimdi Senkronize Et
            </GlassButton>
          </div>
        </>
      )}
    </motion.div>
  );
}
