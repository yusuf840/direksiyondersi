/**
 * Tek veri katmanı (ücretsiz Spark planı: sunucu kodu yok).
 * Kurallar firestore.rules'ta; çakışma "dolu dilim" belgeleriyle veritabanı tarafından engellenir.
 */
import {
  collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp,
  Timestamp, updateDoc, where, writeBatch, type DocumentData, type QuerySnapshot, type WriteBatch,
} from 'firebase/firestore'
import { signInAnonymously } from 'firebase/auth'
import { auth, db } from './firebase'
import { normalizePhone } from './phone'
import { addDays, dayKeyOf, weekStart, zonedToDate } from './time'
import { cellOf, cellsFor, computeSlots, type BusyCell, type Off } from './slots'
import type { Booking, Business, Customer, HoursRange, Member, MyBooking, Resource, Service, ServiceResource, Slot, TimeOff } from './types'

// ---- yardımcılar ----
const err = (code: string) => Object.assign(new Error(code), { code })
function plain<T>(id: string, data: DocumentData): T {
  const o: Record<string, unknown> = { id }
  for (const [k, v] of Object.entries(data)) o[k] = v instanceof Timestamp ? v.toDate().toISOString() : v
  return o as T
}
const bySort = <T extends { sort: number; name: string }>(a: T, b: T) => a.sort - b.sort || a.name.localeCompare(b.name, 'tr')
function toBooking(id: string, data: DocumentData): Booking {
  const b = plain<Booking>(id, data)
  b.customer = { id: b.customer_id, name: b.customer_name, phone: b.customer_phone, user_id: b.customer_user_id, is_blocked: false }
  return b
}
const bizDoc = (b: string) => doc(db, 'businesses', b)
const col = (b: string, c: string) => collection(db, 'businesses', b, c)
const cellRef = (b: string, rid: string, c: number) => doc(db, 'businesses', b, 'cells', `${rid}_${c}`)
const ts = (iso: string | Date) => Timestamp.fromDate(typeof iso === 'string' ? new Date(iso) : iso)
const uid = () => { const u = auth.currentUser; if (!u) throw err('AUTH_REQUIRED'); return u.uid }
const isDenied = (e: unknown) => /permission|insufficient/i.test(String((e as Error)?.message ?? e))

/** Müşteri için hesap açmadan oturum (cihaza bağlı, ücretsiz) */
export async function ensureCustomerSession() {
  if (!auth.currentUser) await signInAnonymously(auth)
  return auth.currentUser!.uid
}

// ---- vitrin (herkese açık) ----
export async function getBusinessBySlug(slug: string) {
  const s = await getDoc(doc(db, 'slugs', slug.toLowerCase()))
  if (!s.exists()) return null
  return loadBusinessMeta(s.data().business_id as string)
}

export async function loadBusinessMeta(bid: string) {
  const [b, r, s] = await Promise.all([getDoc(bizDoc(bid)), getDocs(col(bid, 'resources')), getDocs(col(bid, 'services'))])
  if (!b.exists()) return null
  const biz = plain<Business>(b.id, b.data())
  const resources = r.docs.map((d) => ({ ...plain<Resource>(d.id, d.data()), business_id: bid, hours: (d.data().hours ?? []) as HoursRange[] })).sort(bySort)
  const services = s.docs.map((d) => ({ ...plain<Service>(d.id, d.data()), business_id: bid, resource_ids: (d.data().resource_ids ?? []) as string[] })).sort(bySort)
  const links: ServiceResource[] = services.flatMap((sv) => sv.resource_ids.map((rid: string) => ({ business_id: bid, service_id: sv.id, resource_id: rid })))
  return { biz, resources, services, links }
}

export const slugTaken = async (slug: string) => (await getDoc(doc(db, 'slugs', slug))).exists()

