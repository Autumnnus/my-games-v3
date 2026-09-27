import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";
import * as z from "zod/mini";
import { FormField } from "@/components/auth-card";
import { NotificationSettings } from "@/components/notification-settings";
import { PsnCard, XboxCard } from "@/components/platform-cards";
import { SteamCard } from "@/components/steam-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, unwrap } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { errorMessage } from "@/lib/format";
import { compressImage, uploadTo } from "@/lib/image";
import { metaQuery } from "@/lib/meta";
import { useRefreshSession } from "@/lib/session";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/settings")({
  validateSearch: z.object({ error: z.optional(z.string()), linked: z.optional(z.string()) }),
  head: () => ({ meta: [{ title: `${m.settings_title()} · ${m.app_name()}` }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const refreshSession = useRefreshSession();
  const navigate = useNavigate();
  const meta = useQuery(metaQuery);
  const avatarInput = useRef<HTMLInputElement>(null);
  const [confirmName, setConfirmName] = useState("");

  const saveProfile = useMutation({
    mutationFn: async (values: { name: string; username: string; bio: string }) => {
      const { error } = await authClient.updateUser({
        name: values.name,
        bio: values.bio || null,
        ...(values.username !== user.displayUsername ? { username: values.username } : {}),
      } as Parameters<typeof authClient.updateUser>[0]);
      if (error) throw new Error(authErrorMessage(error));
    },
    onSuccess: async () => {
      toast.success(m.saved());
      await refreshSession();
    },
    onError: (error) => toast.error(error.message),
  });

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      const { blob } = await compressImage(file, 512, 0.85);
      const target = await unwrap(
        api.me.avatar.$post({ json: { contentType: blob.type, size: blob.size } }),
      );
      await uploadTo(target.upload, blob);
      const { error } = await authClient.updateUser({ image: target.url });
      if (error) throw new Error(authErrorMessage(error));
    },
    onSuccess: async () => {
      toast.success(m.saved());
      await refreshSession();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const deleteAccount = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.deleteUser({ callbackURL: "/" });
      if (error) throw new Error(authErrorMessage(error));
    },
    onSuccess: async () => {
      await refreshSession();
      await navigate({ to: "/" });
    },
    onError: (error) => toast.error(error.message),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    saveProfile.mutate({
      name: String(form.get("name")).trim(),
      username: String(form.get("username")).trim(),
      bio: String(form.get("bio") ?? "").trim(),
    });
  }

  return (
    <div className="grid max-w-2xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{m.settings_profile()}</CardTitle>
          <CardDescription>{m.settings_profile_description()}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="flex items-center gap-4">
            <Avatar className="size-16">
              {user.image && <AvatarImage src={user.image} alt="" />}
              <AvatarFallback className="text-xl">
                {user.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <input
              ref={avatarInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) uploadAvatar.mutate(file);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!meta.data?.features.uploads || uploadAvatar.isPending}
              onClick={() => avatarInput.current?.click()}
            >
              {m.field_avatar()}
            </Button>
          </div>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <FormField label={m.field_name()}>
              <Input name="name" defaultValue={user.name} required maxLength={64} />
            </FormField>
            <FormField label={m.field_username()} hint={m.field_username_hint()}>
              <Input
                name="username"
                defaultValue={user.displayUsername ?? ""}
                required
                minLength={3}
                maxLength={30}
                pattern="[A-Za-z0-9_.]+"
              />
            </FormField>
            <FormField label={m.field_bio()}>
              <Textarea name="bio" rows={3} maxLength={500} defaultValue={user.bio ?? ""} />
            </FormField>
            <FormField label={m.field_email()}>
              <Input
                value={user.email.endsWith(".placeholder.invalid") ? "—" : user.email}
                disabled
              />
            </FormField>
            <Button type="submit" className="w-fit" disabled={saveProfile.isPending}>
              {m.action_save()}
            </Button>
          </form>
        </CardContent>
      </Card>

      <SteamCard error={search.error} />
      <PsnCard />
      <XboxCard error={search.error} linked={search.linked} />

      <NotificationSettings />

      <Card>
        <CardHeader>
          <CardTitle>{m.settings_export()}</CardTitle>
          <CardDescription>{m.settings_export_description()}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <a href="/api/v1/me/export" download>
              {m.settings_export()}
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle>{m.settings_danger()}</CardTitle>
          <CardDescription>{m.settings_delete_confirm()}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input
            className="max-w-xs"
            value={confirmName}
            onChange={(event) => setConfirmName(event.target.value)}
            placeholder={user.displayUsername ?? ""}
          />
          <Button
            variant="destructive"
            disabled={confirmName !== user.displayUsername || deleteAccount.isPending}
            onClick={() => deleteAccount.mutate()}
          >
            {m.settings_delete_account()}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
