import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useId, useState } from "react";
import { toast } from "sonner";
import { AdminHeader } from "@/components/admin/shell";
import { Empty, Kpi, Meter, Panel, Person, Pill } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminApi, formatNumber, storageQuery } from "@/lib/admin";
import { unwrap } from "@/lib/api";
import { errorMessage, formatBytes } from "@/lib/format";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/admin/storage")({
  component: StoragePage,
});

const MB = 1024 * 1024;

function DefaultQuota({ current }: { current: number }) {
  const fieldId = useId();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(Math.round(current / MB)));
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        adminApi.storage["default-quota"].$put({
          json: { quotaBytes: Math.round(Number(value) * MB) },
        }),
      ),
    onSuccess: async () => {
      toast.success(m.saved());
      await queryClient.invalidateQueries({ queryKey: ["admin", "storage"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const valid = Number(value) >= 0 && Number.isFinite(Number(value)) && value.trim() !== "";
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) save.mutate();
      }}
    >
      <label className="grid gap-1.5 text-sm" htmlFor={`${fieldId}-1`}>
        <span className="text-foreground/70">{m.admin_quota_mb()}</span>
        <Input
          id={`${fieldId}-1`}
          type="number"
          min={0}
          step={10}
          inputMode="numeric"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="w-[160px]"
        />
      </label>
      <Button type="submit" size="sm" disabled={!valid || save.isPending}>
        {m.admin_save()}
      </Button>
    </form>
  );
}

function StoragePage() {
  const { data } = useQuery(storageQuery);
  if (!data) return <AdminHeader title={m.admin_nav_storage()} />;
  const ratio = data.budgetBytes ? data.usedBytes / data.budgetBytes : 0;
  const custom = data.users.filter((row) => row.customQuota).length;

  return (
    <>
      <AdminHeader title={m.admin_nav_storage()} description={m.admin_storage_description()} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="bg-card col-span-2 grid gap-2 rounded-[20px] border border-white/8 p-4">
          <span className="text-foreground/60 text-[13px]">{m.admin_storage_system()}</span>
          <span className="text-[26px] leading-tight font-semibold">
            {formatBytes(data.usedBytes)}
            <span className="text-foreground/50 ml-2 text-base font-normal">
              / {formatBytes(data.budgetBytes)}
            </span>
          </span>
          <Meter value={data.usedBytes} max={data.budgetBytes} label={m.admin_storage_system()} />
          <span className="text-foreground/55 text-xs">
            {m.admin_storage_budget_hint({ percent: Math.round(ratio * 100) })}
          </span>
        </div>
        <Kpi label={m.admin_storage_default()} value={formatBytes(data.defaultQuotaBytes)} />
        <Kpi
          label={m.admin_storage_custom()}
          value={formatNumber(custom)}
          hint={m.admin_storage_custom_hint()}
        />
      </div>

      <Panel title={m.admin_storage_default()} description={m.admin_storage_default_hint()}>
        <DefaultQuota key={data.defaultQuotaBytes} current={data.defaultQuotaBytes} />
      </Panel>

      <Panel title={m.admin_storage_top()} description={m.admin_storage_top_hint()}>
        {data.users.length === 0 ? (
          <Empty>{m.admin_storage_empty()}</Empty>
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0">
            {data.users.map((row) => (
              <li
                key={row.userId}
                className="grid gap-1.5 sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:items-center sm:gap-4"
              >
                <Person
                  user={{ id: row.userId, name: row.name, username: row.username, image: null }}
                />
                <Meter value={row.usedBytes} max={row.quotaBytes} label={row.name} />
                <span className="flex items-center justify-end gap-2 text-[13px] tabular-nums">
                  {row.customQuota && <Pill tone="info">{m.admin_quota_custom()}</Pill>}
                  {formatBytes(row.usedBytes)} / {formatBytes(row.quotaBytes)}
                  <span className="text-foreground/50 text-xs">
                    {m.admin_files({ count: row.count })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
