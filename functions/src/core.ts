import { getFirestore, Timestamp, FieldValue, type Transaction, type DocumentReference } from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import { addDays, dayKeyOf, isoWeekday, zoned } from './time'

export const db = () => getFirestore()
export const fail = (code: string, kind: 'failed-precondition' | 'permission-denied' | 'not-found' | 'invalid-argument' | 'unauthenticated' | 'resource-exhausted' = 'failed-precondition') => new HttpsError(kind, code)

// ---- Tipler (Firestore belgeleri) ----
export interface Biz {
  slug: string; name: string; description: string | null; phone: string | null; address: string | null
  timezone: string; resource_label: string; booking_mode: 'instant' | 'approval'
  slot_interval_min: number; min_notice_min: number; max_advance_days: number; cancel_until_min: number
  max_active_per_customer: number; weekly_limit_per_customer: number | null; booking_note: string | null
  is_active: boolean; created_by: string
}
export interface Range { weekday: number; start: string; end: string }
export interface Res { name: string; is_active: boolean; sort: number; hours: Range[] }
export interface Svc {
  name: string; description: string | null; duration_min: number; buffer_min: number; slot_interval_min: number | null
  price_text: string | null; is_active: boolean; sort: number; resource_ids: string[]
}
export interface BookingDoc {
  business_id: string; resource_id: string; service_id: string | null; service_name: string
  customer_id: string; customer_user_id: string | null; customer_name: string; customer_phone: string | null
  starts_at: Timestamp; ends_at: Timestamp; block_until: Timestamp
  status: 'pending' | 'confirmed' | 'cancelled' | 'rejected' | 'completed' | 'no_show'; active: boolean
  source: 'customer' | 'staff'; customer_note: string | null; staff_note: string | null
  cancel_reason: string | null; cancelled_by: 'customer' | 'staff' | null
  created_at: Timestamp; updated_at: Timestamp
}
export const ACTIVE = (s: string) => s === 'pending' || s === 'confirmed'

// ---- Yollar ----
export const bizRef = (b: string) => db().doc(`businesses/${b}`)
export const sub = (b: string, c: 'resources' | 'services' | 'timeOff' | 'customers' | 'bookings' | 'members') => db().collection(`businesses/${b}/${c}`)
export const pulseRef = (b: string) => db().doc(`pulse/${b}`)
export const lockRef = (b: string, r: string, day: string) => db().doc(`locks/${b}_${r}_${day}`)

export function bumpPulse(tx: Transaction | null, b: string) {
  const data = { version: FieldValue.increment(1), changed_at: FieldValue.serverTimestamp() }
  return tx ? tx.set(pulseRef(b), data, { merge: true }) : pulseRef(b).set(data, { merge: true })
}

// ---- Yardımcılar ----
export function normalizePhone(input: unknown): string | null {
  let d = String(input ?? '').replace(/\D/g, '')
  if (!d) return null
  if (d.length === 11 && d.startsWith('0')) d = '90' + d.slice(1)
  else if (d.length === 10 && d.startsWith('5')) d = '90' + d
  if (d.length < 10 || d.length > 15) return null
  return '+' + d
}
export const str = (v: unknown, max: number) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : null
}
export function requirePhoneUser(req: CallableRequest) {
  const uid = req.auth?.uid
  const phone = normalizePhone(req.auth?.token.phone_number)
  if (!uid || !phone) throw fail('AUTH_REQUIRED', 'unauthenticated')
  return { uid, phone }
}
export async function memberRole(b: string, uid: string | undefined) {
  if (!uid) return null
  const m = await sub(b, 'members').doc(uid).get()
  return m.exists ? (m.data()!.role as 'owner' | 'staff') : null
}
export async function loadBiz(b: string) {
  if (typeof b !== 'string' || !b) throw fail('BUSINESS_NOT_FOUND', 'not-found')
  const s = await bizRef(b).get()
  if (!s.exists) throw fail('BUSINESS_NOT_FOUND', 'not-found')
  return s.data() as Biz
}
export const ts = (d: Date) => Timestamp.fromDate(d)
export const toDate = (v: unknown) => {
  const d = new Date(String(v))
  if (isNaN(d.getTime())) throw fail('INVALID_TIME', 'invalid-argument')
  return d
}

/** Bir randevunun kapsadığı günler (kilit belgeleri için) */
export function daysTouched(start: Date, end: Date, tz: string) {
  const out: string[] = []
  let k = dayKeyOf(start, tz)
  const last = dayKeyOf(new Date(end.getTime() - 1), tz)
  while (k <= last && out.length < 5) { out.push(k); k = addDays(k, 1) }
  return out
}

