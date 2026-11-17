/**
 * Tek veri katmanı: sayfalar Firebase'e doğrudan değil, buradan erişir.
 * - Kritik işlemler (randevu, iptal, işletme kurma, ekip) -> Cloud Functions (sunucuda kural kontrolü)
 * - Okuma ve sahibin ayar yazmaları -> Firestore (firestore.rules ile korunur)
 */
import {
  addDoc, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query,
  setDoc, Timestamp, updateDoc, where, type DocumentData, type QuerySnapshot,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, fns } from './firebase'
import type { Booking, Business, Customer, HoursRange, Member, MyBooking, Resource, Service, ServiceResource, Slot, TimeOff } from './types'

// ---- yardımcılar ----
const call = <T = unknown>(name: string) => async (data: Record<string, unknown> = {}) =>
  (await httpsCallable(fns, name)(data)).data as T

/** Firestore Timestamp alanlarını ISO metne çevirir */
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
const bookingsCol = (bid: string) => collection(db, 'businesses', bid, 'bookings')

// ---- vitrin (herkese açık) ----
export async function getBusinessBySlug(slug: string) {
  const s = await getDoc(doc(db, 'slugs', slug.toLowerCase()))
  if (!s.exists()) return null
  return loadBusinessMeta(s.data().business_id as string)
}

export async function loadBusinessMeta(bid: string) {
  const [b, r, s] = await Promise.all([
    getDoc(doc(db, 'businesses', bid)),
    getDocs(collection(db, 'businesses', bid, 'resources')),
    getDocs(collection(db, 'businesses', bid, 'services')),
  ])
  if (!b.exists()) return null
  const biz = plain<Business>(b.id, b.data())
  const resources = r.docs.map((d) => ({ ...plain<Resource>(d.id, d.data()), business_id: bid, hours: d.data().hours ?? [] })).sort(bySort)
  const services = s.docs.map((d) => ({ ...plain<Service>(d.id, d.data()), business_id: bid, resource_ids: d.data().resource_ids ?? [] })).sort(bySort)
  const links: ServiceResource[] = services.flatMap((sv) => sv.resource_ids.map((rid: string) => ({ business_id: bid, service_id: sv.id, resource_id: rid })))
  return { biz, resources, services, links }
}

export const slugTaken = async (slug: string) => (await getDoc(doc(db, 'slugs', slug))).exists()

/** İşletmede bir şey değişince (randevu, iptal, ayar) tetiklenir — kişisel veri taşımaz */
export function watchPulse(bid: string, cb: () => void) {
  let first = true
  return onSnapshot(doc(db, 'pulse', bid), () => { if (first) { first = false; return } cb() }, () => {})
}

export const availableSlots = (p: { businessId: string; serviceId: string; from: string; days: number; resourceId?: string | null; ignoreRules?: boolean }) =>
  call<Slot[]>('availableSlots')(p)

// ---- müşteri ----
export const book = call<{ id: string; status: string; starts_at: string; ends_at: string }>('book')
export const myBookings = call<MyBooking[]>('myBookings')
export const cancelMyBooking = (businessId: string, bookingId: string, reason?: string) => call('cancelMyBooking')({ businessId, bookingId, reason })
export const forgetMe = call<{ accountDeleted: boolean }>('forgetMe')
export const updateMyName = (name: string) => call('updateMyName')({ name })

export async function getProfile(uid: string) {
  const s = await getDoc(doc(db, 'users', uid))
  return s.exists() ? (s.data() as { full_name: string | null; phone: string | null }) : null
}

// ---- işletme kurulumu / ekip ----
export const createBusiness = call<{ id: string }>('createBusiness')
export const updateBusiness = (businessId: string, patch: Partial<Business>) => call('updateBusiness')({ businessId, patch })
export const invitePreview = (code: string) => call<{ business_name: string; resource_name: string | null; valid: boolean } | null>('invitePreview')({ code })
export const acceptInvite = (code: string) => call<{ businessId: string }>('acceptInvite')({ code })

export async function myMemberships(uid: string) {
  const ms = await getDocs(query(collectionGroup(db, 'members'), where('uid', '==', uid)))
  const out = await Promise.all(ms.docs.map(async (m) => {
    const b = await getDoc(doc(db, 'businesses', m.data().business_id))
    return b.exists() ? { role: m.data().role as 'owner' | 'staff', resource_id: (m.data().resource_id ?? null) as string | null, business: plain<Business>(b.id, b.data()) } : null
  }))
  return out.filter((x): x is NonNullable<typeof x> => !!x)
}

