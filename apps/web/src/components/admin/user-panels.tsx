import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { BanIcon, Trash2Icon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  type AdminUserDetail,
  adminApi,
  formatNumber,
  type PurgeCategory,
  purgeLabels,
  settingsQuery,
} from "@/lib/admin";
import { unwrap } from "@/lib/api";
import { errorMessage, formatBytes } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { Meter, Panel, Segmented, TypedConfirm } from "./ui";

/** Bir kullanıcıyı değiştiren her işlemden sonra ilgili ekranlar tazelenir. */
function useRefresh(userId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "user", userId] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "audit"] }),
    ]);
}

const MB = 1024 * 1024;

export function StoragePanel({ detail }: { detail: AdminUserDetail }) {
  const fieldId = useId();
  const refresh = useRefresh(detail.user.id);
  const { storage } = detail;
  const [mode, setMode] = useState<"default" | "custom">(
    storage.customQuota ? "custom" : "default",
  );
  const [megabytes, setMegabytes] = useState(String(Math.round(storage.quotaBytes / MB)));
  const [note, setNote] = useState(storage.quotaNote ?? "");
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        adminApi.users[":id"]["storage-quota"].$put({
          param: { id: detail.user.id },
          json: {
            quotaBytes: mode === "default" ? null : Math.round(Number(megabytes) * MB),
            note: note.trim() || null,
          },
        }),
      ),
    onSuccess: async () => {
      toast.success(m.saved());
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const valid =
    mode === "default" || (Number(megabytes) >= 0 && Number.isFinite(Number(megabytes)));

  return (
    <Panel title={m.admin_user_storage()} description={m.admin_user_storage_hint()}>
      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold tabular-nums">
            {formatBytes(storage.usedBytes)} / {formatBytes(storage.quotaBytes)}
          </span>
          <span className="text-foreground/55 text-xs">
            {m.admin_user_storage_counts({
              screenshots: storage.breakdown.screenshot.count,
              avatars: storage.breakdown.avatar.count,
            })}
          </span>
        </div>
        <Meter value={storage.usedBytes} max={storage.quotaBytes} label={m.admin_user_storage()} />
      </div>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) save.mutate();
        }}
      >
        <Segmented
          label={m.admin_quota_mode()}
          value={mode}
          options={[
            { value: "default", label: m.admin_quota_default() },
            { value: "custom", label: m.admin_quota_custom() },
          ]}
          onChange={setMode}
        />
        {mode === "custom" && (
          <label className="grid gap-1.5 text-sm" htmlFor={`${fieldId}-1`}>
            <span className="text-foreground/70">{m.admin_quota_mb()}</span>
            <Input
              id={`${fieldId}-1`}
              type="number"
              min={0}
              step={10}
              inputMode="numeric"
              value={megabytes}
              onChange={(event) => setMegabytes(event.target.value)}
              className="max-w-[180px]"
            />
          </label>
        )}
        <label className="grid gap-1.5 text-sm" htmlFor={`${fieldId}-2`}>
          <span className="text-foreground/70">{m.admin_note()}</span>
          <Input
            id={`${fieldId}-2`}
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <Button type="submit" size="sm" className="w-fit" disabled={!valid || save.isPending}>
          {m.admin_save()}
        </Button>
      </form>
    </Panel>
  );
}

