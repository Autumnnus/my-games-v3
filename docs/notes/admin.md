# Yönetim paneli

> Durum (2026-09-30): uygulandı. Yerelde tarayıcıda uçtan uca denendi (sahte AI modeliyle); gerçek deploy'da
> henüz çalışmadı.

## Karar: aynı uygulama, ayrı bölüm

Admin paneli ayrı bir app değil, `apps/web` içinde `/admin` bölümü. Sebepler:

- **Güvenliği belirleyen sunucudaki kapı.** Ayrı bir app de aynı API'ye ve veritabanına bağlanacaktı; yetki
  kontrolü yine API'de olmalıydı. Ayrı app bu kontrolü gereksiz kılmaz, yalnızca ikinci bir oturum sistemi ve
  ikinci bir kod tabanı getirir.
- **Kaynak.** 8 GB'lık sunucuda ikinci bir container, ikinci bir build ve alan adı yok.
- **Ortak kod.** Tema, bileşenler, i18n ve Hono RPC tipleri paylaşılır.
- **Normal kullanıcı yönetim kodunu indirmez.** Sayfalar kendi parçalarında; istemci tipi de ayrı
  (`AdminAppType`), uygulamanın `api` tipine karışmaz.

İleride ağ düzeyinde ikinci bir kapı istenirse ayrı app gerekmez: Cloudflare Access ile `/admin*` ve
`/api/v1/admin*` yollarına e-posta doğrulamalı bir politika eklenebilir.

## Kimlerin girebildiği

- **Rol yalnızca sunucudan verilir:** `node db/dist/admin.mjs grant <e-posta|kullanıcı adı>` (yerelde
  `pnpm admin grant …`), `revoke` ve `list` de var. E-postası doğrulanmamış hesaba verilmez; komut denetim
  kaydına `cli` olarak yazar. Web arayüzünde rol değiştirme yok: bir admin oturumu ele geçirilse bile yeni
  admin yaratılamaz, başka admin silinemez/banlanamaz.
