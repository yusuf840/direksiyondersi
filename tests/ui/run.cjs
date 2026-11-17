const { chromium, devices } = require('playwright')
const { install, SESSION } = require('./mock.cjs')
const OUT = __dirname + '/shots/'
require('fs').mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:4173'
;(async () => {
  const browser = await chromium.launch()
  const errors = []
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|mock\.supabase\.test\/realtime|ERR_NAME|406/.test(m.text())) errors.push('console: ' + m.text()) })
  const state = {}
  await install(page, state)
  const step = async (name) => { await page.waitForTimeout(250); await page.screenshot({ path: OUT + name + '.png' }) }

  // --- Müşteri akışı ---
  await page.goto(BASE + '/'); await step('01-home')
  await page.goto(BASE + '/ornek'); await page.getByText('Bireysel seans').waitFor(); await step('02-book-services')
  await page.getByRole('button', { name: /Bireysel seans/ }).click()
  await page.locator('.slot').first().waitFor(); await step('03-book-slots')
  await page.locator('.slot').nth(1).click(); await page.getByRole('button', { name: 'Devam' }).waitFor(); await step('04-picked')
  await page.getByRole('button', { name: 'Devam' }).click()
  await page.getByPlaceholder('05XX XXX XX XX').fill('0530 111 22 44'); await step('05-phone')
  await page.getByRole('button', { name: 'Kod gönder' }).click()
  await page.getByLabel('SMS kodu').waitFor(); await step('06-code')
  await page.getByLabel('SMS kodu').fill('123456')
  await page.getByLabel('Ad soyad').waitFor(); await step('07-name')
  await page.getByLabel('Ad soyad').fill('Ayşe Öz'); await page.getByRole('button', { name: 'Devam', exact: true }).last().click()
  await page.getByText('Randevuyu onayla').first().waitFor(); await step('08-confirm')
  const btn = page.getByRole('button', { name: /Randevu talebi gönder/ })
  if (!(await btn.isDisabled())) errors.push('KVKK onayı olmadan gönder düğmesi aktif')
  await page.locator('.check input').check(); await btn.click()
  await page.getByText('Talebiniz alındı').waitFor(); await step('09-done')
  if (!state.booked || state.booked.p_service !== 's1' || !state.booked.p_consent) errors.push('book çağrısı beklenen parametrelerle yapılmadı: ' + JSON.stringify(state.booked))
  await page.getByRole('link', { name: 'Randevularım' }).first().click()
  await page.getByText('Yaklaşan').first().waitFor(); await step('10-my-bookings')

  // --- Panel ---
  await page.goto(BASE + '/panel'); await page.getByText('Onay bekleyen').waitFor(); await step('11-agenda')
  await page.getByRole('button', { name: /Elif Şahin/ }).first().click(); await page.getByRole('button', { name: 'Onayla', exact: true }).waitFor(); await step('12-booking-sheet')
  await page.getByRole('button', { name: 'WhatsApp', exact: true }).click(); await step('13-whatsapp')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '+ Randevu' }).click(); await page.locator('.slot').first().waitFor(); await step('14-new-booking')
  await page.keyboard.press('Escape')
  await page.goto(BASE + '/panel/ayarlar'); await page.getByText('Randevu kuralları').click(); await step('15-settings-rules')
  await page.getByText('Eğitmen ve çalışma saatleri').click(); await page.getByRole('button', { name: /Ayşe/ }).click(); await page.getByText('Çalışma saatleri', { exact: true }).waitFor(); await step('16-hours')
  await page.keyboard.press('Escape')
  await page.getByText('Kapalı zamanlar').first().click(); await page.getByRole('button', { name: '+ Kapalı zaman ekle' }).click(); await step('17-timeoff')
  await page.keyboard.press('Escape')
  await page.goto(BASE + '/panel/paylas?yeni=1'); await page.locator('img.qr').waitFor(); await step('18-share')
  await page.goto(BASE + '/panel/musteriler'); await page.getByText('Zeynep Kaya').waitFor(); await step('19-customers')

  // --- Kurulum sihirbazı ---
  await page.goto(BASE + '/yeni')
  await page.getByLabel('İşletme adı').fill('Kuaför Gül'); await page.waitForTimeout(500); await step('20-onb-1')
  await page.getByRole('button', { name: 'İleri' }).click()
  await page.getByRole('button', { name: 'Usta' }).click(); await page.getByLabel(/İlk usta adı/).fill('Gül'); await step('21-onb-2')
  await page.getByRole('button', { name: 'İleri' }).click()
  await page.getByLabel('Hizmet adı').fill('Saç kesimi'); await page.getByRole('button', { name: '30 dk' }).click()
  await page.getByRole('button', { name: 'İleri' }).click()
  await page.getByRole('button', { name: 'Kurulumu bitir' }).click(); await page.getByText('En az bir gün').waitFor(); await step('22-onb-hours-empty')
  const sw = page.locator('.hours-day .switch')
  await sw.nth(0).check(); await page.locator('.hours-range input').nth(0).fill('10:00'); await page.locator('.hours-range input').nth(1).fill('19:00')
  await sw.nth(1).check(); await sw.nth(5).check(); await step('23-onb-hours')
  await page.getByRole('button', { name: 'Kurulumu bitir' }).click(); await page.waitForURL('**/panel/paylas?yeni=1')

  // Masaüstü + koyu tema bir bakış
  const d = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'dark', serviceWorkers: 'block' })
  const dp = await d.newPage(); await install(dp, {})
  await dp.addInitScript((s) => localStorage.setItem('randevu-auth', JSON.stringify(s)), SESSION)
  await dp.goto(BASE + '/ornek'); await dp.getByRole('button', { name: /Bireysel seans/ }).click(); await dp.locator('.slot').first().waitFor()
  await dp.screenshot({ path: OUT + '24-desktop-dark.png' })

  await browser.close()
  console.log(errors.length ? 'HATALAR:\n' + errors.join('\n') : 'E2E OK — hata yok')
})().catch((e) => { console.error('E2E FAIL', e.message); process.exit(1) })
