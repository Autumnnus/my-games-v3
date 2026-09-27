import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";
import * as z from "zod/mini";
import { AuthCard, FormField } from "@/components/auth-card";
import { SocialButtons } from "@/components/social-buttons";
import { Turnstile, useTurnstileRequired } from "@/components/turnstile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { metaQuery } from "@/lib/meta";
import { safeRedirect, useRefreshSession } from "@/lib/session";
import { steamErrorMessage } from "@/lib/steam";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.optional(z.string()), error: z.optional(z.string()) }),
  beforeLoad: ({ context, search }) => {
    if (context.user) throw redirect({ to: safeRedirect(search.redirect) });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(metaQuery),
  head: () => ({ meta: [{ title: `${m.sign_in_title()} · ${m.app_name()}` }] }),
  component: LoginPage,
});

function LoginPage() {
  const [captcha, setCaptcha] = useState<string | null>(null);
  const captchaRequired = useTurnstileRequired();
  const onCaptcha = useCallback((token: string | null) => setCaptcha(token), []);
  const search = Route.useSearch();
  const navigate = useNavigate();
  const refreshSession = useRefreshSession();
  const redirectTo = safeRedirect(search.redirect);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(steamErrorMessage(search.error));
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    setPending(true);
    setError(null);
    setUnverifiedEmail(null);

    const { error } = await authClient.signIn.email({
      email,
      password: String(form.get("password")),
      fetchOptions: { headers: captcha ? { "x-captcha-response": captcha } : {} },
    });
    setPending(false);

    if (error) {
      setError(authErrorMessage(error));
      if (error.code === "EMAIL_NOT_VERIFIED") setUnverifiedEmail(email);
      return;
    }
    await refreshSession();
    await navigate({ to: redirectTo });
  }

  async function resendVerification() {
    if (!unverifiedEmail) return;
    const { error } = await authClient.sendVerificationEmail({
      email: unverifiedEmail,
      callbackURL: "/",
    });
    if (error) toast.error(authErrorMessage(error));
    else toast.success(m.verify_sent());
  }

  return (
    <AuthCard
      title={m.sign_in_title()}
      footer={
        <>
          {m.sign_in_no_account()}{" "}
          <Link to="/register" className="text-foreground underline underline-offset-4">
            {m.nav_sign_up()}
          </Link>
        </>
      }
    >
      <SocialButtons callbackURL={redirectTo} />
      <form className="grid gap-4" onSubmit={onSubmit}>
        <FormField label={m.field_email()}>
          <Input name="email" type="email" autoComplete="email" required />
        </FormField>
        <FormField label={m.field_password()}>
          <Input name="password" type="password" autoComplete="current-password" required />
        </FormField>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error}
              {unverifiedEmail && (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0"
                  onClick={() => void resendVerification()}
                >
                  {m.verify_resend()}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        <Turnstile onToken={onCaptcha} />
        <Button type="submit" disabled={pending || (captchaRequired && !captcha)}>
          {m.sign_in_submit()}
        </Button>
        <Link
          to="/forgot-password"
          className="text-muted-foreground text-center text-sm underline-offset-4 hover:underline"
        >
          {m.sign_in_forgot()}
        </Link>
      </form>
    </AuthCard>
  );
}
