# My Games

Oynadığın oyunları, sürelerini ve yorumlarını takip ettiğin, Steam ile senkronize olan açık bir oyun takip
platformu. Kararlar ve yol haritası: [`docs/PLAN.md`](docs/PLAN.md) · deploy: [`docs/DEPLOY.md`](docs/DEPLOY.md) ·
doğrulanmış API notları: [`docs/notes/integrations.md`](docs/notes/integrations.md) · RAG planı:
[`docs/notes/rag.md`](docs/notes/rag.md).

## Yapı

| Paket | İçerik |
|---|---|
| `apps/web` | TanStack Start (SSR), UI, i18n. `/api/*` isteklerini aynı process'te Hono'ya verir |
| `apps/worker` | Outbox tüketicileri + pg-boss işleri (Steam sync/presence, IGDB, push) |
| `packages/api` | Hono uygulaması (`/api/v1`), Better Auth (`/api/auth`), Steam OpenID plugin'i |
| `packages/core` | İş mantığı: katalog, kütüphane, onay sistemi, Steam, sosyal, istatistik, AI, migration |
| `packages/db` | Drizzle şeması, client, migration'lar |
| `packages/shared` | Web ve sunucunun paylaştığı sabitler (durumlar, platformlar, görsel URL'leri) |

Kurallar:

- Tüm veri Hono API'den gelir; TanStack Start server function kullanılmaz (desktop/Tauri aynı API'yi kullanacak).
  SSR'da API çağrıları ağa çıkmadan process içinde yapılır (`apps/web/src/lib/api.ts`).
- Elle yapılmayan her değişiklik (`steam`, `igdb`, `migration`, `ai`) onay sisteminden geçer
  (`packages/core/src/proposals.ts`) ve geçmişe yazılır; her değişiklik geri alınabilir.
- Yan etkiler (akış, bildirim, sync) transactional outbox ile worker'da işlenir (`packages/core/src/events.ts`).
- Tüm tarihler `timestamptz`, kimlikler `uuidv7()`.
- UI metinleri `apps/web/scripts/messages.py` içinde (TR + EN tek kaynaktan); çalıştırınca `messages/*.json` üretilir.

## Geliştirme

Gereksinimler: Node 22.12+, pnpm 12, Docker.

```sh
pnpm install
cp .env.example .env            # BETTER_AUTH_SECRET için: openssl rand -base64 32
pnpm db:up                      # Postgres 18 + pgvector (5433)
docker compose up -d minio minio-init   # R2 yerine yerel S3 (9100)
pnpm db:migrate
pnpm dev                        # web: http://localhost:3300 + worker
```

- `RESEND_API_KEY` boşken e-postalar web sunucusunun konsoluna yazılır.
- Asistanı anahtarsız denemek için `.env`'e `AI_PROVIDER=mock` yaz (sahte model tool çağırır ve özetler).
- IGDB/Steam anahtarları olmadan oyunlar elle eklenebilir; entegrasyonlar anahtar girilince kendiliğinden açılır.

| Komut | Ne yapar |
|---|---|
| `pnpm dev` | Web + worker, izleme modunda |
| `pnpm build` | Tüm paketlerin production build'i |
| `pnpm check` / `pnpm fix` | Biome lint + format kontrolü / düzeltme |
| `pnpm typecheck` | TypeScript (önce bir kez `pnpm dev` veya `pnpm build`: Paraglide çıktısı gerekir) |
| `pnpm test` | Core testleri (`<db>_test` veritabanında; MinIO açıksa yükleme testleri de çalışır) |
| `pnpm db:generate` / `pnpm db:migrate` | Şemadan migration üret / uygula |
| `pnpm auth:schema` | Better Auth plugin/alanları değişince auth şemasını yeniden üretir |
| `pnpm migrate:legacy --file <json> --user <kullanıcı> [--dry-run]` | Eski sistemden oyun aktarımı |
