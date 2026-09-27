import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { api, unwrap } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { metaQuery } from "@/lib/meta";
import { notificationPrefsQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

const typeLabels = {
  reaction: m.notification_type_reaction,
  comment: m.notification_type_comment,
  reply: m.notification_type_reply,
  mention: m.notification_type_mention,
  proposals: m.notification_type_proposals,
  system: m.notification_type_system,
} as const;

function base64ToUint8(base64: string) {
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

/** Bu cihazda Web Push aboneliği. Service worker `/sw.js` kök yolda kayıtlıdır. */
function PushToggle() {
  const meta = useQuery(metaQuery);
  const [state, setState] = useState<"loading" | "unsupported" | "denied" | "off" | "on">(
    "loading",
  );

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setState(subscription ? "on" : "off"));
  }, []);

  const toggle = useMutation({
    mutationFn: async (enable: boolean) => {
      const registration = await navigator.serviceWorker.ready;
      if (!enable) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await unwrap(api.push.subscribe.$delete({ json: { endpoint: subscription.endpoint } }));
          await subscription.unsubscribe();
        }
        return "off" as const;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return "denied" as const;
      const { publicKey } = await unwrap(api.push.key.$get());
      if (!publicKey) throw new Error(m.push_disabled());
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8(publicKey),
      });
      const json = subscription.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      await unwrap(api.push.subscribe.$post({ json }));
      return "on" as const;
    },
    onSuccess: (next) => {
      setState(next);
      if (next === "on") toast.success(m.push_enabled());
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (meta.data && !meta.data.features.push) {
    return <p className="text-muted-foreground text-sm">{m.push_disabled()}</p>;
  }
  if (state === "unsupported")
    return <p className="text-muted-foreground text-sm">{m.push_unsupported()}</p>;
  if (state === "denied") return <p className="text-muted-foreground text-sm">{m.push_denied()}</p>;
  return (
    <Button
      variant="outline"
      className="w-fit"
      disabled={state === "loading" || toggle.isPending}
      onClick={() => toggle.mutate(state !== "on")}
    >
      {state === "on" ? m.push_disable() : m.push_enable()}
    </Button>
  );
}

export function NotificationSettings() {
  const queryClient = useQueryClient();
  const { data } = useQuery(notificationPrefsQuery);
  const update = useMutation({
    mutationFn: (value: { type: keyof typeof typeLabels; inApp: boolean; push: boolean }) =>
      unwrap(api.notifications.preferences.$put({ json: value })),
    onSuccess: (result) => queryClient.setQueryData(notificationPrefsQuery.queryKey, result),
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.notification_prefs_title()}</CardTitle>
        <CardDescription>{m.notification_prefs_description()}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 gap-y-3 text-sm">
          <span />
          <span className="text-muted-foreground text-xs">{m.pref_in_app()}</span>
          <span className="text-muted-foreground text-xs">{m.pref_push()}</span>
          {data?.preferences.map((pref) => (
            <div key={pref.type} className="contents">
              <span>{typeLabels[pref.type]()}</span>
              <Switch
                checked={pref.inApp}
                onCheckedChange={(inApp) =>
                  update.mutate({ type: pref.type, inApp, push: pref.push })
                }
                aria-label={`${typeLabels[pref.type]()} ${m.pref_in_app()}`}
              />
              <Switch
                checked={pref.push}
                onCheckedChange={(push) =>
                  update.mutate({ type: pref.type, inApp: pref.inApp, push })
                }
                aria-label={`${typeLabels[pref.type]()} ${m.pref_push()}`}
              />
            </div>
          ))}
        </div>
        <div className="grid gap-2 border-t pt-4">
          <div className="text-sm font-medium">{m.push_title()}</div>
          <p className="text-muted-foreground text-xs">{m.push_description()}</p>
          <PushToggle />
        </div>
      </CardContent>
    </Card>
  );
}
