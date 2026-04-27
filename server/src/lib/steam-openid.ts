import { env } from "../config/env";
import { AppError } from "./errors";

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const STEAM_ID_REGEX = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/;

export function buildSteamLoginUrl(returnTo?: string): string {
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo ?? env.STEAM_RETURN_URL,
    "openid.realm": env.STEAM_REALM,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
}

export async function verifySteamCallback(
  query: Record<string, string>,
): Promise<string> {
  if (query["openid.mode"] !== "id_res") {
    throw new AppError(
      "UNAUTHORIZED",
      "Steam authentication was cancelled or failed",
      401,
    );
  }

  const claimedId = query["openid.claimed_id"];
  if (!claimedId) {
    throw new AppError(
      "UNAUTHORIZED",
      "Missing claimed_id in Steam response",
      401,
    );
  }

  const match = STEAM_ID_REGEX.exec(claimedId);
  if (!match) {
    throw new AppError("UNAUTHORIZED", "Invalid Steam claimed_id format", 401);
  }

  // Verify the assertion with Steam (check_authentication)
  const verifyParams = new URLSearchParams(query as Record<string, string>);
  verifyParams.set("openid.mode", "check_authentication");

  const response = await fetch(STEAM_OPENID_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: verifyParams.toString(),
  });

  const text = await response.text();
  if (!text.includes("is_valid:true")) {
    throw new AppError("UNAUTHORIZED", "Steam OpenID verification failed", 401);
  }

  return match[1];
}
