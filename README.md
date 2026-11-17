# Randevu

Telefonla aramanın yerini alacak kadar basit, her türlü işletmenin kullanabileceği bir randevu uygulaması (PWA).

> Önceki sürüm olan *Direksiyon Dersi Programı* üzerine kuruldu. Sektöre özel hiçbir şey (ders, hoca, 50 dakika, 08:00–17:00) kodda sabit değildir. Bunların hepsini işletme kendisi ayarlar.

## Temel ilkeler

| İlke | Uygulamadaki karşılığı |
|---|---|
| **Aramaktan daha kolay olmalı** | Müşteri bağlantıyı açar, hizmeti, günü ve saati seçer. Telefonunu bir kez SMS ile doğrular, randevu hazır olur. Uygulama indirmek, şifre ya da e-posta gerekmez. |
| **Kuralları işletme koyar** | Hizmetler, süreler, randevu sonrası ara, saat aralığı, çalışma saatleri, öğle arası gibi molalar, tatil ve izinler, onay modu, iptal süresi, haftalık sınır. Hepsi Ayarlar'dan girilir, hiçbirinin varsayılan değeri yoktur. |
| **Sıfatsız** | "Ders/hoca" yerine *hizmet* ve *kaynak* var. Kaynağın adını işletme seçer: Personel, Eğitmen, Usta, Saha, Masa, Araç… |
| **Çakışma imkânsız olmalı** | Kontrol arayüzde değil veritabanında yapılır. Aynı kaynakta üst üste binen iki aktif randevu fiziksel olarak kaydedilemez. |
| **Sahte hesap ve spam olmamalı** | Her hesap SMS ile doğrulanmış bir telefon numarasıdır. Bunun üstüne açık randevu sınırı, haftalık sınır ve numara engelleme gelir. |
| **Herkes aynı anda aynı şeyi görmeli** | Biri saat aldığında açık olan diğer ekranlarda o saat hemen kaybolur. İşletme paneline yeni talep sesli bildirimle düşer. |

## Hesaplar ve işletme ile müşterinin bağlanması

```
            ┌──────────── telefon + SMS kodu (tek giriş yolu) ────────────┐
            │                                                              │
   MÜŞTERİ  │  bağlantı/QR ─► /isletme-adi ─► hizmet ─► gün ─► saat ─► doğrula ─► randevu
            │                                                              │
   İŞLETME  │  /yeni ─► ad + bağlantı ─► kaynak ─► ilk hizmet ─► saatler ─► bağlantı + QR
            │                                                              │
   EKİP     │  sahip davet bağlantısı üretir ─► /katil/kod ─► doğrula ─► panele erişir
            └──────────────────────────────────────────────────────────────┘
```

- **Tek kimlik:** Aynı telefon numarası hem müşteri hem işletme sahibi olabilir. Rol, hesabın kendisinde değil işletmeye üyelikte tutulur.
- **Bağlantı:** İşletmenin `site.com/isletme-adi` bağlantısı ve QR kodu vardır. Bunları WhatsApp açıklamasına, Instagram'a, kapıya koyar. Telefonla arayan müşteriye de bağlantıyı gönderir.
- **Telefonla arayan müşteri:** İşletme randevuyu panelden elle girer. O kişi daha sonra aynı numarayla giriş yaparsa (numara SMS ile doğrulandığı için güvenli şekilde) eski kaydı kendiliğinden ona bağlanır ve randevularını görür.
- **Ana ekrana ekleme:** Uygulama ana ekrandan açıldığında en son kullanılan yerle açılır. Müşteri için bu işletme sayfası, sahip için paneldir.

## Çakışma ve kural motoru

Kurallar veritabanında uygulanır, bu yüzden arayüz atlansa bile delinemez (`supabase/migrations`):

