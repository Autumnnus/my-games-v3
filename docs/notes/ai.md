# Pati (AI asistan)

> Durum (2026-09-29): uygulandı. Arayüz tasarımı: tasarım kanvasındaki "AI asistan" sayfası. 2026-10-04'te
> gerçek Gemini anahtarıyla panelden eklenen anahtar üzerinden sohbet çağrısı doğrulandı.

## Pati (maskot)

2026-10-04: asistanın adı "My games AI" yerine **Pati** (gamepad + pati), maskotu logodaki mor kumandanın
canlanmış hâli (yüz düğmeleri göz, koleksiyon kartları kulak). Seçilmeyen konseptler: Karto (kartuş),
Savi (yüzlü save-point küresi, eski küre).

- Bileşen `components/assistant/mascot.tsx` (`Pati`, `LivePati`), animasyonlar `styles.css` `.pati`.
  Renk sabit marka moru; eski küre gibi sayfanın oyun rengini almaz.
- Ruh hâlleri: `idle` (süzülür, göz kırpar, ara sıra etrafa bakar), `listening` (kutuda yazı varken),
  `thinking` (istek gitti / metin henüz yok), `working` (araç çalışıyor; kartları karıştırır), `talking`
  (metin akıyor), `approval` (onay kartı bekliyor), `success` (akışta bir yazma aracı uygulandı; ~2 sn),
  `error` (sohbet hatası; iki kez silkinip üzgün kalır).
