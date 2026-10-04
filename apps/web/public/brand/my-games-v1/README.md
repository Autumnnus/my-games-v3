# My Games · Logo v1

Oyun kapaklarını andıran M formu ile merkezindeki oynat simgesini birleştiren logo. Projenin koyu Salon temasına ve mevcut mint canlı durum rengine göre tasarlandı.

## Dosyalar

| Dosya | Kullanım | Boyut | Zemin |
|---|---|---|---|
| `logo-on-white.png` | Açık yüzeylerde yatay logo | 1983 × 793 | Opak beyaz |
| `logo-transparent.png` | Açık zeminlere yerleştirilecek yatay logo | 1983 × 793 | Gerçek alpha şeffaflığı; koyu yazı |
| `logo-on-dark.png` | Koyu yüzeylerde yatay logo | 1983 × 793 | Opak koyu zemin; açık yazı |
| `app-icon.png` | App, profil ve ikon kullanımı için kare master | 1254 × 1254 | Opak koyu zemin |
| `preview.html` | Açık/koyu kullanım, web başlığı ve ikon boyutu önizlemesi | — | Yerel HTML |
| `generation-prompts.json` | Son sürümlerin üretim talimatları | — | Built-in image_gen |
| `my-games-logo-kit.zip` | Tüm final dosyaları | — | ZIP |

## Kullanım

- Uygulama ikonu kare dosyadır; önizlemedeki yuvarlama CSS ile gösterilir. İşletim sisteminin uyguladığı maskeye uygundur.
- Şeffaf logo açık yüzeylerde kullanılır. Koyu sürümün zemini opaktır.
- Logonun en-boy oranını koru, yatay/dikey olarak ayrı ölçekleme. Küçük alanlarda yazısız uygulama ikonunu kullan.
- Önizleme için `preview.html` dosyasını tarayıcıda açabilir veya web sunucusunda `/brand/my-games-v1/preview.html` adresini ziyaret edebilirsin.
- Bunlar raster PNG master dosyalarıdır, SVG değildir. Büyük baskı ve sınırsız ölçekleme için ayrıca vektör master gerekir.
- Hedef palet: mint `#7EE2A8`, yeşil `#256D50`, kömür `#0B0C10`, beyaz `#F4F5F7`. AI üretiminde hafif ton farklılıkları vardır.

Görseller built-in `image_gen` ile üretildi. Kullanılan nihai promptlar `generation-prompts.json` dosyasındadır. Uygulamanın mevcut logosu/favikonu bu dosyalarla değiştirilmedi.
