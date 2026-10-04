import { createFileRoute, Link } from "@tanstack/react-router";
import { MailIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import * as z from "zod/mini";
import { AuthCard, FormField } from "@/components/auth-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { m } from "@/paraglide/messages";

/**
 * E-postadaki doğrulama bağlantılarının dönüş sayfası. Better Auth başarılı doğrulamada buraya yönlendirir
 * (kayıtta oturumu da açar), bozuk/süresi dolmuş bağlantıda `?error=<KOD>` ekler. E-posta değişikliğinin iki
 * adımı da `flow=change-email` ile buraya döner.
 */
export const Route = createFileRoute("/verify-email")({
  validateSearch: z.object({
    error: z.optional(z.string()),
    flow: z.optional(z.literal("change-email")),
    step: z.optional(z.enum(["confirmed", "done"])),
  }),
  head: () => ({ meta: [{ title: `${m.verify_page_title()} · ${m.app_name()}` }] }),
  component: VerifyEmailPage,
});

function errorText(code: string) {
  if (code === "TOKEN_EXPIRED") return m.verify_error_expired();
  if (code === "INVALID_USER") return m.verify_error_other_account();
  return m.verify_error_invalid();
}

function VerifyEmailPage() {
  const { error, flow, step } = Route.useSearch();
  const { user } = Route.useRouteContext();

  if (flow === "change-email") {
    return (
      <AuthCard title={m.verify_change_title()}>
        <Alert variant={error ? "destructive" : "default"}>
          <AlertDescription>
            {error
              ? error === "INVALID_USER"
                ? m.verify_error_other_account()
                : m.verify_change_error()
              : step === "confirmed"
                ? m.verify_change_confirmed()
                : step === "done"
                  ? m.verify_change_done()
                  : m.verify_change_description()}
          </AlertDescription>
        </Alert>
        {user && !error && (
          <p className="text-muted-foreground text-sm">
            {m.verify_change_current({ email: user.email })}
          </p>
        )}
        <Button asChild>
          <Link to={user ? "/settings" : "/login"}>
            {user ? m.verify_to_settings() : m.nav_sign_in()}
          </Link>
        </Button>
      </AuthCard>
    );
  }

  if (error) {
    return (
      <AuthCard
        title={m.verify_error_title()}
        footer={
          <Link to="/login" className="text-foreground underline underline-offset-4">
            {m.auth_back_to_sign_in()}
          </Link>
        }
      >
        <Alert variant="destructive">
          <AlertDescription>{errorText(error)}</AlertDescription>
        </Alert>
        {error !== "INVALID_USER" && <ResendForm />}
      </AuthCard>
    );
  }

  return (
    <AuthCard title={m.verify_ok_title()} description={m.verify_ok_description()}>
      <Button asChild size="lg">
        <Link to={user ? "/" : "/login"}>{user ? m.verify_continue() : m.nav_sign_in()}</Link>
      </Button>
    </AuthCard>
  );
}

function ResendForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    const { error } = await authClient.sendVerificationEmail({
      email: String(form.get("email")),
      callbackURL: "/verify-email",
    });
    setPending(false);
    if (error) toast.error(authErrorMessage(error));
    else setSent(true);
  }

  if (sent) {
    return (
      <Alert>
        <AlertDescription>{m.verify_resend_sent()}</AlertDescription>
      </Alert>
    );
  }
  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <p className="text-muted-foreground text-sm">{m.verify_resend_description()}</p>
      <FormField label={m.field_email()}>
        <Input name="email" type="email" autoComplete="email" required leading={<MailIcon />} />
      </FormField>
      <Button type="submit" disabled={pending}>
        {m.verify_resend_submit()}
      </Button>
    </form>
  );
}