- Ortak durum `mascot-store.ts` (AI SDK'sız; başlık düğmesi onu yüklemeden okur). `chat-store.ts` her
  `Chat`'e AI SDK'nın `~register*Callback` kancalarıyla bağlanır; panel kapalıyken de başlıktaki Pati
  çalışır. Bu kancalar `@ai-sdk/react`'in iç API'si (useChat da bunları kullanır); sürüm yükseltmede kontrol et.
- Geçmiş mesajlar ve küçük simgeler `still` (hareketsiz); karşılamadaki büyük Pati'ye dokununca sevinir.
- Sistem talimatında kısa bir persona satırı var (sıcak, oyuncu arkadaş; kısalık önce gelir).
- Hareket azaltma tercihi global kuralla bütün animasyonları durdurur; yüz ifadeleri yine değişir.

## Arayüz

- **Panel, sayfa değil katman.** ⌘J ya da başlıktaki düğme. ≥1280 px'te sağa sabitlenir ve sayfa 440 px
  daralır (`html[data-assistant=docked] .app-shell`), daha dar ekranda sağdan, telefonda alttan açılır.
  `/ai` tam ekran görünümdür (eski `/chat` oraya yönlenir); panelle aynı `Chat` örneğini paylaşır.
- **Sayfa bağlamı**: yönlendiriciden (`pageContextOf`) oyun/kayıt/profil/istatistik/onay kutusu; mesaj
  kutusunda "bu sayfa" çipi olarak görünür, kaldırılabilir.
- **`@` etiketleri** (oyun, oyuncu, durum, yıl) ve **`/` komutları**. `/öner` "Ne oynasam?" destesini,
  kayıt sayfasında `/inceleme` röportajı açar; diğerleri mesajla birlikte modele ipucu olarak gider.
- **Sor / Yap modu.** Sor yalnızca okur (yazma araçları modele verilmez). Yap'ta her değişiklik bir onay
  kartıdır (önce → sonra), onaylanınca uygulanır ve "Geri al" geçmiş kaydını geri alır.
- **Kart cevaplar**: her aracın kartı var (`components/assistant/cards`). Kütüphane sorgusu "akıllı liste"
  olarak kaydedilebilir (`smart_lists`; liste sorgudur, içerik değil).
- **Sohbet dışı akışlar**: "Ne oynasam?" destesi (`/ai/pick`), oyun sonrası röportaj (`/ai/review-draft`),
  kayıt sayfasında "Kaldığın yer" (`/ai/recap/:id`, `ai_recaps` önbelleği).
- **Karşılama kartları** (`/ai/suggestions`) modelsiz, SQL kurallarıyla üretilir.

## Agent döngüsü (`core/ai/agent.ts`, `chat.ts`)

- AI SDK `ToolLoopAgent`, istek başına kurulur. Sistem talimatı İngilizce, cevap kullanıcının dilinde.
- `stopWhen: isStepCount(AI_MAX_STEPS)`. `prepareStep`: son adımda `toolChoice: none` (döngü cevapsız
  bitmez), aynı araç + aynı girdi ikinci kez çağrıldıysa cevaba zorlar, bağlam 120 bin karakteri geçince
  eski araç çağrılarını budar (`pruneMessages`).
- Yazma araçları (`updateEntry`, `addToLibrary`, `resolveInbox`) AI SDK `toolApproval` ile onaya tabi.
  Politika kullanıcının `ai:*` kuralını uygular (Ayarlar › onay kuralları: sor / otomatik / yok say).
  Onay isteğinin `reason` alanında kartın önizlemesi (JSON) taşınır. Onaylar HMAC ile imzalanır
  (`experimental_toolApprovalSecret`, ana gizli anahtardan türetilir).
- Geçmiş sunucuda. İstemci yalnızca son mesajı yollar; onay turunda asistan mesajından **yalnızca kararlar**
  alınır, gerisi DB'den gelir. Onay beklerken yeni mesaj yazılırsa bekleyenler reddedilmiş sayılır.
- Uygulanan değişiklik uygulamanın geri kalanıyla aynı yoldan geçer: onaylanmış `change_proposals`
  (`source: ai`) + ona bağlı `entry_history` → akış, bildirim ve geri alma aynen çalışır.
- Her çağrı `ai_usage`'a iz olarak yazılır: gerçek model kimliği (yedek modele geçildiyse o), durum,
  süre, adım adım token ve araç ölçümleri, cevabı veren anahtar. Hata ve iptal de kaydedilir. Maliyet ve
  izleme ekranı: [admin.md](admin.md). Başlıklar hafif modelle arka planda üretilir.

## Anahtar havuzu (`core/ai/key-pool.ts`, `pooled-model.ts`, `providers.ts`, `models.ts`)

- Sağlayıcıdan bağımsız: `createPooledModel` sıradan bir `LanguageModelV4` döner; agent hiçbir şey bilmez.
- Her çağrıda zincirdeki ilk modelin sağlam anahtarı denenir. Hata yorumu sağlayıcı adaptöründe
  (`classifyError`): 429 → anahtar o modelde dinlenir (Gemini `RetryInfo`'ya uyar, günlük kotada Pasifik
  gece yarısına kadar), 401/403/geçersiz anahtar → 6 saat devre dışı, 5xx/ağ → kısa bekleme, diğer 4xx →
  başka anahtar denenmez. Akış başarılı başlayıp ilk parçası hata olursa da sıradakine geçilir.
- Bekleme **model başınadır** (Gemini'de kota proje × model); modelin bütün anahtarları doluysa
  `AI_FALLBACK_MODELS`'e geçilir. Hiçbiri yoksa `AiUnavailableError` (en erken yeniden deneme zamanıyla);
  istemci "yoğun, ~N dk sonra" gösterir.
- Durum bellekte (süreç başına: app ve worker'ın kendi havuzu var). Anahtar hataları sistem loglarına da düşer.
- **Anahtarların kaynağı (`core/ai/keys.ts`, 2026-10-04):** yönetim panelinden (`/admin/ai` › Anahtar havuzu)
  eklenenler `ai_api_keys` tablosunda AES-256-GCM ile şifreli durur (`core/credentials`, `CREDENTIALS_SECRET`).
  Panel ekleme öncesi anahtarı sağlayıcıda dener (Gemini: model listesi, token harcamaz); reddedilen anahtar
  eklenmez, kotası dolu olan eklenir. Panelde ad, aç/kapat, sıra, "Test et", silme ve strateji
  (`round_robin`/`failover`, `app_config` › `ai.key_strategy`) var; her işlem denetim kaydına yalnızca ipucuyla
  (ilk/son 4 karakter) yazılır, sır hiçbir yanıtta dönmez. Env'deki anahtarlar panel anahtarlarından sonra
  havuza girer ve panelde salt okunurdur; aynı anahtar panele de eklendiyse env kopyası yok sayılır (açık/kapalı
  panelden). Liste süreç başına 15 sn önbellekli; havuz yeniden kurulurken aynı anahtarların durumu taşınır
  (`KeyPool.inherit`), kapatılıp açılan anahtar sıfırdan başlar. AI'nin açık olup olmadığını `aiEnabled()` söyler
  (`/api/v1/meta` › `features.ai`).
- Yeni sağlayıcı: paketini kur, `providers.ts`'e adaptör ekle (model üretici + isteğe bağlı hata yorumu ve
  `verifyKey`), anahtarları panelden ya da `<ÖNEK>_API_KEYS` ile ver; `AI_MODEL=openai:…` gibi karışık zincir de olur.

## Yerelde deneme

`AI_PROVIDER=mock` ile sahte model birkaç anahtar kelimeye göre araç çağırır: "9 ve üstü" → kütüphane
sorgusu, `@kişi` + "karşılaştır" → karşılaştırma, Yap modunda etiketli oyun + "bitirdim/bıraktım/başladım"
→ onay kartı. Hafif model işleri mock'ta kurallı yedeklere düşer (şablon gerekçe/taslak).
