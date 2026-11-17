// İşletmenin saat dilimindeki gün/saat ile gerçek an arasında dönüşüm (istemcideki src/lib/time.ts ile aynı mantık)
const cache = new Map<string, Intl.DateTimeFormat>()
function fmt(tz: string) {
  let f = cache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    cache.set(tz, f)
  }
  return f
}
function offsetMs(at: Date, tz: string) {
  const p: Record<string, number> = {}
  for (const x of fmt(tz).formatToParts(at)) if (x.type !== 'literal') p[x.type] = Number(x.value)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at.getTime() / 1000) * 1000
}
export function zoned(dayKey: string, hhmm: string, tz: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number)
  const [hh, mm] = hhmm.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  let t = guess - offsetMs(new Date(guess), tz)
  t = guess - offsetMs(new Date(t), tz)
  return new Date(t)
}
export const dayKeyOf = (at: Date, tz: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
export function addDays(key: string, n: number) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
export function isoWeekday(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return w === 0 ? 7 : w
}
export const isDayKey = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
export const isHhmm = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(s)
