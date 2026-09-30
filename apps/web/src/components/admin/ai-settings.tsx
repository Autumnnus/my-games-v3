import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type AdminSettings, adminApi, formatNumber, settingsQuery } from "@/lib/admin";
import { unwrap } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { Panel, Segmented } from "./ui";

type Row = { key: string; model: string; input: string; cachedInput: string; output: string };

let rowId = 0;
const toRows = (table: AdminSettings["ai"]["prices"]): Row[] =>
  Object.entries(table).map(([model, price]) => ({
    key: `row-${rowId++}`,
    model,
    input: String(price.input),
    cachedInput: price.cachedInput === undefined ? "" : String(price.cachedInput),
    output: String(price.output),
  }));

function useSave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (json: Parameters<typeof adminApi.settings.$put>[0]["json"]) =>
      unwrap(adminApi.settings.$put({ json })),
    onSuccess: async (next) => {
      queryClient.setQueryData(settingsQuery.queryKey, next);
      toast.success(m.saved());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "ai", "costs"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "overview"] }),
      ]);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

/** Varsayılan günlük token sınırı (herkes için; kişiye özel sınır kullanıcı sayfasından). */
function DailyLimit({ settings }: { settings: AdminSettings }) {
  const fieldId = useId();
  const save = useSave();
  const [mode, setMode] = useState<"env" | "custom">(
    settings.ai.dailyTokens === null ? "env" : "custom",
  );
  const [value, setValue] = useState(
    String(settings.ai.dailyTokens ?? settings.ai.envDailyTokens ?? 200_000),
  );
  const parsed = Number(value);
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ aiDailyTokens: mode === "env" ? null : Math.round(parsed) });
      }}
    >
      <div className="grid gap-1">
        <h3 className="m-0 text-sm font-bold">{m.admin_ai_daily_title()}</h3>
        <p className="text-foreground/60 m-0 text-xs">
          {m.admin_ai_daily_hint({
            value:
              settings.ai.effectiveDailyTokens === 0
                ? m.admin_unlimited()
                : formatNumber(settings.ai.effectiveDailyTokens),
          })}
        </p>
      </div>
      <Segmented
        label={m.admin_ai_daily_title()}
        value={mode}
        options={[
          {
            value: "env",
            label: m.admin_ai_daily_env({
              value:
                settings.ai.envDailyTokens === null
                  ? "—"
                  : settings.ai.envDailyTokens === 0
                    ? m.admin_unlimited()
                    : formatNumber(settings.ai.envDailyTokens),
            }),
          },
          { value: "custom", label: m.admin_ai_limit_custom() },
        ]}
        onChange={setMode}
      />
      {mode === "custom" && (
        <label className="grid gap-1.5 text-sm" htmlFor={`${fieldId}-1`}>
          <span className="text-foreground/70">{m.admin_ai_daily_input()}</span>
          <Input
            id={`${fieldId}-1`}
            type="number"
            min={0}
            step={10_000}
            inputMode="numeric"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="max-w-[200px]"
          />
        </label>
      )}
      <Button
        type="submit"
        size="sm"
        className="w-fit"
        disabled={
          save.isPending || (mode === "custom" && !(parsed >= 0 && Number.isFinite(parsed)))
        }
      >
        {m.admin_save()}
      </Button>
    </form>
  );
}

/** Model fiyat tablosu (USD / 1M token). Maliyetler okuma anında bu tabloyla hesaplanır. */
function PriceTable({ settings }: { settings: AdminSettings }) {
  const save = useSave();
  const [rows, setRows] = useState<Row[]>(() => toRows(settings.ai.prices));
  const update = (key: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const number = (value: string) =>
    value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
  const valid =
    rows.every(
      (row) =>
        row.model.trim() &&
        number(row.input) &&
        number(row.output) &&
        (row.cachedInput === "" || number(row.cachedInput)),
    ) && new Set(rows.map((row) => row.model.trim())).size === rows.length;

  const submit = () => {
    const table = Object.fromEntries(
      rows.map((row) => [
        row.model.trim(),
        {
          input: Number(row.input),
          output: Number(row.output),
          ...(row.cachedInput === "" ? {} : { cachedInput: Number(row.cachedInput) }),
        },
      ]),
    );
    save.mutate({ aiPrices: table });
  };

  const field =
    "h-9 w-full min-w-0 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[13px] outline-none focus:border-white/30";
  const cell = `${field} text-right tabular-nums`;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <h3 className="m-0 text-sm font-bold">{m.admin_prices_title()}</h3>
          <p className="text-foreground/60 m-0 text-xs">{m.admin_prices_hint()}</p>
        </div>
        {settings.ai.pricesCustomized && (
          <Button
            variant="ghost"
            size="sm"
            disabled={save.isPending}
            onClick={() => {
              if (!window.confirm(m.admin_prices_reset_confirm())) return;
              save.mutate(
                { aiPrices: null },
                { onSuccess: () => setRows(toRows(settings.ai.defaultPrices)) },
              );
            }}
          >
            <RotateCcwIcon />
            {m.admin_prices_reset()}
          </Button>
        )}
      </div>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-foreground/55 text-left text-xs">
            <tr>
              <th className="pb-2 font-semibold">{m.admin_prices_model()}</th>
              <th className="w-[110px] pb-2 text-right font-semibold">{m.admin_prices_input()}</th>
              <th className="w-[110px] pb-2 text-right font-semibold">{m.admin_prices_cached()}</th>
              <th className="w-[110px] pb-2 text-right font-semibold">{m.admin_prices_output()}</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="py-1 pr-2">
                  <input
                    aria-label={m.admin_prices_model()}
                    value={row.model}
                    onChange={(event) => update(row.key, { model: event.target.value })}
                    className={`${field} font-mono`}
                  />
                </td>
                {(["input", "cachedInput", "output"] as const).map((field) => (
                  <td key={field} className="px-1 py-1">
                    <input
                      aria-label={`${row.model} ${field}`}
                      inputMode="decimal"
                      value={row[field]}
                      placeholder={field === "cachedInput" ? "—" : "0"}
                      onChange={(event) =>
                        update(row.key, { [field]: event.target.value.replace(",", ".") })
                      }
                      className={cell}
                    />
                  </td>
                ))}
                <td className="py-1 pl-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={m.admin_prices_remove({ model: row.model })}
                    onClick={() =>
                      setRows((current) => current.filter((item) => item.key !== row.key))
                    }
                  >
                    <XIcon />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setRows((current) => [
              ...current,
              { key: `row-${rowId++}`, model: "", input: "", cachedInput: "", output: "" },
            ])
          }
        >
          <PlusIcon />
          {m.admin_prices_add()}
        </Button>
        <Button size="sm" disabled={!valid || save.isPending} onClick={submit}>
          {m.admin_save()}
        </Button>
      </div>
    </div>
  );
}

export function AiSettings() {
  const { data } = useQuery(settingsQuery);
  if (!data) return null;
  return (
    <Panel title={m.admin_ai_settings_title()}>
      <DailyLimit settings={data} />
      <div className="border-t border-white/8 pt-4">
        <PriceTable settings={data} />
      </div>
    </Panel>
  );
}
