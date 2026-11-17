// Arayüz uçtan uca testi — gerçek Firebase emülatörüne karşı (taklit veri yok).
// scripts/test-ui.sh tarafından çalıştırılır.
const { chromium, devices } = require('playwright')
const BASE = 'http://127.0.0.1:4173'
const EMU = 'http://127.0.0.1:9099/emulator/v1/projects/demo-randevu/verificationCodes'
const OUT = __dirname + '/shots/'
require('fs').mkdirSync(OUT, { recursive: true })

// İşletme sahibi: Google ile giriş. Test ortamı apis.google.com'a erişemediği için Google penceresi yerine
// emülatör derlemesindeki kancayla aynı Firebase kimlik bilgisiyle giriş yapılır.
async function googleLogin(page, name) {
  await page.getByRole('button', { name: 'Google ile giriş yap' }).waitFor()
  await page.evaluate((n) => window.__emuGoogleSignIn(n), name)
}
// Müşteri: hesapsız, sadece ad + telefon
async function customerInfo(page, name, phone) {
  await page.getByLabel('Ad soyad').fill(name)
  await page.getByLabel('Cep telefonunuz').fill(phone)
  await page.getByRole('button', { name: 'Devam', exact: true }).last().click()
}

;(async () => {
  const browser = await chromium.launch()
  const errors = []
  const dialogs = []
  const mk = async (opts = {}) => {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, serviceWorkers: 'block', ...opts })
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
    p.on('dialog', (d) => { dialogs.push(d.message()); d.accept() })
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|Failed to load resource/.test(m.text())) { if (!/apis\.google\.com|fonts\.g/.test(m.text())) errors.push('console: ' + m.text()) } })
    return p
  }
  const shot = (p, name) => p.waitForTimeout(300).then(() => p.screenshot({ path: OUT + name + '.png' }))

  // 1) İşletme sahibi: telefonla giriş + kurulum sihirbazı
  const owner = await mk()
  await owner.goto(BASE + '/yeni')
  await googleLogin(owner, 'Gul Usta')
  await owner.getByLabel('İşletme adı').waitFor()
  await owner.getByLabel('İşletme adı').fill('Kuaför Gül')
  await owner.getByText('✓ Uygun').waitFor(); await shot(owner, '01-onb-1')
  await owner.getByRole('button', { name: 'İleri' }).click()
  await owner.getByRole('button', { name: 'Usta', exact: true }).click(); await owner.getByLabel(/İlk usta adı/).fill('Gül')
  await owner.getByRole('button', { name: 'İleri' }).click()
  await owner.getByLabel('Hizmet adı').fill('Saç kesimi'); await owner.getByRole('button', { name: '30 dk' }).click()
  await owner.getByRole('button', { name: 'İleri' }).click()
  const sw = owner.locator('.hours-day .switch')
  await sw.nth(0).check()
  await owner.locator('.hours-range input').nth(0).fill('09:00'); await owner.locator('.hours-range input').nth(1).fill('19:00')
  for (const i of [1, 2, 3, 4, 5, 6]) await sw.nth(i).check() // ilk günün saatleri diğerlerine kopyalanır
  await shot(owner, '02-onb-hours')
  await owner.getByRole('button', { name: 'Kurulumu bitir' }).click()
  await owner.waitForURL('**/panel/paylas?yeni=1'); await owner.locator('img.qr').waitFor(); await shot(owner, '03-share')
  await owner.goto(BASE + '/panel'); await owner.locator('.week-head').waitFor()

  // 2) İkinci müşteri sayfayı açık tutuyor (anlık güncellemeyi görmek için)
  const watcher = await mk()
  await watcher.goto(BASE + '/kuafor-gul'); await watcher.locator('.slot').first().waitFor()
  const firstSlotText = await watcher.locator('.slot').first().innerText()

  // 3) Müşteri randevu alır
  const cust = await mk()
  await cust.goto(BASE + '/kuafor-gul'); await cust.locator('.slot').first().waitFor(); await shot(cust, '04-book')
  await cust.locator('.slot').first().click()
  await cust.getByRole('button', { name: 'Devam' }).click()
  await customerInfo(cust, 'Mehmet Müşteri', '0530 000 00 22')
  await cust.getByText('Randevuyu onayla').first().waitFor(); await shot(cust, '05-confirm')
  await cust.locator('.check input').check()
  await cust.getByRole('button', { name: /Randevu talebi gönder/ }).click()
  await cust.getByText('Talebiniz alındı').waitFor(); await shot(cust, '06-done')

  // 4) Diğer müşterinin ekranında o saat kendiliğinden kaybolur
  await watcher.waitForFunction((t) => ![...document.querySelectorAll('.slot')].some((e) => e.textContent === t), firstSlotText, { timeout: 10000 })
    .then(() => console.log('ok   anlık: alınan saat diğer müşterinin ekranından kayboldu'), () => errors.push('anlık güncelleme: saat diğer ekrandan kaybolmadı'))

  // 5) İşletme paneline talep anında düşer, onaylanır
  await owner.getByText('Onay bekleyen 1 talep').waitFor({ timeout: 10000 })
  console.log('ok   anlık: talep panele düştü'); await shot(owner, '07-agenda-pending')
  await owner.locator('.card-warning .list-row').first().click()
  await owner.getByRole('button', { name: 'Onayla', exact: true }).click()
  await owner.getByText('WhatsApp mesajı').waitFor(); await shot(owner, '08-wa')
  await owner.keyboard.press('Escape')

  // 6) Müşteri onayı görür
  await cust.goto(BASE + '/randevularim'); await cust.getByText('Onaylandı').first().waitFor(); await shot(cust, '09-my')
  console.log('ok   müşteri onayı Randevularım\'da görüyor')

  // 7) Telefonla arayan müşteri için elle randevu + ayarlar
  await owner.goto(BASE + '/panel'); await owner.locator('.week-head').waitFor()
  await owner.getByRole('button', { name: '+ Randevu' }).click()
  await owner.getByLabel('Ad soyad').fill('Ali Telefon'); await owner.getByLabel('Telefon').first().fill('05300000033')
  await owner.locator('.sheet .slot').nth(3).click()
  await owner.getByRole('button', { name: 'Kaydet' }).click()
  await owner.getByText('Randevu eklendi').waitFor(); console.log('ok   elle randevu eklendi')
  await owner.goto(BASE + '/panel/ayarlar')
  await owner.getByText('Usta ve çalışma saatleri').click(); await owner.locator('.settings-body .list-row', { hasText: 'Gül' }).first().click()
  await owner.getByRole('button', { name: '+ aralık ekle (ara vermek için)' }).first().click()
  const r = owner.locator('.hours-day').first().locator('.hours-range')
  await r.nth(0).locator('input').nth(1).fill('12:00'); await r.nth(1).locator('input').nth(0).fill('13:00'); await r.nth(1).locator('input').nth(1).fill('19:00')
  await shot(owner, '10-hours-break')
  await owner.getByRole('button', { name: 'Kaydet' }).click(); await owner.getByText('Kaydedildi').waitFor(); console.log('ok   öğle arası ayarlardan eklendi')
  await owner.getByText('Kapalı zamanlar').first().click(); await owner.getByRole('button', { name: '+ Kapalı zaman ekle' }).click()
  await owner.getByRole('button', { name: 'Ekle', exact: true }).click(); await owner.getByText('Eklendi').waitFor(); console.log('ok   kapalı gün eklendi (uyarı: ' + (dialogs.pop() || 'yok').slice(0, 60) + '…)')
  await owner.goto(BASE + '/panel/musteriler'); await owner.getByText('Ali Telefon').waitFor(); await shot(owner, '11-customers')

  await browser.close()
  if (errors.length) { console.log('HATALAR:\n' + errors.join('\n')); process.exit(1) }
  console.log('ARAYÜZ TESTİ GEÇTİ')
})().catch((e) => { console.error('ARAYÜZ TESTİ BAŞARISIZ:', e.message); process.exit(1) })
