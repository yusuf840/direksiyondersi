// Tüm tarih işlemleri işletmenin saat diliminde yapılır.
// "gün anahtarı" = 'YYYY-MM-DD' (işletmenin yerel takvimi)

const partsCache = new Map<string, Intl.DateTimeFormat>()
function partsFmt(tz: string) {
  let f = partsCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    partsCache.set(tz, f)
  }
  return f
}

function tzOffsetMs(at: Date, tz: string) {
  const p: Record<string, number> = {}
  for (const x of partsFmt(tz).formatToParts(at)) if (x.type !== 'literal') p[x.type] = Number(x.value)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(at.getTime() / 1000) * 1000
}

/** İşletme saatindeki gün + saat -> gerçek an */
export function zonedToDate(dayKey: string, hhmm: string, tz: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number)
  const [hh, mm] = hhmm.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  let t = guess - tzOffsetMs(new Date(guess), tz)
  t = guess - tzOffsetMs(new Date(t), tz) // yaz saati geçişleri için ikinci tur
  return new Date(t)
}

export function dayKeyOf(at: Date | string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(typeof at === 'string' ? new Date(at) : at)
}

export const todayKey = (tz: string) => dayKeyOf(new Date(), tz)

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** ISO hafta günü: 1 = Pazartesi ... 7 = Pazar */
export function isoWeekday(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return w === 0 ? 7 : w
}

export function weekStart(key: string) { return addDays(key, 1 - isoWeekday(key)) }

export function dayRange(key: string, tz: string): [string, string] {
  return [zonedToDate(key, '00:00', tz).toISOString(), zonedToDate(addDays(key, 1), '00:00', tz).toISOString()]
}

export function fmtTime(at: string | Date, tz: string) {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
    .format(typeof at === 'string' ? new Date(at) : at)
}

const keyAsDate = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)) }

export function fmtDay(key: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'UTC', ...opts }).format(keyAsDate(key))
}

export function fmtDateTime(at: string, tz: string) {
  return `${fmtDay(dayKeyOf(at, tz))} · ${fmtTime(at, tz)}`
}

export function relativeDay(key: string, tz: string) {
  const t = todayKey(tz)
  if (key === t) return 'Bugün'
  if (key === addDays(t, 1)) return 'Yarın'
  if (key === addDays(t, -1)) return 'Dün'
  return fmtDay(key, { weekday: 'long' })
}

export const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
export const WEEKDAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

export function minutesLabel(min: number) {
  if (min < 60) return `${min} dk`
  if (min % 1440 === 0) return `${min / 1440} gün`
  if (min % 60 === 0) return `${min / 60} saat`
  return `${Math.floor(min / 60)} sa ${min % 60} dk`
}

export const hhmm = (t: string) => t.slice(0, 5)
