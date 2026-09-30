# my-games-v3 — Proje Planı

> Son güncelleme: 2026-09-27. Bu belge kararların tek kaynağıdır; karar değişince burası güncellenir.

## 1. Amaç

Oyuncuların oynadıkları oyunları, sürelerini, puan ve yorumlarını tuttuğu, Steam ile otomatik senkronize olan,
herkese açık bir oyun takip platformu. `my-games-old` projesinin (CRA + Express + MongoDB) sıfırdan, yeni bir
stack ve yeni bir veri modeliyle yeniden yazımı.

Temel ilkeler:

- **Sunucu kaynağı kıttır.** Coolify sunucusu 8 GB RAM, ~4 GB dolu. Her karar RAM/CPU maliyetiyle gerekçelendirilir.
- **Elle yapılmayan hiçbir değişiklik doğrudan yazılmaz.** Steam, IGDB, AI ve migration değişiklikleri onaydan geçer.
- **API-first.** Web, ileride desktop (Tauri) ve başka istemciler aynı `/api/v1`'i kullanır.
- **UI dili: Salon.** Koyu zemin, oyunun kendi görselleri (Steam hero, logo, kapak) ve kapaktan gelen ortam rengi. shadcn bileşenleri korunur, görünümleri temadan gelir.

## 2. Kararlar

| Konu | Karar | Neden |
|---|---|---|
| Kullanıcı kitlesi | Herkese açık kayıt | — |
| Sosyal model | Takip/arkadaşlık **yok**, gizlilik ayarı **yok**. Tek global akış | Şu an kullanıcı yok; ihtiyaç doğunca eklenir |
| Etkileşim | Beğeni + yorum + bildirim var | — |
| Giriş | E-posta+şifre (doğrulamalı), Google, Discord, Steam | Steam girişi Faz 3'te Steam entegrasyonuyla gelir |
| Dil | TR + EN, tarayıcıdan tespit, cookie ile hatırlama | Temel dil (fallback) EN |
| Görseller | Cloudflare R2, tarayıcıdan presigned upload | Görseller sunucudan hiç geçmez |
| AI | Vercel AI SDK + Gemini, şimdilik sadece sağlam temel | AI ayrı büyük geliştirme olacak |
| Desktop | İleride Tauri 2; aynı React UI, Rust sadece native katman | Backend Rust olmayacak |
| Domain / repo | Cloudflare (DNS, CDN) / GitHub | — |

## 3. Tech stack

