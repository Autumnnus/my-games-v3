🎮 Gamification Planı — my-games-v3

1. XP Sistemi

| Aksiyon                  | XP      | Not                                      |
| ------------------------ | ------- | ---------------------------------------- |
| Oyun ekleme              | +10     |                                          |
| Tamamlama (completed)    | +50     |                                          |
| İnceleme yazma           | +25     |                                          |
| Puanlama                 | +15     |                                          |
| Playtime milestone       | +5–20   | Her 60dk flat değil, milestone bazlı ↓   |
| Günlük giriş             | +5      |                                          |
| Achievement kazanma      | +20–100 | Rarity'e göre skala                      |
| Genre çeşitliliği        | +10     | 3+ farklı genre'da oyun ekleyince        |
| Platform çeşitliliği     | +10     | 3+ farklı platformda oyun ekleyince      |

Playtime Milestone XP (flat +1/60dk yerine):
• İlk 10 saat      → +5 XP
• İlk 50 saat      → +10 XP
• İlk 100 saat     → +20 XP
• Her +100 saat    → +10 XP (tekrarlı)

Günlük cap: 200 XP — fazla aktif olunca bitmesin, serotonin kalsın.

⚠️ Teknik notlar:
• Playtime XP: Steam sync timestamp bazlı, manuel giriş desteklenmez (spam önlemi)
• Günlük cap reset: UTC 00:00 — kullanıcıya yerel saatte gösterilir ama hesap UTC'de tutulur

───

2. Level Sistemi

Sigmoid curve — erken hızlı, sonra yavaş. Simüle edilmesi gerekiyor:

• Level 1  → 0 XP
• Level 5  → 1.500 XP    ("Collector" badge)         ← 700'den yukarı çekildi
• Level 10 → 5.000 XP    ("Veteran" badge + özel renk)
• Level 25 → 25.000 XP   ("Legend" badge)
• Level 50 → 100.000 XP  ("Mythic" — cosmetic, kimse ulaşamasın)

⚠️ Not: Level 1→5 çok hızlı olmamalı, ilk badge değerini korusun.
Gerçek eğri parametreleri implement öncesi spreadsheet'te simüle edilmeli.

───

3. Achievements — 6 Kategori

─── A) Koleksiyoncü ───

| Achievement         | Koşul                              | Rarity    | Tier    |
| ------------------- | ---------------------------------- | --------- | ------- |
| İlk Adım            | İlk oyunu ekle                     | Common    | Bronze  |
| Koleksiyoncü I      | 10 oyun                            | Common    | Bronze  |
| Koleksiyoncü II     | 25 oyun                            | Common    | Silver  |
| Koleksiyoncü III    | 50 oyun                            | Rare      | Gold    |
| Koleksiyoncü IV     | 100 oyun                           | Rare      | Gold    |
| Platform Ustası     | 4+ farklı platform                 | Rare      | Silver  |
| Steam Hayranı       | 50+ Steam sync oyunu               | Rare      | Gold    |
| Favori Koleksiyonu  | 20+ oyunu favorile                 | Common    | Silver  |
| Genre Gezgini       | 5+ farklı genre'da oyun ekle       | Common    | Silver  |
| Genre Ustası        | 10+ farklı genre'da oyun ekle      | Rare      | Gold    |
| Retro Tutkunu       | 2000 öncesi çıkış tarihli 10 oyun  | Rare      | Silver  |
| AAA Koleksiyoncusu  | 10+ AAA oyun (IGDB rating bazlı)   | Common    | Bronze  |
| Bağımsız Ruh        | 10+ indie oyun                     | Common    | Bronze  |

─── B) Tamamlayıcı ───

| Achievement          | Koşul                                    | Rarity    | Tier     |
| -------------------- | ---------------------------------------- | --------- | -------- |
| İlk Tamamlama        | İlk completed oyunu                      | Common    | Bronze   |
| Hız Koşucusu         | 1 haftada 3+ completed                   | Rare      | Silver   |
| Yarımcı I            | 10 completed                             | Common    | Bronze   |
| Yarımcı II           | 25 completed                             | Rare      | Silver   |
| Yarımcı III          | 50 completed                             | Epic      | Gold     |
| Yarımcı IV           | 100 completed                            | Epic      | Diamond  |
| Platinum Duruşu      | Bir oyuna 10/10 puan ver                 | Common    | Silver   |
| Eleştirmen I         | 5 inceleme                               | Common    | Bronze   |
| Eleştirmen II        | 10 inceleme                              | Rare      | Silver   |
| Eleştirmen III       | 25 inceleme                              | Epic      | Gold     |
| Uzun Soluklu         | 50+ saat oynanan bir oyun ekle           | Rare      | Silver   |
| Oyun Günlüğü         | Toplam 100 saatlik playtime              | Common    | Silver   |
| Maraton              | Toplam 1000 saatlik playtime             | Epic      | Gold     |
| Efsane Oyuncu        | Toplam 5000 saatlik playtime             | Legendary | Diamond  |
| Genre Tamamlayıcı    | Aynı genre'de 5 oyun tamamla            | Rare      | Gold     |
| Mükemmeliyetçi       | 5 oyuna 10/10 ver ve hepsini tamamla    | Epic      | Diamond  |
| Hızlı Bitirici       | 5 saatin altında tamamlanan 3 oyun      | Rare      | Silver   |
| Uzun Soluklu Yolculuk| 100+ saatlik bir oyun tamamla           | Epic      | Gold     |

