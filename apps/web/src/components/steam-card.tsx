import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCwIcon, UnlinkIcon } from "lucide-react";
import { toast } from "sonner";
import { RelativeTime } from "@/components/time";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SwitchField } from "@/components/ui/field";
import { api, unwrap } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { metaQuery } from "@/lib/meta";
import { steamQuery } from "@/lib/queries";
import { startSteamSignIn, steamErrorMessage } from "@/lib/steam";
import { m } from "@/paraglide/messages";

export function SteamCard({ error }: { error?: string }) {
  const meta = useQuery(metaQuery);
  const enabled = meta.data?.features.steam ?? false;
  const steam = useQuery({ ...steamQuery, enabled });
  const queryClient = useQueryClient();
  const account = steam.data?.account;

  const refresh = () => queryClient.invalidateQueries({ queryKey: steamQuery.queryKey });

  const sync = useMutation({
    mutationFn: () => unwrap(api.steam.sync.$post()),
    onSuccess: async () => {
      toast.success(m.steam_sync_queued());
      await refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const toggle = useMutation({
    mutationFn: (syncEnabled: boolean) => unwrap(api.steam.$patch({ json: { syncEnabled } })),
    onSuccess: refresh,
    onError: (err) => toast.error(errorMessage(err)),
  });
  const unlink = useMutation({
    mutationFn: () => unwrap(api.steam.$delete()),
    onSuccess: refresh,
    onError: (err) => toast.error(errorMessage(err)),
  });
  const link = useMutation({
    mutationFn: () => startSteamSignIn({ callbackURL: "/settings", link: true }),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const linkError = steamErrorMessage(error);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.steam_title()}</CardTitle>
        <CardDescription>{m.steam_description()}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {linkError && (
          <Alert variant="destructive">
            <AlertDescription>{linkError}</AlertDescription>
          </Alert>
        )}
        {!enabled ? (
          <p className="text-muted-foreground text-sm">{m.steam_disabled()}</p>
        ) : account ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Avatar className="size-10">
                {account.avatarUrl && <AvatarImage src={account.avatarUrl} alt="" />}
                <AvatarFallback>S</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 gap-0.5 text-sm">
                <a
                  href={
                    account.profileUrl ?? `https://steamcommunity.com/profiles/${account.steamId}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium hover:underline"
                >
                  {m.steam_linked_as({ name: account.personaName ?? account.steamId })}
                </a>
                <span className="text-muted-foreground text-xs">
                  {account.lastSyncedAt ? (
                    <>
                      {m.steam_last_sync({ time: "" })}
                      <RelativeTime value={account.lastSyncedAt} />
                    </>
                  ) : (
                    m.steam_never_synced()
                  )}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={sync.isPending}
                onClick={() => sync.mutate()}
              >
                <RefreshCwIcon />
                {m.steam_sync_now()}
              </Button>
            </div>
            {account.lastSyncError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {account.lastSyncError === "private"
                    ? m.steam_error_private()
                    : m.steam_error_generic({ error: account.lastSyncError })}
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SwitchField
                className="min-w-60 flex-1"
                label={m.steam_enabled()}
                checked={account.syncEnabled}
                onCheckedChange={(value) => toggle.mutate(value)}
                disabled={toggle.isPending}
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={unlink.isPending}
                onClick={() => {
                  if (window.confirm(m.steam_unlink_confirm())) unlink.mutate();
                }}
              >
                <UnlinkIcon />
                {m.steam_unlink()}
              </Button>
            </div>
          </>
        ) : (
          <Button className="w-fit" disabled={link.isPending} onClick={() => link.mutate()}>
            {m.steam_link()}
          </Button>
        )}
        <p className="text-muted-foreground text-xs">{m.steam_attribution()}</p>
      </CardContent>
    </Card>
  );
}
