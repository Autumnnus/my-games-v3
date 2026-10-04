/**
 * Gizlilik politikası (KVKK aydınlatma metni dahil) ve kullanım şartları. Uzun metinler mesaj dosyalarında
 * değil burada, dil başına yapılandırılmış bölümler olarak durur. Uygulamanın gerçekte topladığı veriyle
 * (şema, entegrasyonlar, saklama süreleri) eşleşmeli: yeni bir veri türü ya da dış servis eklenince burası da
 * güncellenir ve `updatedAt` değişir.
 */

export type LegalSection = { title: string; paragraphs?: string[]; items?: string[] };
export type LegalDocument = { title: string; intro: string; sections: LegalSection[] };
type Locale = "tr" | "en";

export const LEGAL_UPDATED_AT = "2026-10-02";

const NO_CONTACT = {
  tr: "(iletişim adresi henüz tanımlanmadı)",
  en: "(contact address not set yet)",
};

export function privacyPolicy(locale: Locale, contact: string | null): LegalDocument {
  const email = contact ?? NO_CONTACT[locale];
  if (locale === "tr") {
    return {
      title: "Gizlilik Politikası ve KVKK Aydınlatma Metni",
      intro:
        "Bu metin, My Games'i kullanırken hangi kişisel verilerinin işlendiğini, neden ve nasıl işlendiğini, kimlerle paylaşıldığını ve 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) ile GDPR kapsamındaki haklarını açıklar.",
      sections: [
        {
          title: "1. Veri sorumlusu",
          paragraphs: [
            `My Games, bağımsız olarak işletilen bir oyun takip platformudur ve bu metindeki veriler bakımından veri sorumlusudur. Kişisel verilerinle ilgili tüm başvuruların için: ${email}`,
          ],
        },
        {
          title: "2. İşlenen veriler",
          items: [
            "Hesap bilgileri: ad, kullanıcı adı, e-posta adresi, şifrenin geri döndürülemez özeti (şifrenin kendisi saklanmaz), profil fotoğrafı, biyografi ve dil tercihi.",
            "Google, Discord veya Steam ile giriş yaparsan o hizmetin bize ilettiği temel profil bilgileri (ad, e-posta, profil fotoğrafı, Steam kimliği).",
            "Oyun verileri: kütüphanen, oyun durumları, puanlar, incelemeler, oynama süreleri ve tarihleri, başarımlar, yüklediğin ekran görüntüleri, yorumlar, beğeniler ve şikâyetler.",
            "Platform bağlantıları: Steam kimliğin ve herkese açık Steam verilerin; PlayStation ve Xbox için bağlantıyı sürdürmeye yarayan erişim belirteçleri (şifrelenmiş olarak saklanır, PlayStation NPSSO kodu saklanmaz). Bu hesaplardan oynama süreleri, oynama geçmişi ve başarımlar alınır.",
            "AI asistanı: asistana yazdığın mesajlar, asistanın yanıtları, kullandığı araçlar ve token kullanımı.",
            "Teknik veriler: oturumlarda IP adresi ve tarayıcı bilgisi, güvenlik ve hata kayıtları, bildirimlere izin verdiysen tarayıcının push aboneliği.",
          ],
        },
        {
          title: "3. İşleme amaçları ve hukuki sebepler",
          items: [
            "Hesabını oluşturmak, kütüphaneni tutmak, platformlarınla senkronize etmek, istatistik ve özetleri hazırlamak: sözleşmenin kurulması ve ifası (KVKK m.5/2-c).",
            "Hizmeti kötüye kullanıma karşı korumak (bot koruması, hız sınırları, moderasyon, güvenlik kayıtları): meşru menfaat (KVKK m.5/2-f) ve hukuki yükümlülükler (KVKK m.5/2-ç).",
            "Doğrulama, şifre sıfırlama ve bildirim e-postaları göndermek: sözleşmenin ifası.",
            "Yurt dışındaki hizmet sağlayıcılara aktarım (aşağıda): KVKK m.9 kapsamında, hizmetin sunulması için zorunlu olan aktarımlar.",
          ],
        },
        {
          title: "4. Herkese açık bilgiler",
          paragraphs: [
            "My Games sosyal bir platformdur. Profilin (ad, kullanıcı adı, fotoğraf, biyografi), kütüphanen, puanların, incelemelerin, ekran görüntülerin, yorumların ve etkinlik akışın herkes tarafından görülebilir ve arama motorlarınca dizinlenebilir. E-posta adresin, bağlı hesap belirteçlerin ve AI sohbetlerin herkese açık değildir.",
          ],
        },
        {
          title: "5. Aktarılan taraflar",
          paragraphs: [
            "Kişisel verilerin satılmaz ve reklam amacıyla paylaşılmaz. Hizmetin çalışması için aşağıdaki sağlayıcılar kullanılır; bazıları yurt dışında (ağırlıklı olarak ABD ve AB) veri işler:",
          ],
          items: [
            "Cloudflare: alan adı ve trafik koruması, görsellerin saklanması (R2) ve bot koruması (Turnstile).",
            "Google: AI asistanı (Gemini); asistana yazdığın mesajlar ve ilgili kütüphane bilgileri yanıt üretmek için Google'a gönderilir. Google ile giriş seçersen kimlik doğrulama.",
            "Resend: hesap e-postalarının (doğrulama, şifre sıfırlama, e-posta değişikliği ve güvenlik bildirimleri) gönderimi.",
            "Valve (Steam), Sony (PlayStation), Microsoft (Xbox) ve Discord: yalnızca o hesabı bağladığında veya onunla giriş yaptığında.",
            "IGDB (Twitch): oyun bilgileri için; bu servise kişisel veri gönderilmez.",
          ],
        },
        {
          title: "6. Çerezler ve tarayıcı depolama",
          paragraphs: [
            "Yalnızca hizmetin çalışması için zorunlu çerezler kullanılır: oturum çerezleri (giriş yapmış kalman için), dil tercihi çerezi ve Cloudflare'in bot korumasının kullandığı güvenlik çerezleri. Analiz veya reklam çerezi kullanılmaz. Bazı arayüz tercihleri (ör. görünüm seçimleri) yalnızca tarayıcının yerel depolamasında tutulur.",
          ],
        },
        {
          title: "7. Saklama süreleri",
          items: [
            "Hesap ve içerik verileri hesabın açık olduğu sürece saklanır. Hesap silindiğinde kütüphane, içerikler ve yüklenen dosyalar silinir.",
            "Güvenlik ve sistem kayıtları en fazla 30 gün tutulur.",
            "Veritabanı yedekleri en fazla 7 gün saklanır; silinen veriler bu süre sonunda yedeklerden de kalkar.",
          ],
        },
        {
          title: "8. Hakların",
          paragraphs: [
            "KVKK m.11 ve GDPR kapsamında; verilerinin işlenip işlenmediğini öğrenme, bilgi talep etme, işleme amacını öğrenme, aktarıldığı tarafları bilme, eksik veya yanlış verilerin düzeltilmesini, verilerin silinmesini isteme, itiraz etme ve zarar hâlinde tazminat talep etme hakların vardır.",
            `Verilerinin bir kopyasını Ayarlar > Verilerini dışa aktar bölümünden istediğin zaman indirebilirsin. Hesabının silinmesi ve diğer talepler için ${email} adresine kayıtlı e-posta adresinden yaz; talepler en geç 30 gün içinde sonuçlandırılır. Başvurunun sonucundan memnun kalmazsan Kişisel Verileri Koruma Kurulu'na şikâyette bulunabilirsin.`,
          ],
        },
        {
          title: "9. Yaş sınırı",
          paragraphs: [
            "My Games 13 yaşından küçükler için değildir. 13 yaşından küçük bir kullanıcıya ait hesap fark edilirse silinir.",
          ],
        },
        {
          title: "10. Değişiklikler",
          paragraphs: [
            "Bu metin güncellenebilir; önemli değişiklikler uygulama içinde duyurulur. Güncel sürüm her zaman bu sayfadadır.",
          ],
        },
      ],
    };
  }
  return {
    title: "Privacy Policy",
    intro:
      "This policy explains which personal data My Games processes, why and how, who it is shared with, and your rights under the GDPR and the Turkish Personal Data Protection Law (KVKK).",
    sections: [
      {
        title: "1. Controller",
        paragraphs: [
          `My Games is an independently operated game tracking platform and is the controller of the data described here. For any request about your personal data, contact: ${email}`,
        ],
      },
      {
        title: "2. Data we process",
        items: [
          "Account data: name, username, email address, a one-way hash of your password (the password itself is never stored), profile photo, bio and language preference.",
          "If you sign in with Google, Discord or Steam: the basic profile data that service shares with us (name, email, profile photo, Steam ID).",
          "Game data: your library, game statuses, ratings, reviews, playtime and dates, achievements, screenshots you upload, comments, likes and reports.",
          "Platform connections: your Steam ID and public Steam data; for PlayStation and Xbox, the access tokens that keep the connection alive (stored encrypted; the PlayStation NPSSO code is not stored). Playtime, play history and achievements are read from these accounts.",
          "AI assistant: the messages you write, the assistant's replies, the tools it used and token usage.",
          "Technical data: IP address and browser details in sessions, security and error logs, and your browser's push subscription if you allowed notifications.",
        ],
      },
      {
        title: "3. Purposes and legal bases",
        items: [
          "Running your account, keeping your library, syncing your platforms, building stats and recaps: performance of a contract (GDPR Art. 6(1)(b), KVKK Art. 5/2-c).",
          "Protecting the service from abuse (bot protection, rate limits, moderation, security logs): legitimate interests (GDPR Art. 6(1)(f), KVKK Art. 5/2-f) and legal obligations.",
          "Sending verification, password reset and notification emails: performance of a contract.",
          "Transfers to providers abroad (below): transfers required to provide the service.",
        ],
      },
      {
        title: "4. Public information",
        paragraphs: [
          "My Games is a social platform. Your profile (name, username, photo, bio), library, ratings, reviews, screenshots, comments and activity feed are visible to everyone and may be indexed by search engines. Your email address, connected-account tokens and AI chats are not public.",
        ],
      },
      {
        title: "5. Who we share data with",
        paragraphs: [
          "Your data is never sold or shared for advertising. The service relies on these providers, some of which process data outside your country (mainly in the US and the EU):",
        ],
        items: [
          "Cloudflare: domain and traffic protection, image storage (R2) and bot protection (Turnstile).",
          "Google: the AI assistant (Gemini); your messages and the relevant library details are sent to Google to generate replies. Also sign-in if you choose Google.",
          "Resend: delivery of account emails (verification, password reset, email changes and security notices).",
          "Valve (Steam), Sony (PlayStation), Microsoft (Xbox) and Discord: only when you connect or sign in with that account.",
          "IGDB (Twitch): game information; no personal data is sent to it.",
        ],
      },
      {
        title: "6. Cookies and browser storage",
        paragraphs: [
          "We only use cookies that the service needs to work: session cookies (to keep you signed in), a language preference cookie and the security cookies Cloudflare's bot protection uses. No analytics or advertising cookies are used. Some interface preferences (such as view choices) are kept only in your browser's local storage.",
        ],
      },
      {
        title: "7. Retention",
        items: [
          "Account and content data is kept while your account exists. When the account is deleted, your library, content and uploaded files are deleted.",
          "Security and system logs are kept for at most 30 days.",
          "Database backups are kept for at most 7 days; deleted data leaves the backups after that.",
        ],
      },
      {
        title: "8. Your rights",
        paragraphs: [
          "You have the right to access, rectify and erase your data, to restrict or object to processing, to data portability, and to lodge a complaint with a supervisory authority.",
          `You can download a copy of your data at any time from Settings > Export your data. To delete your account or make any other request, write to ${email} from your account's email address; requests are answered within 30 days.`,
        ],
      },
      {
        title: "9. Age limit",
        paragraphs: [
          "My Games is not for children under 13. Accounts found to belong to a child under 13 are deleted.",
        ],
      },
      {
        title: "10. Changes",
        paragraphs: [
          "This policy may change; significant changes are announced in the app. The current version is always on this page.",
        ],
      },
    ],
  };
}