─── C) Bağlılık ───

| Achievement       | Koşul                                         | Rarity    | Tier    |
| ----------------- | --------------------------------------------- | --------- | ------- |
| Günlük Ziyaretçi  | 7 gün streak                                  | Common    | Bronze  |
| Haftalık Gezgin   | 4 hafta (28 gün) streak                       | Rare      | Silver  |
| Aylık Sadakat     | 30 gün streak                                 | Epic      | Gold    |
| Erken Kuş         | Sabah 06–09 arası 10 giriş (yerel saat)       | Common    | Bronze  |
| Gece Kuşu         | Gece 23–02 arası 10 giriş (yerel saat)        | Common    | Bronze  |
| Yıl Dönümü        | Kayıt tarihinden 1 yıl geçmesi                | Rare      | Gold    |
| İki Yıl           | Kayıt tarihinden 2 yıl geçmesi                | Epic      | Diamond |
| Hafta Sonu Oyuncusu| 4 hafta sonu art arda giriş                  | Common    | Bronze  |
| Geri Döndüm       | 30 gün aradan sonra tekrar giriş              | Common    | Bronze  |

⚠️ Teknik not: "Erken Kuş" / "Gece Kuşu" kullanıcının profil timezone'una göre hesaplanır.
Yıldönümü: kayıt tarihi baz alınır, aktif kullanım değil.

─── D) İlerleme (YENİ KATEGORİ) ───

Sayı değil, oyun davranışı üzerine kurulu:

| Achievement          | Koşul                                              | Rarity    | Tier    |
| -------------------- | -------------------------------------------------- | --------- | ------- |
| Çeşitlilik Ustası    | 5 farklı genre'da en az 1 tamamlama               | Rare      | Silver  |
| Her Şeyin Tadını Al  | 8 farklı genre'da tamamlama                       | Epic      | Gold    |
| Platform Hopper      | 3 farklı platformda tamamlama                     | Rare      | Silver  |
| Seri Tutkunu         | Aynı seriden 3+ oyun ekle (IGDB seri verisi)      | Common    | Bronze  |
| Seri Tamamlayıcı     | Aynı seriden 3+ oyun tamamla                      | Rare      | Gold    |
| Kütüphane Temizleyici| Backlog'dan 10 oyun tamamla (önce added, sonra completed) | Rare | Silver |
| Backlog Savaşçısı    | 25 backlog oyun tamamla                            | Epic      | Gold    |
| Düşük Puanlı Cesur   | 5/10 altı rating alan oyunu yine de tamamla       | Common    | Bronze  |
| Gizem Avcısı         | 5 farklı developer'dan oyun tamamla               | Rare      | Silver  |

─── E) Sosyal (2. faz) ───

Arkadaş takip, beğeni, yorum sistemleri gelince aktif olur.
Şimdilik placeholder — implement edilmez.

─── F) Gizli / Special ───

| Achievement       | Koşul (gizli — kullanıcıya gösterilmez)              | Rarity    | Tier     |
| ----------------- | ---------------------------------------------------- | --------- | -------- |
| Gizli Avcı        | 5 gizli achievement'ı bul                           | Epic      | Gold     |
| 100.000 XP        | Toplam 100.000 XP kazan                             | Legendary | Diamond  |
| Hata Avcısı       | Bug report'u onaylansın (manuel ver)                | Rare      | Gold     |
| Beta Efsanesi     | Beta döneminde kayıt ol                             | Legendary | Diamond  |
| Tam Profil        | Profili %100 doldur (avatar, bio, sosyal link)      | Common    | Bronze   |
| Palindrom         | 11/11, 12/12 gibi bir tarihte giriş yap            | Rare      | Silver   |

───

4. Challenges

Haftalık (her Pazartesi 00:00 UTC sıfırlanır):

• "Haftalık Avcı"       — 3 yeni oyun ekle        → +75 XP
• "Eleştirmen"          — 2 inceleme yaz           → +100 XP
• "Platform Çeşitliliği"— 2+ farklı platformda oyun → +60 XP
• "Tamamlayıcı"         — 1 oyun tamamla           → +80 XP  (yeni)
• "Puanlayıcı"          — 3 oyunu puanla           → +40 XP  (yeni)

Aylık:

• "Aylık Tamamlayıcı"      — 5 completed                → +300 XP
• "Koleksiyon Genişletici" — 20 oyun ekle               → +200 XP
• "Eleştirmen Ayı"         — 5 inceleme yaz             → +250 XP  (yeni)