export async function listMembers(bid: string): Promise<Member[]> {
  const s = await getDocs(collection(db, 'businesses', bid, 'members'))
  return s.docs.map((d) => d.data() as Member).sort((a, b) => (a.role === 'owner' ? -1 : 1) - (b.role === 'owner' ? -1 : 1))
}
export const setMemberResource = (bid: string, uid: string, rid: string | null) => updateDoc(doc(db, 'businesses', bid, 'members', uid), { resource_id: rid })
export const removeMember = (bid: string, uid: string) => deleteDoc(doc(db, 'businesses', bid, 'members', uid))
export async function createInvite(bid: string, resourceId: string | null, uid: string) {
  const r = await addDoc(collection(db, 'invites'), {
    business_id: bid, resource_id: resourceId, created_by: uid, used_by: null, used_at: null,
    expires_at: Timestamp.fromMillis(Date.now() + 7 * 86_400_000),
  })
  return r.id
}

// ---- randevular (ekip) ----
export const staffCreateBooking = call<{ id: string }>('staffCreateBooking')
export const staffUpdateBooking = call('staffUpdateBooking')

/** Bir zaman aralığındaki randevuları anlık izler; değişiklikleri de bildirir */
export function watchBookings(bid: string, fromIso: string, toIso: string,
  cb: (list: Booking[], changes: { type: 'added' | 'modified' | 'removed'; booking: Booking }[], initial: boolean) => void) {
  let initial = true
  const q = query(bookingsCol(bid), where('starts_at', '>=', Timestamp.fromDate(new Date(fromIso))), where('starts_at', '<', Timestamp.fromDate(new Date(toIso))), orderBy('starts_at'))
  return onSnapshot(q, (snap: QuerySnapshot) => {
    const list = snap.docs.map((d) => toBooking(d.id, d.data()))
    const changes = snap.docChanges().map((c) => ({ type: c.type, booking: toBooking(c.doc.id, c.doc.data()) }))
    cb(list, changes, initial); initial = false
  }, () => {})
}

export function watchPending(bid: string, cb: (list: Booking[]) => void) {
  const q = query(bookingsCol(bid), where('status', '==', 'pending'), where('starts_at', '>=', Timestamp.now()), orderBy('starts_at'), limit(50))
  return onSnapshot(q, (s) => cb(s.docs.map((d) => toBooking(d.id, d.data()))), () => {})
}

export async function listBookings(bid: string, fromIso: string, toIso: string) {
  const s = await getDocs(query(bookingsCol(bid), where('starts_at', '>=', Timestamp.fromDate(new Date(fromIso))), where('starts_at', '<', Timestamp.fromDate(new Date(toIso))), orderBy('starts_at')))
  return s.docs.map((d) => toBooking(d.id, d.data()))
}

export async function customerHistory(bid: string, cid: string) {
  const s = await getDocs(query(bookingsCol(bid), where('customer_id', '==', cid), orderBy('starts_at', 'desc'), limit(50)))
  return s.docs.map((d) => toBooking(d.id, d.data()))
}

export async function countActiveOverlapping(bid: string, s: Date, e: Date, resourceId: string | null) {
  const list = await listBookings(bid, new Date(s.getTime() - 86_400_000).toISOString(), e.toISOString())
  return list.filter((b) => b.active && new Date(b.ends_at) > s && (!resourceId || b.resource_id === resourceId)).length
}

// ---- müşteri kartları (ekip) ----
export async function listCustomers(bid: string) {
  const s = await getDocs(query(collection(db, 'businesses', bid, 'customers'), limit(2000)))
  return s.docs.map((d) => plain<Customer>(d.id, d.data())).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
}
export const updateCustomer = (bid: string, cid: string, patch: Partial<Pick<Customer, 'name' | 'phone' | 'note' | 'is_blocked'>>) =>
  updateDoc(doc(db, 'businesses', bid, 'customers', cid), patch)

/** Ad ya da numaraya göre arama (küçük işletmeler için istemcide) */
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
  if (s.id) await setDoc(doc(db, 'businesses', bid, 'services', s.id), data)
  else await addDoc(collection(db, 'businesses', bid, 'services'), data)
}
export const deleteService = (bid: string, id: string) => deleteDoc(doc(db, 'businesses', bid, 'services', id))

export async function saveResource(bid: string, r: { id?: string; name: string; is_active: boolean; sort: number; hours: HoursRange[] }) {
  const data = { name: r.name.trim(), is_active: r.is_active, sort: r.sort, hours: r.hours }
  if (r.id) await setDoc(doc(db, 'businesses', bid, 'resources', r.id), data)
  else await addDoc(collection(db, 'businesses', bid, 'resources'), data)
}

export async function listTimeOff(bid: string) {
  const s = await getDocs(query(collection(db, 'businesses', bid, 'timeOff'), where('ends_at', '>=', Timestamp.now())))
  return s.docs.map((d) => plain<TimeOff>(d.id, d.data())).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}
export const addTimeOff = (bid: string, t: { resource_id: string | null; starts_at: Date; ends_at: Date; reason: string | null }) =>
  addDoc(collection(db, 'businesses', bid, 'timeOff'), { ...t, starts_at: Timestamp.fromDate(t.starts_at), ends_at: Timestamp.fromDate(t.ends_at) })
export const deleteTimeOff = (bid: string, id: string) => deleteDoc(doc(db, 'businesses', bid, 'timeOff', id))
