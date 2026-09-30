import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useRef } from "react";
import { toast } from "sonner";
import * as z from "zod/mini";
import { FormField } from "@/components/auth-card";
import { LanguagePicker } from "@/components/language-picker";
import { NotificationSettings } from "@/components/notification-settings";
import { PsnCard, XboxCard } from "@/components/platform-cards";
import { SteamCard } from "@/components/steam-card";
import { StorageMeter } from "@/components/storage-meter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QualityPicker } from "@/components/upload-quality";
import { api, unwrap } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { errorMessage, formatBytes } from "@/lib/format";
import { encodeImage } from "@/lib/media/encoder";
import {
  describeVariants,
  putObject,
  releaseUploads,
  runLimited,
  uploadErrorMessage,
} from "@/lib/media/upload";
import { avatarThumb } from "@/lib/media/urls";
import { metaQuery } from "@/lib/meta";
import { storageQuery } from "@/lib/queries";
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
  const meta = useQuery(metaQuery);
  const avatarInput = useRef<HTMLInputElement>(null);

  const saveProfile = useMutation({
    mutationFn: async (values: { name: string; username: string; bio: string }) => {
      const { error } = await authClient.updateUser({
        name: values.name,
        bio: values.bio || null,
        ...(values.username !== user.displayUsername
          ? { username: values.username, displayUsername: values.username }
          : {}),
      } as Parameters<typeof authClient.updateUser>[0]);
      if (error) throw new Error(authErrorMessage(error));
    },
    onSuccess: async () => {
      toast.success(m.saved());
      await refreshSession();
    },
    onError: (error) => toast.error(error.message),
  });

  const queryClient = useQueryClient();
  const avatarDone = async () => {
    toast.success(m.saved());
    await Promise.all([
      refreshSession(),
      queryClient.invalidateQueries({ queryKey: storageQuery.queryKey }),
    ]);
  };
  // Avatar tarayıcıda 512 px + 128 px AVIF'e çevrilir; adresi sunucu yazar ve eskisini siler.
  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      const image = await encodeImage(file, "avatar", "optimized");
      const { asset } = await unwrap(
        api.me.avatar.uploads.$post({ json: { variants: describeVariants(image.variants) } }),
      );
      try {
        await runLimited(
          asset.variants.map((target) => async () => {
            const variant = image.variants.find((item) => item.name === target.name);
            if (!variant) throw new Error("variant missing");
            await putObject(target.upload, variant.blob);
          }),
        );
        await unwrap(api.me.avatar.$post({ json: { assetId: asset.id } }));
      } catch (error) {
        await releaseUploads([asset.id]);
        throw error;
      }
    },
    onSuccess: avatarDone,
    onError: (error) => toast.error(uploadErrorMessage(error)),
  });
  const removeAvatar = useMutation({
    mutationFn: () => unwrap(api.me.avatar.$delete()),
    onSuccess: avatarDone,
    onError: (error) => toast.error(errorMessage(error)),
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
    <div className="grid gap-6 pt-4">
      <div className="grid gap-1.5">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {m.nav_settings()}
        </h1>
        <p className="text-foreground/70 text-[15px]">{m.settings_description()}</p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{m.settings_profile()}</CardTitle>
              <CardDescription>{m.settings_profile_description()}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="flex items-center gap-4">
                <Avatar className="size-16">
                  {user.image && <AvatarImage src={avatarThumb(user.image)} alt="" />}
                  <AvatarFallback className="text-xl">
                    {user.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <input
                  ref={avatarInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif"
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
                {user.image && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={removeAvatar.isPending || uploadAvatar.isPending}
                    onClick={() => removeAvatar.mutate()}
                  >
                    {m.avatar_remove()}
                  </Button>
                )}
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
                <FormField label={m.field_bio()} optional>
                  <Textarea
                    name="bio"
                    rows={3}
                    maxLength={500}
                    showCount
                    defaultValue={user.bio ?? ""}
                  />
                </FormField>
                <FormField label={m.field_email()}>
                  <Input
                    value={user.email.endsWith(".placeholder.invalid") ? "—" : user.email}
                    disabled
                  />
                </FormField>
                <Button type="submit" size="lg" className="w-fit" disabled={saveProfile.isPending}>
                  {m.action_save()}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{m.settings_language()}</CardTitle>
              <CardDescription>{m.settings_language_description()}</CardDescription>
            </CardHeader>
            <CardContent>
              <LanguagePicker signedIn />
            </CardContent>
          </Card>

          {meta.data?.features.uploads && <StorageCard />}

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
        </div>
        <div className="grid gap-6">
          <SteamCard error={search.error} />
          <PsnCard />
          <XboxCard error={search.error} linked={search.linked} />

          <NotificationSettings />
        </div>
      </div>
    </div>
  );
}

/** Kullanım, türe göre dağılım ve varsayılan yükleme kalitesi. */
function StorageCard() {
  const queryClient = useQueryClient();
  const { data } = useQuery(storageQuery);
  const setQuality = useMutation({
    mutationFn: (uploadQuality: "optimized" | "original") =>
      unwrap(api.me.storage.$patch({ json: { uploadQuality } })),
    onSuccess: (usage) => {
      queryClient.setQueryData(storageQuery.queryKey, usage);
      toast.success(m.saved());
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.storage_title()}</CardTitle>
        <CardDescription>{m.storage_description()}</CardDescription>
      </CardHeader>
      {data && (
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <StorageMeter usage={data} />
            <div className="text-muted-foreground grid gap-0.5 text-xs">
              <span>
                {m.storage_screenshots({
                  count: data.breakdown.screenshot.count,
                  size: formatBytes(data.breakdown.screenshot.bytes),
                })}
              </span>
              {data.breakdown.avatar.count > 0 && (
                <span>{m.storage_avatar({ size: formatBytes(data.breakdown.avatar.bytes) })}</span>
              )}
              {data.pendingBytes > 0 && (
                <span>{m.storage_pending({ size: formatBytes(data.pendingBytes) })}</span>
              )}
            </div>
            {data.systemFull ? (
              <p className="text-destructive text-sm">{m.storage_system_full()}</p>
            ) : data.usedBytes >= data.quotaBytes ? (
              <p className="text-destructive text-sm">{m.storage_full()}</p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <span className="text-sm font-medium">{m.storage_default_quality()}</span>
            <QualityPicker
              value={setQuality.variables ?? data.uploadQuality}
              disabled={setQuality.isPending}
              onChange={(value) => value !== data.uploadQuality && setQuality.mutate(value)}
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}
