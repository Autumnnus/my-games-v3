# Entegrasyon notları (doğrulanmış API ayrıntıları)

> 2026-09-27'de canlı dokümanlardan ve kurulu paketlerin tip tanımlarından doğrulandı. "Doğrulanmadı" diye
> işaretli maddeler gerçek anahtarla bir kez kontrol edilmeli.

## IGDB v4

- Token: `POST https://id.twitch.tv/oauth2/token` (`client_id`, `client_secret`, `grant_type=client_credentials`)
  → `{access_token, expires_in (sn), token_type}`. Refresh token yok; ~60 gün geçerli, uygulama başına en
  fazla 25 aktif token → önbellekle (`app_config.igdb_token`).
- İstek: `POST https://api.igdb.com/v4/{endpoint}`, header `Client-ID` + `Authorization: Bearer`, gövde düz metin
  Apicalypse. 4 istek/sn, en fazla 8 eşzamanlı; aşımda 429. Geçersiz token → 401.
- Güncel alanlar: `game_type` (eski `category` kaldırıldı), `external_games.external_game_source` (eski
  `category`), `game_status`, `collections`. Game type id'leri eski enum ile aynı: 0 main_game, 1 dlc_addon,
  2 expansion, 3 bundle, 4 standalone_expansion, 8 remake, 9 remaster, 10 expanded_game, 11 port…
- Steam kaynağı `external_game_source = 1` (doğrulanmadı: `/v4/external_game_sources` ile bir kez bak).
- Steam app → IGDB: `external_games` `fields game,uid; where external_game_source = 1 & uid = "570";`
- `game_time_to_beats`: `game_id`, `hastily`, `normally`, `completely` (saniye).
- Görsel: `https://images.igdb.com/igdb/image/upload/t_{size}/{image_id}.jpg` — `cover_small`, `cover_big`,
  `screenshot_big`, `720p`, `1080p`, `_2x` ekiyle retina.
- Arama: `/v4/games` üzerinde `search "..."` + `where game_type = (...) & version_parent = null`. `search` ile
  `sort` birlikte kullanılmamalı. Arama metnindeki `"` ve `\` temizlenmeli (kaçış kuralı belgelenmemiş).
- `/v4/multiquery`: tek istekte 10'a kadar adlandırılmış sorgu.

## Vercel AI SDK 7 (`ai@7`, `@ai-sdk/google@4`, `@ai-sdk/react@4`)

- `ToolLoopAgent({ model, instructions, tools, stopWhen, prepareStep, maxOutputTokens, providerOptions,
  onStepEnd, onEnd })`. `system` yok → `instructions`. `onFinish`/`onStepFinish` deprecated → `onEnd`/`onStepEnd`.
- `stopWhen: isStepCount(n)` (`stepCountIs` alias), `hasToolCall(name)`. Varsayılan `isStepCount(20)`.
- `await agent.stream(...)` (Promise döner). Sunucuda `createAgentUIStreamResponse({ agent, uiMessages,
  abortSignal, generateMessageId, messageMetadata, onEnd: ({ messages }) => kaydet })` — mesajları doğrular,
  model mesajlarına çevirir; `onEnd.messages` kaydedilecek tam `UIMessage[]`.
- `toUIMessageStreamResponse()` deprecated. `experimental_context` kaldırıldı → tool'da `contextSchema` +
  agent'ta `toolsContext`/`callOptionsSchema`+`prepareCall`; en basit yol: istek başına closure ile tool üretmek.
- `convertToModelMessages` ve `validateUIMessages` artık async.
- Kullanım: `result.usage` tüm adımların toplamı (`inputTokens`, `outputTokens`, `totalTokens`; hepsi
  `undefined` olabilir). `messageMetadata`'da `finish` part'ının `totalUsage`'ı.
- İstemci: `useChat` (`@ai-sdk/react`) + `new DefaultChatTransport({ api, credentials, body,
  prepareSendMessagesRequest })` (**`ai` paketinden** import). `status`: submitted | streaming | ready | error.
  Tool part'ları `tool-<ad>`; durumlar `input-streaming`, `input-available`, `output-available`, `output-error`.
- Google: `createGoogle({ apiKey })` (alias `createGoogleGenerativeAI`), varsayılan env
  `GOOGLE_GENERATIVE_AI_API_KEY`. Modeller: `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.8-flash`.
- Embedding: `google.embedding("gemini-embedding-2")`, `providerOptions.google.outputDimensionality` (sadece -2)
  ve `taskType` (`RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY`).
- Test: `MockLanguageModelV4`, `MockEmbeddingModelV4` (`ai/test`); `doStream` için `simulateReadableStream`.

## Steam Web API

- Taban `https://api.steampowered.com`, anahtar `?key=`. Geçersiz/eksik anahtarda yanıt **HTML** (401/400);
  `.json()` öncesi `res.ok` kontrol et. Günlük 100.000 çağrı; 403'ler IP'ye sıkı limit getirir; 429 = yavaşla.
