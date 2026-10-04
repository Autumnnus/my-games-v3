import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { CheckIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useAddGame } from "@/components/add-game";
import { SteamIcon } from "@/components/brand-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { errorMessage } from "@/lib/format";
import { metaQuery } from "@/lib/meta";
import { platformsQuery, steamQuery } from "@/lib/queries";
import { startSteamSignIn } from "@/lib/steam";
import { m } from "@/paraglide/messages";

/**
 * Yeni üyenin ilk ekranı: oyunlarını nereden getireceğini seçer. Başlangıç listesindeki "Platform bağla"
 * adımı da aynı seçenekleri (`mode="platforms"`, elle ekleme olmadan) açar.
 */
export function WelcomeDialog({
  mode,
  onClose,
  onChoose,
}: {
  mode: "welcome" | "platforms";
  onClose: () => void;
  /** Bir seçenek seçildi: hoş geldin "görüldü" sayılır (yönlendirmeden önce beklenir). */
  onChoose: () => Promise<unknown>;
}) {
  const { user } = useRouteContext({ from: "__root__" });
  const navigate = useNavigate();
  const addGame = useAddGame();
  const meta = useQuery(metaQuery);
  const features = meta.data?.features;
  const steam = useQuery({ ...steamQuery, enabled: !!features?.steam });
  const platforms = useQuery({ ...platformsQuery, enabled: !!(features?.psn || features?.xbox) });
  const linked = (provider: string) =>
    !!platforms.data?.accounts.some((account) => account.provider === provider);
  const steamLinked = !!steam.data?.account;

  const connectSteam = useMutation({
    mutationFn: async () => {
      await onChoose();
      await startSteamSignIn({ callbackURL: "/", link: true });
    },
    meta: { errorToast: false },
  });

  async function go(action: () => void) {
    await onChoose().catch(() => {});
    onClose();
    action();
  }

  const firstName = (user?.name ?? "").split(/\s+/)[0] ?? "";
  const welcome = mode === "welcome";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-semibold tracking-tight">
            {welcome
              ? m.onboarding_welcome_title({ name: firstName })
              : m.onboarding_platforms_title()}
          </DialogTitle>
          <DialogDescription className="text-foreground/75 text-[15px]">
            {welcome ? m.onboarding_welcome_body() : m.onboarding_platforms_body()}
          </DialogDescription>
        </DialogHeader>

        {steamLinked && welcome && (
          <div className="grid gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/8 p-3.5 text-sm">
            <p className="m-0">{m.onboarding_steam_linked()}</p>
            <Button
              size="sm"
              className="justify-self-start"
              onClick={() => go(() => navigate({ to: "/inbox" }))}
            >
              {m.onboarding_open_inbox()}
            </Button>
          </div>
        )}

        <div className="grid gap-2">
          {features?.steam && (
            <Choice
              icon={
                <span className="flex size-full items-center justify-center rounded-full bg-[#1b2838]">
                  <SteamIcon className="size-5" />
                </span>
              }
              title="Steam"
              sub={m.onboarding_steam_sub()}
              badge={!steamLinked ? m.onboarding_recommended() : undefined}
              done={steamLinked}
              busy={connectSteam.isPending}
              onClick={() =>
                steamLinked
                  ? go(() => navigate({ to: "/settings", search: { focus: "steam" } }))
                  : connectSteam.mutate()
              }
            />
          )}
          {features?.psn && (
            <Choice
              icon={<Monogram color="#0070d1">PS</Monogram>}
              title="PlayStation"
              sub={m.onboarding_psn_sub()}
              done={linked("psn")}
              onClick={() => go(() => navigate({ to: "/settings", search: { focus: "psn" } }))}
            />
          )}
          {features?.xbox && (
            <Choice
              icon={<Monogram color="#107c10">X</Monogram>}
              title="Xbox"
              sub={m.onboarding_xbox_sub()}
              done={linked("xbox")}
              onClick={() =>
                go(() => {
                  if (linked("xbox")) void navigate({ to: "/settings", search: { focus: "xbox" } });
                  else window.location.href = "/api/v1/platforms/xbox/connect";
                })
              }
            />
          )}
          {welcome && (
            <Choice
              icon={
                <span className="flex size-full items-center justify-center rounded-full bg-white/10">
                  <PlusIcon className="size-5" />
                </span>
              }
              title={m.onboarding_manual()}
              sub={m.onboarding_manual_sub()}
              onClick={() => go(() => addGame.open())}
            />
          )}
        </div>
        {connectSteam.error && (
          <p className="text-destructive m-0 text-sm">{errorMessage(connectSteam.error)}</p>
        )}

        <Button variant="ghost" className="justify-self-center" onClick={onClose}>
          {m.onboarding_skip()}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function Monogram({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      className="flex size-full items-center justify-center rounded-full text-[13px] font-extrabold text-white"
      style={{ background: color }}
    >
      {children}
    </span>
  );
}

function Choice(props: {
  icon: ReactNode;
  title: string;
  sub: string;
  badge?: string;
  done?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.busy}
      onClick={props.onClick}
      className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/4 p-3 text-left transition-colors hover:border-white/20 hover:bg-white/8 disabled:opacity-60"
    >
      <span className="size-10 shrink-0">{props.icon}</span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex items-center gap-2 font-bold">
          {props.title}
          {props.badge && <Badge variant="secondary">{props.badge}</Badge>}
        </span>
        <span className="text-foreground/65 text-[13px]">{props.sub}</span>
      </span>
      {props.done ? (
        <span className="flex items-center gap-1 text-xs font-bold text-emerald-300">
          <CheckIcon className="size-4" />
          {m.onboarding_linked()}
        </span>
      ) : (
        <ChevronRightIcon className="text-foreground/50 group-hover:text-foreground size-5 shrink-0" />
      )}
    </button>
  );
}
