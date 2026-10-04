import { useQuery } from "@tanstack/react-query";
import { MailIcon } from "lucide-react";
import { type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/auth-card";
import { Turnstile, useTurnstileRequired } from "@/components/turnstile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { type CurrentUser, useRefreshSession } from "@/lib/session";
import { m } from "@/paraglide/messages";

/** Steam ile açılan hesapların e-postası yer tutucudur (`…@steam.placeholder.invalid`); oraya e-posta gitmez. */
function isPlaceholder(email: string) {
  return email.endsWith(".placeholder.invalid");
}

/** Ayarlar › E-posta ve şifre: e-posta değiştirme/ekleme, şifre değiştirme ya da (sosyal hesapta) belirleme. */
export function AccountSecurityCard({ user }: { user: CurrentUser }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.settings_security()}</CardTitle>
        <CardDescription>{m.settings_security_description()}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <EmailSection user={user} />
        <Separator />
        <PasswordSection user={user} />
      </CardContent>
    </Card>
  );
}

function EmailSection({ user }: { user: CurrentUser }) {
  const placeholder = isPlaceholder(user.email);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const newEmail = String(new FormData(formElement).get("email")).trim();
    if (newEmail.toLowerCase() === user.email.toLowerCase()) {
      toast.error(m.settings_email_same());
      return;
    }
    setPending(true);
    const { error } = await authClient.changeEmail({
      newEmail,
      callbackURL: "/verify-email?flow=change-email",
    });
    setPending(false);
    if (error) {
      toast.error(authErrorMessage(error));
      return;
    }
    formElement.reset();
    // Doğrulanmış adreste önce eski adrese onay gider; yer tutucu (Steam) adreste doğrudan yeni adrese.
    setNotice(
      placeholder
        ? m.settings_email_sent_verify({ email: newEmail })
        : m.settings_email_sent_confirm({ email: user.email }),
    );
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <FormField label={m.settings_email_current()}>
        <Input value={placeholder ? m.settings_email_none() : user.email} disabled />
      </FormField>
      <FormField label={m.settings_email_new()}>
        <Input name="email" type="email" autoComplete="email" required leading={<MailIcon />} />
      </FormField>
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" variant="outline" className="w-fit" disabled={pending}>
        {placeholder ? m.settings_email_add() : m.settings_email_change()}
      </Button>
    </form>
  );
}

function PasswordSection({ user }: { user: CurrentUser }) {
  const accounts = useQuery({
    queryKey: ["auth-accounts", user.id],
    queryFn: async () => {
      const { data, error } = await authClient.listAccounts();
      if (error) throw new Error(authErrorMessage(error));
      return data;
    },
  });
  if (!accounts.data) return null;
  const hasPassword = accounts.data.some((account) => account.providerId === "credential");
  if (hasPassword) return <ChangePasswordForm />;
  if (isPlaceholder(user.email)) {
    return (
      <div className="grid gap-2">
        <span className="text-sm font-medium">{m.settings_password()}</span>
        <p className="text-muted-foreground text-sm">{m.settings_password_needs_email()}</p>
      </div>
    );
  }
  return <SetPasswordLink email={user.email} />;
}

function ChangePasswordForm() {
  const refreshSession = useRefreshSession();
  const [pending, setPending] = useState(false);
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [wrongCurrent, setWrongCurrent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setWrongCurrent(false);
    const { error } = await authClient.changePassword({
      currentPassword: String(form.get("currentPassword")),
      newPassword: String(form.get("newPassword")),
      revokeOtherSessions: revokeOthers,
    });
    setPending(false);
    if (error) {
      if (error.code === "INVALID_PASSWORD") setWrongCurrent(true);
      else toast.error(authErrorMessage(error));
      return;
    }
    formElement.reset();
    toast.success(m.settings_password_changed());
    // Diğer oturumlar kapatıldıysa bu cihazın oturumu yenilendi (yeni çerez).
    await refreshSession();
  }

  return (
    <form method="post" className="grid gap-4" onSubmit={onSubmit}>
      <FormField
        label={m.settings_password_current()}
        error={wrongCurrent ? m.settings_password_wrong() : null}
      >
        <PasswordInput name="currentPassword" autoComplete="current-password" required />
      </FormField>
      <FormField label={m.field_new_password()} hint={m.field_password_hint()}>
        <PasswordInput name="newPassword" autoComplete="new-password" required minLength={8} />
      </FormField>
      <div className="flex items-center gap-3 text-sm">
        <Checkbox
          id="revoke-other-sessions"
          checked={revokeOthers}
          onCheckedChange={(value) => setRevokeOthers(value === true)}
        />
        <label htmlFor="revoke-other-sessions">{m.settings_password_revoke()}</label>
      </div>
      <Button type="submit" variant="outline" className="w-fit" disabled={pending}>
        {m.settings_password_change()}
      </Button>
    </form>
  );
}

/** Şifresiz (sosyal) hesap: sıfırlama bağlantısı şifre belirlemeyi de yapar (Better Auth hesabı oluşturur). */
function SetPasswordLink({ email }: { email: string }) {
  const [captcha, setCaptcha] = useState<string | null>(null);
  const captchaRequired = useTurnstileRequired();
  const onCaptcha = useCallback((token: string | null) => setCaptcha(token), []);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    setPending(true);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
      fetchOptions: { headers: captcha ? { "x-captcha-response": captcha } : {} },
    });
    setPending(false);
    if (error) toast.error(authErrorMessage(error));
    else setSent(true);
  }

  return (
    <div className="grid gap-3">
      <span className="text-sm font-medium">{m.settings_password()}</span>
      <p className="text-muted-foreground text-sm">{m.settings_password_none()}</p>
      {sent ? (
        <Alert>
          <AlertDescription>{m.settings_password_set_sent({ email })}</AlertDescription>
        </Alert>
      ) : (
        <>
          <Turnstile onToken={onCaptcha} />
          <Button
            variant="outline"
            className="w-fit"
            disabled={pending || (captchaRequired && !captcha)}
            onClick={() => void send()}
          >
            {m.settings_password_set()}
          </Button>
        </>
      )}
    </div>
  );
}
