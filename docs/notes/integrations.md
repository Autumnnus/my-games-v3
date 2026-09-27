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
- `ISteamUserStats/GetSchemaForGame/v2?appid&l=english|turkish` → `game.availableGameStats.achievements[]`
  (`name` = apiname, `displayName`, `description`, `hidden` 0/1, `icon`, `icongray` tam URL). Şema oyun başına
  ortaktır; 30 günde bir ya da başarım sayısı değişince yeniden çekilir (`achievement_sets`).
- `ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2?gameid` → `achievementpercentages.achievements[]`
  (`name`, `percent` — string ya da sayı gelebilir).
- `IPublishedFileService/GetUserFiles/v1?steamid&filetype=4&page&numperpage&return_previews=1` → kullanıcının
  **herkese açık** ekran görüntüleri (`k_PFI_MatchingFileType_Screenshots = 4`). `publishedfiledetails[]`:
  `publishedfileid`, `consumer_appid`, `file_url`, `preview_url`, `title`, `time_created`, `image_width/height`.
  Normal Web API anahtarıyla çalışır (belgeye göre; gerçek anahtarla doğrulanmadı). Gizli/arkadaşlara açık
  görüntüler gelmez. Görseller Steam'in adresinden gösterilir, R2'ye kopyalanmaz.
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

## PlayStation Network (`psn-api@2`, resmî değil)

- Kimlik: kullanıcı playstation.com'a girip `https://ca.account.sony.com/api/v1/ssocookie` sayfasındaki `npsso`
  değerini (64 karakter) yapıştırır → `exchangeNpssoForAccessCode` → `exchangeAccessCodeForAuthTokens`. Erişim
  token'ı ~1 sa, yenileme token'ı ~2 ay (`refresh_token_expires_in`). NPSSO saklanmaz.
- **Dikkat:** `exchangeRefreshTokenForAuthTokens` hata durumunda fırlatmaz, alanları `undefined` döner; yanıtı
  doğrula. API çağrıları hata gövdesinde `error` varsa fırlatır.
- Hesap kimliği: `getProfileFromAccountId(auth, "me")` → `onlineId`; `getProfileFromUserName(auth, onlineId)` →
  `profile.accountId`.
- Oynanan oyunlar (yalnızca PS4/PS5, PS Portal/PC dahil): `getUserPlayedGames(auth, "me", {limit, offset})` →
  `titles[]`: `titleId`, `concept.id` (PS4/PS5 sürümleri aynı konsept), `name`, `imageUrl`, `playDuration`
  (ISO 8601, `PT228H56M33S`), `lastPlayedDateTime`.
- Kupalar: `getUserTitles(auth, "me", {limit: 800})` → `trophyTitles[]` (`npCommunicationId`, `npServiceName`
  trophy/trophy2, `definedTrophies`, `earnedTrophies`). Ayrıntı: `getTitleTrophies(npId, "all")` (ad, açıklama,
  ikon; `Accept-Language` ile dil) + `getUserTrophiesEarnedForTitle(me, npId, "all")` (`earned`,
  `earnedDateTime`, `trophyEarnedRate`). PS3/PS4/Vita için `npServiceName: "trophy"` şart.
- Oynanan oyun ↔ kupa seti eşleşmesi ad benzerliğiyle yapılır; yalnızca kupa listesinde olanlar (PS3/Vita)
  süresiz başlık olarak gelir (`np:<npCommunicationId>`).

## Xbox Live (Microsoft hesabı OAuth + XSTS)

- Azure'da **yalnızca kişisel Microsoft hesapları** için uygulama; redirect `{APP_URL}/api/v1/platforms/xbox/callback`
  (Web), bir client secret. `XBOX_CLIENT_ID` / `XBOX_CLIENT_SECRET`.
- OAuth: `https://login.live.com/oauth20_authorize.srf?client_id&response_type=code&scope=Xboxlive.signin
  Xboxlive.offline_access&redirect_uri&state`; token `POST https://login.live.com/oauth20_token.srf`
  (form-encoded; `grant_type=authorization_code|refresh_token`, `scope`, `client_id`, `client_secret`).
- Kullanıcı token'ı: `POST https://user.auth.xboxlive.com/user/authenticate` (`x-xbl-contract-version: 1`)
  `{RelyingParty:"http://auth.xboxlive.com", TokenType:"JWT", Properties:{AuthMethod:"RPS",
  SiteName:"user.auth.xboxlive.com", RpsTicket:"d=<access_token>"}}` → `Token`.
- XSTS: `POST https://xsts.auth.xboxlive.com/xsts/authorize` `{RelyingParty:"http://xboxlive.com",
  TokenType:"JWT", Properties:{UserTokens:[token], SandboxId:"RETAIL"}}` → `Token`, `NotAfter`,
  `DisplayClaims.xui[0]` (`uhs`, `xid` = XUID, `gtg` = gamertag). Xbox profili olmayan hesapta hata.
- Başlık: `Authorization: XBL3.0 x=<uhs>;<xsts>`.
- Oyun geçmişi: `GET https://titlehub.xboxlive.com/users/xuid({xuid})/titles/titlehistory/decoration/achievement,image?maxItems=1000`
  (`x-xbl-contract-version: 2`) → `titles[]`: `titleId`, `name`, `type` (Game/App), `devices`, `displayImage`,
  `achievement.{currentAchievements,totalAchievements}`, `titleHistory.lastTimePlayed`.
- Süre: `POST https://userstats.xboxlive.com/batch` (contract 2) `{arrangebyfield:"xuid", xuids:[xuid],
  stats:[{name:"MinutesPlayed", titleid}]}` → `statlistscollection[0].stats[].value` (dakika, string).
- Başarımlar (Xbox One/Series/PC): `GET https://achievements.xboxlive.com/users/xuid({xuid})/achievements?titleId=&maxItems=1000`
  (contract 2) → `achievements[]`: `id`, `name`, `progressState` ("Achieved"), `progression.timeUnlocked`
  (bilinmiyorsa `0001-01-01`), `mediaAssets[type=Icon]`, `isSecret`, `rarity.currentPercentage`,
  `rewards[type=Gamerscore]`. Xbox 360 başarımları farklı API'de; yalnızca sayılar alınır.
- Kaynak: OpenXbox `xbox-webapi-python` (authentication/manager.py, api/provider/*).
