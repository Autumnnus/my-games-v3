import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  FlagIcon,
  GaugeIcon,
  HardDriveIcon,
  type LucideIcon,
  MenuIcon,
  ScanSearchIcon,
  ScrollTextIcon,
  ServerIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { overviewQuery } from "@/lib/admin";
import { avatarThumb } from "@/lib/media/urls";
import type { CurrentUser } from "@/lib/session";
import { m } from "@/paraglide/messages";

type NavItem = {
  to:
    | "/admin"
    | "/admin/users"
    | "/admin/ai"
    | "/admin/ai/traces"
    | "/admin/storage"
    | "/admin/reports"
    | "/admin/system"
    | "/admin/logs"
    | "/admin/audit";
  label: () => string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: "reports" | "errors";
};

const groups: Array<{ label: () => string; items: NavItem[] }> = [
  {
    label: m.admin_nav_group_manage,
    items: [
      { to: "/admin", label: m.admin_nav_overview, icon: GaugeIcon, exact: true },
      { to: "/admin/users", label: m.admin_nav_users, icon: UsersIcon },
      { to: "/admin/reports", label: m.admin_nav_reports, icon: FlagIcon, badge: "reports" },
      { to: "/admin/storage", label: m.admin_nav_storage, icon: HardDriveIcon },
    ],
  },
  {
    label: m.admin_nav_group_ai,
    items: [
      { to: "/admin/ai", label: m.admin_nav_ai, icon: SparklesIcon, exact: true },
      { to: "/admin/ai/traces", label: m.admin_nav_traces, icon: ScanSearchIcon },
    ],
  },
  {
    label: m.admin_nav_group_system,
    items: [
      { to: "/admin/system", label: m.admin_nav_system, icon: ServerIcon },
      { to: "/admin/logs", label: m.admin_nav_logs, icon: ScrollTextIcon, badge: "errors" },
      { to: "/admin/audit", label: m.admin_nav_audit, icon: ShieldCheckIcon },
    ],
  },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <span className="flex size-8 items-center justify-center rounded-[9px] bg-amber-300 text-[#1a1406]">
        <ShieldCheckIcon className="size-[18px]" strokeWidth={2.4} />
      </span>
      <span className="grid leading-tight">
        <span className="font-display text-[15px] font-medium">{m.app_name()}</span>
        <span className="text-[11px] font-bold tracking-[0.14em] text-amber-300/90 uppercase">
          {m.admin_brand()}
        </span>
      </span>
    </div>
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const overview = useQuery(overviewQuery);
  const badges = {
    reports: overview.data?.kpi.openReports ?? 0,
    errors: overview.data?.logs.errors ?? 0,
  };
  return (
    <nav aria-label={m.admin_brand()} className="grid gap-5">
      {groups.map((group) => (
        <div key={group.label()} className="grid gap-0.5">
          <p className="text-foreground/45 m-0 px-3 pb-1 text-[11px] font-bold tracking-[0.12em] uppercase">
            {group.label()}
          </p>
          {group.items.map((item) => {
            const count = item.badge ? badges[item.badge] : 0;
            return (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact ?? false }}
                onClick={onNavigate}
                className="text-foreground/75 hover:text-foreground flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors hover:bg-white/6 data-[status=active]:bg-white/10 data-[status=active]:font-bold data-[status=active]:text-foreground"
              >
                <item.icon className="size-[18px] shrink-0" />
                <span className="flex-1 truncate">{item.label()}</span>
                {count > 0 && (
                  <span
                    className={`min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-bold tabular-nums ${
                      item.badge === "errors"
                        ? "bg-destructive/20 text-destructive"
                        : "bg-amber-300/20 text-amber-200"
                    }`}
                  >
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Footer({ user }: { user: CurrentUser }) {
  return (
    <div className="grid gap-2 border-t border-white/8 pt-3">
      <Link
        to="/"
        className="text-foreground/70 hover:text-foreground flex h-9 items-center gap-2.5 rounded-xl px-3 text-sm transition-colors hover:bg-white/6"
      >
        <ArrowLeftIcon className="size-4" />
        {m.admin_back_to_site()}
      </Link>
      <div className="flex items-center gap-2.5 px-3 py-1">
        <Avatar className="size-7">
          {user.image && <AvatarImage src={avatarThumb(user.image)} alt="" />}
          <AvatarFallback className="text-xs">{user.name.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="grid min-w-0 leading-tight">
          <span className="truncate text-[13px] font-semibold">{user.name}</span>
          <span className="text-foreground/55 truncate text-xs">@{user.displayUsername}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Yönetim bölümünün kabuğu: sitenin başlığı/sekme çubuğu yerine kendi menüsü. Üstteki ince amber şerit
 * yönetim ekranında olunduğunu her an hatırlatır.
 */
export function AdminShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // Sayfa değişince çekmece kapanır (geri tuşu dahil).
  // biome-ignore lint/correctness/useExhaustiveDependencies: yalnızca yol değişiminde çalışmalı
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-dvh">
      <div
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-50 h-[3px] bg-gradient-to-r from-amber-300 via-amber-400/70 to-amber-300/20"
      />
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[240px] flex-col gap-6 border-r border-white/8 bg-[#0e0f14] px-3 pt-6 pb-4 lg:flex">
        <Brand />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Nav />
        </div>
        <Footer user={user} />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/8 bg-[#0e0f14]/90 px-4 backdrop-blur lg:hidden">
        <Brand />
        <Button
          variant="ghost"
          size="icon"
          aria-label={m.admin_menu()}
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <MenuIcon />
        </Button>
      </header>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="flex w-[280px] flex-col gap-6 bg-[#0e0f14] px-3 pt-6 pb-4"
        >
          <SheetTitle className="sr-only">{m.admin_menu()}</SheetTitle>
          <Brand />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Nav onNavigate={() => setOpen(false)} />
          </div>
          <Footer user={user} />
        </SheetContent>
      </Sheet>

      <main className="min-w-0 px-4 pt-6 pb-24 sm:px-6 lg:ml-[240px] lg:px-10 lg:pt-10">
        <div className="mx-auto grid w-full max-w-6xl gap-6">{children}</div>
      </main>
    </div>
  );
}

/** Sayfa başlığı: başlık, kısa açıklama ve sağda işlemler. */
export function AdminHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="grid min-w-0 gap-1.5">
        {eyebrow && <div className="text-foreground/60 text-sm">{eyebrow}</div>}
        <h1 className="font-display m-0 text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description && <p className="text-foreground/65 m-0 max-w-2xl text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
