import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminHeader } from "@/components/admin/shell";
import { Empty, JsonView, Panel, Pill } from "@/components/admin/ui";
import { RelativeTime } from "@/components/time";
import { Button } from "@/components/ui/button";
import { type AuditRow, auditLabel, auditQuery, formatDateTime } from "@/lib/admin";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/admin/audit")({
  component: AuditPage,
});

const destructive = new Set(["user.delete", "user.purge", "user.ban", "role.grant", "role.revoke"]);

function Target({ row }: { row: AuditRow }) {
  if (!row.targetId) return null;
  const label = row.targetLabel ?? row.targetId;
  if (row.targetType === "user" && row.action !== "user.delete") {
    return (
      <Link
        to="/admin/users/$id"
        params={{ id: row.targetId }}
        className="font-semibold hover:underline"
      >
        {label}
      </Link>
    );
  }
  if (row.targetType === "thread") {
    return (
      <Link
        to="/admin/ai/threads/$id"
        params={{ id: row.targetId }}
        className="font-semibold hover:underline"
      >
        {label}
      </Link>
    );
  }
  return <span className="font-semibold">{label}</span>;
}

function AuditPage() {
  const query = useInfiniteQuery(auditQuery);
  const rows = query.data?.pages.flatMap((page) => page.entries) ?? [];
  return (
    <>
      <AdminHeader title={m.admin_nav_audit()} description={m.admin_audit_description()} />
      <Panel>
        {query.isPending ? (
          <div className="grid gap-2">
            {["a", "b", "c"].map((key) => (
              <div key={key} className="h-12 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Empty>{m.admin_audit_empty()}</Empty>
        ) : (
          <>
            <ul className="m-0 grid list-none p-0">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="grid gap-1.5 border-b border-white/6 py-3 last:border-0"
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Pill tone={destructive.has(row.action) ? "danger" : "muted"}>
                      {auditLabel(row.action)}
                    </Pill>
                    <Target row={row} />
                    <span className="text-foreground/55 text-xs">
                      {m.admin_audit_by({ name: row.adminName })}
                      {row.ip ? ` · ${row.ip}` : ""}
                    </span>
                    <RelativeTime
                      value={row.createdAt}
                      className="text-foreground/50 ml-auto text-xs"
                    />
                  </div>
                  {row.details && Object.keys(row.details).length > 0 && (
                    <JsonView
                      label={`${m.admin_audit_details()} · ${formatDateTime(row.createdAt)}`}
                      value={row.details}
                    />
                  )}
                </li>
              ))}
            </ul>
            {query.hasNextPage && (
              <Button
                variant="outline"
                size="sm"
                className="w-fit justify-self-center"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {m.admin_load_more()}
              </Button>
            )}
          </>
        )}
      </Panel>
    </>
  );
}
