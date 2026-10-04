# Yeni üye rehberi

> Durum (2026-10-04): uygulandı. Yerelde tarayıcıda uçtan uca denendi (Steam bağlantısı ve AI sohbeti
> veritabanından taklit edildi); gerçek Steam/Xbox yönlendirmesiyle ve deploy'da henüz denenmedi.

## Kim görür

Yalnızca yeni üyeler. `user_onboarding` satırı kayıt anında açılır (Better Auth `user.create.after` →
`startOnboarding`). Satırı olmayan hesaplar (eski, taşınmış) rehberi hiç görmez; migration geriye dönük satır
açmaz. Rehber kayıttan `ONBOARDING_DAYS` (30) gün sonra, bütün adımlar bitince ya da kullanıcı gizleyince
kapanır. Admin `/admin/users/$id` sayfasından rehberi baştan başlatabilir (denetim kaydına düşer).

## Parçalar

- **Hoş geldin diyaloğu:** ilk kez ana sayfada, bir kez açılır. Steam (önerilen, doğrudan bağlama akışı),
  PlayStation (ayarlarda kod adımları), Xbox (Microsoft girişi) ya da elle ekleme. Kapatmak da "görüldü" sayılır.
- **Başlangıç listesi:** ana sayfanın sağ sütununda (telefonda sahnenin altında). Adımlar veriden hesaplanır,
  tıklamadan değil: platform bağlı, gelen kutusunda en az bir karar ya da senkron bitmiş ve bekleyen öneri yok,
  kütüphanede oyun var, AI sohbeti var, avatar ya da bio var. Kapalı özelliklerin adımı listeye girmez. Gizlenirse
  profil menüsünden geri getirilir. Son adım bitince sunucu bir kez `justCompleted` döner, istemci kutlar.
- **İpuçları:** `CoachMark` bir `data-tour="…"` öğesine bağlanır (bileşene dokunmadan). Her ipucu bir kez
  gösterilir ve gösterildiği anda görüldü yazılır. Oturum (sekme) başına en fazla bir ipucu çıkar
  (`sessionStorage` `mg.onboarding.tip`). Şu an dört tane var: ⌘K araması, AI'ın Sor/Yap modları, inbox destesi
  ve kütüphane filtreleri.
- **AI:** rehber açıkken karşılama ekranında "Başlarken" kartları çıkar: Yap modunda yazarak oyun ekleme ve sitenin
  kısa turu. Sistem talimatında sitenin özelliklerini anlatan kısa bir bölüm var.
- **Admin:** genel bakışta son 30 günün hunisi var (kayıt → hoş geldin → adımlar → tamamlandı/gizlendi).

## Tazelenme

Liste her başarılı mutation'dan sonra (`router.tsx` MutationCache) ve her sayfa değişiminde tazelenir. Rehberi
olmayan hesapta sorgu `null` döner; bunun dışında maliyeti yok.