export function termsOfService(locale: Locale, contact: string | null): LegalDocument {
  const email = contact ?? NO_CONTACT[locale];
  if (locale === "tr") {
    return {
      title: "Kullanım Şartları",
      intro:
        "My Games'e kayıt olarak veya hizmeti kullanarak bu şartları kabul etmiş olursun. Kabul etmiyorsan hizmeti kullanma.",
      sections: [
        {
          title: "1. Hesap",
          items: [
            "Hizmeti kullanmak için en az 13 yaşında olmalısın.",
            "Kayıt bilgilerinin doğru olmasından ve şifrenin güvenliğinden sen sorumlusun. Hesabın başkası tarafından kullanıldığını fark edersen bize hemen bildir.",
            "Başkasının yerine geçen, yanıltıcı ya da toplu/otomatik açılmış hesaplar kapatılabilir.",
          ],
        },
        {
          title: "2. İçeriğin",
          paragraphs: [
            "Yazdığın incelemeler, yorumlar ve yüklediğin ekran görüntüleri sana aittir. Bunları hizmette göstermemiz, saklamamız ve hizmetin çalışması için gereken biçimde işlememiz (ör. görsellerin sıkıştırılması, akışta gösterilmesi) için bize ücretsiz, münhasır olmayan bir izin vermiş olursun. İçeriği sildiğinde bu izin de sona erer.",
            "Yüklediğin içeriğin sana ait olduğundan ya da paylaşma hakkın olduğundan emin olmalısın.",
          ],
        },
        {
          title: "3. Yasak davranışlar",
          items: [
            "Taciz, nefret söylemi, tehdit, başkalarının kişisel bilgilerini paylaşmak.",
            "Hukuka aykırı, müstehcen veya telif hakkını ihlal eden içerik yüklemek.",
            "Spam, reklam, sahte etkileşim ya da hizmeti otomatik araçlarla izinsiz taramak.",
            "Hizmetin güvenliğini aşmaya, başka hesaplara erişmeye ya da sistemi aşırı yüklemeye çalışmak.",
          ],
        },
        {
          title: "4. Moderasyon",
          paragraphs: [
            "Bu şartlara aykırı içerikleri kaldırabilir, AI asistanı veya yükleme gibi özellikleri kısıtlayabilir ve hesapları askıya alabilir ya da kapatabiliriz. Uygunsuz bir içerik görürsen içerikteki şikâyet seçeneğini kullan.",
          ],
        },
        {
          title: "5. Üçüncü taraf platformlar",
          paragraphs: [
            "My Games; Valve, Sony, Microsoft veya oyun yayıncılarıyla bağlantılı değildir. Oyun adları, görselleri ve markaları sahiplerine aittir. Steam, PlayStation ve Xbox bağlantıları o platformların sunduğu (PlayStation için resmî olmayan) arayüzlere dayanır; bu platformlar değişiklik yaparsa bağlantılar çalışmayabilir.",
          ],
        },
        {
          title: "6. AI asistanı ve tahminler",
          paragraphs: [
            "AI asistanının yanıtları ve takip öncesi oynama geçmişi tahminleri hatalı olabilir; tahminler arayüzde ayrıca işaretlenir. Asistanın önerdiği değişiklikler, ayarlarında aksini seçmediğin sürece onayın olmadan uygulanmaz. AI kullanımı günlük kotalarla sınırlıdır.",
          ],
        },
        {
          title: "7. Hizmetin sunulması",
          paragraphs: [
            'Hizmet ücretsizdir ve "olduğu gibi" sunulur. Kesintisiz veya hatasız çalışacağı garanti edilmez; özellikler değiştirilebilir ya da kaldırılabilir. Kanunun izin verdiği ölçüde, hizmetin kullanımından doğan dolaylı zararlardan sorumluluk kabul edilmez. Verilerinin bir kopyasını Ayarlar\'dan istediğin zaman indirebilirsin.',
          ],
        },
        {
          title: "8. Hesabın kapatılması",
          paragraphs: [
            `Hesabının silinmesini ${email} adresine yazarak istediğin zaman talep edebilirsin. Şartları ciddi biçimde ihlal eden hesaplar bildirimde bulunmaksızın kapatılabilir.`,
          ],
        },
        {
          title: "9. Değişiklikler ve iletişim",
          paragraphs: [
            `Bu şartlar güncellenebilir; önemli değişiklikler uygulama içinde duyurulur ve sonrasında hizmeti kullanmaya devam etmen yeni şartları kabul ettiğin anlamına gelir. Bu şartlara Türkiye Cumhuriyeti hukuku uygulanır. Sorular için: ${email}`,
          ],
        },
      ],
    };
  }
  return {
    title: "Terms of Service",
    intro:
      "By signing up for or using My Games you agree to these terms. If you do not agree, do not use the service.",
    sections: [
      {
        title: "1. Your account",
        items: [
          "You must be at least 13 years old to use the service.",
          "You are responsible for the accuracy of your sign-up details and for keeping your password safe. Tell us right away if someone else is using your account.",
          "Accounts that impersonate others, mislead, or were created in bulk or automatically may be closed.",
        ],
      },
      {
        title: "2. Your content",
        paragraphs: [
          "The reviews and comments you write and the screenshots you upload remain yours. You grant us a free, non-exclusive permission to display and store them and to process them as the service needs (for example compressing images or showing them in the feed). This permission ends when you delete the content.",
          "Only upload content you own or have the right to share.",
        ],
      },
      {
        title: "3. Not allowed",
        items: [
          "Harassment, hate speech, threats or sharing other people's personal information.",
          "Illegal, sexually explicit or copyright-infringing content.",
          "Spam, advertising, fake engagement or scraping the service without permission.",
          "Trying to bypass security, access other accounts or overload the system.",
        ],
      },
      {
        title: "4. Moderation",
        paragraphs: [
          "We may remove content that breaks these terms, restrict features such as the AI assistant or uploads, and suspend or close accounts. If you see something inappropriate, use the report option on it.",
        ],
      },
      {
        title: "5. Third-party platforms",
        paragraphs: [
          "My Games is not affiliated with Valve, Sony, Microsoft or game publishers. Game names, images and trademarks belong to their owners. Steam, PlayStation and Xbox connections rely on interfaces those platforms provide (unofficial in PlayStation's case) and may stop working if they change.",
        ],
      },
      {
        title: "6. AI assistant and estimates",
        paragraphs: [
          "The AI assistant's answers and the estimates of your play history before tracking began can be wrong; estimates are marked as such in the interface. Changes the assistant proposes are not applied without your approval unless you choose otherwise in your settings. AI use is limited by daily quotas.",
        ],
      },
      {
        title: "7. The service",
        paragraphs: [
          'The service is free and provided "as is". It is not guaranteed to be uninterrupted or error-free, and features may change or be removed. To the extent the law allows, we are not liable for indirect damages arising from using the service. You can download a copy of your data from Settings at any time.',
        ],
      },
      {
        title: "8. Closing your account",
        paragraphs: [
          `You can ask for your account to be deleted at any time by writing to ${email}. Accounts that seriously break these terms may be closed without notice.`,
        ],
      },
      {
        title: "9. Changes and contact",
        paragraphs: [
          `These terms may change; significant changes are announced in the app, and continuing to use the service afterwards means you accept the new terms. These terms are governed by the laws of the Republic of Türkiye. Questions: ${email}`,
        ],
      },
    ],
  };
}
