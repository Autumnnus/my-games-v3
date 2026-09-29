# Görsel depolama: klasör yapısı, kota, sıkıştırma, sağlayıcılar

> Durum: uygulandı (2026-09-29). Sıkıştırma ayarları 10 gerçek screenshot ile ölçüldü. R2'nin imzalı tür/boyut/
> `Cache-Control` başlıklarını zorladığı gerçek bucket'ta doğrulandı. Kendi bucket / Imgur bağlama bir sonraki faz;
> bu fazda sadece önünü açan yapı kuruldu. Kod: `packages/core/src/{media,storage}.ts`, `apps/web/src/lib/media/`.

## Kararlar

| Konu | Karar |
|---|---|
| Varsayılan kota | **250 MB** / kullanıcı. Admin kişi bazında değiştirir; varsayılan deploy'suz değişir (`app_config`). |
| Sistem bütçesi | **8 GB** (10 GB ücretsiz − DB yedekleri − pay). Dolunca herkes için yükleme durur. |
| Optimize (varsayılan) | AVIF, kalite 80, 4:4:4, speed 7; uzun kenar ≤ 2560 px. |
| Orijinal | Dosya **byte byte aynen** yüklenir (yeniden kodlama yok). Yanına gösterim kopyası + küçük görsel. |
| Hatalar | Kota yetmezse `storage_quota`, sistem bütçesi dolduysa `storage_full` (HTTP 507). Başarısız yükleme kotayı hemen bırakır (`/me/uploads/cancel`). |
| Küçük görsel | Her yüklemede zorunlu. Screenshot 640 px, avatar 128 px (AVIF kalite 60, 4:4:4). Link ile eklenenler hariç. |
| Tercih | `Optimize / Orijinal` kullanıcı ayarında saklanır; yükleme penceresinde o yükleme için değiştirilebilir. |
| Nerede kodlanır | Tamamen tarayıcıda (jSquash WASM, Web Worker). Sunucu görsel byte'ı görmez. |

## Ölçüm (jSquash 2.x, M4 Pro tek çekirdek, SSIMULACRA2)

Kalite ölçeği: 90 = göz kırpma testinde bile ayırt edilemez · **80 = 1:1 yan yana bakınca ayırt edilemez** ·
70 = karşılaştırmadan fark edilmez · 50 = orta.

10 görsel (1508×632 ×3, 1920×931 ×3, 3440×1440 ×4), kaynak PNG ortalaması 4,35 MB (en büyük 8,7 MB):

| Ayar (uzun kenar ≤ 2560) | Ort. KB | En büyük KB | Kalite ort. / en düşük | Ort. süre |
|---|---|---|---|---|
| Bugünkü: WebP q85 (canvas) | 214 | 473 | 75,4 / 72,6 | 0,15 sn |
| WebP q90 sharp-YUV | 285 | 624 | 82,0 / 80,8 | 0,31 sn |
| AVIF q75 4:4:4 s6 | 241 | 567 | 81,7 / 78,6 | 1,5 sn |
| **AVIF q80 4:4:4 s7 (seçilen)** | **271** | **630** | **83,1 / 80,9** | **1,0 sn** |
| AVIF q80 4:4:4 s6 | 282 | 663 | 83,8 / 81,5 | 1,6 sn |
| AVIF q85 4:4:4 s6 | 363 | 852 | 86,1 / 84,8 | 1,8 sn |
| AVIF q65 **4:2:0** s6 | 157 | 359 | 74,5 / 70,3 | 1,3 sn |

- Seçilen ayarla **her** test görseli 80'in üstünde; PNG'ye göre ~%94 küçülme. 3440×1440 görseller ~600 KB.
- Bugünkü WebP daha küçük ama kalite 72–75 bandında (yazı/HUD kenarları yumuşuyor); Safari/iOS WebP üretemediği
  için orada bugün JPEG'e düşülüyor.
