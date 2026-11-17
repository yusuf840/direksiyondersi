# Randevu

Telefonla aramanın yerini alacak kadar basit, her türlü işletmenin kullanabileceği bir randevu uygulaması (PWA). Altyapı **Firebase**.

> Önceki sürüm olan *Direksiyon Dersi Programı* üzerine kuruldu. Sektöre özel hiçbir şey (ders, hoca, 50 dakika, 08:00–17:00) kodda sabit değildir. Bunların hepsini işletme kendisi ayarlar.

## Temel ilkeler

| İlke | Uygulamadaki karşılığı |
|---|---|
| **Aramaktan daha kolay olmalı** | Müşteri bağlantıyı açar, hizmeti, günü ve saati seçer. Telefonunu bir kez SMS ile doğrular, randevu hazır olur. Uygulama indirmek, şifre ya da e-posta gerekmez. |
| **Kuralları işletme koyar** | Hizmetler, süreler, randevu sonrası ara, saat aralığı, çalışma saatleri, öğle arası gibi molalar, tatil ve izinler, onay modu, iptal süresi, haftalık sınır. Hepsi Ayarlar'dan girilir. Kurulumda saat alanları bile boş gelir. |
| **Sıfatsız** | "Ders/hoca" yerine *hizmet* ve *kaynak* var. Kaynağın adını işletme seçer: Personel, Eğitmen, Usta, Saha, Masa, Araç… |
| **Çakışma imkânsız olmalı** | Randevu yalnızca sunucuda (Cloud Functions) bir işlem (transaction) içinde yazılır. Aynı kaynak ve gün için eşzamanlı istekler sıraya girer. |
| **Sahte hesap ve spam olmamalı** | Her hesap SMS ile doğrulanmış bir telefon numarasıdır. Bunun üstüne açık randevu sınırı, haftalık sınır ve numara engelleme gelir. |
| **Herkes aynı anda aynı şeyi görmeli** | Biri saat aldığında açık olan diğer müşteri ekranlarında o saat hemen kaybolur. İşletme paneline yeni talep sesli bildirimle düşer. |

## Hesaplar ve işletme ile müşterinin bağlanması

```
              ┌──────────── telefon + SMS kodu (tek giriş yolu) ────────────┐
   MÜŞTERİ    │  bağlantı/QR ─► /isletme-adi ─► hizmet ─► gün ─► saat ─► doğrula ─► randevu
   İŞLETME    │  /yeni ─► ad + bağlantı ─► kaynak ─► ilk hizmet ─► saatler ─► bağlantı + QR
   EKİP       │  sahip davet bağlantısı üretir ─► /katil/kod ─► doğrula ─► panele erişir
              └──────────────────────────────────────────────────────────────┘
```

- **Tek kimlik:** Aynı telefon numarası hem müşteri hem işletme sahibi olabilir. Rol, hesabın kendisinde değil işletmeye üyelikte tutulur.
- **Telefonla arayan müşteri:** İşletme randevuyu panelden elle girer. O kişi daha sonra aynı numarayla giriş yaparsa (numara SMS ile doğrulandığı için güvenli şekilde) eski kaydı kendiliğinden ona bağlanır.
- **Ana ekrana ekleme:** Uygulama ana ekrandan açıldığında en son kullanılan yerle açılır. Müşteri için bu işletme sayfası, sahip için paneldir.

## Mimari

```
Tarayıcı (React PWA)
  ├─ okur: işletme vitrini, hizmetler, kaynaklar          ─┐
  ├─ dinler: pulse/{işletme} (kişisel veri yok)            │  Firestore
  ├─ ekip okur/dinler: randevular, müşteriler, izinler     │  (firestore.rules ile korunur)
  ├─ sahip yazar: hizmetler, saatler, kapalı zamanlar     ─┘
  └─ çağırır: book, cancelMyBooking, availableSlots …   ──►  Cloud Functions (europe-west1)
                                                              kurallar + transaction + kilitler
```