| Katman | Seçim |
|---|---|
| Runtime | Node 24 LTS, pnpm workspaces |
| Web | TanStack Start 1.x (React 19, Vite 8), TanStack Router + Query, Nitro (Node sunucusu) |
| UI | Tailwind 4 + shadcn/ui (Salon teması), lucide ikonlar, Unbounded + Manrope (fontsource, kendi sunucumuzdan) |
| i18n | Paraglide JS 2 — strateji: `cookie → preferredLanguage → baseLocale` |
| API | Hono 4, `/api/v1`; web process'i içinde çalışır; SSR'da ağ yerine process içi çağrı |
| DB | Postgres 18 + pgvector (+ pg_trgm, unaccent), Drizzle ORM, drizzle-kit migration |
| Auth | Better Auth (cookie session) + username + admin plugin'leri |
| Kuyruk / cron | pg-boss (Postgres üzerinde; Redis yok) — ayrı `worker` container |
| Gerçek zamanlı | SSE + Postgres LISTEN/NOTIFY |
| E-posta | Resend (dev'de konsola yazılır) |
| Bot koruması | Cloudflare Turnstile + rate limit (kayıt ve yorumlarda) |
| AI | AI SDK 7 (`ToolLoopAgent`) + `@ai-sdk/google` |
| RAG (sonra) | Gemini embedding (`gemini-embedding-2`, boyut düşürülmüş) + pgvector, hibrit arama |
| Hata takibi / analitik | Sentry free tier / Cloudflare Web Analytics |
| Lint / format | Biome |
| CI/CD | GitHub Actions → GHCR imajları → Coolify imajı çeker (sunucuda build yok) |

Bilerek elenenler: Next.js (self-host RAM/build yükü, statik export'ta Tauri ile ayrı veri katmanı gerekir),
MongoDB (RAM), Redis (Postgres yetiyor), Rust backend (AI SDK TS; yük I/O).

## 4. Mimari

```
Cloudflare (DNS · CDN · Turnstile)                 R2 (görseller · DB yedekleri)
            │                                        ▲ tarayıcıdan direkt upload
            ▼
Coolify ─┬─ app      TanStack Start SSR + Hono /api (+ SSE)
         ├─ worker   pg-boss: Steam sync · presence · IGDB · bildirim · embedding
         └─ postgres + pgvector
                      ▲
        Steam API · IGDB · Gemini · Resend          Desktop/Tauri (sonra) ──► /api/v1
```

### Kaynak bütçesi (hedef)

| Container | RAM |
|---|---|
| app | ~150–250 MB |
| worker | ~100–150 MB |
| postgres (`shared_buffers=256MB`, `max_connections≈30`) | ~200–350 MB |
| **Toplam** | **~0.5–0.75 GB** |

Build sunucuda **yapılmaz**; GitHub Actions'ta build edilen imaj Coolify'a çekilir.

### Repo yapısı

```
apps/web        TanStack Start (SSR + SPA modu), UI, i18n; /api/* isteklerini Hono'ya verir
apps/worker     pg-boss işleri (sync, bildirim, embedding)
packages/api    Hono uygulaması, Better Auth, servisler (framework bağımsız)
packages/db     Drizzle şeması, client, migration'lar
docs/           Plan ve deploy notları
```

### Olay omurgası (outbox)

Bir değişiklik uygulandığında aynı transaction içinde bir iş/olay yazılır (pg-boss Drizzle transaction içinde
job oluşturabiliyor). Worker bu olayları tüketir:

```
değişiklik (elle / onaylı sync / AI / desktop)
  └─ aynı transaction'da event: entry.completed, review.created, comment.created …
       └─ worker:
            ├─ activity     → global akış
            ├─ notification → ilgili kullanıcı (uygulama içi + push)
            ├─ embedding    → RAG index (sonra)
            └─ stats/cache
```

## 5. Veri modeli (hedef)

Tablolar ilgili fazda migration olarak eklenir.

**Auth (Faz 0):** `user` (+ `username`, `role`, `banned`), `session`, `account`, `verification`.

**Katalog ve kütüphane (Faz 1):**

- `games` — ortak katalog: `igdb_id`, `steam_app_id`, ad, slug, kapak, çıkış tarihi, özet, time-to-beat,
  `metadata_synced_at`. Taksonomi: `genres`, `themes`, `game_modes`, `player_perspectives`, `companies`
  + join tabloları (istatistik sorguları için normalize).
- `library_entries` — kullanıcı × oyun: `status`, `rating` (0–10, tek ondalık, 0–100 int saklanır), `review`,
  `platform`, `store`, `playtime_manual_min`, `playtime_steam_min`, `started_at`, `finished_at`,
  `last_played_at`, `is_favorite`.
- Durumlar: `playing`, `completed`, `paused`, `dropped`, `backlog`, `wishlist`, `endless`.
- `platform` (PC, PS5, Switch…) ve `store` (Steam, Epic, Game Pass, Torrent…) ayrı alanlardır.

**Sync ve onay (Faz 2–3):** `change_proposals` (kaynak, alan, eski → yeni, güven, durum), `sync_rules`,
`sync_runs`, `activity_log` (geri alma için), `steam_accounts`, `play_sessions`
(`source`: `steam_delta` | `steam_presence` | `desktop` | `manual`), `playtime_snapshots`.

**Sosyal (Faz 4):** `activities`, `comments` (tek seviye yanıt, mention), `reactions`, `notifications`
(gruplama anahtarlı), `notification_preferences`, `push_subscriptions`, `reports`.

**Medya:** `screenshots` (`upload` | `external` | `steam`, boyutlar); yüklenen dosyalar `media_assets`'te
(varyantlar, byte, depo), kota `user_storage`'da. Ayrıntı: `docs/notes/storage.md`.

**AI (Faz 6–7):** `chat_threads`, `chat_messages` (UIMessage jsonb), `ai_usage`, `documents`, `chunks`
(embedding, `content_hash`, sahip, dil).

## 6. Sync ve onay sistemi

```
Kaynak (Steam / IGDB / AI / Migration)
  → diff: alan, eski → yeni, kaynak, güven
  → sync_rules: otomatik uygula | onaya sor | yok say
  → Onay Kutusu (toplu onay/red, diff görünümü)
  → uygula + activity_log (geri alınabilir) + event
```

Varsayılan kurallar: Steam süre/son oynama → otomatik · Steam'de yeni oyun → sor (backlog'a ekle / yok say /
bir daha sorma) · durum önerileri → sor · IGDB metadata → otomatik · AI değişiklikleri → sor.

Zamanlama: Steam `GetOwnedGames` (tek istekte tüm kütüphane) kullanıcı başına birkaç saatte bir + "Şimdi
senkronize et"; başarımlar yalnız süresi değişen oyunlar için; IGDB metadata haftalık, dağıtılmış;
kuyruk rate-limit'e göre backoff. Steam oturum geçmişi vermez; süre farkları `play_sessions` olarak kaydedilir.

## 7. Steam

- Bağlama: Steam OpenID 2.0 (Better Auth için özel plugin) veya profil linki / vanity URL.
- Veri: sahip olunan oyunlar + süreler, son oynananlar, başarımlar, profil.
- Canlı durum: `GetPlayerSummaries` (100 kullanıcı/istek) oyundaki oyunu döner → "şu an oynuyor".
- Steam ↔ IGDB eşleşmesi: IGDB `external_games` (Steam app id) ile kesin eşleşme.
- Gereksinim: Steam Web API key; kullanıcının profili ve oyun detayları public olmalı.
- "Powered by Steam" ibaresi ve IGDB attribution gösterilir.

### Takipten önceki oynama geçmişi (tahmin)

Platformlar oturum geçmişi vermez: ilk gözlemdeki süre (ve elle/eski sistemden gelen süre) hiçbir güne yazılmaz.
`core/estimates` bu süreyi takibin başladığı andan (ufuk) önceye dağıtır; ısı haritası, yıllık istatistik ve Wrapped
eski yılları da gösterir. İlke: **AI bilgi verir, kod hesaplar.**

- **Bütçe** = kaydın görünen toplam süresi − gerçek oturumlar; tahmin + oturumlar her zaman kütüphanedeki toplamdır.
  **Ufuk** = başlığın ilk gözlemi (`platform_snapshots.baseline_at`) ve ilk gerçek oturum; tahmin asla ufuktan sonraya
  yazılmaz, gerçek oturumlarla çakışmaz.
- **Kanıt** (`evidence.ts`): ekran görüntüsü ve başarım günleri (aynı dakikadaki toplu açılımlar zayıf), bitirme ve son
  oynama (ilk gözlemdeki değer dondurulur), eklenme günü (toplu içe aktarım günleri hariç), çıkış tarihi, IGDB bitirme
  süresi, tür/mod.
- **Plan** (`planner.ts`): kanıt günleri kümelenir, her küme süresini taşıyacak kadar genişletilir; yıllara yayılan
  oyunlarda düzenli bir arka plan fazı eklenir. ≥5 saatlik ve güveni < 0,5 olan oyunlarda AI (`ai.ts`) yalnızca oyun
  bilgisini verir: tür (araç → dağıtılmaz, kampanya, yıllara yayılan), gerçek çıkış tarihi, saatlerin gittiği dönemler.
  İpucu planla saklanır; kurallar ya da kanıt değişince plan AI'ya tekrar sorulmadan yeniden kurulur.
- **Sentez** (`synthesize.ts`): tohumlu (kayıt kimliği + üretici sürümü) ve deterministik; Markov zinciriyle seri halinde
  aktif günler, uzun fazlarda aylık dalga, kişisel haftalık ritim, toplam tam bütçe. Kullanıcı düzeyinde uzlaştırma: aylık
  yük sınırını aşan aylar geriye yayılır (önce yıllara yayılan oyunlar kayar), günlük tavan aşılmaz.
- **Kayıt**: `play_estimate_plans` (kayıt başına plan + kanıt), `play_estimate_days` (gün × kayıt), `play_estimate_builds`
  (derleme özeti). Kayıt silinince tahmini de gider. Worker: platform sync'i bitince (`estimates.requested`) ve 20 dakikada
  bir değişen kullanıcılar için `estimates.rebuild-user`. Elle: `pnpm --filter @my-games/core estimates:rebuild -- --user
  <ad> [--no-ai] [--force] [--ask-ai]`.
- **İşaret**: API tahmin olan kısmı ayrı döner (`estimatedMinutes`); ısı haritasında taralı, Wrapped'da "~" ve "Tahmini".
  Akış, bildirim, karşılaştırma ve site geneli istatistikler tahmini kullanmaz.
- **Kayıt sayfası** (`components/play-history.tsx`): ay ay (üç yıldan uzunsa yıl yıl) gerçek + taralı tahmini süre,
  tahminin kaynağı (kurallar / AI / kullanıcı), güveni ve AI notu. Sahip "Tarihleri düzelt" ile dönemleri (başlangıç,
  bitiş, yoğun / düzenli / ara sıra) ya da "bu bir oyun değil"i girer; pay dönem uzunluğu × yoğunluktan hesaplanır,
  plan `planner = user` olarak kilitlenir (AI ve kurallar değiştirmez), takip başladıktan sonrası seçilemez. "Tahmine
  dön" saklanan AI ipucuyla planı yeniden kurar. API: `GET|PUT|DELETE /library/:id/play-history`.
- **"Geçmişini netleştir" destesi** (`components/play-history-deck.tsx`, kendi istatistik sayfandaki takvimden): çok
  saatli ve kanıtı az oyunlar (öncelik = süre × (1 − kanıt güveni); AI'nın kendi güvenine bakılmaz, eşik 0,6) birer birer
  sorulur: "bir kerede" (yıl, biliniyorsa ay), "yıllara yayarak" (yıllar), "tahmin doğru", "oyun değil", "atla". Cevap
  kullanıcı planı olarak kilitlenir; geometriyi kod kurar (`planFromAnswer`). API: `GET /me/play-history/questions`,
  `POST /library/:id/play-history/answer`. AI gerekmez; asistan sohbetine araç olarak bağlanması sonraki iş.
- **Bitirme tarihi önerisi** (`estimates/finish.ts`, her tahmin derlemesinden sonra): AI oyun başına bir kez "ana hikâyeyi
  bitirince açılan başarımları" (herhangi bir son; çoğu gizli olduğundan anahtar kelime işe yaramaz) seçer, sonuç
  `achievement_sets.ending_api_names`'te herkes için ortak saklanır. Bitirme tarihi boş kayıtlara sonun en erken açıldığı gün
  önerilir (kayıt "bitirildi" değilse durum da); aynı dakikadaki toplu açılımlar tarih sayılmaz. Başarımı olmayan
  kayıtlarda yalnızca "bitirdim" denmiş ama tarihi girilmemişse son oynama günü (`system`). Öneri türü `finish_date`,
  varsayılan kural "sor", kayıt başına bir kez; 7 günden eski bitirmeler onaylanınca akışa düşmez.
- Başarım çekiminde düzeltme: geçici hata (istek sınırı) alan başlık artık "kontrol edildi" işaretlenmez (Steam başarım
  sayısını önceden bildirmediği için bir daha denenmiyordu); 0019 mevcut başlıkları yeniden denetir.
- Sonraki adımlar: görünürlük tercihi (herkese / yalnızca ben / kapalı), asistan sohbetinde "Witcher 3'ü 2016 yazında
  bitirdim" gibi cümlelerden aynı cevabı üreten onaylı araç, gerçek oturumlarla geriye dönük doğruluk ölçümü.

## 8. Sosyal: akış, beğeni, yorum, bildirim

- Aktivite türleri: başladı, bitirdi, bıraktı, puanladı, review yazdı, backlog/wishlist'e ekledi, süre eşiği
  (10/50/100 sa), başarım/%100, screenshot, liste, şu an oynuyor.
- Gürültü kontrolü: sync süre farkları günlük toplanır ("bugün 3 sa 20 dk oynadı"); art arda benzer olaylar
  gruplanır.
- Tek global akış (takip yok). Oyun sayfasında topluluk puan ortalaması ve review'lar.
- Beğeni + yorum: aktivite, review, screenshot, liste. Yorumlarda tek seviye yanıt ve `@kullanıcı`.
- Bildirim türleri: beğeni, yorum, yanıt, mention, onay bekleyen değişiklik, sistem. Gruplama
  ("X ve 3 kişi daha beğendi").
- Kanallar: uygulama içi (SSE), Web Push (PWA), opsiyonel e-posta özeti; sonra desktop native.
- Minimum moderasyon: admin içerik silme, kullanıcı banlama, şikayet, yorum rate limit.
- Hesap silme ve veri dışa aktarma (KVKK/GDPR).

## 9. AI

**Temel (Faz 6):** `ToolLoopAgent` + Gemini; model seçimi tek config'te. `stopWhen` adım limiti, `prepareStep`
bağlam yönetimi. İlk tool'lar salt-okuma (kütüphane arama, istatistik, oyun detayı, kullanıcı karşılaştırma).
Sohbetler Postgres'te; her adım ve tool çağrısı loglanır. Kullanıcı başına günlük kota.

**Büyük geliştirme (Faz 7):** yazma tool'ları (öneri onay kutusuna düşer), RAG, hafıza.

**My games AI (Faz 7a, 2026-09-29):** sayfanın üstünde panel (⌘J, sabitlenebilir), `/ai` tam ekran,
sayfa bağlamı, `@`/`/`, Sor/Yap (yazma araçları AI SDK tool onayıyla; kart + geri al), kart cevaplar,
akıllı listeler, "Ne oynasam?", oyun sonrası röportaj, "Kaldığın yer". Sağlayıcıdan bağımsız anahtar
havuzu + yedek model zinciri. Ayrıntı: [notes/ai.md](notes/ai.md).

**Yönetim tarafı (2026-09-30):** her model çağrısı iz olarak kaydedilir (adımlar, araçlar, süreler,
anahtar değişimleri, token'lar; içerik değil). Maliyet fiyat tablosuyla okuma anında hesaplanır, kişi başı
sınır ve AI'yı kapatma panelden. Ayrıntı: [notes/admin.md](notes/admin.md).

**RAG:** ayrı vektör DB yok; aynı Postgres'te pgvector (yetki filtresi ve join'ler aynı sorguda).
`documents` + `chunks`, boyutu düşürülmüş embedding, HNSW index. Hibrit arama (Postgres FTS TR/EN + vektör,
RRF ile birleştirme). Event ile tetiklenen yeniden indexleme (`content_hash`). Agent'a `searchKnowledge`
tool'u olarak verilir. İleride multimodal embedding ile screenshot araması.

## 10. Desktop (Faz 8)

- Aynı React UI, Tauri 2 ile SPA modunda paketlenir; veri `/api/v1`'den token ile.
- Rust tarafı: process tespiti, oturum başlangıç/bitiş, tray, otomatik başlatma, native bildirim.
- Oyun eşleme: Steam `appmanifest` dosyalarından kurulum klasörü → app id; bilinmeyenler kullanıcıya bir kez sorulur.
- Bunun için şimdiden: tüm veri API'den, UI SSR'a bağımlı değil, `play_sessions.source` hazır.

## 11. Migration (Faz 2)

Kaynak: `my-games-old/old_db_data/kadir_games.json` (98 oyun, kullanıcı `vector`) ve `mustafa_games.json` (263 oyun).

1. Idempotent script, `--dry-run` rapor.
2. Normalize: Türkçe durum/platform → yeni enum'lar (`Bitirildi`→`completed`, `Bırakıldı`→`dropped`,
   `Aktif Oynanılıyor`→`playing`, `Bitirilecek`→`backlog`; `Steam`/`Epic Games`/`Ubisoft`/`EA Games`/`Torrent`
   → `store`, `Xbox(Pc)` → PC + Game Pass, `Playstation` → PS), saat → dakika, string/null süreler, Firestore
   `createdAt` → timestamp, `gameDate` → `last_played_at` (tamamlananlarda `finished_at`).
3. Eşleştirme: isim → IGDB arama + benzerlik skoru (pg_trgm) → Steam app id `external_games`'ten.
4. Emin olunanlar otomatik; belirsizler Onay Kutusu'na "migration" kartı olarak düşer.
5. Kapaklar IGDB'den, eski link yedek olarak saklanır. Kadir'in Steam UGC screenshot linkleri `external` screenshot.
6. Kullanıcılar yeniden açılır (eski bcrypt hash'leri taşınmaz). Mustafa'nın eski kullanıcı kaydı dump'ta yok.
7. Veri kirleri: 1 string süre (`"7.8"`), 1 `null` süre, "Lego Harry Potter 1-4" iki kez.

## 12. Ek özellikler (öncelik sırasıyla)

- Aktivite ısı haritası ve oyun zaman çizelgesi (sync verisinden)
- Backlog + IGDB time-to-beat ("backlog'u bitirmek ~X saat") + sıradaki oyun kuyruğu
- Kullanıcı karşılaştırma: ortak oyunlar, puan farkları, uyum skoru
- Değişiklik geçmişi + geri al
- `Cmd+K` hızlı arama/ekleme
- Yıl özeti ("Wrapped")
- Listeler ve etiketler
- PWA + JSON/CSV export
- Başarım yüzdesi ve %100 rozetleri
- Alt puanlar (hikaye / oynanış / grafik / müzik), opsiyonel
- Sonra: wishlist fiyat alarmı (IsThereAnyDeal), SteamGridDB görselleri

## 13. Yol haritası

| Faz | İçerik | Durum |
|---|---|---|
| 0 | Monorepo, CI/CD, Docker, Postgres + migration altyapısı, auth (e-posta, Google, Discord), i18n, standart UI kabuğu, worker iskeleti | Tamam |
| 1 | Katalog + kütüphane, IGDB arama, SSR'lı profil sayfaları, grid/tablo/filtreler, R2 screenshot | Tamam |
| 2 | Outbox + worker tüketicileri, Onay Kutusu, migration (Kadir & Mustafa) | Tamam |
| 3 | Steam: giriş/bağlama, sync, canlı durum, oturum geçmişi | Tamam |
| 4 | Sosyal: global akış, beğeni/yorum, bildirimler (uygulama içi + push), moderasyon, Turnstile | Tamam |
| 5 | İstatistikler, karşılaştırma, yıl özeti | Tamam |
| 6 | AI temeli: agent, okuma tool'ları, kota | Tamam |
| 7 | AI büyük geliştirme: RAG, yazma tool'ları, hafıza | Asistan + yazma tool'ları tamam ([ai.md](notes/ai.md)); RAG altyapısı hazır ([rag.md](notes/rag.md)) |
| 7b | Yönetim paneli: kullanıcılar ve veri silme, AI izleri ve maliyet, kotalar, sistem durumu, loglar, denetim kaydı ([admin.md](notes/admin.md)) | Tamam |
| 8 | Desktop (Tauri) | — |

### Faz 0 notları

- Auth: e-posta+şifre (doğrulama zorunlu), Google ve Discord (env doluysa açılır), şifre sıfırlama, kullanıcı adı
  (sosyal girişte otomatik üretilir), admin plugin (rol/ban), son giriş yöntemi. Oturum 5 dk cookie cache'li.
- Steam girişi Faz 3'e (Steam entegrasyonuyla birlikte), Turnstile Faz 4'e (yorumlarla birlikte) bırakıldı.
- Postgres extension'ları: `vector`, `pg_trgm`, `unaccent`.
- E-postalar kullanıcının dilinde (cookie → Accept-Language) gönderilir.
- Ölçülen RAM (Docker, boşta): app ~54 MB, worker ~21 MB, Postgres ~54 MB.

### Faz 1–6 notları

- **Faz 1:** Katalog/kütüphane (IGDB içe aktarma, elle ve Steam oyunu), profil ve kayıt sayfaları (SSR + OG meta),
  kütüphane filtre/sıralama/ızgara-tablo, oyun sayfası (topluluk puanı, review'lar, time-to-beat), `Cmd+K` ekleme,
  screenshot'lar (tarayıcıda WebP + presigned upload), değişiklik geçmişi ve geri alma, veri dışa aktarma.
- **Faz 2:** Transactional outbox + worker (LISTEN/NOTIFY + yoklama, artan bekleme), onay kutusu (kurallar,
  "bir daha sorma", toplu onay), migration script'i ve IGDB eşleştirme işi. Gerçek dump'larla aktarıldı:
  Kadir 98, Mustafa 262 (+1 tekrar), 442 screenshot linki.
- **Faz 3:** Steam OpenID giriş/bağlama (Better Auth plugin), sync (süre, son oynama, başarımlar, yeni oyun ve
  durum önerileri, süre çakışması), `steam_snapshots` ile tekrar sayılmayan oturumlar, presence ("şu an oynuyor").
- **Faz 4:** Global akış (günlük gruplama, süre eşikleri), beğeni/yorum/yanıt/`@bahsetme`, gruplanmış bildirimler,
  SSE ile anlık iletim, Web Push + PWA, bildirim tercihleri, şikayet + admin moderasyonu (ban), Turnstile (opsiyonel).
- **Faz 5:** Kullanıcı ve site istatistikleri, aktivite ısı haritası, backlog tahmini, karşılaştırma + zevk uyumu,
  yıl özeti.
- **Faz 6:** `ToolLoopAgent` + Gemini, 6 salt-okunur tool, sohbet kaydı, günlük token kotası, `AI_PROVIDER=mock`.

**Bağımsız inceleme (güvenlik + doğruluk) sonrası düzeltmeler:**

- **Güvenlik:**
  - Nesne anahtarları sıkı biçimde doğrulanıyor (`../` ile başkasının dosyasını silme kapandı).
  - Presigned PUT artık Content-Type ve Content-Length'i imzalıyor (HTML/büyük dosya yüklenemez).
  - `/api/v1` için CSRF (origin) kontrolü eklendi.
  - Better Auth IP'yi `cf-connecting-ip` başlığından okuyor; kullanıcı adıyla giriş de captcha'lı.
  - Steam'in yer tutucu e-posta adresleriyle kayıt olunamıyor.
  - Push adresleri yalnızca tarayıcı servislerine gidebiliyor ve kullanıcı başına en fazla 10.
  - Ağır/pahalı uç noktalara rate limit ve önbellek eklendi.
  - Eşleştirme onayında yalnızca sunulan aday kabul ediliyor ve yalnızca onaylayanın kaydı taşınıyor.
- **Doğruluk:**
  - Steam'den gelen yeni oyun onayı artık çökmüyor (jsonb'den gelen tarih geri çevriliyor).
  - Oyun birleştirmede Steam kimliği korunuyor (gerekirse `steam_app_aliases` ek kimliği olarak), kayıtsız
    oturumlar ve bekleyen öneriler de taşınıyor.
  - Aynı kullanıcı için iki sync aynı anda çalışamıyor (pg-boss `stately`).
  - Akış imleci mikro saniye hassasiyetinde.
  - "Bir daha sorma" her öneri türünde çalışıyor; reddedilen süre çakışması ve eşleştirme bir daha sorulmuyor.
  - Bildirim sayısı yalnızca yeni önerileri sayıyor.
  - Moderasyonla kaldırılan inceleme akıştan da siliniyor ve geri alınamıyor.
  - Silinen kayıt/hesabın dosyaları R2'den temizleniyor.
  - "Gün" hesapları `APP_TIMEZONE`'a göre yapılıyor.

**Doğrulama durumu:**

- 56 otomatik test (gerçek Postgres) ve tarayıcı testleri geçiyor.
- Canlı anahtarı olmayan dış servisler (IGDB, Steam Web API, Gemini, R2, Google/Discord OAuth, Resend, Web Push)
  belgelere göre yazıldı ve sahte yanıtlarla test edildi. İlk gerçek anahtarla her biri bir kez uçtan uca
  denenmeli.
- Canlı doğrulananlar:
  - Steam OpenID sahte imzayı reddediyor.
  - MinIO (S3) üzerinden imzalı yükleme çalışıyor; imzada olmayan tür veya boyut reddediliyor.
- R2'nin imzalı Content-Length'i zorladığını ilk deploy'da bir kez kontrol et.

**Platform genişletmesi (2026-09-27):**

- **Ortak sync motoru** (`packages/core/src/platforms/engine.ts`): Steam, PlayStation ve Xbox aynı mantığı
  kullanır: süre, çakışma, oturum, durum önerisi, yeni oyun ve başarımlar. Platforma özel kısım yalnızca başlık
  listesi, kayıt eşleştirme ve başarım ayrıntısıdır. Son gözlem `platform_snapshots`'ta tutulur, oyunun platform
  kimlikleri `game_external_ids`'te.
- **Başarımlar:** tanımlar oyun başına ortak (`achievement_sets` + `achievements`; TR/EN adlar, ikon adresi,
  nadirlik, PSN kupa derecesi, Xbox gamerscore). Kullanıcı başına yalnızca açılanlar tutulur
  (`user_achievements`). İlk içe aktarım sessizdir; sonra açılanlar akışa "X başarım açtı" olarak düşer (en
  nadirler önde). Görseller platform CDN'inden gelir, depo kullanılmaz.
- **Steam ekran görüntüleri:** herkese açık paylaşılanlar (`GetUserFiles`) ilgili kayda eklenir. Kural
  `steam:screenshots`: otomatik / onayla / yok say. Reddedilenler bir daha önerilmez.
- **PlayStation:** kullanıcının NPSSO koduyla bağlanır (resmî değil; `psn-api`). Kod saklanmaz, yenileme
  token'ı AES-256-GCM ile şifrelenir. PS4/PS5 süreleri, PS3/Vita dahil kupalar alınır. Token'ın süresi
  dolunca hesap "yeniden bağla" durumuna düşer.
- **Xbox:** Microsoft OAuth + XSTS (Azure uygulaması gerekir). Oyun geçmişi, MinutesPlayed ve Xbox One/Series/PC
  başarımları alınır.
- **Doğrulama:** Hepsi sahte yanıtlarla test edildi (toplam 66 test) ve tarayıcıda denendi. Gerçek anahtarla her biri
  bir kez uçtan uca denenmeli: Steam başarım/ekran görüntüsü, PSN NPSSO akışı, Azure uygulaması.
- **Masaüstü (Tauri):** web öncelikli olduğu için ertelendi. GOG/Epic/EA/Ubisoft kütüphaneleri ve Steam'in
  paylaşılmamış ekran görüntüleri yalnızca yerel istemciyle alınabilir.

**Salon arayüzü (2026-09-28):**

- Dört yön denendi (tasarım panosu: Raf, Dergi, Salon, Zaman); Salon seçildi.
- `games` tablosuna `hero_url`, `logo_url`, `accent_color`, `art_synced_at` eklendi. Worker (`catalog.game-art`, saatte
  60 oyun) Steam mağaza API'sinden hero ve logoyu alır, kapağı bir kez indirip baskın rengi hesaplar (`jpeg-js`, native
  bağımlılık yok). İlk kurulumda hemen doldurmak için: `pnpm --filter @my-games/core art:refresh`.
- Arayüz: sayfanın arkasında `<Stage>` (hero + ortam rengi), cam üst menü, telefonda alt sekme çubuğu, logolu ana sayfa
  sahnesi ve kapak şeridi, cam "senin kaydın" kartı, akışta büyük kartlar ve ekran görüntüsü önizlemeleri.
- Koyu logolar (ör. Crusader Kings III) tarayıcıda bir kez ölçülüp beyaza çevrilir. Sayfa geçişleri View Transitions
  ile; kapak kütüphaneden kayıt sayfasına uçar. `prefers-reduced-motion` tüm animasyonları kapatır.
- Onay kutusu varsayılan olarak deste: sağa sürükle onayla, sola reddet, "sonraya bırak"; aynı kararlar düğmelerle de
  verilir. Eşleşme ve süre çakışmasında karar kartın içindeki seçimle. Liste görünümü (toplu onay) duruyor.
- Oyun "Bitirildi"ye geçince kayıt sayfasında damga vurulur; süreler değişince rakamlar döner (`RollingText`).
- Yıl özeti hikâye biçiminde (otomatik ilerleyen kareler, ok tuşları, durdur, bağlantı paylaş); grafikler altta
  "Ayrıntılar" olarak kaldı.
- İstatistik, karşılaştırma, ayarlar (iki sütun), sohbet, bildirimler, geçmiş, yönetim ve giriş sayfaları Salon
  bileşenlerini kullanıyor; form alanları, diyaloglar ve açılır menüler de temaya uyarlandı.

**Plandan kalanlar:** listeler/etiketler, alt puanlar, wishlist fiyat alarmı, SteamGridDB görselleri, e-posta özeti.

## 14. Eski sistemden kapanan sorunlar

Süresiz JWT (localStorage) → httpOnly cookie session · S3 `public-read-write` ACL → private bucket + presigned
upload · IGDB sorgusuna kullanıcı girdisinin ham gömülmesi → parametreli/kaçışlı sorgu · elle tutulan sayaçlar
(`screenshotSize`, `gameSize`) → SQL ile hesaplanan değerler · gece istatistik cron'u → canlı sorgu.