async function busyAndOff(bid: string, fromMs: number, toMs: number) {
  const [cells, off] = await Promise.all([
    getDocs(query(col(bid, 'cells'), where('cell', '>=', cellOf(fromMs - 86_400_000)), where('cell', '<', cellOf(toMs)))),
    getDocs(query(col(bid, 'timeOff'), where('ends_at', '>', Timestamp.fromMillis(fromMs)))),
  ])
  const busy = cells.docs.map((d) => d.data() as BusyCell & { booking_id: string })
  const offs = off.docs.map((d) => plain<Off>(d.id, d.data()))
  return { busy, offs }
}

export async function availableSlots(p: { businessId: string; serviceId: string; from: string; days: number; resourceId?: string | null; ignoreRules?: boolean; ignoreBookingId?: string }): Promise<Slot[]> {
  const meta = await loadBusinessMeta(p.businessId)
  const service = meta?.services.find((s) => s.id === p.serviceId)
  if (!meta || !service) return []
  if (!p.ignoreRules && (!meta.biz.is_active || !service.is_active)) return []
  const tz = meta.biz.timezone
  const fromMs = zonedToDate(p.from, '00:00', tz).getTime()
  const toMs = zonedToDate(addDays(p.from, p.days), '00:00', tz).getTime()
  const { busy, offs } = await busyAndOff(p.businessId, fromMs, toMs)
  return computeSlots({
    biz: meta.biz, service, resources: meta.resources, off: offs,
    busy: busy.filter((c) => c.booking_id !== p.ignoreBookingId),
    from: p.from, days: p.days, resourceId: p.resourceId, ignoreRules: p.ignoreRules,
  })
}

/** Dolu dilimler ya da kapalı zamanlar değişince tetiklenir (kişisel veri taşımaz) */
export function watchPulse(bid: string, cb: () => void) {
  let ready = 0
  const fire = () => { if (ready >= 2) cb() }
  const a = onSnapshot(query(col(bid, 'cells'), where('cell', '>=', cellOf(Date.now() - 86_400_000))), () => { if (ready < 2) ready++; else fire() }, () => {})
  const b = onSnapshot(col(bid, 'timeOff'), () => { if (ready < 2) ready++; else fire() }, () => {})
  return () => { a(); b() }
}

// ---- müşteri ----
export async function getProfile(u: string) {
  const s = await getDoc(doc(db, 'users', u))
  return s.exists() ? (s.data() as { full_name: string | null; phone: string | null }) : null
}

/** Müşterinin adı ve telefonu (cihazda hesap açmadan) */
export async function saveMyInfo(name: string, phone: string) {
  const u = await ensureCustomerSession()
  const p = normalizePhone(phone)
  if (!p) throw err('INVALID_PHONE')
  if (name.trim().length < 2) throw err('INVALID_NAME')
  const batch = writeBatch(db)
  batch.set(doc(db, 'users', u), { full_name: name.trim(), phone: p }, { merge: true })
  await batch.commit()
}
export const updateMyName = async (name: string) => {
  const u = uid()
  await writeBatch(db).set(doc(db, 'users', u), { full_name: name.trim() }, { merge: true }).commit()
}

async function myPointers() {
  const s = await getDocs(collection(db, 'users', uid(), 'myBookings'))
  return s.docs.map((d) => ({ id: d.id, business_id: d.data().business_id as string }))
}

export async function myBookings(): Promise<MyBooking[]> {
  if (!auth.currentUser) return []
  const ptrs = await myPointers()
  const bizCache = new Map<string, Business | null>()
  const resCache = new Map<string, string>()
  const out: MyBooking[] = []
  await Promise.all(ptrs.map(async (p) => {
    const s = await getDoc(doc(db, 'businesses', p.business_id, 'bookings', p.id)).catch(() => null)
    if (!s?.exists()) return
    const x = toBooking(s.id, s.data())
    if (!bizCache.has(p.business_id)) {
      const b = await getDoc(bizDoc(p.business_id)); bizCache.set(p.business_id, b.exists() ? plain<Business>(b.id, b.data()) : null)
    }
    const b = bizCache.get(p.business_id)
    if (!b) return
    const rk = `${p.business_id}/${x.resource_id}`
    if (!resCache.has(rk)) resCache.set(rk, ((await getDoc(doc(db, 'businesses', p.business_id, 'resources', x.resource_id))).data()?.name as string) ?? '')
    out.push({
      id: x.id, status: x.status, starts_at: x.starts_at, ends_at: x.ends_at, service_name: x.service_name,
      resource_name: resCache.get(rk) ?? '', customer_note: x.customer_note, cancel_reason: x.cancel_reason,
      business_id: b.id, business_name: b.name, business_slug: b.slug, business_phone: b.phone, business_address: b.address,
      timezone: b.timezone, cancel_until_min: b.cancel_until_min, resource_label: b.resource_label,
    })
  }))
  return out.sort((a, b) => b.starts_at.localeCompare(a.starts_at))
}