- `bookings_no_overlap`: `EXCLUDE USING gist (resource_id =, [başlangıç, bitiş+ara) &&)`. Aynı kaynakta bekleyen ya da onaylı iki randevu üst üste binemez.
- `available_slots()`: Boş saatleri çalışma aralıkları, hizmet süresi ve arası, saat aralığı, mevcut randevular, kapalı zamanlar, en az önceden haber süresi ve ileri tarih sınırından hesaplar.
- `book()`: Müşteri tablolara doğrudan yazamaz. Randevu yalnızca bu fonksiyonla alınır ve şunları kontrol eder:
  - giriş ve doğrulanmış telefon
  - KVKK onayı
  - engellenmiş numara
  - açık randevu sınırı ve haftalık sınır
  - müşterinin aynı anda iki yerde olmaması
  - seçilen saatin gerçekten boş olması

  "Fark etmez" seçildiyse o gün en az dolu kaynağı atar.
- Aynı müşterinin eşzamanlı istekleri kilitle sıraya alınır, böylece sınırlar yarış durumunda da aşılamaz.
- Satır düzeyi güvenlik (RLS): Müşteri yalnızca kendi randevularını görür (`my_bookings()`), başka kimsenin adını ya da numarasını göremez. Ekip yalnızca kendi işletmesini, ayarları ise yalnızca sahip değiştirebilir.

