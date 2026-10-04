import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ComponentType, type SVGProps, useState } from "react";
import { DiscordIcon, GoogleIcon, SteamIcon } from "@/components/brand-icons";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";
import { metaQuery } from "@/lib/meta";
import { startSteamSignIn } from "@/lib/steam";
import { m } from "@/paraglide/messages";

const providers: Record<string, { label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }> = {
  google: { label: "Google", Icon: GoogleIcon },
  discord: { label: "Discord", Icon: DiscordIcon },
};

export function SocialButtons({ callbackURL }: { callbackURL: string }) {
  const { data } = useSuspenseQuery(metaQuery);
  const [pending, setPending] = useState<string | null>(null);

  const steam = data.features.steam;
  if (data.socialProviders.length === 0 && !steam) return null;

  async function signIn(provider: (typeof data.socialProviders)[number]) {
    setPending(provider);
    await authClient.signIn.social({ provider, callbackURL });
    setPending(null);
  }

  return (
    <>
      <div className="grid gap-2">
        {data.socialProviders.map((provider) => {
          const Icon = providers[provider]?.Icon;
          return (
            <Button
              key={provider}
              variant="outline"
              disabled={pending !== null}
              onClick={() => void signIn(provider)}
            >
              {Icon && <Icon />}
              {m.auth_continue_with({ provider: providers[provider]?.label ?? provider })}
            </Button>
          );
        })}
        {steam && (
          <Button
            variant="outline"
            disabled={pending !== null}
            onClick={() => {
              setPending("steam");
              void startSteamSignIn({ callbackURL }).catch(() => setPending(null));
            }}
          >
            <SteamIcon />
            {m.auth_continue_with({ provider: "Steam" })}
          </Button>
        )}
        {/* Sosyal girişte kayıt formu yok; hesap ilk girişte açıldığı için şartlar burada bildirilir. */}
        <p className="text-muted-foreground text-xs leading-relaxed">
          <LegalLinks
            before={m.auth_social_consent_before()}
            after={m.auth_social_consent_after()}
          />
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs">{m.auth_or()}</span>
        <Separator className="flex-1" />
      </div>
    </>
  );
}

/** "… Kullanım Şartları ile Gizlilik Politikası …" cümlesi; iki bağlantı yeni sekmede açılır (form kaybolmasın). */
export function LegalLinks({ before, after }: { before: string; after: string }) {
  const link = "text-foreground underline underline-offset-4";
  return (
    <>
      {before}
      <Link to="/terms" target="_blank" className={link}>
        {m.legal_terms()}
      </Link>
      {m.legal_and()}
      <Link to="/privacy" target="_blank" className={link}>
        {m.legal_privacy()}
      </Link>
      {after}
    </>
  );
}