/** Müşteri randevu alır: randevu + dilim kilitleri + müşteri kartı tek toplu yazmada */
export async function book(p: { businessId: string; serviceId: string; startsAt: string; resourceId?: string | null; note?: string | null; consent: boolean }) {
  const u = await ensureCustomerSession()
  const me = await getProfile(u)
  if (!me?.full_name || !me.phone) throw err('NAME_REQUIRED')
  if (!p.consent) throw err('CONSENT_REQUIRED')
  const meta = await loadBusinessMeta(p.businessId)
  const svc = meta?.services.find((s) => s.id === p.serviceId)
  if (!meta || !meta.biz.is_active) throw err('BUSINESS_NOT_FOUND')
  if (!svc || !svc.is_active) throw err('SERVICE_NOT_FOUND')
  const biz = meta.biz
  const start = new Date(p.startsAt)
  const end = new Date(start.getTime() + svc.duration_min * 60_000)
  const blockEnd = new Date(end.getTime() + svc.buffer_min * 60_000)

  // İşletme sınırları (bu cihazdaki randevulara göre)
  const mine = (await myBookings()).filter((b) => b.business_id === biz.id && ['pending', 'confirmed'].includes(b.status))
  if (mine.filter((b) => new Date(b.starts_at) > new Date()).length >= biz.max_active_per_customer) throw err('ACTIVE_LIMIT')
  if (mine.some((b) => new Date(b.starts_at) < end && new Date(b.ends_at) > start)) throw err('CUSTOMER_OVERLAP')
  if (biz.weekly_limit_per_customer) {
    const wk = weekStart(dayKeyOf(start, biz.timezone))
    if (mine.filter((b) => weekStart(dayKeyOf(b.starts_at, biz.timezone)) === wk).length >= biz.weekly_limit_per_customer) throw err('WEEKLY_LIMIT')
  }

  const day = dayKeyOf(start, biz.timezone)
  const slots = (await availableSlots({ businessId: biz.id, serviceId: svc.id, from: day, days: 1, resourceId: p.resourceId })).filter((s) => s.starts_at === start.toISOString())
  if (!slots.length) throw err('SLOT_TAKEN')

  const cardRef = doc(db, 'businesses', biz.id, 'customers', u)
  const card = await getDoc(cardRef)
  for (const { resource_id: rid } of slots) {
    const ref = doc(col(biz.id, 'bookings'))
    const batch = writeBatch(db)
    // Müşteri kartı: ilk randevuda oluşur; sonrakilerde sadece ad/telefon/onay güncellenir
    if (card.exists()) batch.update(cardRef, { name: me.full_name, phone: me.phone, consent_at: Timestamp.now() })
    else batch.set(cardRef, { user_id: u, name: me.full_name, phone: me.phone, consent_at: Timestamp.now(), is_blocked: false, note: null, created_at: Timestamp.now() })
    const status = biz.booking_mode === 'instant' ? 'confirmed' : 'pending'
    batch.set(ref, {
      business_id: biz.id, resource_id: rid, service_id: svc.id, service_name: svc.name,
      customer_id: u, customer_user_id: u, customer_name: me.full_name, customer_phone: me.phone,
      starts_at: ts(start), ends_at: ts(end), block_until: ts(blockEnd),
      cell_first: cellOf(start.getTime()), cell_last: cellOf(blockEnd.getTime() - 1),
      status, active: true, source: 'customer', customer_note: p.note?.trim() || null,
      cancel_reason: null, cancelled_by: null, created_at: serverTimestamp(), updated_at: serverTimestamp(),
    })
    for (const c of cellsFor(start.getTime(), blockEnd.getTime())) batch.set(cellRef(biz.id, rid, c), { business_id: biz.id, resource_id: rid, cell: c, booking_id: ref.id })
    batch.set(doc(db, 'users', u, 'myBookings', ref.id), { business_id: biz.id })
    try {
      await batch.commit()
      return { id: ref.id, status, resource_id: rid, starts_at: start.toISOString(), ends_at: end.toISOString() }
    } catch (e) {
      if (!isDenied(e)) throw e
      // Reddedildi: ya biri az önce aldı (dilim dolu) ya da numara engelli / kurallar değişti
      const still = (await availableSlots({ businessId: biz.id, serviceId: svc.id, from: day, days: 1, resourceId: rid })).some((s) => s.starts_at === start.toISOString())
      if (still) throw err('BOOKING_REJECTED')
    }
  }
  throw err('SLOT_TAKEN')
}

