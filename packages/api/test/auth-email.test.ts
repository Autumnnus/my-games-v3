import { createHmac, randomUUID } from "node:crypto";
import { db } from "@my-games/core/db";
import { schema } from "@my-games/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUser } from "../../core/test/factories";

// Gerçek e-posta yerine giden mektuplar toplanır; şablonlar (renderEmail) gerçek kalır.
const sent = vi.hoisted(
  () => [] as Array<{ to: string; subject: string; text: string; html: string }>,
);
const sendEmail = vi.hoisted(() => vi.fn());
vi.mock("../src/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/email")>()),
  sendEmail,
}));

const { auth } = await import("../src/auth");
const { app } = await import("../src/index");

const ORIGIN = "http://localhost:3300";
const PASSWORD = "supersecret1";

beforeEach(() => {
  sent.length = 0;
  sendEmail.mockReset();
  sendEmail.mockImplementation(async (email) => {
    sent.push(email);
  });
});

function cookieOf(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

function post(path: string, body: unknown, init: { cookie?: string; locale?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json", origin: ORIGIN });
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.locale) headers.set("accept-language", init.locale);
  return app.request(`/api/auth${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

/** E-postadaki bağlantıyı tarayıcı gibi açar (aynı origin, yönlendirmeyi izlemeden). */
function open(url: string, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return app.request(url.replace(ORIGIN, ""), { headers, redirect: "manual" });
}

function linkIn(email: { text: string } | undefined) {
  const url = email?.text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error("e-postada bağlantı yok");
  return url;
}

async function signUp(email = `u-${randomUUID().slice(0, 8)}@example.com`) {
  const response = await post(
    "/sign-up/email",
    {
      email,
      password: PASSWORD,
      name: "Test",
      username: `u_${randomUUID().slice(0, 8)}`,
      callbackURL: "/verify-email",
    },
    { locale: "tr-TR,tr;q=0.9" },
  );
  return { email, response };
}

/** Kayıt + doğrulama bağlantısı; doğrulama otomatik giriş yaptırır. */
async function verifiedAccount() {
  const { email } = await signUp();
  const verified = await open(linkIn(sent.at(-1)));
  sent.length = 0;
  return { email, cookie: cookieOf(verified) };
}

async function userByEmail(email: string) {
  const [row] = await db.select().from(schema.user).where(eq(schema.user.email, email));
  return row;
}

describe("email verification", () => {
  it("sends a localized verification email and verifies + signs in from its link", async () => {
    const { email, response } = await signUp();
    expect(response.status).toBe(200);
    expect(sent).toHaveLength(1);
    const [mail] = sent;
    expect(mail?.to).toBe(email);
    expect(mail?.subject).toBe("E-posta adresini doğrula");
    expect(mail?.html).toContain("E-postamı doğrula");
    expect(linkIn(mail)).toContain("callbackURL=%2Fverify-email");

    const verified = await open(linkIn(mail));
    expect(verified.status).toBe(302);
    expect(verified.headers.get("location")).toBe("/verify-email");
    expect(cookieOf(verified)).toContain("session_token");
    expect((await userByEmail(email))?.emailVerified).toBe(true);
  });

  it("redirects a broken link back to the page with an error code", async () => {
    const response = await open(`/api/auth/verify-email?token=nope&callbackURL=%2Fverify-email`);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/verify-email?error=INVALID_TOKEN");
  });

  it("still creates the account when the provider fails, and resending reports the failure", async () => {
    sendEmail.mockRejectedValue(new Error("Resend down"));
    const { email, response } = await signUp();
    expect(response.status).toBe(200);
    expect(await userByEmail(email)).toBeTruthy();

    const resend = await post("/send-verification-email", { email, callbackURL: "/verify-email" });
    expect(resend.status).toBeGreaterThanOrEqual(500);
  });
});

describe("password reset", () => {
  it("emails a reset link, sets the new password and sends a security notice", async () => {
    const { email } = await verifiedAccount();

    const request = await post("/request-password-reset", { email, redirectTo: "/reset-password" });
    expect(request.status).toBe(200);
    expect(sent.map((mail) => mail.subject)).toEqual(["Şifre sıfırlama"]);

    // E-postadaki bağlantı token'ı doğrulayıp sayfaya yönlendirir.
    const landing = await open(linkIn(sent[0]));
    expect(landing.status).toBe(302);
    const token = new URL(landing.headers.get("location") ?? "", ORIGIN).searchParams.get("token");
    expect(token).toBeTruthy();

    const reset = await post("/reset-password", { token, newPassword: "brand-new-pass" });
    expect(reset.status).toBe(200);
    expect(sent.map((mail) => mail.subject)).toEqual(["Şifre sıfırlama", "Şifren değiştirildi"]);

    expect((await post("/sign-in/email", { email, password: PASSWORD })).status).toBe(401);
    expect((await post("/sign-in/email", { email, password: "brand-new-pass" })).status).toBe(200);
    // Aynı bağlantı ikinci kez kullanılamaz.
    expect((await post("/reset-password", { token, newPassword: "another-pass" })).status).toBe(
      400,
    );
  });

  it("answers the same for unknown addresses and sends nothing", async () => {
    const response = await post("/request-password-reset", {
      email: "nobody@example.com",
      redirectTo: "/reset-password",
    });
    expect(response.status).toBe(200);
    expect(sent).toHaveLength(0);
  });
});

describe("signed-in account changes", () => {
  it("changes the password with the current one and sends a security notice", async () => {
    const { email, cookie } = await verifiedAccount();

    const wrong = await post(
      "/change-password",
      { currentPassword: "wrong-password", newPassword: "brand-new-pass" },
      { cookie },
    );
    expect(wrong.status).toBe(400);
    expect(sent).toHaveLength(0);

    const changed = await post(
      "/change-password",
      { currentPassword: PASSWORD, newPassword: "brand-new-pass", revokeOtherSessions: true },
      { cookie },
    );
    expect(changed.status).toBe(200);
    expect(sent.map((mail) => [mail.to, mail.subject])).toEqual([[email, "Şifren değiştirildi"]]);
  });

  it("moves a verified address only after the old one confirms and the new one verifies", async () => {
    const { email, cookie } = await verifiedAccount();
    const newEmail = `new-${randomUUID().slice(0, 8)}@example.com`;

    const request = await post(
      "/change-email",
      { newEmail, callbackURL: "/verify-email?flow=change-email" },
      { cookie },
    );
    expect(request.status).toBe(200);
    expect(sent.map((mail) => [mail.to, mail.subject])).toEqual([
      [email, "E-posta değişikliğini onayla"],
    ]);
    expect(sent[0]?.text).toContain(newEmail);

    const confirmed = await open(linkIn(sent[0]), cookie);
    expect(confirmed.headers.get("location")).toBe(
      "/verify-email?flow=change-email&step=confirmed",
    );
    expect(sent.map((mail) => [mail.to, mail.subject]).at(-1)).toEqual([
      newEmail,
      "Yeni e-posta adresini doğrula",
    ]);
    expect((await userByEmail(email))?.email).toBe(email);

    const done = await open(linkIn(sent.at(-1)), cookie);
    expect(done.headers.get("location")).toBe("/verify-email?flow=change-email&step=done");
    expect(await userByEmail(email)).toBeUndefined();
    expect((await userByEmail(newEmail))?.emailVerified).toBe(true);
  });

  it("lets a Steam account add a real address by verifying only the new one", async () => {
    const user = await createUser({
      email: `7656${randomUUID().slice(0, 8)}@steam.placeholder.invalid`,
      emailVerified: false,
    });
    const context = await auth.$context;
    const session = await context.internalAdapter.createSession(user.id);
    const signature = createHmac("sha256", context.secret).update(session.token).digest("base64");
    const cookie = `better-auth.session_token=${encodeURIComponent(`${session.token}.${signature}`)}`;
    const newEmail = `steam-${randomUUID().slice(0, 8)}@example.com`;

    const request = await post(
      "/change-email",
      { newEmail, callbackURL: "/verify-email?flow=change-email" },
      { cookie },
    );
    expect(request.status).toBe(200);
    expect(sent.map((mail) => [mail.to, mail.subject])).toEqual([
      [newEmail, "Verify your new email address"],
    ]);

    const done = await open(linkIn(sent[0]), cookie);
    expect(done.headers.get("location")).toBe("/verify-email?flow=change-email&step=done");
    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, user.id));
    expect(row).toMatchObject({ email: newEmail, emailVerified: true });
  });
});