export function AiLimitsPanel({ detail }: { detail: AdminUserDetail }) {
  const fieldId = useId();
  const refresh = useRefresh(detail.user.id);
  const settings = useQuery(settingsQuery);
  const { limits, ai } = detail;
  const initialMode =
    limits.aiDailyTokens === null ? "default" : limits.aiDailyTokens === 0 ? "unlimited" : "custom";
  const [mode, setMode] = useState<"default" | "custom" | "unlimited">(initialMode);
  const [tokens, setTokens] = useState(String(limits.aiDailyTokens || ai.today.limit || 200_000));
  const [blocked, setBlocked] = useState(limits.aiBlocked);
  const [note, setNote] = useState(limits.note ?? "");
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        adminApi.users[":id"].limits.$put({
          param: { id: detail.user.id },
          json: {
            aiDailyTokens:
              mode === "default" ? null : mode === "unlimited" ? 0 : Math.round(Number(tokens)),
            aiBlocked: blocked,
            note: note.trim() || null,
          },
        }),
      ),
    onSuccess: async () => {
      toast.success(m.saved());
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const defaultLimit = settings.data?.ai.effectiveDailyTokens;

  return (
    <Panel title={m.admin_user_ai_limits()} description={m.admin_user_ai_limits_hint()}>
      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold tabular-nums">
            {ai.today.limit > 0
              ? m.admin_ai_today_of({
                  used: formatNumber(ai.today.used),
                  limit: formatNumber(ai.today.limit),
                })
              : m.admin_ai_today_unlimited({ used: formatNumber(ai.today.used) })}
          </span>
          {ai.today.blocked && (
            <span className="text-destructive text-xs font-bold">{m.admin_ai_blocked()}</span>
          )}
        </div>
        <Meter
          value={ai.today.used}
          max={ai.today.limit || null}
          label={m.admin_user_ai_limits()}
        />
      </div>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <Segmented
          label={m.admin_ai_limit_mode()}
          value={mode}
          options={[
            {
              value: "default",
              label:
                defaultLimit !== undefined
                  ? m.admin_ai_limit_default_value({
                      value: defaultLimit === 0 ? m.admin_unlimited() : formatNumber(defaultLimit),
                    })
                  : m.admin_ai_limit_default(),
            },
            { value: "custom", label: m.admin_ai_limit_custom() },
            { value: "unlimited", label: m.admin_unlimited() },
          ]}
          onChange={setMode}
        />
        {mode === "custom" && (
          <label className="grid gap-1.5 text-sm" htmlFor={`${fieldId}-3`}>
            <span className="text-foreground/70">{m.admin_ai_limit_tokens()}</span>
            <Input
              id={`${fieldId}-3`}
              type="number"
              min={1}
              step={10_000}
              inputMode="numeric"
              value={tokens}
              onChange={(event) => setTokens(event.target.value)}
              className="max-w-[200px]"
            />
          </label>
        )}
        <label
          className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5 text-sm"
          htmlFor={`${fieldId}-4`}
        >
          <span className="grid gap-0.5">
            <span className="font-semibold">{m.admin_ai_block()}</span>
            <span className="text-foreground/55 text-xs">{m.admin_ai_block_hint()}</span>
          </span>
          <Switch id={`${fieldId}-4`} checked={blocked} onCheckedChange={setBlocked} />
        </label>
        <label className="grid gap-1.5 text-sm" htmlFor={`${fieldId}-5`}>
          <span className="text-foreground/70">{m.admin_note()}</span>
          <Input
            id={`${fieldId}-5`}
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <Button
          type="submit"
          size="sm"
          className="w-fit"
          disabled={save.isPending || (mode === "custom" && !(Number(tokens) > 0))}
        >
          {m.admin_save()}
        </Button>
      </form>
    </Panel>
  );
}