async function releaseCells(batch: WriteBatch, bid: string, b: { resource_id: string; starts_at: string; block_until: string }, keep?: Set<string>) {
  for (const c of cellsFor(Date.parse(b.starts_at), Date.parse(b.block_until))) {
    if (!keep?.has(`${b.resource_id}_${c}`)) batch.delete(cellRef(bid, b.resource_id, c))
  }
}

export async function cancelMyBooking(businessId: string, bookingId: string, reason?: string) {
  uid()
  const ref = doc(db, 'businesses', businessId, 'bookings', bookingId)
  const s = await getDoc(ref)
  if (!s.exists()) throw err('NOT_FOUND')
  const x = toBooking(s.id, s.data())
  if (!x.active) throw err('NOT_CANCELLABLE')
  const biz = (await getDoc(bizDoc(businessId))).data() as Business
  if (x.status === 'confirmed' && Date.parse(x.starts_at) - Date.now() < biz.cancel_until_min * 60_000) throw err('CANCEL_TOO_LATE')
  const batch = writeBatch(db)
  batch.update(ref, { status: 'cancelled', active: false, cancelled_by: 'customer', cancel_reason: reason?.trim() || null, updated_at: serverTimestamp() })
  await releaseCells(batch, businessId, x)
  await batch.commit()
}

export async function forgetMe() {
  const u = uid()
  const ptrs = await myPointers()
  for (const p of ptrs) {
    const s = await getDoc(doc(db, 'businesses', p.business_id, 'bookings', p.id)).catch(() => null)
    const x = s?.exists() ? toBooking(s.id, s.data()) : null
    if (x?.active && Date.parse(x.starts_at) > Date.now()) await cancelMyBooking(p.business_id, p.id, 'Müşteri verilerini sildi').catch(() => {})
  }
  const bizIds = [...new Set(ptrs.map((p) => p.business_id))]
  const batch = writeBatch(db)
  for (const b of bizIds) batch.set(doc(db, 'businesses', b, 'customers', u), { name: 'Silinmiş kullanıcı', phone: null }, { merge: true })
  ptrs.forEach((p) => batch.delete(doc(db, 'users', u, 'myBookings', p.id)))
  batch.delete(doc(db, 'users', u))
  await batch.commit()
  if (auth.currentUser?.isAnonymous) await auth.currentUser.delete().catch(() => {})
  return { accountDeleted: true }
}