⚠️ Edge case: Kullanıcı Pazartesi'den sonra katılırsa o haftaki challenge'lar gözükür ama
kalan süre azalmış olur. Kısmi kredi yok — ya o hafta yetişir ya bekler.
Challenge ilerlemesi kullanıcıya açıkça gösterilmeli (2/3 oyun eklendi gibi).

───

5. Streaks

7 / 14 / 30 / 60 / 90 gün ardışık giriş → ekstra XP bonusları.
30 gün: özel badge.

Streak Freeze: MVP'de yok, 2. fazda "Donut" (1 kez affedici gün) eklenebilir.
Bağımlılık riski var — streak mekanik MVP'de optional/kapatılabilir tutulabilir.

⚠️ Teknik karar: Streak sayacı UTC gün bazlı çalışır.
Kullanıcıya "bugün giriş yaptın mı?" gösterimi yerel saatte yapılır ama
UTC gece yarısını geçince yeni gün sayılır — bu durum bildirimle kullanıcıya iletilmeli.

───

6. Leaderboard

• Haftalık ve Aylık — primary metrik: o döneme ait XP (toplam değil)
• Tüm Zamanlar      — secondary
• Top 3: özel cosmetic frame
• Kullanıcının kendi sırası: her zaman görünür (top 3'te olmasa bile)
• Pozisyon değişimi: ▲ +3 / ▼ -2 gösterimi

⚠️ Önemli karar: Haftalık leaderboard o haftaki XP'ye göre sıralanır, toplam XP'ye değil.
Yoksa aynı 3 kişi hep kazanır, yeni kullanıcı motive olmaz.

Erken aşamada muhtemelen 50–300 aktif kullanıcı olacak — realistic tasarlanmış.

───

7. Oyuncu Tipleri

| Tip            | Mekanik                        |
| -------------- | ------------------------------ |
| Steam Sync Fan | Playtime milestone XP ana kaynak|
| Manual Tracker | Review + collection ile telafi |
| Casual         | Hafifletilmiş challenges       |
| Hardcore       | Tüm mekanikler                 |

───

8. MVP vs Full Roadmap

MVP (yapılacak):

• XP + Level sistemi (milestone bazlı playtime dahil)
• 15–20 achievement (A, B, C kategorileri — temel olanlar)
• Haftalık challenges (5 challenge)
• Leaderboard (haftalık + aylık, dönem XP bazlı)
• Streak (basic, UTC bazlı)
• İlerleme kategorisinden 3–4 achievement

2. Faz:

• D kategorisi achievement'ların tamamı
• Arkadaşlar arası leaderboard
• Donut streak (1 kez affedici giriş)
• Sosyal achievements (E kategorisi)
• Profile completeness bonus

3. Faz:

• Social features (takip, beğeni, yorum)
• Yıllık season pass
• Ödül marketplace (cosmetic exchange)
• Gizli achievement'ların tamamı

───

9. Veritabanı Şeması

Collections:
• UserProgress       — XP, level, totalXP, currentStreak, longestStreak, lastLoginDate (UTC)
• AchievementDef     — id, name, description, category, rarity, tier, xpReward, condition, isHidden
• UserAchievement    — userId, achievementId, unlockedAt
• ChallengeDefinition— id, name, description, xpReward, type (weekly/monthly), resetDay
• UserChallengeProgress — userId, challengeId, progress, completedAt, weekKey/monthKey
• StreakArchive      — userId, date (UTC), loginCount
• XPLog             — userId, amount, source, createdAt  (debug + anti-cheat için)

⚠️ XPLog önemli: günlük cap kontrolü ve retroaktif hata düzeltmesi için gerekli.

───

10. Implementasyon Sırası

1. UserProgress modeli + XP service (günlük cap + XPLog dahil)
2. Activity trigger'ları (oyun ekle, tamamla, puan, inceleme, playtime milestone)
3. Achievement service — A ve B kategorisi temel achievement'lar
4. Streak tracking (UTC bazlı)
5. Basic leaderboard endpoint (haftalık dönem XP)
6. Frontend: progress bar, level badge, achievement modal
7. Challenges (haftalık 5 challenge)
8. C kategorisi (bağlılık) achievement'lar
9. İlerleme (D) kategorisi — genre/seri bazlı, IGDB verisi gerekebilir
10. Advanced + gizli achievement'lar
11. 2. faz: sosyal + donut streak + arkadaş leaderboard

───

11. Açık Kararlar (implement öncesi netleştirilmeli)

- [ ] Level eğrisi parametreleri spreadsheet'te simüle edilmeli
- [ ] Playtime: sadece Steam sync mi, manuel giriş de XP veriyor mu?
- [ ] Kullanıcı timezone'u profilde saklanacak mı?
- [ ] IGDB "seri" verisi yeterince güvenilir mi? (Seri Tutkunu achievement için)
- [ ] "AAA" tanımı: IGDB rating mi, satış rakamı mı, publisher mi?
- [ ] Challenge'larda kısmi ilerleme gösterimi UI'da nasıl görünecek?
