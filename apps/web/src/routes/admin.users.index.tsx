import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import * as z from "zod/mini";
import { AdminHeader } from "@/components/admin/shell";
import { Empty, Panel, Person, Pill, Segmented } from "@/components/admin/ui";
import { RelativeTime } from "@/components/time";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type AdminUserRow, formatCompact, formatNumber, formatUsd, usersQuery } from "@/lib/admin";
import { formatBytes, formatDate } from "@/lib/format";
import { m } from "@/paraglide/messages";

const filters = ["all", "admins", "banned", "unverified"] as const;
const sorts = ["newest", "oldest", "active", "entries", "storage"] as const;

export const Route = createFileRoute("/admin/users/")({
  validateSearch: z.object({
    q: z.optional(z.string()),
    filter: z.optional(z.enum(filters)),
    sort: z.optional(z.enum(sorts)),
    page: z.optional(z.number()),
  }),
  component: UsersPage,
});

const filterLabels = {
  all: m.admin_filter_all,
  admins: m.admin_filter_admins,
  banned: m.admin_filter_banned,
  unverified: m.admin_filter_unverified,
};
const sortLabels = {
  newest: m.admin_sort_newest,
  oldest: m.admin_sort_oldest,
  active: m.admin_sort_active,
  entries: m.admin_sort_entries,
  storage: m.admin_sort_storage,
};

function Badges({ user }: { user: AdminUserRow }) {
  return (
    <>
      {user.role === "admin" && <Pill tone="info">{m.admin_badge_admin()}</Pill>}
      {user.banned && <Pill tone="danger">{m.admin_badge_banned()}</Pill>}
      {!user.emailVerified && <Pill tone="warn">{m.admin_badge_unverified()}</Pill>}
    </>
  );
}

function UsersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [q, setQ] = useState(search.q ?? "");
  const { data, isPending, isPlaceholderData } = useQuery(usersQuery(search));

  // Yazarken her tuşta istek atılmaz; 300 ms sessizlikten sonra adres (ve sorgu) güncellenir.
  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed === (search.q ?? "")) return;
    const timer = setTimeout(
      () =>
        void navigate({
          search: (prev) => ({ ...prev, q: trimmed || undefined, page: undefined }),
          replace: true,
        }),
      300,
    );
    return () => clearTimeout(timer);
  }, [q, search.q, navigate]);

  const page = data?.page ?? 1;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const from = data && data.total > 0 ? (page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.total, page * data.pageSize) : 0;

  return (
    <>
      <AdminHeader
        title={m.admin_nav_users()}
        description={m.admin_users_description({ count: formatNumber(data?.total ?? 0) })}
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-foreground/70 flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-full bg-white/6 px-4 sm:max-w-sm">
          <SearchIcon className="size-4 shrink-0" />
          <span className="sr-only">{m.admin_users_search()}</span>
          <input
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={m.admin_users_search()}
            className="text-foreground placeholder:text-foreground/50 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <Segmented
          label={m.admin_users_filter()}
          value={search.filter ?? "all"}
          options={filters.map((value) => ({ value, label: filterLabels[value]() }))}
          onChange={(value) =>
            void navigate({
              search: (prev) => ({
                ...prev,
                filter: value === "all" ? undefined : value,
                page: undefined,
              }),
            })
          }
        />
        <Select
          value={search.sort ?? "newest"}
          onValueChange={(value) =>
            void navigate({
              search: (prev) => ({
                ...prev,
                sort: value === "newest" ? undefined : (value as (typeof sorts)[number]),
                page: undefined,
              }),
            })
          }
        >
          <SelectTrigger className="h-10 w-[190px] rounded-full" aria-label={m.admin_users_sort()}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sorts.map((value) => (
              <SelectItem key={value} value={value}>
                {sortLabels[value]()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Panel className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
        {isPending ? (
          <div className="grid gap-2">
            {["a", "b", "c", "d", "e"].map((key) => (
              <div key={key} className="h-12 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : !data || data.users.length === 0 ? (
          <Empty>{m.admin_users_empty()}</Empty>
        ) : (
          <>
            {/* Geniş ekran: tablo */}
            <div className="-mx-2 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="text-foreground/55 text-xs">
                  <tr className="border-b border-white/8">
                    <th className="px-2 py-2 font-semibold">{m.admin_col_user()}</th>
                    <th className="px-2 py-2 font-semibold">{m.admin_col_email()}</th>
                    <th className="px-2 py-2 font-semibold">{m.admin_col_joined()}</th>
                    <th className="px-2 py-2 font-semibold">{m.admin_col_seen()}</th>
                    <th className="px-2 py-2 text-right font-semibold">{m.admin_col_entries()}</th>
                    <th className="px-2 py-2 text-right font-semibold">{m.admin_col_storage()}</th>
                    <th className="px-2 py-2 text-right font-semibold">{m.admin_col_ai()}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-white/6 last:border-0 hover:bg-white/[0.03]"
                    >
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2">
                          <Person user={row} />
                          <Badges user={row} />
                        </div>
                      </td>
                      <td className="text-foreground/75 max-w-[220px] truncate px-2 py-2.5">
                        {row.email}
                      </td>
                      <td className="text-foreground/65 px-2 py-2.5 whitespace-nowrap">
                        {formatDate(row.createdAt)}
                      </td>
                      <td className="text-foreground/65 px-2 py-2.5 whitespace-nowrap">
                        {row.lastSeenAt ? <RelativeTime value={row.lastSeenAt} /> : "—"}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {formatNumber(row.entries)}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {row.storageBytes > 0 ? formatBytes(row.storageBytes) : "—"}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                        {row.aiTokens30d > 0 ? (
                          <>
                            {formatUsd(row.aiCost30d)}
                            <span className="text-foreground/50 ml-1.5 text-xs">
                              {formatCompact(row.aiTokens30d)}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Telefon: kartlar */}
            <ul className="m-0 grid list-none gap-2 p-0 md:hidden">
              {data.users.map((row) => (
                <li key={row.id} className="grid gap-2 rounded-2xl bg-white/[0.04] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Person user={row} />
                    <span className="flex flex-wrap justify-end gap-1">
                      <Badges user={row} />
                    </span>
                  </div>
                  <div className="text-foreground/60 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span className="truncate">{row.email}</span>
                    <span>{m.admin_card_entries({ count: formatNumber(row.entries) })}</span>
                    {row.storageBytes > 0 && <span>{formatBytes(row.storageBytes)}</span>}
                    {row.aiTokens30d > 0 && <span>AI {formatUsd(row.aiCost30d)}</span>}
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-3 text-sm">
              <span className="text-foreground/60 tabular-nums">
                {m.admin_range_of({ from, to, total: formatNumber(data.total) })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() =>
                    void navigate({
                      search: (prev) => ({ ...prev, page: page - 1 > 1 ? page - 1 : undefined }),
                    })
                  }
                >
                  <ChevronLeftIcon />
                  {m.admin_prev()}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => void navigate({ search: (prev) => ({ ...prev, page: page + 1 }) })}
                >
                  {m.admin_next()}
                  <ChevronRightIcon />
                </Button>
              </div>
            </div>
          </>
        )}
      </Panel>
    </>
  );
}