// ---- işletme kurulumu / ekip ----
export async function createBusiness(p: { name: string; slug: string; resourceLabel: string; resourceName: string; serviceName: string; durationMin: number; hours: HoursRange[]; phone: string | null }) {
  const u = uid()
  if (auth.currentUser?.isAnonymous) throw err('AUTH_REQUIRED')
  if (await slugTaken(p.slug)) throw err('SLUG_TAKEN')
  const bRef = doc(collection(db, 'businesses'))
  const rRef = doc(col(bRef.id, 'resources'))
  const batch = writeBatch(db)
  batch.set(doc(db, 'slugs', p.slug), { business_id: bRef.id })
  batch.set(bRef, {
    slug: p.slug, name: p.name, description: null, phone: p.phone, address: null, timezone: 'Europe/Istanbul',
    resource_label: p.resourceLabel || 'Personel', booking_mode: 'approval',
    slot_interval_min: p.durationMin <= 240 ? p.durationMin : 60, min_notice_min: 60, max_advance_days: 30,
    cancel_until_min: 120, max_active_per_customer: 3, weekly_limit_per_customer: null, booking_note: null,
    is_active: true, created_by: u, created_at: serverTimestamp(),
  })
  batch.set(doc(db, 'businesses', bRef.id, 'members', u), { uid: u, business_id: bRef.id, role: 'owner', resource_id: rRef.id, full_name: auth.currentUser?.displayName ?? null })
  batch.set(doc(db, 'users', u, 'memberships', bRef.id), { business_id: bRef.id })
  batch.set(rRef, { name: p.resourceName, is_active: true, sort: 0, hours: p.hours })
  batch.set(doc(col(bRef.id, 'services')), { name: p.serviceName, description: null, duration_min: p.durationMin, buffer_min: 0, slot_interval_min: null, price_text: null, is_active: true, sort: 0, resource_ids: [] })
  try { await batch.commit() } catch (e) { if (isDenied(e) && await slugTaken(p.slug)) throw err('SLUG_TAKEN'); throw e }
  return { id: bRef.id }
}

export async function updateBusiness(businessId: string, patch: Partial<Business>) {
  const cur = (await getDoc(bizDoc(businessId))).data() as Business
  const batch = writeBatch(db)
  const clean = { ...patch } as Record<string, unknown>
  delete clean.id
  if (patch.slug && patch.slug !== cur.slug) {
    if (await slugTaken(patch.slug)) throw err('SLUG_TAKEN')
    batch.set(doc(db, 'slugs', patch.slug), { business_id: businessId })
    batch.delete(doc(db, 'slugs', cur.slug))
  }
  batch.update(bizDoc(businessId), clean)
  await batch.commit()
}

export async function invitePreview(code: string) {
  const i = (await getDoc(doc(db, 'invites', code))).data()
  if (!i) return null
  const b = (await getDoc(bizDoc(i.business_id))).data()
  const r = i.resource_id ? (await getDoc(doc(db, 'businesses', i.business_id, 'resources', i.resource_id))).data() : null
  return { business_name: (b?.name as string) ?? '', resource_name: (r?.name as string) ?? null, valid: !i.used_by && i.expires_at.toMillis() > Date.now() }
}

export async function acceptInvite(code: string) {
  const u = uid()
  const i = (await getDoc(doc(db, 'invites', code))).data()
  if (!i || i.used_by || i.expires_at.toMillis() < Date.now()) throw err('INVITE_INVALID')
  const batch = writeBatch(db)
  batch.set(doc(db, 'businesses', i.business_id, 'members', u), { uid: u, business_id: i.business_id, role: 'staff', resource_id: i.resource_id ?? null, full_name: auth.currentUser?.displayName ?? null, invite_code: code })
  batch.set(doc(db, 'users', u, 'memberships', i.business_id), { business_id: i.business_id })
  batch.update(doc(db, 'invites', code), { used_by: u, used_at: serverTimestamp() })
  await batch.commit()
  return { businessId: i.business_id as string }
}

export async function myMemberships(u: string) {
  const ms = await getDocs(collection(db, 'users', u, 'memberships'))
  const out = await Promise.all(ms.docs.map(async (m) => {
    const [b, mem] = await Promise.all([getDoc(bizDoc(m.id)), getDoc(doc(db, 'businesses', m.id, 'members', u))])
    if (!b.exists() || !mem.exists()) return null
    return { role: mem.data().role as 'owner' | 'staff', resource_id: (mem.data().resource_id ?? null) as string | null, business: plain<Business>(b.id, b.data()) }
  }))
  return out.filter((x): x is NonNullable<typeof x> => !!x)
}

