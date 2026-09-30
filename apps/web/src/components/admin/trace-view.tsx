import { BrainIcon, CircleAlertIcon, KeyRoundIcon, UserIcon, WrenchIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Orb } from "@/components/assistant/orb";
import {
  formatCompact,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatUsd,
  purposeLabels,
  type TraceDetail,
} from "@/lib/admin";
import { m } from "@/paraglide/messages";
import { JsonView, Pill } from "./ui";

type Run = TraceDetail["run"];
type Step = Run["detail"] extends infer D
  ? D extends { steps: Array<infer S> }
    ? S
    : never
  : never;
type Thread = NonNullable<TraceDetail["thread"]>;
type Message = Thread["messages"][number];

const statusTone = { ok: "ok", error: "danger", aborted: "warn" } as const;
const statusLabels = {
  ok: m.admin_status_ok,
  error: m.admin_status_error,
  aborted: m.admin_status_aborted,
} as const;

export function StatusPill({ status }: { status: "ok" | "error" | "aborted" }) {
  return <Pill tone={statusTone[status]}>{statusLabels[status]()}</Pill>;
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-foreground/50 text-[11px]">{label}</span>
      <span className="text-[13px] font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/** Tek model çağrısının özeti: amaç, durum, model, süre, token dökümü, maliyet. */
export function RunSummary({ run, active = false }: { run: Run; active?: boolean }) {
  return (
    <div
      id={`run-${run.id}`}
      className={`grid gap-3 rounded-2xl border p-3.5 ${
        active ? "border-[#7ea7e6]/50 bg-[#7ea7e6]/[0.06]" : "border-white/8 bg-white/[0.02]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Pill tone="muted">{purposeLabels[run.purpose]?.() ?? run.purpose}</Pill>
        <StatusPill status={run.status} />
        {run.mode && (
          <Pill tone="info">{run.mode === "act" ? m.admin_mode_act() : m.admin_mode_ask()}</Pill>
        )}
        <code className="text-foreground/75 text-xs">{run.model}</code>
        <span className="text-foreground/50 ml-auto text-xs">{formatDateTime(run.createdAt)}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <Metric label={m.admin_metric_duration()} value={formatDuration(run.durationMs)} />
        <Metric label={m.admin_metric_steps()} value={formatNumber(run.steps)} />
        <Metric label={m.admin_metric_input()} value={formatCompact(run.inputTokens)} />
        <Metric label={m.admin_metric_cached()} value={formatCompact(run.cachedInputTokens)} />
        <Metric
          label={m.admin_metric_output()}
          value={
            <>
              {formatCompact(run.outputTokens)}
              {run.reasoningTokens > 0 && (
                <span className="text-foreground/50 ml-1 text-[11px] font-normal">
                  {m.admin_metric_reasoning_short({ count: formatCompact(run.reasoningTokens) })}
                </span>
              )}
            </>
          }
        />
        <Metric
          label={m.admin_metric_cost()}
          value={
            run.priced ? (
              formatUsd(run.cost)
            ) : (
              <span className="text-amber-200">{m.admin_unpriced()}</span>
            )
          }
        />
      </div>
      {run.error && (
        <div className="border-destructive/30 bg-destructive/[0.08] flex items-start gap-2 rounded-xl border px-3 py-2 text-[13px]">
          <CircleAlertIcon className="text-destructive mt-0.5 size-4 shrink-0" />
          <span className="font-mono break-words">{run.error}</span>
        </div>
      )}
      {run.detail && run.detail.steps.length > 0 && <StepTable steps={run.detail.steps} />}
    </div>
  );
}

const toolTone = { ok: "ok", error: "danger", denied: "warn", approval: "info" } as const;

/** Adım adım: model, süre, ilk çıktıya kadar geçen süre, token'lar, bitiş nedeni, araçlar, anahtar. */
export function StepTable({ steps }: { steps: Step[] }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="text-foreground/50">
          <tr className="border-b border-white/8">
            <th className="py-1.5 pr-2 font-semibold">#</th>
            <th className="py-1.5 pr-2 font-semibold">{m.admin_metric_duration()}</th>
            <th className="py-1.5 pr-2 font-semibold">{m.admin_metric_first_output()}</th>
            <th className="py-1.5 pr-2 text-right font-semibold">{m.admin_metric_input()}</th>
            <th className="py-1.5 pr-2 text-right font-semibold">{m.admin_metric_output()}</th>
            <th className="py-1.5 pr-2 font-semibold">{m.admin_metric_finish()}</th>
            <th className="py-1.5 font-semibold">{m.admin_metric_tools()}</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: adımların kendi kimliği yok, sıraları sabit
            <tr key={index} className="border-b border-white/5 align-top last:border-0">
              <td className="text-foreground/60 py-1.5 pr-2 tabular-nums">{index + 1}</td>
              <td className="py-1.5 pr-2 tabular-nums">{formatDuration(step.ms)}</td>
              <td className="py-1.5 pr-2 tabular-nums">
                {step.firstOutputMs !== undefined ? formatDuration(step.firstOutputMs) : "—"}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {formatNumber(step.inputTokens)}
                {step.cachedInputTokens > 0 && (
                  <span className="text-foreground/45 block">
                    {m.admin_metric_cached_short({ count: formatNumber(step.cachedInputTokens) })}
                  </span>
                )}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {formatNumber(step.outputTokens)}
                {step.reasoningTokens > 0 && (
                  <span className="text-foreground/45 block">
                    {m.admin_metric_reasoning_short({ count: formatNumber(step.reasoningTokens) })}
                  </span>
                )}
              </td>
              <td className="py-1.5 pr-2">
                <code>{step.finishReason}</code>
              </td>
              <td className="py-1.5">
                <div className="flex flex-wrap gap-1">
                  {step.tools.map((tool, toolIndex) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: aynı araç bir adımda iki kez çağrılabilir
                    <Pill key={toolIndex} tone={toolTone[tool.status]}>
                      {tool.name}
                      {tool.ms !== undefined && (
                        <span className="font-normal opacity-75">{formatDuration(tool.ms)}</span>
                      )}
                    </Pill>
                  ))}
                  {step.tools.length === 0 && <span className="text-foreground/40">—</span>}
                </div>
                {(step.key || step.failovers?.length) && (
                  <div className="text-foreground/55 mt-1 flex flex-wrap items-center gap-1.5">
                    <KeyRoundIcon className="size-3" />
                    {step.failovers?.map((failover) => (
                      <span key={`${failover.key}-${failover.model}`} className="text-amber-200">
                        {failover.key} ({failover.kind}) →
                      </span>
                    ))}
                    {step.key && <span className="font-mono">{step.key}</span>}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Sohbet ---

type Part = {
  type: string;
  text?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  toolName?: string;
  approval?: { id: string; approved?: boolean; reason?: string };
};

function toolNameOf(part: Part) {
  return part.type === "dynamic-tool" ? (part.toolName ?? "tool") : part.type.replace(/^tool-/, "");
}

const partStates: Record<string, () => string> = {
  "output-available": m.admin_part_done,
  "output-error": m.admin_part_error,
  "output-denied": m.admin_part_denied,
  "approval-requested": m.admin_part_waiting,
  "approval-responded": m.admin_part_responded,
  "input-available": m.admin_part_called,
};

function ToolPart({ part }: { part: Part }) {
  const tone =
    part.state === "output-error"
      ? "danger"
      : part.state === "output-denied"
        ? "warn"
        : part.state === "output-available"
          ? "ok"
          : "info";
  return (
    <div className="grid gap-2 rounded-xl border border-white/8 bg-white/[0.02] p-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <WrenchIcon className="text-foreground/55 size-3.5" />
        <code className="font-semibold">{toolNameOf(part)}</code>
        <Pill tone={tone}>{partStates[part.state ?? ""]?.() ?? part.state}</Pill>
        {part.approval && (
          <span className="text-foreground/55 text-xs">
            {part.approval.approved === true
              ? m.admin_part_approved()
              : part.approval.approved === false
                ? m.admin_part_rejected()
                : m.admin_part_pending()}
          </span>
        )}
      </div>
      {part.input !== undefined && <JsonView label={m.admin_part_input()} value={part.input} />}
      {part.output !== undefined && <JsonView label={m.admin_part_output()} value={part.output} />}
      {part.errorText && (
        <p className="text-destructive m-0 font-mono text-xs break-words">{part.errorText}</p>
      )}
    </div>
  );
}

function PartView({ part }: { part: Part }) {
  if (part.type === "text") {
    return <p className="m-0 text-sm leading-relaxed whitespace-pre-wrap">{part.text}</p>;
  }
  if (part.type === "reasoning") {
    return (
      <details className="text-foreground/65 rounded-xl bg-white/[0.03] px-3 py-2 text-xs">
        <summary className="flex cursor-pointer items-center gap-1.5 font-semibold select-none">
          <BrainIcon className="size-3.5" />
          {m.admin_part_reasoning()}
        </summary>
        <p className="m-0 mt-2 whitespace-pre-wrap">{part.text}</p>
      </details>
    );
  }
  if (part.type.startsWith("tool-") || part.type === "dynamic-tool")
    return <ToolPart part={part} />;
  return <JsonView label={part.type} value={part} />;
}

/** Parçaları adımlara böler (her adım `step-start` ile başlar). */
function stepsOf(parts: Part[]) {
  const segments: Part[][] = [];
  for (const part of parts) {
    if (part.type === "step-start") segments.push([]);
    else {
      if (segments.length === 0) segments.push([]);
      segments.at(-1)?.push(part);
    }
  }
  return segments.filter((segment) => segment.length > 0);
}

function UserMessage({ message }: { message: Message }) {
  const parts = (message.parts ?? []) as Part[];
  const meta = (message.metadata ?? {}) as {
    mode?: string;
    command?: string;
    page?: { type: string; slug?: string; id?: string; username?: string };
    mentions?: Array<{ type: string; label?: string }>;
  };
  return (
    <div className="grid justify-items-end gap-1.5">
      <div className="text-foreground/50 flex items-center gap-1.5 text-xs">
        <UserIcon className="size-3.5" />
        {formatDateTime(message.createdAt)}
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-white/[0.08] px-3.5 py-2.5">
        {parts.map((part, index) =>
          part.type === "text" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: mesaj parçalarının kimliği yok
            <p key={index} className="m-0 text-sm whitespace-pre-wrap">
              {part.text}
            </p>
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-1">
        {meta.mode && (
          <Pill tone="info">{meta.mode === "act" ? m.admin_mode_act() : m.admin_mode_ask()}</Pill>
        )}
        {meta.command && <Pill tone="muted">/{meta.command}</Pill>}
        {meta.page && (
          <Pill tone="muted">
            {m.admin_page_context({
              page: [meta.page.type, meta.page.slug ?? meta.page.username ?? ""]
                .filter(Boolean)
                .join(" · "),
            })}
          </Pill>
        )}
        {meta.mentions?.map((mention) => (
          <Pill key={`${mention.type}-${mention.label}`} tone="muted">
            @{mention.label ?? mention.type}
          </Pill>
        ))}
      </div>
    </div>
  );
}

function AssistantMessage({
  message,
  runs,
  activeRunId,
}: {
  message: Message;
  runs: Run[];
  activeRunId?: string;
}) {
  const segments = stepsOf((message.parts ?? []) as Part[]);
  const steps = runs.flatMap((run) => run.detail?.steps ?? []);
  const aligned = steps.length === segments.length;
  return (
    <div className="grid gap-2">
      <div className="text-foreground/50 flex items-center gap-1.5 text-xs">
        <Orb size={14} />
        {formatDateTime(message.createdAt)}
      </div>
      {runs.map((run) => (
        <RunSummary key={run.id} run={run} active={run.id === activeRunId} />
      ))}
      <div className="grid gap-2.5 border-l-2 border-white/8 pl-3.5">
        {segments.map((segment, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: adım sırası sabit
          <div key={index} className="grid gap-2">
            <div className="text-foreground/45 flex items-center gap-2 text-[11px] font-bold tracking-wide uppercase">
              {m.admin_step({ number: index + 1 })}
              {aligned && steps[index] && (
                <span className="font-normal tracking-normal normal-case">
                  {formatDuration(steps[index].ms)} · {formatNumber(steps[index].inputTokens)} →{" "}
                  {formatNumber(steps[index].outputTokens)}
                </span>
              )}
            </div>
            {segment.map((part, partIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: mesaj parçalarının kimliği yok
              <PartView key={partIndex} part={part} />
            ))}
          </div>
        ))}
        {segments.length === 0 && (
          <p className="text-foreground/50 m-0 text-sm italic">{m.admin_empty_message()}</p>
        )}
      </div>
    </div>
  );
}

/** Sohbetin tamamı: kullanıcı mesajları, asistan cevapları ve her cevabın çağrı ölçümleri. */
export function ThreadView({ thread, activeRunId }: { thread: Thread; activeRunId?: string }) {
  const linked = new Set(thread.messages.map((message) => message.id));
  const other = thread.runs.filter((run) => !run.messageId || !linked.has(run.messageId));
  return (
    <div className="grid gap-5">
      {thread.messages.map((message) =>
        message.role === "user" ? (
          <UserMessage key={message.id} message={message} />
        ) : (
          <AssistantMessage
            key={message.id}
            message={message}
            runs={thread.runs.filter((run) => run.messageId === message.id)}
            activeRunId={activeRunId}
          />
        ),
      )}
      {other.length > 0 && (
        <div className="grid gap-2 border-t border-white/8 pt-4">
          <h3 className="m-0 text-sm font-bold">{m.admin_other_runs()}</h3>
          <p className="text-foreground/55 m-0 text-xs">{m.admin_other_runs_hint()}</p>
          {other.map((run) => (
            <RunSummary key={run.id} run={run} active={run.id === activeRunId} />
          ))}
        </div>
      )}
    </div>
  );
}