/**
 * ÇAKIŞMA KURALI (işlem içinde):
 * Kaynağın ilgili günlerindeki kilit belgeleri okunup yazılır -> aynı kaynak+gün için eşzamanlı işlemler sıraya girer.
 * Sonra o aralıkla kesişen aktif randevu var mı bakılır.
 */
export async function assertResourceFree(tx: Transaction, b: string, rid: string, start: Date, blockEnd: Date, tz: string, ignoreId?: string) {
  // Üst üste binen iki randevu mutlaka en az bir ortak günü kilitler
  const locks: DocumentReference[] = daysTouched(start, blockEnd, tz).map((d) => lockRef(b, rid, d))
  await tx.getAll(...locks)
  const q = sub(b, 'bookings').where('resource_id', '==', rid).where('active', '==', true)
    .where('starts_at', '>=', ts(addMinutes(start, -1440 - 240))).where('starts_at', '<', ts(blockEnd))
  const snap = await tx.get(q)
  for (const d of snap.docs) {
    if (d.id === ignoreId) continue
    const x = d.data() as BookingDoc
    if (x.block_until.toDate() > start && x.starts_at.toDate() < blockEnd) throw fail('SLOT_TAKEN')
  }
  return locks
}
export const touchLocks = (tx: Transaction, locks: DocumentReference[]) =>
  locks.forEach((l) => tx.set(l, { v: FieldValue.increment(1) }, { merge: true }))
export const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000)

// ---- BOŞ SAATLER ----
export async function computeSlots(o: {
  bizId: string; biz: Biz; serviceId: string; from: string; days: number; resourceId?: string | null; ignoreRules: boolean
}) {
  const { bizId, biz } = o
  const svcSnap = await sub(bizId, 'services').doc(o.serviceId).get()
  if (!svcSnap.exists) return []
  const svc = svcSnap.data() as Svc
  if (!svc.is_active && !o.ignoreRules) return []
  const tz = biz.timezone
  const days = Math.min(Math.max(o.days, 1), 62)
  const rangeStart = zoned(o.from, '00:00', tz)
  const rangeEnd = zoned(addDays(o.from, days), '00:00', tz)

  const resSnap = await sub(bizId, 'resources').get()
  const resources = resSnap.docs
    .filter((d) => (d.data() as Res).is_active)
    .filter((d) => !o.resourceId || d.id === o.resourceId)
    .filter((d) => !svc.resource_ids?.length || svc.resource_ids.includes(d.id))
    .map((d) => ({ id: d.id, ...(d.data() as Res) }))
  if (!resources.length) return []

  const [bk, off] = await Promise.all([
    sub(bizId, 'bookings').where('active', '==', true).where('starts_at', '>=', ts(addMinutes(rangeStart, -1440 - 240))).where('starts_at', '<', ts(rangeEnd)).get(),
    sub(bizId, 'timeOff').where('ends_at', '>', ts(rangeStart)).get(),
  ])
  const busy = new Map<string, [number, number][]>()
  for (const d of bk.docs) {
    const x = d.data() as BookingDoc
    const arr = busy.get(x.resource_id) ?? []
    arr.push([x.starts_at.toMillis(), x.block_until.toMillis()])
    busy.set(x.resource_id, arr)
  }
  const offs = off.docs.map((d) => d.data()).filter((t) => t.starts_at.toMillis() < rangeEnd.getTime())
    .map((t) => ({ rid: t.resource_id as string | null, s: t.starts_at.toMillis() as number, e: t.ends_at.toMillis() as number }))

  const len = svc.duration_min * 60_000
  const blk = (svc.duration_min + svc.buffer_min) * 60_000
  const step = (svc.slot_interval_min || biz.slot_interval_min) * 60_000
  const now = Date.now()
  const earliest = o.ignoreRules ? -Infinity : now + biz.min_notice_min * 60_000
  const latest = o.ignoreRules ? Infinity : now + biz.max_advance_days * 86_400_000

  const out: { resource_id: string; starts_at: string }[] = []
  for (let i = 0; i < days; i++) {
    const day = addDays(o.from, i)
    const wd = isoWeekday(day)
    for (const r of resources) {
      for (const h of (r.hours ?? []).filter((x) => x.weekday === wd)) {
        const ws = zoned(day, h.start, tz).getTime()
        const we = zoned(day, h.end, tz).getTime()
        for (let t = ws; t + len <= we; t += step) {
          if (t < earliest || t > latest) continue
          if ((busy.get(r.id) ?? []).some(([s, e]) => s < t + blk && e > t)) continue
          if (offs.some((x) => (!x.rid || x.rid === r.id) && x.s < t + len && x.e > t)) continue
          out.push({ resource_id: r.id, starts_at: new Date(t).toISOString() })
        }
      }
    }
  }
  out.sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.resource_id.localeCompare(b.resource_id))
  return out
}

export { dayKeyOf }