**Anlık güncelleme:** Herkese açık `business_pulse` tablosu kişisel veri içermez, yalnızca "bu işletmede bir şey değişti" sinyali taşır. Müşteri ekranı buna abone olur ve boş saatleri yeniden çeker. Panel `bookings` tablosuna abonedir (RLS'ye tabi).

## Teknoloji

- **Ön yüz:** React 19, Vite, TypeScript, `vite-plugin-pwa`. Müşteri sayfası panelden ayrı yüklenir, böylece hızlı açılır.
- **Arka uç:** Supabase (Postgres, telefon OTP girişi, Realtime). Ayrı bir sunucu kodu yoktur.
- **Barındırma:** Vercel (statik). `vercel.json` SPA yönlendirmelerini içerir.
- **SMS:** Supabase'in yerleşik sağlayıcıları (Twilio, Vonage, MessageBird…) ya da Türkiye için `supabase/functions/send-sms` (Netgsm).

## Kurulum

### 1. Supabase

1. [supabase.com](https://supabase.com) üzerinde ücretsiz bir proje açın. Bölge olarak Frankfurt (eu-central-1) önerilir.
2. **SQL Editor**'de sırasıyla `supabase/migrations/0001_init.sql` ve `0002_set_working_hours.sql` dosyalarını çalıştırın.
3. **Authentication → Sign In / Providers → Phone**'u açın.
   - **Deneme için (SMS ücreti olmadan):** Aynı sayfadaki *Test Phone Numbers and OTPs* alanına `905301112233=123456` gibi satırlar ekleyin. Bu numaralar SMS gitmeden sabit kodla giriş yapar.
   - **Gerçek SMS için:** Aşağıdaki "SMS" bölümüne bakın.
4. **Database → Publications → supabase_realtime** altında `bookings` ve `business_pulse` tablolarının açık olduğunu kontrol edin. Migration bunları otomatik ekler.
5. **Project Settings → API** sayfasından `Project URL` ve `anon public` anahtarını alın.

### 2. Vercel

1. Bu repoyu Vercel'e "Import" edin. Framework olarak **Vite** otomatik algılanır.
2. Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - (isteğe bağlı) `VITE_APP_NAME`
3. Deploy edin. `https://<proje>.vercel.app/yeni` adresinden ilk işletmeyi oluşturun.
4. Alan adı aldığınızda Vercel'e bağlamanız yeterli, kodda değişiklik gerekmez.

### 3. SMS (Netgsm, Türkiye)

Supabase'in yerleşik Twilio desteği de çalışır, ancak Türkiye'de Netgsm gibi yerel bir sağlayıcı daha ucuzdur ve SMS başlığı (gönderici adı) alınabilir.

```bash
npx supabase functions deploy send-sms --no-verify-jwt
```

```bash
npx supabase secrets set NETGSM_USERCODE=... NETGSM_PASSWORD=... NETGSM_MSGHEADER=FIRMAADI APP_NAME=Randevu
```

Ardından **Authentication → Hooks → Send SMS hook** ayarını açın, tür olarak *HTTPS* seçin ve fonksiyon adresini girin. Üretilen gizli anahtarı `SEND_SMS_HOOK_SECRET` olarak secret'a ekleyin.

> Netgsm API'sinin güncel adresini ve gövde biçimini hesabınızdaki dokümandan doğrulayın. Ayrıca kötüye kullanıma karşı Supabase **Auth → Rate Limits**'ten SMS sınırlarını düşük tutun ve **Attack Protection**'dan CAPTCHA'yı açmayı düşünün.

### Yerel geliştirme

```bash
cp .env.example .env.local
```

`.env.local` dosyasına Supabase bilgilerinizi girin, ardından:

```bash
npm install
```

```bash
npm run dev
```

### Arayüz testi

```bash
npm run test:ui
```

Supabase API'si Playwright ile taklit edilir. Test şu akışların hepsini tıklayarak dener: müşterinin randevu alması (SMS kodu ve KVKK onayı dahil), Randevularım, panelin ajanda, onay ve WhatsApp ekranları, elle randevu ekleme, ayarlar (kurallar, saatler, kapalı zaman), paylaşım ve QR, müşteriler ve kurulum sihirbazı.

### Veritabanı testleri

Yerel bir Postgres (15+) gerekir. Supabase'in `auth` şeması taklit edilir:

```bash
npm run test:db
```

Bu komut kural testlerini çalıştırır: çakışma, ara süre, haftalık sınır, kapalı zaman, engelleme, iptal süresi, yetkiler ve telefonla arayan müşteri kaydının sahiplenilmesi. Ayrıca 20 kişinin aynı anda aynı saate randevu almaya çalıştığı yarış testini çalıştırır; tam bir kişi kazanmalıdır.

## Eski sürümden farklar

| Eski (direksiyondersi) | Yeni |
|---|---|
| Öğrenci "uygunluk" bildirir, hoca otomatik plan çalıştırır | Müşteri boş saati kendisi seçer. Onaylı modda saat ayrılır, işletme onaylar. |
| Hoca şifresi `12345` tarayıcı kodunda açıkça duruyor | Telefon + SMS ile giriş, yetki kontrolü sunucuda (RLS) |
| Her kayıtta tüm liste baştan yazılıyor; eşzamanlı kayıtlar birbirini siliyor | Satır bazlı kayıt ve veritabanı düzeyinde çakışma kısıtı |
| "Pazartesi 10:00" gibi tarihsiz kayıtlar | Gerçek tarih ve saat dilimi; haftalar arasında geçmiş tutuluyor |
| Saatler, günler ve ders süresi kodda sabit | Hepsi işletme ayarlarında, kaynak başına ayrı ayrı |
| Tek hoca | Birden çok kaynak, ekip daveti, hizmet–kaynak eşleşmesi |
| WhatsApp şablonları | Korundu ve genelleştirildi (onay, hatırlatma, değişiklik, iptal) |
| PDF ve Excel çıktısı | Excel uyumlu CSV ve yazdırma görünümü (PDF olarak kaydedilebilir) |

## Yol haritası (sonraki adımlar)

- [ ] Web Push: panel kapalıyken de yeni talep bildirimi (VAPID ve bir edge function)
- [ ] Otomatik hatırlatma SMS'i ya da WhatsApp Business API mesajı (randevudan 1 gün önce)
- [ ] Onaylanmayan talepler için süre aşımı (ör. 24 saat içinde onaylanmazsa düşsün)
- [ ] Bekleme listesi: dolu güne "yer açılırsa haber ver"
- [ ] Grup ve kapasiteli hizmetler (aynı saate N kişi, ör. grup dersi)
- [ ] Personelin kendi iznini panelden girmesi (veritabanı izin veriyor, arayüz yalnızca sahibe açık)
- [ ] KVKK metninin hukukçu tarafından son hali
