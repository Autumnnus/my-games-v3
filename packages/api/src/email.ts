import { log } from "@my-games/core/log";
import { env } from "./env";
import { isLocale, type Locale, localeFromRequest } from "./locale";

type Email = { to: string; subject: string; text: string; html: string };

/**
 * Resend ile gönderir. Anahtar yoksa (yalnızca geliştirmede; production'da `env.ts` açılışı durdurur) e-posta
 * konsola yazılır. Başarısız gönderim sistem loglarına düşer ve hata fırlatılır.
 */
export async function sendEmail(email: Email) {
  if (!env.RESEND_API_KEY) {
    console.info(
      `[email] (RESEND_API_KEY yok, gönderilmedi)\n  to: ${email.to}\n  subject: ${email.subject}\n  ${email.text}`,
    );
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, ...email }),
  }).catch((error: unknown) => {
    failed(email, error instanceof Error ? error.message : String(error));
    throw error;
  });
  if (!response.ok) {
    const detail = `${response.status} ${(await response.text()).slice(0, 500)}`;
    failed(email, detail);
    throw new Error(`Resend hatası: ${detail}`);
  }
}

function failed(email: Email, detail: string) {
  log({
    level: "error",
    source: "email",
    event: "email_failed",
    message: `E-posta gönderilemedi: ${email.subject}`,
    // Adresin tamamı loga yazılmaz; alan adı teşhis için yeter.
    context: { domain: email.to.split("@")[1] ?? null, detail },
  });
}

/** E-postanın dili: hesabın dili, yoksa isteği yapan tarayıcının dili. */
export function emailLocale(user: object, request?: Request | null): Locale {
  const locale = "locale" in user ? user.locale : undefined;
  return typeof locale === "string" && isLocale(locale) ? locale : localeFromRequest(request);
}

type Content = {
  subject: string;
  /** Paragraflar; ilki selamlamadan sonra gelen asıl mesaj. */
  lines: string[];
  action?: { label: string; url: string };
  footer: string;
};

const IGNORE = {
  tr: "Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; hesabında bir şey değişmez.",
  en: "If you didn't request this, you can ignore this email; nothing changes on your account.",
};

const templates = {
  verify: (locale: Locale, { url }: { url: string }): Content =>
    locale === "tr"
      ? {
          subject: "E-posta adresini doğrula",
          lines: [
            "My Games hesabını etkinleştirmek için e-posta adresini doğrula. Bağlantı 1 saat geçerli.",
          ],
          action: { label: "E-postamı doğrula", url },
          footer: IGNORE.tr,
        }
      : {
          subject: "Verify your email address",
          lines: [
            "Verify your email address to activate your My Games account. The link is valid for 1 hour.",
          ],
          action: { label: "Verify my email", url },
          footer: IGNORE.en,
        },
  verifyNewEmail: (locale: Locale, { url }: { url: string }): Content =>
    locale === "tr"
      ? {
          subject: "Yeni e-posta adresini doğrula",
          lines: [
            "Bu adresi My Games hesabının e-postası yapmak için doğrula. Değişiklik bağlantıyı açınca tamamlanır; bağlantı 1 saat geçerli.",
          ],
          action: { label: "Adresimi doğrula", url },
          footer: IGNORE.tr,
        }
      : {
          subject: "Verify your new email address",
          lines: [
            "Verify this address to make it your My Games account's email. The change completes when you open the link; it's valid for 1 hour.",
          ],
          action: { label: "Verify my address", url },
          footer: IGNORE.en,
        },
  resetPassword: (locale: Locale, { url }: { url: string }): Content =>
    locale === "tr"
      ? {
          subject: "Şifre sıfırlama",
          lines: [
            "Hesabın için şifre sıfırlama isteği aldık. Yeni şifreni belirlemek için aşağıdaki bağlantıyı aç. Bağlantı 1 saat geçerli.",
          ],
          action: { label: "Yeni şifre belirle", url },
          footer: IGNORE.tr,
        }
      : {
          subject: "Reset your password",
          lines: [
            "We received a request to reset the password for your account. Open the link below to choose a new one. It's valid for 1 hour.",
          ],
          action: { label: "Choose a new password", url },
          footer: IGNORE.en,
        },
  changeEmail: (locale: Locale, { url, newEmail }: { url: string; newEmail: string }): Content =>
    locale === "tr"
      ? {
          subject: "E-posta değişikliğini onayla",
          lines: [
            `Hesabının e-posta adresinin ${newEmail} olarak değiştirilmesi istendi. Onaylarsan yeni adrese bir doğrulama bağlantısı gönderilir; değişiklik o bağlantıyla tamamlanır.`,
          ],
          action: { label: "Değişikliği onayla", url },
          footer:
            "Bu isteği sen yapmadıysan bu e-postayı yok say ve şifreni değiştir; onaylamadıkça adresin değişmez.",
        }
      : {
          subject: "Confirm your email change",
          lines: [
            `Someone asked to change your account's email address to ${newEmail}. If you confirm, a verification link is sent to the new address and the change completes there.`,
          ],
          action: { label: "Confirm the change", url },
          footer:
            "If this wasn't you, ignore this email and change your password; your address won't change unless you confirm.",
        },
  passwordChanged: (locale: Locale, { url }: { url: string }): Content =>
    locale === "tr"
      ? {
          subject: "Şifren değiştirildi",
          lines: [
            "My Games hesabının şifresi az önce değiştirildi.",
            "Bunu sen yapmadıysan hemen şifreni sıfırla.",
          ],
          action: { label: "Şifremi sıfırla", url },
          footer:
            "Bu bir güvenlik bildirimidir; değişikliği sen yaptıysan bir şey yapmana gerek yok.",
        }
      : {
          subject: "Your password was changed",
          lines: [
            "The password for your My Games account was just changed.",
            "If this wasn't you, reset your password right away.",
          ],
          action: { label: "Reset my password", url },
          footer: "This is a security notice; if you made this change, there's nothing else to do.",
        },
};

type Templates = typeof templates;

export function renderEmail<T extends keyof Templates>(
  template: T,
  locale: Locale,
  data: Parameters<Templates[T]>[1],
): Omit<Email, "to"> {
  const content = (templates[template] as (locale: Locale, data: unknown) => Content)(locale, data);
  return { subject: content.subject, text: toText(content), html: toHtml(content, locale) };
}

function toText(content: Content) {
  return [
    ...content.lines,
    ...(content.action ? [`${content.action.label}:\n${content.action.url}`] : []),
    content.footer,
  ].join("\n\n");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Tek sütunlu, satır içi stilli şablon (e-posta istemcileri harici CSS'i desteklemez). */
function toHtml(content: Content, locale: Locale) {
  const paragraphs = content.lines
    .map(
      (line) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2933">${escapeHtml(line)}</p>`,
    )
    .join("");
  const action = content.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(content.action.url)}" style="display:inline-block;background:#111318;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">${escapeHtml(content.action.label)}</a></p>
<p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:#6b7280">${locale === "tr" ? "Düğme çalışmazsa bu adresi tarayıcına yapıştır:" : "If the button doesn't work, paste this address into your browser:"}<br><a href="${escapeHtml(content.action.url)}" style="color:#6b7280;word-break:break-all">${escapeHtml(content.action.url)}</a></p>`
    : "";
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td>
<p style="margin:0 0 24px;font-size:18px;font-weight:700;color:#111318">My Games</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#111318">${escapeHtml(content.subject)}</h1>
${paragraphs}${action}
<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#6b7280">${escapeHtml(content.footer)}</p>
</td></tr></table>
</td></tr></table>
</body></html>`;
}
