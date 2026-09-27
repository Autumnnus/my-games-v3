import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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

export const Route = createFileRoute("/reset-password")({
  // Better Auth geçerli bağlantıda `token`, geçersiz/süresi dolmuşta `error=INVALID_TOKEN` ekler.
  validateSearch: z.object({ token: z.optional(z.string()), error: z.optional(z.string()) }),
  head: () => ({ meta: [{ title: `${m.reset_title()} · ${m.app_name()}` }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token, error: linkError } = Route.useSearch();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const { error } = await authClient.resetPassword({
      token,
      newPassword: String(form.get("password")),
    });
    setPending(false);

    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    toast.success(m.reset_success());
    await navigate({ to: "/login" });
  }

  const footer = (
    <Link to="/login" className="text-foreground underline underline-offset-4">
      {m.auth_back_to_sign_in()}
    </Link>
  );

  if (!token || linkError) {
    return (
      <AuthCard title={m.reset_title()} footer={footer}>
        <Alert variant="destructive">
          <AlertDescription>{m.reset_invalid()}</AlertDescription>
        </Alert>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={m.reset_title()} footer={footer}>
      <form className="grid gap-4" onSubmit={onSubmit}>
        <FormField label={m.field_new_password()} hint={m.field_password_hint()}>
          <Input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </FormField>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={pending}>
          {m.reset_submit()}
        </Button>
      </form>
    </AuthCard>
  );
}
