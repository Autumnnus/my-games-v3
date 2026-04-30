import { env } from "../config/env";
import igdbAuthHelper from "./igdb-auth.helper";
import type { IGDBData } from "@my-games/shared";

async function fetchIgdbEndpoint<T>(
  endpoint: string,
  body: string,
  isRetry = false,
): Promise<T[]> {
  const accessToken = await igdbAuthHelper.getAccessToken();

  const response = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": env.IGDB_CLIENT_ID,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body,
  });

  if (response.status === 401 && !isRetry) {
    await igdbAuthHelper.refreshAccessToken();
    return await fetchIgdbEndpoint<T>(endpoint, body, true);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`IGDB API error: ${response.status} - ${errorText}`);
  }

  return (await response.json()) as T[];
}

async function fetchIgdbGames(body: string): Promise<IGDBData[]> {
  return fetchIgdbEndpoint<IGDBData>("games", body);
}

export default { fetchIgdbGames, fetchIgdbEndpoint };
