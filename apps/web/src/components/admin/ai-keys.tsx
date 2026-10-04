import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  FlaskConicalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Switch } from "@/components/ui/switch";
import { adminApi, aiKeysQuery, formatNumber } from "@/lib/admin";
import { unwrap } from "@/lib/api";
import { errorMessage, formatRelative } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { Panel, Pill, Segmented } from "./ui";

type Overview = Awaited<ReturnType<NonNullable<typeof aiKeysQuery.queryFn>>>;
type Live = Overview["status"]["pools"][number]["keys"][number];
type Check = { status: "ok" | "limited" | "invalid" | "error"; message?: string };

/** Panel satırı: paneldeki (yönetilebilir) ya da ortam değişkenindeki (salt okunur) anahtar. */
type Row =
  | {
      source: "db";
      ref: string;
      id: string;
      provider: string;
      name: string | null;
      hint: string;
      enabled: boolean;
    }
  | { source: "env"; ref: string; provider: string; hint: string; inPanel: boolean };

const providerNames: Record<string, string> = { google: "Google Gemini" };

function checkMessage(check: Check) {
  const message = check.message ?? "";
  if (check.status === "ok") return m.admin_keys_test_ok();
  if (check.status === "limited") return m.admin_keys_test_limited({ message });
  if (check.status === "invalid") return m.admin_keys_test_invalid({ message });
  return m.admin_keys_test_error({ message });
}

function showCheck(check: Check) {
  if (check.status === "ok") toast.success(checkMessage(check));
  else if (check.status === "limited") toast.warning(checkMessage(check));
  else toast.error(checkMessage(check));
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: aiKeysQuery.queryKey });
}

/**
 * Anahtar havuzu: panelden eklenen anahtarlar (şifreli saklanır, bir daha gösterilmez) ve ortam
 * değişkenindekiler, canlı durumlarıyla. Havuz durumu app sürecinin görüşüdür.
 */
