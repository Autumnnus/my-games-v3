# Deploy (Coolify + Cloudflare)

Akış: `main`'e push → GitHub Actions lint/build/typecheck/test → `app` ve `worker` imajları GHCR'a → Coolify
webhook ile yeni imajı çeker. **Sunucuda build yapılmaz.**

## 1. Cloudflare

- Domain için sunucu IP'sine `A` kaydı, proxy açık (turuncu bulut).
- SSL/TLS modu: **Full (strict)**. Coolify Let's Encrypt sertifikası alır; alternatif olarak Cloudflare Origin
  Certificate kullanılabilir.
- Bildirim akışı (SSE) proxy'den geçer; uygulama 25 sn'de bir heartbeat gönderdiği için bağlantı kopmaz.
- Rate limit istemci IP'sini `CF-Connecting-IP` başlığından okur. Bu başlık taklit edilebildiği için sunucunun
  80/443 portlarını yalnızca [Cloudflare IP aralıklarına](https://www.cloudflare.com/ips/) aç (Hetzner/OVH
  firewall ya da `ufw`).

## 2. Cloudflare R2 (görseller)

1. R2'de bucket oluştur (ör. `my-games`), **Public access**'i özel domainle aç (ör. `cdn.<domain>`).
2. **R2 API token** oluştur (Object Read & Write, sadece bu bucket).
3. Bucket → Settings → **CORS policy** (tarayıcı doğrudan yüklediği için şart; `Cache-Control` imzaya dahil
   olduğu için izinli başlıklarda olmalı):
   ```json
   [
     {
       "AllowedOrigins": ["https://<domain>", "http://localhost:3300"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["Content-Type", "Cache-Control"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
4. Değişkenler (app **ve** worker; worker dosya silme işlerini yapar): `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`,
   `S3_REGION=auto`, `S3_BUCKET=my-games`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL=https://cdn.<domain>`.
5. **DB yedekleri için ayrı, public erişimi kapalı bir bucket** aç (ör. `my-games-backups`) ve Coolify'a onu ver;
   yedekler asla görsellerin public bucket'ına konmaz. 10 GB ücretsiz alan hesabın tamamı için geçerli, yedekler de
   bu alandan yer; 7 günlük saklama yeterli.

Görseller tarayıcıda AVIF'e çevrilip (ya da "orijinal" seçildiyse dosyanın kendisi) imzalı URL ile doğrudan R2'ye
yüklenir; sunucu byte'lara dokunmaz. İmzada tür, boyut ve `Cache-Control` vardır: istemci başka türde (ör.
`text/html`) ya da bildirdiğinden farklı boyutta dosya yükleyemez (R2'de doğrulandı). Klasör yapısı, kota ve
sıkıştırma ayarları: `docs/notes/storage.md`.

**Kota:** varsayılan kullanıcı kotası `STORAGE_DEFAULT_QUOTA_MB` (250), sistem bütçesi `STORAGE_BUDGET_GB` (8).
Bütçe dolunca yükleme herkese kapanır; %80 ve %95'te adminlere bildirim düşer. Varsayılan kota ve kişi bazında
kota admin API'siyle (`/api/v1/admin/storage…`) deploy'suz değişir.

Ek güvenlik (önerilir): CDN alan adına Cloudflare'de bir **Transform Rule → Response Header** ile
`X-Content-Type-Options: nosniff` ekle. Mümkünse bucket'ı uygulamadan farklı bir kayıtlı alan adından sun (ör.
`<domain>-cdn.com`); aynı site olduğunda o alan adındaki bir dosya uygulamanın cookie'lerine yakın durur.

## 3. GHCR erişimi

İlk başarılı `main` build'inden sonra imajlar oluşur:

- `ghcr.io/<github-kullanıcı>/<repo>-app`
- `ghcr.io/<github-kullanıcı>/<repo>-worker`

Paketler varsayılan olarak private'tır. Coolify'da **Settings → Docker Registries**'e `read:packages` yetkili bir
GitHub token ekle (ya da paketleri public yap).

## 4. Coolify kaynakları

### Postgres

- New Resource → Database → PostgreSQL. İmaj: **`pgvector/pgvector:pg18`** (uuidv7 ve pgvector için şart).
- Custom PostgreSQL configuration:
  ```
  shared_buffers = 256MB
  max_connections = 30
  work_mem = 8MB
  ```
- Dışarıya açma (public port kapalı). Uygulamalar Coolify'ın iç ağından bağlanır.
- **Scheduled Backups**: günlük, hedef olarak R2'deki **yedek bucket'ını** (`my-games-backups`, public değil) S3
  storage olarak ekle (Settings → S3 Storages). Görsellerin bucket'ını kullanma.

### app

- New Resource → Docker Image → `ghcr.io/<github-kullanıcı>/<repo>-app:latest`
- Port `3000`, domain `https://<domain>`, health check `GET /api/v1/health`
- Önerilen memory limit: 384 MB. Başlarken migration'ları kendisi uygular (advisory lock'lu).

### worker

- New Resource → Docker Image → `ghcr.io/<github-kullanıcı>/<repo>-worker:latest`
- Domain/port yok. Önerilen memory limit: 256 MB.
- Zamanlanmış işler (UTC): Steam presence her 2 dk, Steam sync 6 saatte bir (ekran görüntüleri dahil),
  PSN/Xbox sync 6 saatte bir, IGDB eşleştirme 04:00,
  metadata yenileme pazartesi 05:00, outbox temizliği 03:30.

## 5. Ortam değişkenleri

Opsiyonel olanlar boşsa ilgili özellik kapalı olur (UI `/api/v1/meta` ile öğrenir ve gizler).