| Dosya | Görevi |
|---|---|
| `functions/src/index.ts` | Randevu alma, iptal, işletme kurma ve güncelleme, ekip daveti, ekibin randevu ekleme ve düzenlemesi |
| `functions/src/core.ts` | Boş saat hesaplama ve çakışma kilidi |
| `firestore.rules` | Kim neyi okuyup yazabilir. Müşteri randevu tablosuna doğrudan yazamaz, başkasının adını ya da numarasını göremez. |
| `firestore.indexes.json` | Sorguların ihtiyaç duyduğu indeksler |
| `src/lib/api.ts` | Arayüzün tek veri katmanı |

**Çakışma nasıl önleniyor?** Her randevu, kaynağın ilgili günü için bir kilit belgesini (`locks/…`) aynı işlemde okuyup yazar. Aynı kaynak ve aynı gün için gelen iki istek Firestore tarafından sıraya sokulur; ikinci istek ilkinin kaydını görür ve `SLOT_TAKEN` hatası alır. Emülatörde 20 kişi aynı anda aynı saate bastı ve tam 1 kişi kaydedildi (`npm run test:firebase`).

## Kurulum

Mevcut Firebase projesi (`direksiyon-dersi-29912`) kullanılır. Eski site Realtime Database'i, yeni sürüm ise Firestore'u kullandığı için ikisi aynı projede çakışmadan durabilir.

### 1. Firebase Console (tarayıcıdan, yaklaşık 10 dakika)