export function AiKeys() {
  const { data } = useQuery(aiKeysQuery);
  if (!data) return null;
  const { status, today, keys } = data;
  const mock = status.provider === "mock";

  const live = new Map<string, Live>();
  for (const pool of status.pools)
    for (const key of pool.keys) live.set(`${pool.provider}|${key.ref}`, key);

  const rows: Row[] = [
    ...keys.stored.map((key) => ({ source: "db" as const, ref: `db:${key.id}`, ...key })),
    ...keys.env.map((key) => ({ source: "env" as const, ...key })),
  ];
  const providers = [...new Set([...keys.providers, ...rows.map((row) => row.provider)])];

  return (
    <Panel
      title={m.admin_ai_keys_title()}
      description={m.admin_ai_today({
        tokens: formatNumber(today.tokens),
        calls: today.calls,
        users: today.users,
      })}
    >
      {mock ? (
        <p className="text-foreground/60 m-0 text-sm">{m.admin_ai_mock()}</p>
      ) : (
        !status.enabled && <p className="text-amber-200 m-0 text-sm">{m.admin_keys_empty()}</p>
      )}

      <dl className="m-0 grid gap-2 text-sm sm:grid-cols-2">
        <div className="grid gap-1 rounded-2xl bg-white/[0.04] p-3">
          <dt className="text-foreground/60 text-xs">{m.admin_ai_chat()}</dt>
          <dd className="m-0 font-mono text-[13px] break-words">
            {status.chains.chat.join(" → ") || "—"}
          </dd>
        </div>
        <div className="grid gap-1 rounded-2xl bg-white/[0.04] p-3">
          <dt className="text-foreground/60 text-xs">{m.admin_ai_light()}</dt>
          <dd className="m-0 font-mono text-[13px] break-words">
            {status.chains.light.join(" → ") || "—"}
          </dd>
        </div>
      </dl>

      <StrategyPicker strategy={status.strategy} />

      {providers.map((provider) => {
        const list = rows.filter((row) => row.provider === provider);
        const stored = list.filter((row) => row.source === "db");
        return (
          <div key={provider} className="grid gap-2">
            <h3 className="m-0 text-sm font-bold">
              {m.admin_ai_keys({ provider: providerNames[provider] ?? provider })}
            </h3>
            {list.length === 0 ? (
              <p className="text-foreground/55 m-0 text-xs">{m.admin_keys_none()}</p>
            ) : (
              <ul className="m-0 grid list-none gap-1.5 p-0">
                {list.map((row) => (
                  <KeyRow
                    key={row.ref}
                    row={row}
                    live={live.get(`${provider}|${row.ref}`) ?? null}
                    order={
                      row.source === "db"
                        ? {
                            ids: stored.map((item) => (item.source === "db" ? item.id : "")),
                            id: row.id,
                          }
                        : null
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}

      <AddKeyForm providers={keys.providers} />
    </Panel>
  );
}

function StrategyPicker({ strategy }: { strategy: Overview["status"]["strategy"] }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (value: "round_robin" | "failover" | null) =>
      unwrap(adminApi.ai.strategy.$put({ json: { strategy: value } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiKeysQuery.queryKey }),
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label={m.admin_keys_strategy_label()}
          value={strategy.value}
          options={[
            { value: "round_robin", label: m.admin_keys_strategy_round_robin() },
            { value: "failover", label: m.admin_keys_strategy_failover() },
          ]}
          onChange={(value) => value !== strategy.value && save.mutate(value)}
        />
        {strategy.source === "env" ? (
          <Pill>{m.admin_keys_from_env()}</Pill>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={save.isPending}
            onClick={() => save.mutate(null)}
          >
            {m.admin_keys_strategy_reset()}
          </Button>
        )}
      </div>
      <p className="text-foreground/55 m-0 text-xs">
        {strategy.value === "failover"
          ? m.admin_keys_strategy_failover_hint()
          : m.admin_keys_strategy_round_robin_hint()}
      </p>
    </div>
  );
}

function KeyRow({
  row,
  live,
  order,
}: {
  row: Row;
  live: Live | null;
  order: { ids: string[]; id: string } | null;
}) {
  const refresh = useRefresh();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(row.source === "db" ? (row.name ?? "") : "");

  const patch = useMutation({
    mutationFn: ({ id, json }: { id: string; json: { name?: string | null; enabled?: boolean } }) =>
      unwrap(adminApi.ai.keys[":id"].$patch({ param: { id }, json })),
    onSuccess: async () => {
      setRenaming(false);
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(adminApi.ai.keys[":id"].$delete({ param: { id } })),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const test = useMutation({
    mutationFn: (id: string) => unwrap(adminApi.ai.keys[":id"].test.$post({ param: { id } })),
    onSuccess: async (check) => {
      showCheck(check);
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const move = useMutation({
    mutationFn: (ids: string[]) =>
      unwrap(adminApi.ai.keys.order.$put({ json: { provider: row.provider, ids } })),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const index = order ? order.ids.indexOf(order.id) : -1;
  const reorder = (delta: number) => {
    if (!order) return;
    const ids = [...order.ids];
    const [item] = ids.splice(index, 1);
    if (item) ids.splice(index + delta, 0, item);
    move.mutate(ids);
  };
  const busy = patch.isPending || remove.isPending || move.isPending;
  const title = row.source === "db" && row.name ? row.name : null;

  return (
    <li className="grid gap-1.5 rounded-2xl bg-white/[0.04] px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {renaming && row.source === "db" ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              patch.mutate({ id: row.id, json: { name: name.trim() || null } });
            }}
          >
            <Input
              value={name}
              maxLength={40}
              autoFocus
              placeholder={m.admin_keys_name_placeholder()}
              aria-label={m.admin_keys_name()}
              onChange={(event) => setName(event.target.value)}
              className="h-8 min-w-0 flex-1"
            />
            <Button type="submit" size="icon-sm" variant="ghost" aria-label={m.admin_save()}>
              <CheckIcon />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={m.admin_cancel()}
              onClick={() => setRenaming(false)}
            >
              <XIcon />
            </Button>
          </form>
        ) : (
          <span className="flex min-w-0 items-baseline gap-2">
            {title && <span className="truncate font-semibold">{title}</span>}
            <span className="text-foreground/70 font-mono text-[13px]">{row.hint}</span>
          </span>
        )}
        {row.source === "env" && <Pill tone="info">{m.admin_keys_source_env()}</Pill>}
        {row.source === "db" && !row.enabled ? (
          <Pill>{m.admin_keys_off()}</Pill>
        ) : live ? (
          <Pill tone={live.state === "ready" ? "ok" : live.state === "cooling" ? "warn" : "danger"}>
            {live.state === "ready"
              ? m.admin_ai_state_ready()
              : live.state === "cooling"
                ? m.admin_ai_state_cooling()
                : m.admin_ai_state_disabled()}
          </Pill>
        ) : null}
        {live?.until && (
          <span className="text-foreground/60 text-xs">
            {m.admin_ai_until({ time: formatRelative(live.until) })}
          </span>
        )}
        {live && (
          <span className="text-foreground/60 ml-auto text-xs tabular-nums">
            {m.admin_ai_counts({ ok: live.ok, failed: live.failed })}
          </span>
        )}
      </div>
      {live?.lastError && (
        <span className="text-foreground/55 truncate text-xs">
          {m.admin_ai_last_error({ error: live.lastError })}
        </span>
      )}
      {row.source === "env" ? (
        <span className="text-foreground/50 text-xs">
          {row.inPanel ? m.admin_keys_env_in_panel() : m.admin_keys_env_hint()}
        </span>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-foreground/70 mr-2 flex items-center gap-2 text-xs">
            <Switch
              id={`key-${row.id}-enabled`}
              checked={row.enabled}
              disabled={busy}
              onCheckedChange={(enabled) => patch.mutate({ id: row.id, json: { enabled } })}
            />
            <label htmlFor={`key-${row.id}-enabled`}>
              {row.enabled ? m.admin_keys_on() : m.admin_keys_off()}
            </label>
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={test.isPending}
            onClick={() => test.mutate(row.id)}
          >
            <FlaskConicalIcon />
            {m.admin_keys_test()}
          </Button>
          {!renaming && (
            <Button size="sm" variant="ghost" onClick={() => setRenaming(true)}>
              <PencilIcon />
              {m.admin_keys_rename()}
            </Button>
          )}
          <span className="ml-auto flex gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={busy || index <= 0}
              aria-label={m.admin_models_up()}
              onClick={() => reorder(-1)}
            >
              <ArrowUpIcon />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={busy || !order || index >= order.ids.length - 1}
              aria-label={m.admin_models_down()}
              onClick={() => reorder(1)}
            >
              <ArrowDownIcon />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={busy}
              aria-label={m.admin_keys_delete()}
              onClick={() => {
                if (!window.confirm(m.admin_keys_delete_confirm({ key: title ?? row.hint })))
                  return;
                remove.mutate(row.id);
              }}
            >
              <Trash2Icon />
            </Button>
          </span>
        </div>
      )}
    </li>
  );
}

function AddKeyForm({ providers }: { providers: string[] }) {
  const refresh = useRefresh();
  const fieldId = useId();
  const [provider, setProvider] = useState(providers[0] ?? "google");
  const add = useMutation({
    mutationFn: (json: { provider: string; key: string; name: string | null }) =>
      unwrap(adminApi.ai.keys.$post({ json })),
    onSuccess: async (result, _variables) => {
      const check = result.check as Check;
      if (check.status === "ok") toast.success(m.admin_keys_added());
      else if (check.status === "limited")
        toast.warning(m.admin_keys_added_limited({ message: check.message ?? "" }));
      else toast.warning(m.admin_keys_added_unchecked({ message: check.message ?? "" }));
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    add.mutate(
      {
        provider,
        key: String(data.get("key")).trim(),
        name: String(data.get("name") ?? "").trim() || null,
      },
      { onSuccess: () => form.reset() },
    );
  }

  return (
    <form
      className="grid gap-3 rounded-2xl border border-dashed border-white/12 p-3"
      onSubmit={onSubmit}
    >
      <div className="grid gap-0.5">
        <span className="text-sm font-semibold">{m.admin_keys_add_title()}</span>
        <span className="text-foreground/55 text-xs">{m.admin_keys_add_hint()}</span>
      </div>
      {providers.length > 1 && (
        <Segmented
          label={m.admin_keys_provider()}
          value={provider}
          options={providers.map((id) => ({ value: id, label: providerNames[id] ?? id }))}
          onChange={setProvider}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <label className="grid gap-1.5 text-sm" htmlFor={`${fieldId}-name`}>
          <span className="text-foreground/70 text-xs">{m.admin_keys_name()}</span>
          <Input
            id={`${fieldId}-name`}
            name="name"
            maxLength={40}
            autoComplete="off"
            placeholder={m.admin_keys_name_placeholder()}
          />
        </label>
        <label className="grid gap-1.5 text-sm" htmlFor={`${fieldId}-key`}>
          <span className="text-foreground/70 text-xs">{m.admin_keys_secret()}</span>
          <PasswordInput
            id={`${fieldId}-key`}
            name="key"
            required
            minLength={10}
            maxLength={300}
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-[13px]"
          />
        </label>
      </div>
      <Button type="submit" size="sm" className="w-fit" disabled={add.isPending}>
        <PlusIcon />
        {add.isPending ? m.admin_keys_adding() : m.admin_keys_add_submit()}
      </Button>
    </form>
  );
}