| Değişken | app | worker | Açıklama |
|---|:-:|:-:|---|
| `APP_URL` | ✓ | ✓ | `https://<domain>` (auth callback, push linkleri) |
| `DATABASE_URL` | ✓ | ✓ | Coolify Postgres iç adresi |
| `DATABASE_POOL_MAX` | ✓ | ✓ | app `10`, worker `4` |
| `APP_TIMEZONE` | opsiyonel | opsiyonel | "Gün" hesapları için; varsayılan `Europe/Istanbul` |
| `BETTER_AUTH_SECRET` | ✓ | | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` / `_SECRET` | opsiyonel | | Google OAuth |
| `DISCORD_CLIENT_ID` / `_SECRET` | opsiyonel | | Discord OAuth |
| `RESEND_API_KEY`, `EMAIL_FROM` | ✓ | | Doğrulama/şifre e-postaları (yoksa e-posta gönderilmez) |
| `S3_*` | ✓ | ✓ | R2 (bkz. 2. bölüm); worker dosya silme ve yarım yükleme temizliği için kullanır |
| `STORAGE_DEFAULT_QUOTA_MB` | opsiyonel | | Varsayılan kullanıcı kotası (250); admin API'siyle de değişir |
| `STORAGE_BUDGET_GB` | opsiyonel | | Tüm yüklemelerin üst sınırı (8); dolunca yükleme kapanır |
| `IGDB_CLIENT_ID` / `_SECRET` | ✓ | ✓ | Twitch uygulaması; oyun arama ve metadata |
| `STEAM_API_KEY` | ✓ | ✓ | https://steamcommunity.com/dev/apikey — Steam girişi, sync, başarımlar, ekran görüntüleri |
| `XBOX_CLIENT_ID` / `_SECRET` | opsiyonel | opsiyonel | Xbox bağlantısı (aşağıda "Xbox uygulaması") |
| `PSN_DISABLED` | opsiyonel | opsiyonel | `true` ise PlayStation bağlantısı kapalı (anahtar gerekmez) |
| `CREDENTIALS_SECRET` | opsiyonel | ✓ | PSN/Xbox token'larını şifreler; yoksa `BETTER_AUTH_SECRET` (o zaman worker'a da ver) |
| `VAPID_PUBLIC_KEY` / `_PRIVATE_KEY` / `VAPID_SUBJECT` | ✓ | ✓ | Web Push; `npx web-push generate-vapid-keys` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | ✓ | | Gemini (asistan) |
| `AI_MODEL` | opsiyonel | | Varsayılan `gemini-3.5-flash` |
| `AI_DAILY_TOKEN_LIMIT` | opsiyonel | | Kullanıcı başına günlük token (varsayılan 200.000) |
| `TURNSTILE_SITE_KEY` / `_SECRET_KEY` | opsiyonel | | Kayıt/giriş bot koruması |

## 6. GitHub → Coolify otomatik deploy

1. Coolify → Keys & Tokens → API token oluştur (deploy yetkili).
2. `app` ve `worker` kaynaklarının **Webhooks** sekmesindeki deploy URL'lerini kopyala.
3. GitHub repo → Settings → Secrets and variables → Actions: `COOLIFY_TOKEN`, `COOLIFY_DEPLOY_APP_URL`,
   `COOLIFY_DEPLOY_WORKER_URL`. Secret'lar yoksa `deploy` adımı atlanır.

## 7. OAuth callback adresleri

- Google: `https://<domain>/api/auth/callback/google`
- Discord: `https://<domain>/api/auth/callback/discord`
- Steam: ayar gerekmez (OpenID `return_to` = `https://<domain>/api/auth/steam/callback`)

### Xbox uygulaması (Azure)

1. https://portal.azure.com → **App registrations → New registration**.
2. Supported account types: **Personal Microsoft accounts only**.
3. Redirect URI (Web): `https://<domain>/api/v1/platforms/xbox/callback`.
4. Certificates & secrets → yeni client secret. `XBOX_CLIENT_ID` = Application (client) ID,
   `XBOX_CLIENT_SECRET` = secret değeri (süresi dolmadan yenile).

PlayStation için bir şey kurulmaz: kullanıcı ayarlarda kendi NPSSO kodunu yapıştırır. Bu, Sony'nin mobil
uygulama API'sini kullanır (resmî değil); Sony değiştirirse kırılabilir.

## 8. İlk kurulum sonrası

1. Kendi hesabınla kayıt ol, sonra kendini admin yap:
   `update "user" set role = 'admin' where email = '<e-posta>';` (Coolify'ın Postgres terminalinden).
2. Eski verileri aktar (Kadir ve Mustafa hesap açtıktan sonra). App container'ında değil, repo'yu klonladığın bir
   makineden, production `DATABASE_URL` ile:
   ```sh
   DATABASE_URL=… IGDB_CLIENT_ID=… IGDB_CLIENT_SECRET=… pnpm migrate:legacy --file kadir_games.json --user kadir --dry-run
   DATABASE_URL=… IGDB_CLIENT_ID=… IGDB_CLIENT_SECRET=… pnpm migrate:legacy --file kadir_games.json --user kadir
   ```
   IGDB anahtarlarıyla çalıştırılırsa kesin eşleşmeler hemen IGDB oyununa bağlanır; belirsizler kullanıcının onay
   kutusuna düşer. Anahtarsız çalıştırılırsa worker'ın gece eşleştirme işi sonradan yapar.
3. Steam'i bağlayan kullanıcılarda ilk sync, elle girilmiş sürelerle Steam süresini karşılaştırıp onay ister.

## 9. Kaynak kullanımı

Yerel Docker ölçümü (2026-09-27, 360 kayıtlık gerçek veriyle, hafif yük): app ~125 MB, worker ~30 MB,
Postgres ~160 MB. Plan bütçesi toplam ~0.5–0.75 GB.