export function BanDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: AdminUserDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fieldId = useId();
  const refresh = useRefresh(detail.user.id);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState<"1" | "7" | "30" | "forever">("7");
  const ban = useMutation({
    mutationFn: () =>
      unwrap(
        adminApi.users[":id"].ban.$post({
          param: { id: detail.user.id },
          json: { reason: reason.trim() || null, days: days === "forever" ? null : Number(days) },
        }),
      ),
    onSuccess: async () => {
      toast.success(m.admin_banned_toast());
      onOpenChange(false);
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.admin_ban_title({ name: detail.user.name })}</DialogTitle>
          <DialogDescription>{m.admin_ban_description()}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Segmented
            label={m.admin_ban_duration()}
            value={days}
            options={[
              { value: "1", label: m.admin_ban_days({ days: 1 }) },
              { value: "7", label: m.admin_ban_days({ days: 7 }) },
              { value: "30", label: m.admin_ban_days({ days: 30 }) },
              { value: "forever", label: m.admin_ban_forever() },
            ]}
            onChange={setDays}
          />
          <label className="grid gap-1.5 text-sm" htmlFor={`${fieldId}-6`}>
            <span className="text-foreground/70">{m.admin_ban_reason()}</span>
            <Textarea
              id={`${fieldId}-6`}
              value={reason}
              maxLength={500}
              rows={3}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {m.admin_cancel()}
          </Button>
          <Button variant="destructive" disabled={ban.isPending} onClick={() => ban.mutate()}>
            <BanIcon />
            {m.admin_ban_confirm_button()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const categoryCounts = (counts: AdminUserDetail["counts"], user: AdminUserDetail["user"]) =>
  ({
    library: counts.entries,
    screenshots: counts.screenshots,
    ai: counts.threads,
    social: counts.comments + counts.reactions + counts.activities + counts.notifications,
    platforms: counts.platforms + counts.proposals,
    profile: (user.image ? 1 : 0) + (user.bio ? 1 : 0),
  }) satisfies Record<PurgeCategory, number>;

/**
 * Geri alınamayan işlemler: kategori bazlı veri silme ve hesabı silme. Admin hesaplarında ve kendi hesabında
 * kapalıdır (sunucu da reddeder).
 */
export function DangerZone({ detail, self }: { detail: AdminUserDetail; self: boolean }) {
  const refresh = useRefresh(detail.user.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<PurgeCategory[]>([]);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const counts = categoryCounts(detail.counts, detail.user);
  const expected = detail.user.username ? `@${detail.user.username}` : detail.user.email;
  const locked = self || detail.user.role === "admin";

  const purge = useMutation({
    mutationFn: () =>
      unwrap(
        adminApi.users[":id"].purge.$post({
          param: { id: detail.user.id },
          json: { categories: selected },
        }),
      ),
    onSuccess: async () => {
      toast.success(m.admin_purge_done());
      setPurgeOpen(false);
      setSelected([]);
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (confirm: string) =>
      unwrap(adminApi.users[":id"].$delete({ param: { id: detail.user.id }, json: { confirm } })),
    onSuccess: async () => {
      toast.success(m.admin_delete_done());
      setDeleteOpen(false);
      queryClient.removeQueries({ queryKey: ["admin", "user", detail.user.id] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "overview"] }),
      ]);
      await navigate({ to: "/admin/users" });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const categories = Object.keys(purgeLabels) as PurgeCategory[];

  return (
    <Panel
      tone="danger"
      title={m.admin_danger_title()}
      description={
        locked ? (self ? m.admin_danger_self() : m.admin_danger_admin()) : m.admin_danger_hint()
      }
    >
      <fieldset disabled={locked} className="m-0 grid gap-2 border-0 p-0 disabled:opacity-50">
        <legend className="mb-2 text-sm font-semibold">{m.admin_purge_title()}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {categories.map((category) => {
            const checked = selected.includes(category);
            const id = `purge-${category}`;
            return (
              <label
                key={category}
                htmlFor={id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                  checked
                    ? "border-destructive/50 bg-destructive/[0.08]"
                    : "border-white/8 hover:bg-white/[0.03]"
                }`}
              >
                <Checkbox
                  id={id}
                  checked={checked}
                  className="mt-0.5"
                  onCheckedChange={(value) =>
                    setSelected((current) =>
                      value ? [...current, category] : current.filter((item) => item !== category),
                    )
                  }
                />
                <span className="grid gap-0.5">
                  <span className="text-sm font-semibold">
                    {purgeLabels[category].title()}
                    <span className="text-foreground/50 ml-1.5 text-xs font-normal tabular-nums">
                      {formatNumber(counts[category])}
                    </span>
                  </span>
                  <span className="text-foreground/55 text-xs">{purgeLabels[category].hint()}</span>
                </span>
              </label>
            );
          })}
        </div>
        {selected.includes("library") &&
          !selected.includes("platforms") &&
          counts.platforms > 0 && (
            <p className="m-0 text-xs text-amber-200">{m.admin_purge_resync_warning()}</p>
          )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="destructive"
            size="sm"
            disabled={selected.length === 0}
            onClick={() => setPurgeOpen(true)}
          >
            <Trash2Icon />
            {m.admin_purge_button({ count: selected.length })}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2Icon />
            {m.admin_delete_button()}
          </Button>
        </div>
      </fieldset>

      <TypedConfirm
        open={purgeOpen}
        onOpenChange={setPurgeOpen}
        title={m.admin_purge_confirm_title()}
        description={m.admin_purge_confirm_description({
          categories: selected.map((category) => purgeLabels[category].title()).join(", "),
        })}
        expected={expected}
        confirmLabel={m.admin_purge_confirm_button()}
        pending={purge.isPending}
        onConfirm={() => purge.mutate()}
      />
      <TypedConfirm
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={m.admin_delete_confirm_title({ name: detail.user.name })}
        description={m.admin_delete_confirm_description({
          entries: formatNumber(detail.counts.entries),
          screenshots: formatNumber(detail.counts.screenshots),
          storage: formatBytes(detail.storage.usedBytes),
        })}
        expected={expected}
        confirmLabel={m.admin_delete_confirm_button()}
        pending={remove.isPending}
        onConfirm={(typed) => remove.mutate(typed)}
      />
    </Panel>
  );
}