- `IPlayerService/GetOwnedGames/v1?steamid&include_appinfo=1&include_played_free_games=1` →
  `response.games[]`: `appid`, `name`, `playtime_forever` (dk), `playtime_2weeks`, `rtime_last_played` (unix sn).
  Profil/oyun detayları gizliyse HTTP 200 + `{"response":{}}` (games yok) → "gizli" say.
- `ISteamUser/GetPlayerSummaries/v2?steamids=a,b` (en fazla 100): `personaname`, `avatarfull`, `profileurl`,
  `communityvisibilitystate` (1 gizli, 3 public), public profilde `gameid` + `gameextrainfo` (şu an oynanan).
- `ISteamUserStats/GetPlayerAchievements/v1?steamid&appid&l=` → `playerstats.achievements[]` (`achieved` 0/1,
  `unlocktime`); başarım yoksa/gizliyse `success:false` (400/403, doğrulanmadı).
- `ISteamUser/ResolveVanityURL/v1?vanityurl=` → `{response:{success:1, steamid}}` / `success:42` (doğrulanmadı).
- CDN: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{appid}/library_600x900.jpg`
  (`header.jpg`, `library_hero.jpg` de var). `shared.cloudflare.steamstatic.com` artık 301 veriyor, kullanma.
- Store `appdetails`: yanıtın üst anahtarı istenen appid olmayabilir → `Object.values(json)[0]`; ~200 istek/5 dk.

## Steam OpenID 2.0 (giriş/bağlama)

- Yönlendirme: `https://steamcommunity.com/openid/login?openid.ns=http://specs.openid.net/auth/2.0&
  openid.mode=checkid_setup&openid.return_to=…&openid.realm=…&openid.identity=…identifier_select&
  openid.claimed_id=…identifier_select`.
- Doğrulama: dönen tüm `openid.*` parametreleri `openid.mode=check_authentication` ile aynı adrese
  form-urlencoded POST → yanıtta `is_valid:true`. Ek kontroller: `mode=id_res`, `op_endpoint` Steam,
  `return_to` bizim verdiğimiz URL (state dahil), `claimed_id === identity`,
  `^https://steamcommunity.com/openid/id/(7656119\d{10})$`, `response_nonce` tek kullanımlık.
- Better Auth 1.7: `createAuthEndpoint`, `getSessionFromCtx`, `APIError` → `better-auth/api`;
  `setSessionCookie` → `better-auth/cookies`; `generateGenericState`/`parseGenericState` → `better-auth`.
  `internalAdapter.findAccountOwnerByKey({providerId, accountId})`, `createUser(user, source)`,
  `createAccount`, `linkAccount`, `createSession`, `reserveVerificationValue`. E-posta zorunlu →
  `${steamId}@steam.placeholder.invalid`; bu adreslere e-posta gönderilmemeli.
