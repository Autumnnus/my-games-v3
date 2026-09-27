import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";
import { metaQuery } from "@/lib/meta";
import { startSteamSignIn } from "@/lib/steam";
import { m } from "@/paraglide/messages";

const providerLabels: Record<string, string> = { google: "Google", discord: "Discord" };

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
        {data.socialProviders.map((provider) => (
          <Button
            key={provider}
            variant="outline"
            disabled={pending !== null}
            onClick={() => void signIn(provider)}
          >
            {m.auth_continue_with({ provider: providerLabels[provider] ?? provider })}
          </Button>
        ))}
        {steam && (
          <Button
            variant="outline"
            disabled={pending !== null}
            onClick={() => {
              setPending("steam");
              void startSteamSignIn({ callbackURL }).catch(() => setPending(null));
            }}
          >
            {m.auth_continue_with({ provider: "Steam" })}
          </Button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs">{m.auth_or()}</span>
        <Separator className="flex-1" />
      </div>
    </>
  );
}