export async function listMembers(bid: string): Promise<Member[]> {
  const s = await getDocs(col(bid, 'members'))
  return s.docs.map((d) => ({ ...(d.data() as Member), phone: null })).sort((a, b) => (a.role === 'owner' ? -1 : 1) - (b.role === 'owner' ? -1 : 1))
}
export const setMemberResource = (bid: string, u: string, rid: string | null) => updateDoc(doc(db, 'businesses', bid, 'members', u), { resource_id: rid })
export const removeMember = (bid: string, u: string) => writeBatch(db).delete(doc(db, 'businesses', bid, 'members', u)).commit()
export async function createInvite(bid: string, resourceId: string | null, u: string) {
  const ref = doc(collection(db, 'invites'))
  await writeBatch(db).set(ref, { business_id: bid, resource_id: resourceId, created_by: u, used_by: null, used_at: null, expires_at: Timestamp.fromMillis(Date.now() + 7 * 86_400_000) }).commit()
  return ref.id
}

// ---- randevular (ekip) ----
async function findOrCreateCustomer(batch: WriteBatch, bid: string, p: { customerId?: string | null; name?: string | null; phone?: string | null }) {
  if (p.customerId) {
    const c = await getDoc(doc(db, 'businesses', bid, 'customers', p.customerId))
    if (!c.exists()) throw err('CUSTOMER_NOT_FOUND')
    return { id: c.id, ...(c.data() as Omit<Customer, 'id'>) }
  }
  const name = p.name?.trim() ?? ''
  if (name.length < 2) throw err('INVALID_NAME')
  const phone = p.phone ? normalizePhone(p.phone) : null
  if (p.phone && !phone) throw err('INVALID_PHONE')
  if (phone) {
    const same = (await getDocs(query(col(bid, 'customers'), where('phone', '==', phone)))).docs
    if (same.length) return { id: same[0].id, ...(same[0].data() as Omit<Customer, 'id'>) }
  }
  const ref = doc(col(bid, 'customers'))
  const data = { user_id: null, name, phone, note: null, is_blocked: false, created_at: serverTimestamp() }
  batch.set(ref, data)
  return { id: ref.id, ...data }
}

export async function staffCreateBooking(p: { businessId: string; serviceId: string; resourceId: string; startsAt: string; customerId?: string | null; name?: string | null; phone?: string | null; note?: string | null }) {
  const bid = p.businessId
  const svc = (await getDoc(doc(db, 'businesses', bid, 'services', p.serviceId))).data() as Service | undefined
  if (!svc) throw err('SERVICE_NOT_FOUND')
  const start = new Date(p.startsAt)
  const end = new Date(start.getTime() + svc.duration_min * 60_000)
  const blockEnd = new Date(end.getTime() + svc.buffer_min * 60_000)
  const batch = writeBatch(db)
  const cust = await findOrCreateCustomer(batch, bid, p)
  const ref = doc(col(bid, 'bookings'))
  batch.set(ref, {
    business_id: bid, resource_id: p.resourceId, service_id: p.serviceId, service_name: svc.name,
    customer_id: cust.id, customer_user_id: cust.user_id ?? null, customer_name: cust.name, customer_phone: cust.phone ?? null,
    starts_at: ts(start), ends_at: ts(end), block_until: ts(blockEnd),
    cell_first: cellOf(start.getTime()), cell_last: cellOf(blockEnd.getTime() - 1),
    status: 'confirmed', active: true, source: 'staff', customer_note: p.note?.trim() || null,
    cancel_reason: null, cancelled_by: null, created_at: serverTimestamp(), updated_at: serverTimestamp(),
  })
  for (const c of cellsFor(start.getTime(), blockEnd.getTime())) batch.set(cellRef(bid, p.resourceId, c), { business_id: bid, resource_id: p.resourceId, cell: c, booking_id: ref.id })
  try { await batch.commit() } catch (e) { if (isDenied(e)) throw err('SLOT_TAKEN'); throw e }
  return { id: ref.id }
}

