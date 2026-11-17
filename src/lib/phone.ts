/** Türkiye ağırlıklı telefon biçimlendirme. Sunucudaki normalize_phone ile aynı mantık. */
export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, '')
  if (!d) return null
  if (d.length === 11 && d.startsWith('0')) d = '90' + d.slice(1)
  else if (d.length === 10 && d.startsWith('5')) d = '90' + d
  if (d.length < 10 || d.length > 15) return null
  return '+' + d
}

export function isTrMobile(input: string) {
  const n = normalizePhone(input)
  return !!n && /^\+905\d{9}$/.test(n)
}

export function displayPhone(p: string | null | undefined) {
  if (!p) return ''
  const n = normalizePhone(p)
  if (n && n.startsWith('+90') && n.length === 13) {
    const d = '0' + n.slice(3)
    return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`
  }
  return p
}

export const telHref = (p: string) => `tel:${normalizePhone(p) ?? p}`
export const waHref = (p: string, text = '') => `https://wa.me/${(normalizePhone(p) ?? p).replace('+', '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`
