# My games AI

> Durum (2026-09-29): uygulandı. Arayüz tasarımı: tasarım kanvasındaki "AI asistan" sayfası. Gerçek
> Gemini anahtarıyla henüz denenmedi; bütün akışlar `AI_PROVIDER=mock` ve testlerde sahte modelle doğrulandı.

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
- Durum bellekte (tek app process'i). Yönetim sayfası anahtarları maskeli gösterir (`/admin/ai`);
  anahtar hataları sistem loglarına da düşer.
- Yeni sağlayıcı: paketini kur, `providers.ts`'e adaptör ekle (model üretici + isteğe bağlı hata yorumu),
  `<ÖNEK>_API_KEYS` ile anahtarları ver; `AI_MODEL=openai:…` gibi karışık zincir de olur.

## Yerelde deneme

`AI_PROVIDER=mock` ile sahte model birkaç anahtar kelimeye göre araç çağırır: "9 ve üstü" → kütüphane
sorgusu, `@kişi` + "karşılaştır" → karşılaştırma, Yap modunda etiketli oyun + "bitirdim/bıraktım/başladım"
→ onay kartı. Hafif model işleri mock'ta kurallı yedeklere düşer (şablon gerekçe/taslak).
