# Randevu

Telefonla aramanın yerini alacak kadar basit, her türlü işletmenin kullanabileceği bir randevu uygulaması (PWA).
Altyapı **Firebase'in ücretsiz planı (Spark)** ile çalışır. Kredi kartı, sunucu kodu ve komut satırı gerekmez.

> Önceki sürüm olan *Direksiyon Dersi Programı* üzerine kuruldu. Sektöre özel hiçbir şey (ders, hoca, 50 dakika, 08:00–17:00) kodda sabit değildir. Hepsini işletme kendisi ayarlar.

## Nasıl çalışır?

| | |
|---|---|
| **Müşteri** | İşletmenin bağlantısını ya da QR kodunu açar. Hizmeti, günü ve saati seçip adını ve telefonunu yazar, randevu hazır olur. Hesap açmaz, şifre ya da e-posta girmez. Randevuları o cihazda "Randevularım" sayfasında görünür. |
| **İşletme sahibi** | Google hesabıyla tek tıkla girer ve 4 adımda kurar: ad, kaynak (Personel/Usta/Saha…), ilk hizmet, çalışma saatleri. Ardından bağlantı ve QR kodu hazırdır. |
| **Ekip** | Sahip bir davet bağlantısı gönderir. Ekip üyesi Google ile girip katılır, ajandayı ve müşterileri görür. Ayarları değiştiremez. |
| **Telefonla arayan müşteri** | İşletme randevuyu panelden "+ Randevu" ile elle ekler. |

Hizmetler, süreler, randevu sonrası ara, saat aralığı, çalışma saatleri, öğle arası gibi molalar, tatil ve izin günleri, onay modu, iptal süresi ve haftalık sınır: **hepsini işletme Ayarlar'dan girer.**

## Çakışma ve güvenlik

Kuralların tamamı `firestore.rules` dosyasında. Bu dosya Firebase Console'daki "Rules" sekmesine yapıştırılır.

- **Aynı saate iki randevu yazılamaz.** Her randevu, kapladığı her 5 dakikalık dilim için bir "dolu" kaydı oluşturur. Bu kayıtların üzerine yazılamaz; aynı dilimi ikinci kez almaya çalışan randevunun tamamı reddedilir. Test: 20 kişi aynı anda aynı saate bastı, 1 kişi kaydedildi, 19 kişi reddedildi.
- **Müşteri ekranını atlayıp doğrudan veritabanına yazan biri bile şunları yapamaz:**
  - başkasının randevusunu görmek, iptal etmek ya da kilidini silmek
  - kendi randevusunu "onaylandı" yazmak
  - hizmet süresini ya da randevu sonrası arayı kısaltmak
  - "en az ne kadar önceden" ve "en fazla kaç gün ileri" kurallarını aşmak
  - engellenmiş bir numarayla randevu almak
  - işletme ayarlarını ya da çalışma saatlerini değiştirmek
- **Müşteri listesini ve randevuları yalnızca ekip görür.** Herkese açık olan bilgiler: işletme vitrini, hizmetler, çalışma saatleri, kapalı günler ve dolu dilimler. Dolu dilimlerde isim veya numara yoktur.

**Ücretsiz planın sınırları (bilerek yapılan tercihler):**
- **Telefon doğrulanmıyor.** Firebase, SMS'i yalnızca ücretli Blaze planında gönderiyor. Sahte randevuya karşı alınan önlemler:
  - varsayılan **"Ben onaylayayım"** modu
  - numara engelleme
  - ileri tarih ve önceden haber sınırları
- **"Açık randevu sınırı" ve "haftalık sınır" uygulama tarafından** (müşterinin cihazına göre) kontrol edilir. Çakışma kuralı ise veritabanı tarafından garanti edilir.
- **Çalışma saati dışına randevu yazılmasını uygulama engeller.** Veritabanı kuralı bunu ayrıca kontrol etmez; kötü niyetli bir istek gelirse işletme onaylamayarak reddeder.

## Kurulum: sadece tarayıcıdan

### A) Firebase Console

