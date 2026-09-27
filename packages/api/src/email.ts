import { env } from "./env";
import type { Locale } from "./locale";

type Email = { to: string; subject: string; text: string };

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
  });
  if (!response.ok) {
    throw new Error(`Resend hatası: ${response.status} ${await response.text()}`);
  }
}

const templates = {
  verify: {
    tr: (url: string) => ({
      subject: "E-posta adresini doğrula",
      text: `My Games hesabını etkinleştirmek için bu bağlantıya tıkla:\n\n${url}\n\nBu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.`,
    }),
    en: (url: string) => ({
      subject: "Verify your email address",
      text: `Click the link below to activate your My Games account:\n\n${url}\n\nIf you didn't request this, you can ignore this email.`,
    }),
  },
  resetPassword: {
    tr: (url: string) => ({
      subject: "Şifre sıfırlama",
      text: `Şifreni sıfırlamak için bu bağlantıya tıkla (1 saat geçerli):\n\n${url}\n\nBu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.`,
    }),
    en: (url: string) => ({
      subject: "Reset your password",
      text: `Click the link below to reset your password (valid for 1 hour):\n\n${url}\n\nIf you didn't request this, you can ignore this email.`,
    }),
  },
} as const;

export function renderEmail(template: keyof typeof templates, locale: Locale, url: string) {
  return templates[template][locale](url);
}
