import { useQuery } from "@tanstack/react-query";
import { aiKeysQuery, formatNumber } from "@/lib/admin";
import { formatRelative } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { Panel, Pill } from "./ui";

/** Model zincirleri ve her anahtarın durumu (maskeli). Havuz bellekte tutulduğu için app sürecinin görüşü. */
export function AiKeys() {
  const { data } = useQuery(aiKeysQuery);
  if (!data) return null;
  const { status, today } = data;

  return (
    <Panel
      title={m.admin_ai_keys_title()}
      description={m.admin_ai_today({
        tokens: formatNumber(today.tokens),
        calls: today.calls,
        users: today.users,
      })}
    >
      {!status.enabled ? (
        <p className="text-foreground/60 m-0 text-sm">{m.admin_ai_disabled()}</p>
      ) : (
        <>
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
          {status.provider === "mock" ? (
            <p className="text-foreground/60 m-0 text-sm">{m.admin_ai_mock()}</p>
          ) : (
            <>
              <p className="text-foreground/65 m-0 text-xs">
                {m.admin_ai_strategy({ strategy: status.strategy })}
              </p>
              {status.pools.map((pool) => (
                <div key={pool.provider} className="grid gap-2">
                  <h3 className="m-0 text-sm font-bold">
                    {m.admin_ai_keys({ provider: pool.provider })}
                  </h3>
                  <ul className="m-0 grid list-none gap-1.5 p-0">
                    {pool.keys.map((key) => (
                      <li
                        key={key.label}
                        className="grid gap-1 rounded-2xl bg-white/[0.04] px-3 py-2.5 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[13px]">{key.label}</span>
                          <Pill
                            tone={
                              key.state === "ready"
                                ? "ok"
                                : key.state === "cooling"
                                  ? "warn"
                                  : "danger"
                            }
                          >
                            {key.state === "ready"
                              ? m.admin_ai_state_ready()
                              : key.state === "cooling"
                                ? m.admin_ai_state_cooling()
                                : m.admin_ai_state_disabled()}
                          </Pill>
                          {key.until && (
                            <span className="text-foreground/60 text-xs">
                              {m.admin_ai_until({ time: formatRelative(key.until) })}
                            </span>
                          )}
                          <span className="text-foreground/60 ml-auto text-xs tabular-nums">
                            {m.admin_ai_counts({ ok: key.ok, failed: key.failed })}
                          </span>
                        </div>
                        {key.lastError && (
                          <span className="text-foreground/55 truncate text-xs">
                            {m.admin_ai_last_error({ error: key.lastError })}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </Panel>
  );
}
