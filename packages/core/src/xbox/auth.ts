import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { appUrl, credentialsSecret, xboxConfig } from "../config";
import { AppError } from "../errors";
import {
  markNeedsReauth,
  type PlatformAccount,
  PlatformReauthError,
  readCredentials,
  savePlatformAccount,
  updateCredentials,
} from "../platforms/accounts";

/**
 * Xbox Live kimlik doğrulaması: Microsoft hesabı OAuth (login.live.com) → Xbox Live kullanıcı token'ı →
 * XSTS token'ı. API çağrıları `Authorization: XBL3.0 x=<uhs>;<xsts>` başlığıyla yapılır.
 */
const SCOPE = "Xboxlive.signin Xboxlive.offline_access";
const AUTHORIZE_URL = "https://login.live.com/oauth20_authorize.srf";
const TOKEN_URL = "https://login.live.com/oauth20_token.srf";
const STATE_TTL_MS = 10 * 60 * 1000;

export type XboxAuth = { uhs: string; token: string; xuid: string; gamertag: string | null };
type XboxCredentials = { refreshToken: string; xsts: (XboxAuth & { notAfter: number }) | null };

function config() {
  const value = xboxConfig();
  if (!value) throw new AppError("unavailable", "Xbox bağlantısı yapılandırılmamış");
  return value;
}

export function xboxRedirectUri() {
  return `${appUrl()}/api/v1/platforms/xbox/callback`;
}

function sign(value: string) {
  return createHmac("sha256", credentialsSecret())
    .update(`xbox-state:${value}`)
    .digest("base64url");
}

/** Kullanıcıya ve 10 dakikaya bağlı, imzalı `state` (başka bir oturumda kullanılamaz). */
export function createXboxState(userId: string, now = Date.now()) {
  const body = Buffer.from(
    JSON.stringify({ u: userId, e: now + STATE_TTL_MS, n: randomBytes(8).toString("hex") }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyXboxState(state: string, userId: string, now = Date.now()) {
  const [body, signature] = state.split(".");
  if (!body || !signature) return false;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      u: string;
      e: number;
    };
    return parsed.u === userId && parsed.e > now;
  } catch {
    return false;
  }
}

export function xboxAuthorizeUrl(userId: string) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", config().clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("redirect_uri", xboxRedirectUri());
  url.searchParams.set("state", createXboxState(userId));
  return url.toString();
}

async function tokenRequest(params: Record<string, string>) {
  const { clientId, clientSecret } = config();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      scope: SCOPE,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
  };
  if (!response.ok || !body.access_token || !body.refresh_token) {
    return { ok: false as const, error: body.error ?? `HTTP ${response.status}` };
  }
  return { ok: true as const, accessToken: body.access_token, refreshToken: body.refresh_token };
}

async function xblPost<T>(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-xbl-contract-version": "1",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

type XTokenResponse = {
  Token: string;
  NotAfter: string;
  DisplayClaims: { xui: Array<{ uhs: string; xid?: string; gtg?: string }> };
};

/** Microsoft erişim token'ından Xbox Live XSTS token'ı alır. */
async function xstsFromAccessToken(accessToken: string) {
  const user = await xblPost<XTokenResponse>("https://user.auth.xboxlive.com/user/authenticate", {
    RelyingParty: "http://auth.xboxlive.com",
    TokenType: "JWT",
    Properties: {
      AuthMethod: "RPS",
      SiteName: "user.auth.xboxlive.com",
      RpsTicket: `d=${accessToken}`,
    },
  });
  if (!user?.Token) return null;
  const xsts = await xblPost<XTokenResponse>("https://xsts.auth.xboxlive.com/xsts/authorize", {
    RelyingParty: "http://xboxlive.com",
    TokenType: "JWT",
    Properties: { UserTokens: [user.Token], SandboxId: "RETAIL" },
  });
  const claims = xsts?.DisplayClaims?.xui?.[0];
  if (!xsts?.Token || !claims?.uhs || !claims.xid) return null;
  return {
    token: xsts.Token,
    uhs: claims.uhs,
    xuid: claims.xid,
    gamertag: claims.gtg ?? null,
    notAfter: new Date(xsts.NotAfter).getTime(),
  };
}

async function gamerpic(auth: XboxAuth) {
  const response = await fetch(
    `https://profile.xboxlive.com/users/xuid(${auth.xuid})/profile/settings?settings=GameDisplayPicRaw,Gamertag`,
    {
      headers: {
        Authorization: authorizationHeader(auth),
        "x-xbl-contract-version": "2",
        Accept: "application/json",
      },
    },
  ).catch(() => null);
  if (!response?.ok) return null;
  const body = (await response.json()) as {
    profileUsers?: Array<{ settings?: Array<{ id: string; value: string }> }>;
  };
  return (
    body.profileUsers?.[0]?.settings?.find((setting) => setting.id === "GameDisplayPicRaw")
      ?.value ?? null
  );
}

export function authorizationHeader(auth: XboxAuth) {
  return `XBL3.0 x=${auth.uhs};${auth.token}`;
}

/** OAuth dönüşü: kodu token'a çevirir, Xbox hesabını bağlar. */
export async function completeXboxLink(userId: string, code: string, state: string) {
  if (!verifyXboxState(state, userId)) throw new AppError("forbidden", "Geçersiz Xbox dönüşü");
  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: xboxRedirectUri(),
  });
  if (!tokens.ok) throw new AppError("invalid", "Microsoft girişi doğrulanamadı");
  const xsts = await xstsFromAccessToken(tokens.accessToken);
  if (!xsts) {
    // Xbox profili olmayan Microsoft hesapları burada düşer.
    throw new AppError("invalid", "Bu Microsoft hesabının Xbox profili yok");
  }
  await savePlatformAccount({
    userId,
    provider: "xbox",
    externalId: xsts.xuid,
    displayName: xsts.gamertag,
    avatarUrl: await gamerpic(xsts),
    credentials: { refreshToken: tokens.refreshToken, xsts } satisfies XboxCredentials,
    // Microsoft yenileme token'ları kullanıldıkça yenilenir; kesin bitiş tarihi yok.
    credentialsExpireAt: null,
  });
}

/** Geçerli bir XSTS token'ı döner; gerekirse yeniler. Yenileme reddedilirse hesap "yeniden bağla"ya düşer. */
export async function xboxAuthorize(account: PlatformAccount): Promise<XboxAuth> {
  const credentials = readCredentials<XboxCredentials>(account);
  if (credentials.xsts && credentials.xsts.notAfter - Date.now() > 5 * 60_000) {
    return credentials.xsts;
  }
  const tokens = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: credentials.refreshToken,
  });
  const xsts = tokens.ok ? await xstsFromAccessToken(tokens.accessToken) : null;
  if (!tokens.ok || !xsts) {
    await markNeedsReauth(account);
    throw new PlatformReauthError("xbox");
  }
  await updateCredentials(account, {
    refreshToken: tokens.refreshToken,
    xsts,
  } satisfies XboxCredentials);
  return xsts;
}

/** Önbellekteki XSTS token'ını siler; sonraki çağrı yenileme token'ıyla yenisini alır. */
export async function forgetXsts(account: PlatformAccount) {
  const credentials = readCredentials<XboxCredentials>(account);
  await updateCredentials(account, { ...credentials, xsts: null } satisfies XboxCredentials);
}