- **Tek kapı:** bütün yönetim route'ları `packages/api/src/routes/admin.ts` içinde, `use("*", withSession,
  requireAdmin)` arkasında. `requireAdmin` rolü **her istekte veritabanından** okur (oturum çerezi rolü 5 dk
  önbellekler; yetki alınınca ya da hesap banlanınca kapı anında kapanır). Başkasının yerine geçilmiş
  (impersonation) oturum kabul edilmez. Admin olmayana bölüm yokmuş gibi **404** döner. Yanıtlar
  `Cache-Control: no-store` ve `X-Robots-Tag: noindex`.
- **Better Auth'un kendi admin uç noktaları** (`/api/auth/admin/*`: rol verme, başkasının yerine geçme, şifre
  değiştirme…) dışarıya kapalı (404). Ban vb. işlemler kendi kodumuzla, denetim kaydıyla yapılır.
- **Kullanıcı rolünü kendine veremez:** `role` alanı Better Auth'ta `input: false`; test ediliyor.
- **Arayüz kontrolü yalnızca kolaylık:** `/admin` düzeni oturum yoksa girişe, admin değilse "bulunamadı"
  sayfasına yollar. Asıl koruma API'de.
- **Testler** (`packages/api/test/admin-access.test.ts`) uygulamadaki bütün `/api/v1/admin` route'larını
  otomatik bulur ve anonim/normal kullanıcı için her birinin 404 döndüğünü doğrular. Yeni eklenen route da
  kapsanır. `/api/v1/admin` dışında adında "admin" geçen route olmadığını da kontrol eder.

## Ban, silme ve çerez önbelleği

Oturum 5 dakika imzalı çerezde önbelleklendiği için banlanan ya da silinen kullanıcı çerezi o süre boyunca
geçerli kalırdı. Admin bir hesabı banlayınca, silince ya da oturumlarını kapatınca API süreci bunu hatırlar
(`revokeUserAccess`) ve o andan önce açılmış oturumları hemen düşürür; sonra açılan yeni oturumlar etkilenmez.
Durum bellekte tutuluyor (tek app süreci; rate limit ile aynı varsayım).

## Bölümler

| Sayfa | İçerik |
|---|---|
| Genel bakış | Kullanıcı / aktif / bu ayki AI maliyeti (ay sonu tahmini) / depolama; dikkat isteyenler (hata, şikayet, tükenmiş olay, fiyatsız model, depolama); 30 günlük kayıt ve maliyet grafikleri |
| Kullanıcılar | Arama, filtre (admin/banlı/doğrulanmamış), sıralama, sayfalama; kayıt, depolama, 30 günlük AI maliyeti |
| Kullanıcı | Hesap ve giriş yolları, veri sayıları, AI sohbetleri ve son çağrılar, AI sınırı (varsayılan/özel/sınırsız + AI'yı kapat), depolama kotası, oturumlar, bu hesaptaki admin işlemleri; veriyi indir, oturumları kapat, ban; **tehlikeli bölge**: kategori bazlı veri silme ve hesabı silme (kullanıcı adını yazarak onay; sunucu da doğrular) |
| Moderasyon | Açık / kaldırılan / yok sayılan şikayetler |
| Depolama | Sistem deposu doluluğu, varsayılan kota, en çok yer kaplayanlar |
| AI · maliyet ve anahtarlar | Dönem (bugün/7/30 gün/bu ay), maliyet/çağrı/token/kişi, günlük grafik, modele/işe/kişiye göre döküm, anahtar havuzu durumu, varsayılan günlük sınır, fiyat tablosu |
| AI · izler | Her model çağrısı: kişi, iş, model, adım, araçlar, anahtar değişimi, token, maliyet, süre; filtreler. İz detayı sohbetin tamamını mesaj mesaj, adım adım gösterir (araç girdisi/çıktısı, düşünme, onay kararı) |
| Sistem | App ve worker süreçleri (bellek, heap, çalışma süresi, yaşam belirtisi), pg-boss kuyrukları ve son başarısız işler, outbox (tükenmiş olayı yeniden dene), senkronizasyon hataları, veritabanı; **yeni kayıtları aç/kapat** |
| Loglar | Seviye/kaynak/arama, canlı izleme, en sık hatalar |
| Denetim kaydı | Adminlerin bütün değişiklikleri ve sohbet içeriği okumaları |

## Veri silme kategorileri (`core/admin/users.ts`)

Tek transaction; dosyalar outbox üzerinden worker'da depodan silinir, kota hemen geri gelir.

- **Kütüphane:** kayıtlar (bağlı görüntüler, akış, öneriler, özetler cascade), geçmiş, oyun oturumları,
  başarımlar, akıllı listeler. Platform bağlantıları duruyorsa sonraki senkronizasyon kütüphaneyi yeniden
  doldurabilir; arayüz bunu uyarır.
- **Ekran görüntüleri:** hepsi, dosyalarıyla.
- **AI sohbetleri:** sohbetler ve "kaldığın yer" özetleri. Maliyet satırları içerik taşımadığı için kalır.
- **Sosyal:** yorumlar (başkasının yanıtladığı yorumun metni boşaltılır, yeri kalır), beğeniler, akış,
  bildirimler.
- **Platformlar:** Steam/PSN/Xbox bağlantıları, snapshot'lar, senkronizasyon geçmişi, öneriler.
- **Profil:** avatar ve biyografi.

Hesap silme: bütün dosyalar temizlik kuyruğuna alınır, satırlar cascade ile gider. `ai_usage` satırları
kalır (`user_id` boşalır) ki aylık maliyet geçmişi bozulmasın. Denetim kaydına silinen kişinin e-postası
değil yalnızca kullanıcı adı yazılır (silinme hakkı).

## AI izleri ve maliyet

- `ai_usage` artık her çağrının izi: `purpose` (sohbet, başlık, öneri, taslak, özet), `status`
  (başarılı/hatalı/yarıda), `error`, süre, giriş/önbellek/çıkış/düşünme token'ları, cevabın mesaj kimliği ve
  `detail.steps` (adım başına model, süre, ilk çıktıya kadar geçen süre, token'lar, bitiş nedeni, araçlar ve
  süreleri, cevabı veren anahtar ve önce düşenler). **İçerik tutulmaz**; içerik sohbet mesajlarında.
- Anahtar bilgisi havuzdan sağlayıcı meta verisiyle (`providerMetadata.pool`) gelir. Adım bitiş parçası
  istemciye gönderilmediği için anahtar etiketi kullanıcıya sızmaz (test ediliyor).
- Maliyet **okuma anında** güncel fiyat tablosuyla hesaplanır (`core/ai/pricing.ts`, USD / 1M token);
  fiyat düzeltilirse geçmiş de düzelir. Başlangıç tablosu Gemini'nin 2026-09-30 tarihli liste fiyatları.
  Ücretsiz katmandaki anahtarların gerçek faturası 0'dır; panel liste fiyatıyla tahmin gösterir. Model adı
  önekle de eşleşir (`…-001`, `models/…`, `google:…`).
- Sohbet içeriğini açmak denetim kaydına yazılır (aynı admin aynı sohbeti 10 dakika içinde tekrar açarsa bir
  kez). Asistandaki gizlilik notu yöneticilerin sohbetleri inceleyebileceğini söyler.
- Günlük token sınırı: varsayılan `app_config` (`ai.daily_token_limit`, yoksa `AI_DAILY_TOKEN_LIMIT`),
  kişiye özel `user_limits.ai_daily_tokens` (0 = sınırsız), `ai_blocked` AI'yı tamamen kapatır.

## Sistem logları (`core/log.ts`)

- `log()` / `logger.*`: stdout'a (Coolify) ve arka planda `system_logs`'a. İstek bekletmez; 2 sn'de bir toplu
  yazılır. Dakikada en fazla 120 kayıt yazılır, fazlası sayılıp özetlenir (hata fırtınası veritabanını
  boğmasın). 30 günden eskiler her gece silinir (`maintenance.prune-logs`).
- Kaynaklar: API'nin 500'leri (`request_failed`), worker işlerinin her başarısız denemesi (`job_failed`),
  outbox (`event_failed`, `event_dead`), AI anahtarları (`key_rate_limit`, `key_auth`…), AI hataları
  (`unavailable`, `chat_failed`, `*_failed`), Better Auth uyarı/hataları, süreç başlangıçları.
- Worker dakikada bir `app_config.worker.heartbeat` yazar; panel 3 dakikadan eskiyse "yanıt vermiyor" der.

## Ayarlar (deploy'suz, `app_config`)

`auth.signups_open`, `ai.models` (sohbet modeli, en fazla 5 yedek, kısa işler modeli; boş alan `AI_MODEL` /
`AI_FALLBACK_MODELS` / `AI_LIGHT_MODEL`'e, o da sağlayıcı varsayılanına düşer), `ai.daily_token_limit`, `ai.prices`,
`storage.default_quota_bytes`. Her süreç 15 sn
önbellekler (`core/settings.ts`). Kayıtlar kapalıyken Better Auth'un kullanıcı oluşturma kancası reddeder
(e-posta, Google, Discord, Steam); kayıt sayfası formu gizler.
