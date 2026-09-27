import { appUrl } from "@my-games/core/config";
import { AppError } from "@my-games/core/errors";
import { linkSteamAccount } from "@my-games/core/steam/accounts";
import { getPlayerSummaries } from "@my-games/core/steam/api";
import type { BetterAuthPlugin } from "better-auth";
import { generateGenericState, parseGenericState } from "better-auth";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

const OP = "https://steamcommunity.com/openid/login";
const ID_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(7656119\d{10})$/;

/**
 * Steam OpenID 2.0 ile giriş ve hesap bağlama. Steam e-posta vermediği için yeni kullanıcılara
 * `<steamid>@steam.placeholder.invalid` atanır (bu adreslere e-posta gönderilmez).
 *
 * Güvenlik: imzalı state (login CSRF), `return_to`/`op_endpoint`/`claimed_id` kontrolü, Steam'e
 * `check_authentication` doğrulaması ve tek kullanımlık `response_nonce`.
 */
export const steamAuth = () =>
  ({
    id: "steam",
    endpoints: {
      signInSteam: createAuthEndpoint(
        "/sign-in/steam",
        {
          method: "POST",
          body: z.object({
            callbackURL: z.string().optional(),
            errorCallbackURL: z.string().optional(),
            link: z.boolean().optional(),
          }),
        },
        async (ctx) => {
          let link: { userId: string; email: string } | undefined;
          if (ctx.body.link) {
            const session = await getSessionFromCtx(ctx);
            if (!session) throw new APIError("UNAUTHORIZED", { message: "Önce giriş yapmalısın" });
            link = { userId: session.user.id, email: session.user.email };
          }
          const { state } = await generateGenericState(ctx, {
            callbackURL: ctx.body.callbackURL ?? "/",
            errorURL: ctx.body.errorCallbackURL ?? (link ? "/settings" : "/login"),
            codeVerifier: "",
            expiresAt: Date.now() + 10 * 60_000,
            link,
          });
          const url = new URL(OP);
          url.search = new URLSearchParams({
            "openid.ns": "http://specs.openid.net/auth/2.0",
            "openid.mode": "checkid_setup",
            "openid.return_to": `${ctx.context.baseURL}/steam/callback?state=${state}`,
            "openid.realm": new URL(ctx.context.baseURL).origin,
            "openid.identity": ID_SELECT,
            "openid.claimed_id": ID_SELECT,
          }).toString();
          return ctx.json({ url: url.toString(), redirect: true });
        },
      ),
      steamCallback: createAuthEndpoint(
        "/steam/callback",
        { method: "GET", query: z.record(z.string(), z.string()) },
        async (ctx) => {
          const query = ctx.query;
          const fail = (code: string, base?: string): never => {
            const target = new URL(base ?? "/login", appUrl());
            target.searchParams.set("error", code);
            throw ctx.redirect(target.toString());
          };

          let state: Awaited<ReturnType<typeof parseGenericState>>;
          try {
            state = await parseGenericState(ctx, query.state ?? "");
          } catch {
            return fail("steam_state");
          }
          if (query["openid.mode"] !== "id_res") fail("steam_cancelled", state.errorURL);
          if (query["openid.op_endpoint"] !== OP) fail("steam_invalid", state.errorURL);
          if (
            query["openid.return_to"] !==
            `${ctx.context.baseURL}/steam/callback?state=${query.state}`
          ) {
            fail("steam_invalid", state.errorURL);
          }
          const match = CLAIMED_ID.exec(query["openid.claimed_id"] ?? "");
          if (!match || query["openid.identity"] !== query["openid.claimed_id"]) {
            return fail("steam_invalid", state.errorURL);
          }

          const body = new URLSearchParams();
          for (const [key, value] of Object.entries(query))
            if (key.startsWith("openid.")) body.set(key, value);
          body.set("openid.mode", "check_authentication");
          const verification = await fetch(OP, { method: "POST", body }).then((response) =>
            response.text(),
          );
          if (!/^is_valid:true$/m.test(verification)) fail("steam_invalid", state.errorURL);

          const steamId = match[1] as string;
          const fresh = await ctx.context.internalAdapter.reserveVerificationValue({
            identifier: `steam-nonce:${query["openid.response_nonce"] ?? ""}`,
            value: steamId,
            expiresAt: new Date(Date.now() + 5 * 60_000),
          });
          if (!fresh) fail("steam_invalid", state.errorURL);

          const [profile] = await getPlayerSummaries([steamId]).catch(() => []);
          const key = { providerId: "steam", accountId: steamId };

          if (state.link) {
            const existing = await ctx.context.internalAdapter.findAccountByKey(key);
            if (existing && existing.userId !== state.link.userId)
              fail("steam_taken", state.errorURL);
            if (!existing)
              await ctx.context.internalAdapter.linkAccount({ ...key, userId: state.link.userId });
            await linkSteamAccount(state.link.userId, steamId, profile).catch((error: unknown) => {
              if (error instanceof AppError && error.code === "conflict")
                fail("steam_taken", state.errorURL);
              throw error;
            });
            throw ctx.redirect(new URL(state.callbackURL, appUrl()).toString());
          }

          const owner = await ctx.context.internalAdapter.findAccountOwnerByKey(key);
          if (owner?.kind === "orphaned") return fail("steam_invalid", state.errorURL);
          let user = owner?.kind === "owned" ? owner.user : null;
          if (!user) {
            user = await ctx.context.internalAdapter.createUser(
              {
                name: profile?.personaname ?? `steam_${steamId.slice(-6)}`,
                image: profile?.avatarfull ?? null,
                email: `${steamId}@steam.placeholder.invalid`,
                emailVerified: false,
              },
              { method: "oauth", oauth: { providerId: "steam", profile: profile ?? {} } },
            );
            await ctx.context.internalAdapter.createAccount({ ...key, userId: user.id });
          }
          await linkSteamAccount(user.id, steamId, profile).catch(() => {});
          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          throw ctx.redirect(new URL(state.callbackURL, appUrl()).toString());
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
