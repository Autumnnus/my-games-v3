import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, KeyRoundIcon, RefreshCwIcon, UnlinkIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { DateText, RelativeTime } from "@/components/time";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, SwitchField } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, unwrap } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { metaQuery } from "@/lib/meta";
import { platformsQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

type Provider = "psn" | "xbox";

const titles: Record<Provider, () => string> = { psn: m.psn_title, xbox: m.xbox_title };

const xboxErrors: Record<string, () => string> = {
  xbox_taken: m.xbox_error_xbox_taken,
  xbox_failed: m.xbox_error_xbox_failed,
  xbox_cancelled: m.xbox_error_xbox_cancelled,
};

export function xboxErrorMessage(code: string | undefined) {
  return code ? (xboxErrors[code]?.() ?? null) : null;
}

/** Bağlı bir platform hesabının durumu ve eylemleri (Steam kartıyla aynı düzen). */
function LinkedAccount({ provider }: { provider: Provider }) {
  const queryClient = useQueryClient();
  const platforms = useQuery(platformsQuery);
  const account = platforms.data?.accounts.find((row) => row.provider === provider);
  const refresh = () => queryClient.invalidateQueries({ queryKey: platformsQuery.queryKey });

  const sync = useMutation({
    mutationFn: () => unwrap(api.platforms[":provider"].sync.$post({ param: { provider } })),
    onSuccess: async () => {
      toast.success(m.platform_sync_queued());
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const toggle = useMutation({
    mutationFn: (syncEnabled: boolean) =>
      unwrap(api.platforms[":provider"].$patch({ param: { provider }, json: { syncEnabled } })),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const unlink = useMutation({
    mutationFn: () => unwrap(api.platforms[":provider"].$delete({ param: { provider } })),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!account) return null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Avatar className="size-10">
          {account.avatarUrl && <AvatarImage src={account.avatarUrl} alt="" />}
          <AvatarFallback>{titles[provider]().slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="grid flex-1 gap-0.5 text-sm">
          <span className="font-medium">
            {m.platform_linked_as({ name: account.displayName ?? account.externalId })}
          </span>
          <span className="text-muted-foreground text-xs">
            {account.lastSyncedAt ? (
              <>
                {m.platform_last_sync()} <RelativeTime value={account.lastSyncedAt} />
              </>
            ) : (
              m.platform_never_synced()
            )}
            {account.credentialsExpireAt && (
              <>
                {" · "}
                {m.platform_expires()} <DateText value={account.credentialsExpireAt} />
              </>
            )}
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={sync.isPending || account.needsReauth}
          onClick={() => sync.mutate()}
        >
          <RefreshCwIcon />
          {m.platform_sync_now()}
        </Button>
      </div>
      {account.needsReauth ? (
        <Alert variant="destructive">
          <AlertDescription>{m.platform_reauth()}</AlertDescription>
        </Alert>
      ) : (
        account.lastSyncError && (
          <Alert variant="destructive">
            <AlertDescription>
              {m.platform_error({ error: account.lastSyncError })}
            </AlertDescription>
          </Alert>
        )
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SwitchField
          className="min-w-60 flex-1"
          label={m.platform_auto_sync()}
          checked={account.syncEnabled}
          onCheckedChange={(value) => toggle.mutate(value)}
          disabled={toggle.isPending}
        />
        <Button
          size="sm"
          variant="ghost"
          disabled={unlink.isPending}
          onClick={() => {
            if (window.confirm(m.platform_unlink_confirm({ name: titles[provider]() }))) {
              unlink.mutate();
            }
          }}
        >
          <UnlinkIcon />
          {m.platform_unlink()}
        </Button>
      </div>
    </>
  );
}

export function PsnCard() {
  const meta = useQuery(metaQuery);
  const enabled = meta.data?.features.psn ?? false;
  const platforms = useQuery({ ...platformsQuery, enabled });
  const queryClient = useQueryClient();
  const account = platforms.data?.accounts.find((row) => row.provider === "psn");
  const [npsso, setNpsso] = useState("");

  const link = useMutation({
    mutationFn: (code: string) => unwrap(api.platforms.psn.$post({ json: { npsso: code } })),
    onSuccess: async () => {
      setNpsso("");
      toast.success(m.platform_linked_toast());
      await queryClient.invalidateQueries({ queryKey: platformsQuery.queryKey });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (npsso.trim()) link.mutate(npsso.trim());
  }

  const showForm = !account || account.needsReauth;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.psn_title()}</CardTitle>
        <CardDescription>{m.psn_description()}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!enabled ? (
          <p className="text-muted-foreground text-sm">{m.psn_disabled()}</p>
        ) : (
          <>
            <LinkedAccount provider="psn" />
            {showForm && (
              <form onSubmit={onSubmit} className="grid gap-3">
                <ol className="text-muted-foreground grid list-decimal gap-1 pl-5 text-sm">
                  <li>
                    <a
                      href="https://www.playstation.com"
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      {m.psn_step_1()}
                    </a>
                  </li>
                  <li>
                    {m.psn_step_2()}{" "}
                    <a
                      href="https://ca.account.sony.com/api/v1/ssocookie"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 underline"
                    >
                      ca.account.sony.com/api/v1/ssocookie
                      <ExternalLinkIcon className="size-3" />
                    </a>
                  </li>
                  <li>{m.psn_step_3()}</li>
                </ol>
                <FormField label={m.psn_npsso_label()}>
                  <Input
                    value={npsso}
                    onChange={(event) => setNpsso(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono"
                    leading={<KeyRoundIcon />}
                  />
                </FormField>
                <Button type="submit" className="w-fit" disabled={link.isPending || !npsso.trim()}>
                  {m.psn_link()}
                </Button>
              </form>
            )}
          </>
        )}
        <p className="text-muted-foreground text-xs">{m.psn_unofficial()}</p>
      </CardContent>
    </Card>
  );
}

export function XboxCard({ error, linked }: { error?: string; linked?: string }) {
  const meta = useQuery(metaQuery);
  // Microsoft dönüşünden sonra bir kez bilgi verilir.
  useEffect(() => {
    if (linked === "xbox") toast.success(m.platform_linked_toast());
  }, [linked]);
  const enabled = meta.data?.features.xbox ?? false;
  const platforms = useQuery({ ...platformsQuery, enabled });
  const account = platforms.data?.accounts.find((row) => row.provider === "xbox");
  const linkError = xboxErrorMessage(error);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.xbox_title()}</CardTitle>
        <CardDescription>{m.xbox_description()}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {linkError && (
          <Alert variant="destructive">
            <AlertDescription>{linkError}</AlertDescription>
          </Alert>
        )}
        {!enabled ? (
          <p className="text-muted-foreground text-sm">{m.xbox_disabled()}</p>
        ) : (
          <>
            <LinkedAccount provider="xbox" />
            {(!account || account.needsReauth) && (
              <Button asChild className="w-fit">
                {/* Tam sayfa yönlendirme: Microsoft girişinden sonra ayarlara geri döner. */}
                <a href="/api/v1/platforms/xbox/connect">{m.xbox_link()}</a>
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
