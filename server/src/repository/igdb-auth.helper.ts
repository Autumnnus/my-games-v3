import Config from "../models/Config";
import { env } from "../config/env";

const ACCESS_TOKEN_KEY = "igdb_access_token";
const ACCESS_TOKEN_EXPIRES_AT_KEY = "igdb_access_token_expires_at";
const EXPIRY_BUFFER_MS = 60_000;

let refreshInFlight: Promise<string> | null = null;

function parseExpiry(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

async function getAccessToken(): Promise<string> {
  const [tokenConfig, expiryConfig] = await Promise.all([
    Config.findOne({ key: ACCESS_TOKEN_KEY }),
    Config.findOne({ key: ACCESS_TOKEN_EXPIRES_AT_KEY }),
  ]);

  const expiresAt = parseExpiry(expiryConfig?.value);
  const isExpired = !expiresAt || Date.now() + EXPIRY_BUFFER_MS >= expiresAt;

  if (tokenConfig?.value && !isExpired) return tokenConfig.value;
  return await refreshAccessToken();
}

async function refreshAccessToken(): Promise<string> {
  if (refreshInFlight) return await refreshInFlight;

  refreshInFlight = (async () => {
    const response = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${env.IGDB_CLIENT_ID}&client_secret=${env.IGDB_CLIENT_SECRET}&grant_type=client_credentials`,
      { method: "POST" },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Failed to refresh IGDB token: ${response.statusText} - ${body}`,
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    const expiresAt = Date.now() + data.expires_in * 1000;

    await Promise.all([
      Config.findOneAndUpdate(
        { key: ACCESS_TOKEN_KEY },
        { value: data.access_token },
        { upsert: true, new: true },
      ),
      Config.findOneAndUpdate(
        { key: ACCESS_TOKEN_EXPIRES_AT_KEY },
        { value: String(expiresAt) },
        { upsert: true, new: true },
      ),
    ]);

    return data.access_token;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export default { getAccessToken, refreshAccessToken };
