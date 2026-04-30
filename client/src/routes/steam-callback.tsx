import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useAuthStore } from "@/store/auth.store";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";

const searchSchema = z.object({
  data: z.unknown().optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/steam-callback")({
  validateSearch: searchSchema,
  component: SteamCallbackPage,
});

function SteamCallbackPage() {
  const { t } = useTranslation();
  const { data, error } = Route.useSearch();
  const setAuth = useAuthStore((s) => s.setAuth);
  const router = useRouter();

  useEffect(() => {
    if (error) {
      toast.error(
        t("translation:steam.callback.loginFailedWithReason", { error }),
      );
      router.navigate({ to: "/login" });
      return;
    }

    if (data) {
      try {
        const parsed =
          typeof data === "string"
            ? JSON.parse(decodeURIComponent(data))
            : data;
        if (
          parsed &&
          typeof parsed === "object" &&
          "token" in parsed &&
          "user" in parsed
        ) {
          setAuth(
            parsed.token as string,
            parsed.user as Parameters<typeof setAuth>[1],
          );
          toast.success(t("translation:steam.callback.loginSuccess"));
          router.navigate({ to: "/" });
        } else {
          throw new Error(t("translation:steam.callback.invalidData"));
        }
      } catch {
        toast.error(t("translation:steam.callback.couldNotProcessData"));
        router.navigate({ to: "/login" });
      }
      return;
    }

    router.navigate({ to: "/login" });
  }, [data, error, setAuth, router]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4">
      <LoadingSpinner size="lg" />
      <p className="text-sm text-text-muted">
        {t("translation:steam.callback.loading")}
      </p>
    </div>
  );
}
