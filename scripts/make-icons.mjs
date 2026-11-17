// public/icon.svg'den PNG ikonları üretir (önceden kurulu Playwright/Chromium ile)
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
import { readFileSync } from 'node:fs'
const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8')
const browser = await chromium.launch()
for (const [size, name, pad] of [[192, 'icon-192.png', 0], [512, 'icon-512.png', 0], [180, 'apple-touch-icon.png', 0]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style><div style="width:${size}px;height:${size}px;padding:${pad}px;box-sizing:border-box">${svg.replace('<svg ', `<svg width="${size - pad * 2}" height="${size - pad * 2}" `)}</div>`)
  await page.screenshot({ path: new URL(`../public/${name}`, import.meta.url).pathname, omitBackground: true })
}
await browser.close()
console.log('ikonlar üretildi')
