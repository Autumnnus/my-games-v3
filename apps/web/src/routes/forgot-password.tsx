import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useCallback, useState } from "react";
import { AuthCard, FormField } from "@/components/auth-card";
import { Turnstile, useTurnstileRequired } from "@/components/turnstile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: `${m.forgot_title()} · ${m.app_name()}` }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [captcha, setCaptcha] = useState<string | null>(null);
  const captchaRequired = useTurnstileRequired();
  const onCaptcha = useCallback((token: string | null) => setCaptcha(token), []);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    // Hesabın var olup olmadığını sızdırmamak için sonuç ne olursa olsun aynı mesaj gösterilir.
    await authClient.requestPasswordReset({
      email: String(form.get("email")),
      redirectTo: "/reset-password",
      fetchOptions: { headers: captcha ? { "x-captcha-response": captcha } : {} },
    });
    setPending(false);
    setSent(true);
  }

  return (
    <AuthCard
      title={m.forgot_title()}
      description={m.forgot_description()}
      footer={
        <Link to="/login" className="text-foreground underline underline-offset-4">
          {m.auth_back_to_sign_in()}
        </Link>
      }
    >
      {sent ? (
        <Alert>
          <AlertDescription>{m.forgot_success()}</AlertDescription>
        </Alert>
      ) : (
        <form className="grid gap-4" onSubmit={onSubmit}>
          <FormField label={m.field_email()}>
            <Input name="email" type="email" autoComplete="email" required />
          </FormField>
          <Turnstile onToken={onCaptcha} />
          <Button type="submit" disabled={pending || (captchaRequired && !captcha)}>
            {m.forgot_submit()}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
