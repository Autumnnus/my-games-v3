import { GlassButton } from "@/components/ui/GlassButton";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { GlassSwitch } from "@/components/ui/GlassSwitch";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  useSteamSyncSettings,
  useSteamSyncStatus,
  useTriggerSteamSync,
  useUpdateSteamSyncSettings,
} from "@/hooks/useSteamSync";
import { motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
    return <XCircle {...props} className="text-danger" />;
  return null;
}

export function SteamSyncSettings() {
  const { t } = useTranslation();
  const { data: settings, isLoading: settingsLoading } = useSteamSyncSettings();
  const { data: status } = useSteamSyncStatus();
  const updateMutation = useUpdateSteamSyncSettings();
  const triggerMutation = useTriggerSteamSync();

  const [pendingEnabled, setPendingEnabled] = useState<boolean | null>(null);
  const [pendingInterval, setPendingInterval] = useState<number | null>(null);

  const enabled = pendingEnabled ?? settings?.enabled ?? false;
  const intervalHours = pendingInterval ?? settings?.intervalHours ?? 24;

  const INTERVAL_OPTIONS = [
    { value: "1", label: t("translation:steamSync.interval.1") },
    { value: "6", label: t("translation:steamSync.interval.6") },
    { value: "12", label: t("translation:steamSync.interval.12") },
    { value: "24", label: t("translation:steamSync.interval.24") },
    { value: "168", label: t("translation:steamSync.interval.168") },
  ];

  function handleToggleEnabled(value: boolean) {
    setPendingEnabled(value);
    updateMutation.mutate(
      { enabled: value },
      {
        onSuccess: () => {
          setPendingEnabled(null);
          toast.success(
            value
              ? t("translation:steamSync.enabled")
              : t("translation:steamSync.disabled"),
          );
        },
        onError: () => {
          setPendingEnabled(null);
          toast.error(t("translation:steamSync.settingsError"));
        },
      },
    );
  }

  function handleIntervalChange(value: string) {
    const numValue = Number(value);
    setPendingInterval(numValue);
    updateMutation.mutate(
      { intervalHours: numValue },
      {
        onSuccess: () => {
          setPendingInterval(null);
          toast.success(t("translation:steamSync.intervalUpdated"));
        },
        onError: () => {
          setPendingInterval(null);
          toast.error(t("translation:steamSync.settingsError"));
        },
      },
    );
  }

  function handleSyncNow() {
    triggerMutation.mutate(undefined, {
      onSuccess: (data) => {
        toast.success(data.message ?? t("translation:steamSync.syncStarted"));
      },
      onError: () => {
        toast.error(t("translation:steamSync.syncError"));
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
    ? new Date(settings.lastSyncAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : t("translation:steamSync.neverSynced");

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
          <span className="text-sm font-medium text-text-secondary">
            {t("translation:steamSync.autoSync")}
          </span>
          <span className="text-xs text-text-muted">
            {t("translation:steamSync.autoSyncHint")}
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
            <span className="text-sm text-text-secondary">
              {t("translation:steamSync.intervalLabel")}
            </span>
            <div className="w-48">
              <GlassSelect
                value={String(intervalHours)}
                onChange={handleIntervalChange}
                disabled={updateMutation.isPending}
                options={INTERVAL_OPTIONS}
              />
            </div>
          </div>

          {/* Last sync status */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-surface-subtle border border-glass-border">
            <div className="flex items-center gap-2">
              <Clock size={13} className="text-text-muted" />
              <span className="text-xs text-text-muted">
                {t("translation:steamSync.lastSync")}
              </span>
              <span className="text-xs text-text-secondary">
                {lastSyncLabel}
              </span>
            </div>
            {settings?.lastSyncStatus && (
              <StatusIcon status={settings.lastSyncStatus} />
            )}
          </div>

          {/* Pending conflicts warning */}
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-warning-soft border border-warning/20">
              <AlertCircle size={14} className="text-warning" />
              <span className="text-xs text-warning">
                {t("translation:steamSync.pendingConflicts", {
                  count: pendingCount,
                })}
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
              {t("translation:steamSync.syncNow")}
            </GlassButton>
          </div>
        </>
      )}
    </motion.div>
  );
}
