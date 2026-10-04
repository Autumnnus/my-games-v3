import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";
import { AuthCard, FormField } from "@/components/auth-card";
import { LegalLinks, SocialButtons } from "@/components/social-buttons";
import { Turnstile, useTurnstileRequired } from "@/components/turnstile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { metaQuery } from "@/lib/meta";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/register")({
  beforeLoad: ({ context }) => {
    if (context.user) throw redirect({ to: "/" });
  },
  // Kayıtların açık olup olmadığı her girişte taze okunur (yönetim panelinden değişebilir).
  loader: ({ context }) => context.queryClient.fetchQuery({ ...metaQuery, staleTime: 0 }),
  head: () => ({ meta: [{ title: `${m.sign_up_title()} · ${m.app_name()}` }] }),
  component: RegisterPage,
});

function RegisterPage() {
  const meta = useQuery(metaQuery);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const captchaRequired = useTurnstileRequired();
  const onCaptcha = useCallback((token: string | null) => setCaptcha(token), []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    setPending(true);
    setError(null);

    const { error } = await authClient.signUp.email({
      name: String(form.get("name")),
      username: String(form.get("username")),
      email,
      password: String(form.get("password")),
      // Doğrulama bağlantısı buraya döner (başarı ya da "süresi doldu, yeniden gönder").
      callbackURL: "/verify-email",
      fetchOptions: { headers: captcha ? { "x-captcha-response": captcha } : {} },
    });
    setPending(false);

    if (error) setError(authErrorMessage(error));
    else setSentTo(email);
  }

  const footer = (
    <>
      {m.sign_up_have_account()}{" "}
      <Link to="/login" className="text-foreground underline underline-offset-4">
        {m.nav_sign_in()}
      </Link>
    </>
  );

  if (meta.data?.signupsOpen === false) {
    return (
      <AuthCard title={m.sign_up_title()} footer={footer}>
        <Alert>
          <AlertDescription>{m.sign_up_closed()}</AlertDescription>
        </Alert>
      </AuthCard>
    );
  }

  if (sentTo) {
    return (
      <AuthCard title={m.sign_up_title()} footer={footer}>
        <Alert>
          <AlertDescription>{m.sign_up_success({ email: sentTo })}</AlertDescription>
        </Alert>
        <ResendVerification email={sentTo} />
      </AuthCard>
    );
  }

  return (
    <AuthCard title={m.sign_up_title()} footer={footer}>
      <SocialButtons callbackURL="/" />
      {/* method="post": sayfa henüz etkileşimli değilken (hydration öncesi) Enter'a basılırsa tarayıcı formu
          kendisi gönderir; GET olsaydı şifre adres çubuğuna ve geçmişe yazılırdı. */}
      <form method="post" className="grid gap-4" onSubmit={onSubmit}>
        <FormField label={m.field_name()}>
          <Input name="name" autoComplete="name" required maxLength={64} />
        </FormField>
        <FormField label={m.field_username()} hint={m.field_username_hint()}>
          <Input
            name="username"
            autoComplete="username"
            required
            minLength={3}
            maxLength={30}
            pattern="[A-Za-z0-9_.]+"
          />
        </FormField>
        <FormField label={m.field_email()}>
          <Input name="email" type="email" autoComplete="email" required />
        </FormField>
        <FormField label={m.field_password()} hint={m.field_password_hint()}>
          <PasswordInput name="password" autoComplete="new-password" required minLength={8} />
        </FormField>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {/* <label> değil: içindeki şart bağlantılarına tıklamak kutuyu da işaretlemesin. */}
        <div className="flex items-start gap-3 text-sm leading-relaxed">
          <Checkbox
            name="consent"
            aria-labelledby="sign-up-consent"
            required
            checked={accepted}
            onCheckedChange={(value) => setAccepted(value === true)}
            className="mt-0.5"
          />
          <span id="sign-up-consent">
            <LegalLinks before={m.sign_up_consent_before()} after={m.sign_up_consent_after()} />
          </span>
        </div>
        <Turnstile onToken={onCaptcha} />
        <Button
          type="submit"
          size="lg"
          disabled={pending || !accepted || (captchaRequired && !captcha)}
        >
          {m.sign_up_submit()}
        </Button>
      </form>
    </AuthCard>
  );
}

/** Kayıttan sonra e-posta gelmediyse; Better Auth IP başına dakikada en fazla 3 istek kabul eder. */
function ResendVerification({ email }: { email: string }) {
  const [pending, setPending] = useState(false);
  async function resend() {
    setPending(true);
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/verify-email",
    });
    setPending(false);
    if (error) toast.error(authErrorMessage(error));
    else toast.success(m.verify_sent());
  }
  return (
    <Button variant="outline" disabled={pending} onClick={() => void resend()}>
      {m.sign_up_resend()}
    </Button>
  );
}