- Renk alt örneklemesi (4:2:0) oyun UI'ında kaliteyi belirgin düşürüyor; 4:4:4 şart.
- 3440×1440 kendi çözünürlüğünde AVIF q80 ≈ 1 MB (2560'a küçültülünce ≈ 600 KB).
- Küçük görsel: AVIF q60 4:4:4 ort. 21 KB / kalite 76,8 (bugünkü WebP q75: 17 KB / 69,2).
- Süre: ortalama bir dizüstünde ~2×, telefonda ~3–4× yavaş beklenir → 2–4 worker paralel, dosya bazlı ilerleme.
  Çok iş parçacıklı sürüm COOP/COEP ister (OAuth popup'ları ve dış görselleri bozar), kullanılmıyor.
- JPEG XL: Chrome'da hâlâ bayrak arkasında (2026-07), teslim formatı olamaz.

## Klasör yapısı

```
my-games  (public, cdn.autumnnus.dev)
└── users/{userId}/
    ├── avatar/{assetId}/{full,thumb}.avif
    └── screenshots/{assetId}/
        ├── full.{avif|png|jpg|webp}   optimize: AVIF ≤2560 · orijinal: yüklenen dosyanın kendisi
        ├── display.avif               sadece orijinalde: lightbox'ta gösterilen AVIF ≤2560
        └── thumb.avif                 640 px

my-games-backups  (private) ← Coolify DB yedekleri; public bucket'a asla yedek konmaz
```

- Anahtarı hep sunucu üretir; istemci confirm'de anahtar değil sadece `assetId` gönderir.
- Oyun/kayıt kimliği yolda yok: anahtar hiç değişmez, ilişki DB'de. Yeni varyant = klasöre yeni dosya.
- Her nesne `Cache-Control: public, max-age=31536000, immutable` ile yüklenir (imzaya dahil). Bu yüzden
  R2 CORS'unda `AllowedHeaders` → `["Content-Type", "Cache-Control"]` olmalı.

## Veri modeli

```sql
create table media_assets (
  id uuid primary key default uuidv7(),
  user_id text not null references "user"(id) on delete cascade,
  target_id uuid,               -- null = sistem R2'si; sonraki fazda storage_targets(id)
  purpose text not null,        -- 'screenshot' | 'avatar'
  quality text not null,        -- 'optimized' | 'original'
  status text not null,         -- 'pending' | 'ready'
  variants jsonb not null,      -- [{ name: 'full'|'display'|'thumb', key, bytes, contentType, width, height }]
  total_bytes bigint not null,  -- kotaya sayılan toplam (tüm varyantlar)
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index on media_assets (user_id, status);

create table user_storage (
  user_id text primary key references "user"(id) on delete cascade,
  quota_bytes bigint,           -- null = varsayılan
  quota_note text,
  quota_set_by text,
  quota_updated_at timestamptz,
  upload_quality text not null default 'optimized'   -- 'optimized' | 'original'
);

-- screenshots: storage_key / thumb_key yerine asset_id → media_assets(id)
```

Kullanım = `sum(total_bytes)` (pending + ready, sistem hedefi). Sayaç tutulmaz, SQL ile hesaplanır.

## Yükleme akışı

1. Tarayıcı dosyaları worker'da hazırlar (optimize: resize + AVIF; orijinal: dosya aynen + display + thumb),
   boyutları gösterir, kota çubuğunu "bu yükleme +X MB" ile günceller.
2. `POST /uploads` `{ purpose, entryId?, quality, files: [{ variants: [{ name, contentType, bytes, width, height }] }] }`
   - Kullanıcı bazında advisory lock → kullanım + istenen ≤ kota ve sistem bütçesi kontrolü → `pending` satırlar.
   - Varyant başına imzalı PUT (Content-Type, Content-Length, Cache-Control imzada).
3. Tarayıcı PUT eder → `POST /uploads/confirm` `{ assetIds, captions? }` → HEAD ile doğrula → `ready`,
   screenshot satırı oluşur / avatar `user.image`'e sunucu yazar ve eski avatar silinir.
4. 1 saatte onaylanmayan `pending` kayıtlar: worker nesneleri siler, satırı kaldırır (kota geri gelir).

Sınırlar: varyant türleri amaca göre sabit (optimize: full+thumb; orijinal: full+display+thumb; avatar her zaman
optimize). Tek dosya: orijinal ≤ 40 MB, optimize ≤ 15 MB, display ≤ 5 MB, thumb ≤ 300 KB, avatar ≤ 2 MB.
Orijinal modda JPEG'de GPS bilgisi varsa pencerede uyarı gösterilir (dosyaya dokunulmaz).

## Kullanıcı ve admin

- `GET /me/storage` → kullanım, kota, türe göre dağılım, tercih, sistem dolu mu. `PATCH /me/storage` → tercih.
- Ayarlar → "Depolama" kartı: çubuk, dağılım, varsayılan kalite. Kota doluysa yükle butonları kapalı + açıklama.
- Admin (UI sonra): `GET /admin/storage` (genel doluluk, en çok kullananlar), `GET /admin/users/:id/storage`,
  `PUT /admin/users/:id/storage-quota` `{ quotaBytes | null, note }`, `PUT /admin/storage/default-quota`.
- Sistem doluluğu %80 ve %95'i geçince adminlere `system` bildirimi (her eşik bir kez).

## Kota hesabı

8 GB / 250 MB = herkes tam doldurursa 32 kullanıcı; gerçekçi %25 ortalama dolulukla ~130. 250 MB ≈ 380 adet
3440×1440 optimize screenshot (≈ 0,65 MB) ya da ≈ 27 adet 3440×1440 orijinal PNG (≈ 8,7 MB + display + thumb ≈ 9,3 MB).
10 GB aşılırsa maliyet 0,015 $/GB-ay; bütçe `STORAGE_BUDGET_GB` ile büyütülebilir.

## Sonraki faz: sağlayıcıdan bağımsız depolama

Bu fazda kurulan: `media_assets.target_id`, sürücü arayüzü (`prepareUpload / stat / delete / publicUrl`), tipli
yükleme talimatı (şimdilik sadece `put`), URL'in okuma anında hedeften üretilmesi.

- S3 uyumlu tek sürücü: R2, MinIO, AWS S3, Backblaze B2, Wasabi. Imgur ayrı sürücü (API upload, id + deletehash).
- `storage_targets`: sahibi, tür, şifreli kimlik bilgisi (`credentials.ts`, AES-256-GCM), public URL, durum.
- Kota sadece sistem hedefinde; kendi hedefinde sınır yok (dosya boyutu ve rate limit kalır).
- `user_storage.default_target_id`: yeni yüklemeler nereye gitsin.
- Riskler: kullanıcı endpoint'ine sunucu istek atar → sadece https, özel/iç IP engeli (SSRF); kullanıcı kendi
  CORS'unu kurmalı → "bağlantıyı test et" (sunucu HEAD/PUT/DELETE + tarayıcı PUT); bucket silinirse kırık görsel →
  periyodik sağlık kontrolü; Imgur'un kısıtlamaları/güvenilirliği.

## Uygulama adımları

1. Migration: `media_assets`, `user_storage`, `screenshots.asset_id`; eski `storage_key/thumb_key` kalkar
   (prod'da veri yok, R2 boş; yereldeki MinIO test yüklemeleri silinir).
2. Core: S3 sürücüsü, anahtar üretimi, kota (ayır / onayla / bırak), pending temizliği, bütçe + admin bildirimi,
   admin fonksiyonları, hesap/kayıt silmede nesne temizliği.
3. API: `/uploads`, `/uploads/confirm`, `/me/storage`, admin uç noktaları; avatar aynı akışa geçer.
4. Web: görsel işleme worker'ı (jSquash avif + resize, pencere açılınca yüklenir; AVIF başarısızsa WebP),
   yükleme penceresi, Depolama kartı, küçük avatar kullanımı, TR/EN metinler.
5. Testler: eşzamanlı ayırmada kota, aşım, bütçe, pending temizliği, sahiplik, admin override; gerçek R2'ye
   tarayıcıdan uçtan uca yükleme.
6. `DEPLOY.md`: yedek bucket'ı, güncel CORS (`Cache-Control`), kota env'leri.