[console.firebase.google.com](https://console.firebase.google.com) adresinden mevcut projeyi açın (ya da yeni bir proje oluşturun). Ücretsiz Spark planı yeterli.

1. **Firestore Database → Create database**
   - Konum: `europe-west1` (Belçika). Konum sonradan değiştirilemez.
   - Mod: **Production mode** ("test mode" seçmeyin; o mod 30 gün boyunca veritabanını herkese açar).
   - Oluştuktan sonra **Rules** sekmesine gidin, içindekileri silin, bu repodaki [`firestore.rules`](firestore.rules) dosyasının **tamamını** yapıştırıp **Publish**'e basın.
2. **Authentication → Get started → Sign-in method**
   - **Google** → Enable → destek e-postanızı seçin → Save
   - **Anonymous** → Enable → Save. Müşteriler hesap açmadan randevu alabilsin diye gerekli.
3. **Authentication → Settings → Authorized domains → Add domain:** Vercel adresiniz (`xxx.vercel.app`). Alan adı aldığınızda onu da ekleyin. Eklenmezse Google ile giriş çalışmaz.
4. **Proje ayarları (⚙) → Genel → Uygulamalarınız:** Web uygulaması yoksa `</>` ile ekleyin (Hosting kutusunu işaretlemeyin). Gösterilen `apiKey`, `authDomain`, `projectId` ve `appId` değerlerini kopyalayın.

### B) Vercel

1. **Add New → Project →** bu repoyu seçin (**Import**). Framework olarak **Vite** otomatik algılanır.
2. **Environment Variables:**

   | Ad | Değer |
   |---|---|
   | `VITE_FIREBASE_API_KEY` | apiKey |
   | `VITE_FIREBASE_AUTH_DOMAIN` | authDomain |
   | `VITE_FIREBASE_PROJECT_ID` | projectId |
   | `VITE_FIREBASE_APP_ID` | appId |

3. **Deploy.** Çıkan adresi A-3 adımındaki **Authorized domains** listesine ekleyin.
4. `https://xxx.vercel.app/yeni` adresinde Google ile girin ve işletmenizi kurun.

Bu kadar. Sonraki her kod güncellemesi Vercel'e otomatik yansır. `firestore.rules` dosyası değişirse yeni halini Rules sekmesine yeniden yapıştırmanız yeterli.

### Eski sitenin verisi

Eski site (`main` dalı) Realtime Database'e herkese açık şekilde yazıyor; öğrenci adları ve telefonları dışarıdan okunabilir. Yeni sürüme geçince:

1. **Realtime Database → Rules** sayfasında kuralları şöyle yapıp yayınlayın:
   ```json
   { "rules": { ".read": false, ".write": false } }
   ```
2. Eski veriye ihtiyacınız yoksa `ogrenciKayitlar` düğümünü silin. Saklamak istiyorsanız önce "Export JSON" ile indirin.

## Geliştirme ve testler (isteğe bağlı)

Yerelde çalıştırmak için önce ortam dosyasını oluşturup Firebase değerlerinizi girin:

```bash
cp .env.example .env.local
```

```bash
npm install
```

```bash
npm run dev
```

**Güvenlik kuralları testleri** (Firebase emülatörü; Java 11+ ve `firebase-tools` gerekir). Toplam 41 test var; kötü niyetli istemci senaryolarını ve 20 kişilik yarış testini kapsar:

```bash
npm run test:rules
```

**Arayüz testi** (uygulama emülatöre bağlanır, Playwright tıklar; taklit veri yoktur):

```bash
npm run test:ui
```

Test sırasıyla şunları dener: Google ile giriş, kurulum sihirbazı, müşterinin hesapsız randevu alması, alınan saatin başka bir müşterinin ekranından anında kaybolması, talebin panele anında düşmesi, onay, WhatsApp şablonu, elle randevu ekleme, öğle arası tanımlama ve kapalı gün ekleme.

## İleride Blaze planına geçilirse

- SMS ile telefon doğrulama (Firebase Phone Auth)
- Panel kapalıyken bildirim (Cloud Messaging) ve otomatik hatırlatma
- Haftalık sınırın sunucu tarafında, numaraya göre kontrolü