export async function staffUpdateBooking(p: { businessId: string; bookingId: string; status?: string; startsAt?: string; resourceId?: string; reason?: string }) {
  const bid = p.businessId
  const ref = doc(db, 'businesses', bid, 'bookings', p.bookingId)
  const s = await getDoc(ref)
  if (!s.exists()) throw err('NOT_FOUND')
  const x = toBooking(s.id, s.data())
  const status = p.status ?? x.status
  const active = status === 'pending' || status === 'confirmed'
  const len = Date.parse(x.ends_at) - Date.parse(x.starts_at)
  const buf = Date.parse(x.block_until) - Date.parse(x.ends_at)
  const start = p.startsAt ? Date.parse(p.startsAt) : Date.parse(x.starts_at)
  const rid = p.resourceId ?? x.resource_id
  const blockEnd = start + len + buf
  const newCells = active ? new Set(cellsFor(start, blockEnd).map((c) => `${rid}_${c}`)) : new Set<string>()
  const oldCells = x.active ? new Set(cellsFor(Date.parse(x.starts_at), Date.parse(x.block_until)).map((c) => `${x.resource_id}_${c}`)) : new Set<string>()

  const batch = writeBatch(db)
  const patch: Record<string, unknown> = {
    status, active, resource_id: rid, starts_at: Timestamp.fromMillis(start), ends_at: Timestamp.fromMillis(start + len),
    block_until: Timestamp.fromMillis(blockEnd), cell_first: cellOf(start), cell_last: cellOf(blockEnd - 1), updated_at: serverTimestamp(),
  }
  if (status === 'cancelled' || status === 'rejected') { patch.cancel_reason = p.reason?.trim() || null; patch.cancelled_by = 'staff' }
  batch.update(ref, patch)
  for (const k of oldCells) if (!newCells.has(k)) { const [r, c] = k.split('_'); batch.delete(cellRef(bid, r, Number(c))) }
  for (const k of newCells) if (!oldCells.has(k)) { const [r, c] = k.split('_'); batch.set(cellRef(bid, r, Number(c)), { business_id: bid, resource_id: r, cell: Number(c), booking_id: x.id }) }
  try { await batch.commit() } catch (e) { if (isDenied(e) && active) throw err('SLOT_TAKEN'); throw e }
}

/** Bir zaman aralığındaki randevuları anlık izler; değişiklikleri de bildirir */
export function watchBookings(bid: string, fromIso: string, toIso: string,
  cb: (list: Booking[], changes: { type: 'added' | 'modified' | 'removed'; booking: Booking }[], initial: boolean) => void) {
  let initial = true
  const q = query(col(bid, 'bookings'), where('starts_at', '>=', ts(fromIso)), where('starts_at', '<', ts(toIso)), orderBy('starts_at'))
  return onSnapshot(q, (snap: QuerySnapshot) => {
    const list = snap.docs.map((d) => toBooking(d.id, d.data()))
    const changes = snap.docChanges().map((c) => ({ type: c.type, booking: toBooking(c.doc.id, c.doc.data()) }))
    cb(list, changes, initial); initial = false
  }, () => {})
}

export function watchPending(bid: string, cb: (list: Booking[]) => void) {
  const q = query(col(bid, 'bookings'), where('status', '==', 'pending'), limit(200))
  return onSnapshot(q, (s) => {
    const now = new Date().toISOString()
    cb(s.docs.map((d) => toBooking(d.id, d.data())).filter((b) => b.starts_at >= now).sort((a, b) => a.starts_at.localeCompare(b.starts_at)))
  }, () => {})
}

export async function listBookings(bid: string, fromIso: string, toIso: string) {
  const s = await getDocs(query(col(bid, 'bookings'), where('starts_at', '>=', ts(fromIso)), where('starts_at', '<', ts(toIso)), orderBy('starts_at')))
  return s.docs.map((d) => toBooking(d.id, d.data()))
}