[console.firebase.google.com](https://console.firebase.google.com) → `direksiyon-dersi-29912` projesi:

1. **Blaze planına geçin** (sol altta "Upgrade"). Cloud Functions ve SMS ile giriş bunu gerektiriyor.
   - Kredi kartı istenir, ancak küçük bir işletmenin kullanımı büyük ölçüde ücretsiz kotaların içinde kalır. SMS'ler ise ayrıca ücretlendirilir.
   - **Mutlaka bütçe uyarısı kurun:** Google Cloud → Billing → Budgets & alerts, örneğin 5 $.
2. **Firestore Database → Create database**
   - Konum: `europe-west1` (Belçika). Konum sonradan değiştirilemez.
   - Mod: *Production mode*. Kurallar 4. adımda yüklenecek.
3. **Authentication → Get started → Sign-in method → Phone → Enable**
   - **Phone numbers for testing:** `+90 530 000 00 01` → `123456` gibi birkaç numara ekleyin. Deneme sırasında SMS gitmez, para harcanmaz.
   - **Settings → SMS region policy → Allow → yalnızca Türkiye.** Yurt dışı numaralarla SMS dolandırıcılığına karşı önemli.
   - **Settings → Authorized domains:** Vercel adresinizi ekleyin (`xxx.vercel.app`) ve alan adı aldığınızda onu da ekleyin. Eklenmezse SMS ile giriş çalışmaz.
4. **Proje ayarları (⚙) → Genel → Uygulamalarınız:** Web uygulaması yoksa `</>` ile ekleyin. Gösterilen `apiKey`, `authDomain`, `projectId` ve `appId` değerlerini not edin.

### 2. Sunucu tarafını yükleme (kendi bilgisayarınızdan, bir kez)

Node.js 22 kurulu olmalı. Önce Firebase komut satırı aracını kurun:

```bash
npm install -g firebase-tools
```

```bash
firebase login
```

Kodu indirip `randevu` dalına geçin:

```bash
git clone -b randevu https://github.com/yusuf840/direksiyondersi
```

```bash
cd direksiyondersi
```

Fonksiyonların bağımlılıklarını kurun:

```bash
npm --prefix functions install
```

Güvenlik kurallarını, indeksleri ve Cloud Functions'ı yükleyin:

```bash
firebase deploy --only firestore,functions
```

İlk yüklemede Google bazı servisleri (Cloud Build, Artifact Registry vb.) açmak için onay isteyebilir; "evet" deyin. İndekslerin oluşması birkaç dakika sürer.

> Fonksiyon kodu ya da kurallar değiştiğinde aynı `firebase deploy` komutu tekrar çalıştırılır. Arayüz değişiklikleri ise Vercel'e otomatik gider.

### 3. Vercel (arayüz)

1. Vercel'de **Add New → Project →** `yusuf840/direksiyondersi` reposunu Import edin.
2. **Settings → Git → Production Branch:** `randevu`.
3. **Environment Variables:**
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_APP_ID`
   - (isteğe bağlı) `VITE_APP_NAME`
4. Deploy edin. Çıkan adresi Firebase'deki **Authorized domains** listesine eklemeyi unutmayın.
5. `https://<proje>.vercel.app/yeni` adresine gidip test numarasıyla (kod `123456`) giriş yapın ve ilk işletmeyi kurun.

> Vercel yerine Firebase Hosting de kullanılabilir: `npm run deploy:hosting`.

### Eski sitenin verisi

`main` dalındaki eski site Realtime Database'e herkese açık şekilde yazıyor; öğrenci adları ve telefonları dışarıdan okunabilir. Yeni sürüme geçtiğinizde:

1. **Realtime Database → Rules** sayfasında kuralları şöyle yapıp yayınlayın:
   ```json
   { "rules": { ".read": false, ".write": false } }
   ```
2. Eski veriye ihtiyacınız yoksa `ogrenciKayitlar` düğümünü silin. Saklamak istiyorsanız önce "Export JSON" ile indirin.

## Geliştirme ve testler

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

**Kural ve çakışma testleri** (Firebase emülatörü; Java 11+ gerekir):

```bash
npm run test:firebase
```

Toplam 40 test var; kapsadıkları:
- çakışma, ara süre, çalışma saati ve saat ızgarası kontrolü
- haftalık sınır ve kapalı zaman
- KVKK onayı ve numara engelleme
- iptal süresi ve iptal sonrası saatin boşalması
- yetkiler: müşteri başkasının verisini göremez, ekip ayar değiştiremez
- telefonla arayan müşterinin kaydını sahiplenmesi
- ekip daveti ve "verilerimi sil"
- 20 kişilik yarış testi

**Arayüz testi** (uygulama emülatöre bağlanır, Playwright tıklar; taklit veri yoktur):

```bash
npm run test:ui
```

Test sırasıyla şunları yapar: SMS koduyla giriş, kurulum sihirbazı, müşterinin randevu alması, alınan saatin başka bir müşterinin ekranından anında kaybolması, talebin panele anında düşmesi, onay, WhatsApp şablonu, elle randevu ekleme, öğle arası tanımlama ve kapalı gün ekleme.

## Eski sürümden farklar

| Eski (direksiyondersi) | Yeni |
|---|---|
| Öğrenci "uygunluk" bildirir, hoca otomatik plan çalıştırır | Müşteri boş saati kendisi seçer. Onaylı modda saat ayrılır, işletme onaylar. |
| Hoca şifresi `12345` tarayıcı kodunda açıkça duruyor | Telefon + SMS ile giriş, yetki kontrolü sunucuda ve Firestore kurallarında |
| Her kayıtta tüm liste baştan yazılıyor; eşzamanlı kayıtlar birbirini siliyor | Belge bazlı kayıt, transaction ve kilitlerle çakışma koruması |
| Veritabanı herkese açık | Müşteri yalnızca kendi randevusunu görür; randevu tablosuna doğrudan yazma yok |
| "Pazartesi 10:00" gibi tarihsiz kayıtlar | Gerçek tarih ve saat dilimi; geçmiş tutuluyor |
| Saatler, günler ve ders süresi kodda sabit | Hepsi işletme ayarlarında, kaynak başına ayrı ayrı |
| Tek hoca | Birden çok kaynak, ekip daveti, hizmet–kaynak eşleşmesi |
| WhatsApp şablonları | Korundu ve genelleştirildi (onay, hatırlatma, değişiklik, iptal) |
| PDF ve Excel çıktısı | Excel uyumlu CSV ve yazdırma görünümü (PDF olarak kaydedilebilir) |

## Yol haritası

- [ ] Web Push: panel kapalıyken de yeni talep bildirimi (Firebase Cloud Messaging)
- [ ] Otomatik hatırlatma (randevudan 1 gün önce): zamanlanmış fonksiyon, SMS ya da WhatsApp Business
- [ ] Onaylanmayan talepler için süre aşımı (ör. 24 saat)
- [ ] Bekleme listesi: dolu güne "yer açılırsa haber ver"
- [ ] Grup ve kapasiteli hizmetler (aynı saate N kişi)
- [ ] Personelin kendi iznini panelden girmesi (kurallar izin veriyor, arayüz şimdilik yalnızca sahibe açık)
- [ ] App Check (bot koruması) ve KVKK metninin hukukçu tarafından son hali