export async function customerHistory(bid: string, cid: string) {
  const s = await getDocs(query(col(bid, 'bookings'), where('customer_id', '==', cid), limit(200)))
  return s.docs.map((d) => toBooking(d.id, d.data())).sort((a, b) => b.starts_at.localeCompare(a.starts_at)).slice(0, 50)
}

export async function countActiveOverlapping(bid: string, s: Date, e: Date, resourceId: string | null) {
  const list = await listBookings(bid, new Date(s.getTime() - 86_400_000).toISOString(), e.toISOString())
  return list.filter((b) => b.active && new Date(b.ends_at) > s && (!resourceId || b.resource_id === resourceId)).length
}

// ---- müşteri kartları (ekip) ----
export async function listCustomers(bid: string) {
  const s = await getDocs(query(col(bid, 'customers'), limit(2000)))
  return s.docs.map((d) => plain<Customer>(d.id, d.data())).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
}
export async function updateCustomer(bid: string, cid: string, patch: Partial<Pick<Customer, 'name' | 'phone' | 'note' | 'is_blocked'>>) {
  const cur = (await getDoc(doc(db, 'businesses', bid, 'customers', cid))).data() as Customer
  const batch = writeBatch(db)
  batch.update(doc(db, 'businesses', bid, 'customers', cid), patch)
  // Engelleme numaraya işlenir: aynı numarayla yeni randevu alınamaz
  const phone = (patch.phone ?? cur.phone) || null
  if (phone && patch.is_blocked !== undefined) {
    if (patch.is_blocked) batch.set(doc(db, 'businesses', bid, 'blocked', phone), { at: serverTimestamp() })
    else batch.delete(doc(db, 'businesses', bid, 'blocked', phone))
  }
  await batch.commit()
}
export function matchCustomer(c: Customer, term: string) {
  const t = term.trim().toLocaleLowerCase('tr-TR')
  if (!t) return true
  const digits = t.replace(/\D/g, '').replace(/^0/, '')
  if (digits.length >= 3) return (c.phone ?? '').includes(digits)
  return c.name.toLocaleLowerCase('tr-TR').includes(t)
}

// ---- ayarlar (sahip) ----
export async function saveService(bid: string, s: Partial<Service>, sort: number) {
  const data = {
    name: s.name!.trim(), description: s.description?.trim() || null, duration_min: s.duration_min!, buffer_min: s.buffer_min ?? 0,
    slot_interval_min: s.slot_interval_min || null, price_text: s.price_text?.trim() || null, is_active: s.is_active ?? true,
    sort: s.sort ?? sort, resource_ids: s.resource_ids ?? [],
  }
  await writeBatch(db).set(s.id ? doc(db, 'businesses', bid, 'services', s.id) : doc(col(bid, 'services')), data).commit()
}
export const deleteService = (bid: string, id: string) => writeBatch(db).delete(doc(db, 'businesses', bid, 'services', id)).commit()

export async function saveResource(bid: string, r: { id?: string; name: string; is_active: boolean; sort: number; hours: HoursRange[] }) {
  const data = { name: r.name.trim(), is_active: r.is_active, sort: r.sort, hours: r.hours }
  await writeBatch(db).set(r.id ? doc(db, 'businesses', bid, 'resources', r.id) : doc(col(bid, 'resources')), data).commit()
}

export async function listTimeOff(bid: string) {
  const s = await getDocs(query(col(bid, 'timeOff'), where('ends_at', '>=', Timestamp.now())))
  return s.docs.map((d) => plain<TimeOff>(d.id, d.data())).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}
export const addTimeOff = (bid: string, t: { resource_id: string | null; starts_at: Date; ends_at: Date }) =>
  writeBatch(db).set(doc(col(bid, 'timeOff')), { resource_id: t.resource_id, starts_at: ts(t.starts_at), ends_at: ts(t.ends_at) }).commit()
export const deleteTimeOff = (bid: string, id: string) => writeBatch(db).delete(doc(db, 'businesses', bid, 'timeOff', id)).commit()

