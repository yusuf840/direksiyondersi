/**
 * Randevu — Cloud Functions (Firebase)
 *
 * İlke: Kurallar istemcide değil BURADA uygulanır. Müşteri randevu tablosuna doğrudan yazamaz
 * (firestore.rules), her şey bu fonksiyonlardan geçer.
 */
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, Timestamp, type DocumentReference } from 'firebase-admin/firestore'
import { onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { setGlobalOptions } from 'firebase-functions/v2'
import {
  ACTIVE, addMinutes, assertResourceFree, bizRef, bumpPulse, computeSlots, db, fail, loadBiz, memberRole,
  normalizePhone, requirePhoneUser, str, sub, toDate, touchLocks, ts,
  type Biz, type BookingDoc, type Range, type Svc,
} from './core'
import { addDays, dayKeyOf, isDayKey, isHhmm, isoWeekday, zoned } from './time'

initializeApp()
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 })

type Req = CallableRequest<Record<string, unknown>>
const call = (fn: (req: Req) => Promise<unknown>) => onCall({ cors: true }, fn)
const RESERVED = ['panel', 'giris', 'randevularim', 'katil', 'kvkk', 'yeni', 'api', 'admin', 'app', 'www', 'assets', 'hesap', '__']

function bookingOut(id: string, x: BookingDoc) {
  return {
    ...x, id,
    starts_at: x.starts_at.toDate().toISOString(), ends_at: x.ends_at.toDate().toISOString(),
    block_until: x.block_until.toDate().toISOString(), created_at: x.created_at.toDate().toISOString(),
    updated_at: x.updated_at.toDate().toISOString(),
  }
}

// ---------------------------------------------------------------------------
//  Boş saatler (herkese açık; kişisel veri döndürmez)
// ---------------------------------------------------------------------------
export const availableSlots = call(async (req) => {
  const { businessId, serviceId, from, days, resourceId, ignoreRules } = req.data
  const bizId = String(businessId)
  const biz = await loadBiz(bizId)
  const member = ignoreRules ? await memberRole(bizId, req.auth?.uid) : null
  if (!biz.is_active && !member) return []
  if (!isDayKey(from)) throw fail('INVALID_DATE', 'invalid-argument')
  return computeSlots({ bizId, biz, serviceId: String(serviceId), from, days: Number(days) || 7, resourceId: (resourceId as string) || null, ignoreRules: !!member })
})

// ---------------------------------------------------------------------------
//  Profil
// ---------------------------------------------------------------------------
export const updateMyName = call(async (req) => {
  const { uid, phone } = requirePhoneUser(req)
  const name = str(req.data.name, 80)
  if (!name || name.length < 2) throw fail('INVALID_NAME', 'invalid-argument')
  await db().doc(`users/${uid}`).set({ full_name: name, phone, updated_at: FieldValue.serverTimestamp() }, { merge: true })
  // İşletmelerdeki müşteri kartları ve gelecekteki randevulardaki ad
  const cards = await db().collectionGroup('customers').where('user_id', '==', uid).get()
  const batch = db().batch()
  cards.docs.forEach((d) => batch.update(d.ref, { name }))
  const future = await db().collectionGroup('bookings').where('customer_user_id', '==', uid).where('starts_at', '>=', Timestamp.now()).get()
  future.docs.forEach((d) => batch.update(d.ref, { customer_name: name }))
  await batch.commit()
  return { ok: true }
})

// ---------------------------------------------------------------------------
//  RANDEVU AL (müşteri)
// ---------------------------------------------------------------------------
export const book = call(async (req) => {
  const { uid, phone } = requirePhoneUser(req)
  const bizId = String(req.data.businessId)
  const serviceId = String(req.data.serviceId)
  const start = toDate(req.data.startsAt)
  const wanted = (req.data.resourceId as string) || null
  const note = str(req.data.note, 500)
  const consent = req.data.consent === true

  const biz = await loadBiz(bizId)
  if (!biz.is_active) throw fail('BUSINESS_NOT_FOUND', 'not-found')
  const svcSnap = await sub(bizId, 'services').doc(serviceId).get()
  const svc = svcSnap.data() as Svc | undefined
  if (!svc || !svc.is_active) throw fail('SERVICE_NOT_FOUND', 'not-found')
  const user = (await db().doc(`users/${uid}`).get()).data()
  const name = user?.full_name as string | undefined
  if (!name) throw fail('NAME_REQUIRED')

  // Müşteri aynı anda iki yerde olamaz (daha anlaşılır hata için önce bakılır; işlem içinde tekrar kontrol edilir)
  const endPre = addMinutes(start, svc.duration_min)
  const minePre = await sub(bizId, 'bookings').where('customer_id', '==', uid).where('active', '==', true).get()
  if (minePre.docs.some((d) => d.data().starts_at.toDate() < endPre && d.data().ends_at.toDate() > start)) throw fail('CUSTOMER_OVERLAP')

  // Saat ızgarada ve kurallara uygun mu? Uygun kaynaklar (en az dolu önce)
  const day = dayKeyOf(start, biz.timezone)
  const slots = (await computeSlots({ bizId, biz, serviceId, from: day, days: 1, resourceId: wanted, ignoreRules: false }))
    .filter((s) => s.starts_at === start.toISOString())
  if (!slots.length) throw fail('SLOT_TAKEN')
  const dayStart = zoned(day, '00:00', biz.timezone), dayEnd = zoned(addDays(day, 1), '00:00', biz.timezone)
  const load = await sub(bizId, 'bookings').where('active', '==', true).where('starts_at', '>=', ts(dayStart)).where('starts_at', '<', ts(dayEnd)).get()
  const count = (rid: string) => load.docs.filter((d) => d.data().resource_id === rid).length
  const candidates = slots.map((s) => s.resource_id).sort((a, b) => count(a) - count(b) || Math.random() - 0.5)

  const end = addMinutes(start, svc.duration_min)
  const blockEnd = addMinutes(start, svc.duration_min + svc.buffer_min)
  const custRef = sub(bizId, 'customers').doc(uid) // doğrulanmış müşterinin kartı = kullanıcı kimliği

  let lastErr: unknown = null
  for (const rid of candidates) {
    try {
      return await db().runTransaction(async (tx) => {
        const locks = await assertResourceFree(tx, bizId, rid, start, blockEnd, biz.timezone)
        const card = await tx.get(custRef)
        const walkIns = card.exists ? null : await tx.get(sub(bizId, 'customers').where('phone', '==', phone).where('user_id', '==', null))
        const blocked = await tx.get(sub(bizId, 'customers').where('phone', '==', phone).where('is_blocked', '==', true).limit(1))
        const mine = await tx.get(sub(bizId, 'bookings').where('customer_id', '==', uid).where('active', '==', true))
        const walkInBookings = walkIns && !walkIns.empty
          ? await tx.get(sub(bizId, 'bookings').where('customer_id', 'in', walkIns.docs.map((d) => d.id).slice(0, 30)))
          : null

        if (!blocked.empty) throw fail('BLOCKED', 'permission-denied')
        const consentAt = card.data()?.consent_at ?? (consent ? Timestamp.now() : null)
        if (!consentAt) throw fail('CONSENT_REQUIRED')

        const now = Date.now()
        const active = [...mine.docs, ...(walkInBookings?.docs.filter((d) => d.data().active) ?? [])].map((d) => d.data() as BookingDoc)
        if (active.filter((b) => b.starts_at.toMillis() > now).length >= biz.max_active_per_customer) throw fail('ACTIVE_LIMIT')
        if (active.some((b) => b.starts_at.toDate() < end && b.ends_at.toDate() > start)) throw fail('CUSTOMER_OVERLAP')
        if (biz.weekly_limit_per_customer) {
          const ws = zoned(addDays(day, 1 - isoWeekday(day)), '00:00', biz.timezone)
          const we = addMinutes(ws, 7 * 1440)
          const week = await tx.get(sub(bizId, 'bookings').where('customer_id', '==', uid).where('starts_at', '>=', ts(ws)).where('starts_at', '<', ts(we)))
          const n = week.docs.filter((d) => ['pending', 'confirmed', 'completed'].includes(d.data().status)).length
            + (walkInBookings?.docs.filter((d) => { const x = d.data(); return ['pending', 'confirmed', 'completed'].includes(x.status) && x.starts_at.toDate() >= ws && x.starts_at.toDate() < we }).length ?? 0)
          if (n >= biz.weekly_limit_per_customer) throw fail('WEEKLY_LIMIT')
        }

        // Müşteri kartı: yoksa oluştur; işletmenin daha önce elle eklediği (telefonla aramış) kartı sahiplen.
        // Telefon SMS ile doğrulandığı için bu güvenlidir.
        const prior = walkIns?.docs[0]?.data()
        tx.set(custRef, {
          user_id: uid, name, phone, consent_at: consentAt,
          note: card.data()?.note ?? prior?.note ?? null, is_blocked: false,
          created_at: card.data()?.created_at ?? prior?.created_at ?? FieldValue.serverTimestamp(),
        }, { merge: true })
        walkInBookings?.docs.forEach((d) => tx.update(d.ref, { customer_id: uid, customer_user_id: uid, customer_name: name, customer_phone: phone }))
        walkIns?.docs.forEach((d) => tx.delete(d.ref))

        const status = biz.booking_mode === 'instant' ? 'confirmed' : 'pending'
        const ref = sub(bizId, 'bookings').doc()
        const doc: BookingDoc = {
          business_id: bizId, resource_id: rid, service_id: serviceId, service_name: svc.name,
          customer_id: uid, customer_user_id: uid, customer_name: name, customer_phone: phone,
          starts_at: ts(start), ends_at: ts(end), block_until: ts(blockEnd), status, active: true, source: 'customer',
          customer_note: note, staff_note: null, cancel_reason: null, cancelled_by: null,
          created_at: Timestamp.now(), updated_at: Timestamp.now(),
        }
        tx.set(ref, doc)
        touchLocks(tx, locks)
        bumpPulse(tx, bizId)
        return { id: ref.id, status, resource_id: rid, starts_at: start.toISOString(), ends_at: end.toISOString() }
      })
    } catch (e) {
      lastErr = e
      if ((e as { message?: string }).message !== 'SLOT_TAKEN') throw e
    }
  }
  throw lastErr ?? fail('SLOT_TAKEN')
})

// ---------------------------------------------------------------------------
//  Müşteri: randevularım / iptal / verilerimi sil
// ---------------------------------------------------------------------------
export const myBookings = call(async (req) => {
  const { uid } = requirePhoneUser(req)
  const snap = await db().collectionGroup('bookings').where('customer_user_id', '==', uid).orderBy('starts_at', 'desc').limit(200).get()
  const bizCache = new Map<string, Biz | null>()
  const resCache = new Map<string, string>()
  const out = []
  for (const d of snap.docs) {
    const x = d.data() as BookingDoc
    if (!bizCache.has(x.business_id)) bizCache.set(x.business_id, ((await bizRef(x.business_id).get()).data() as Biz) ?? null)
    const b = bizCache.get(x.business_id)
    if (!b) continue
    const rk = `${x.business_id}/${x.resource_id}`
    if (!resCache.has(rk)) resCache.set(rk, ((await sub(x.business_id, 'resources').doc(x.resource_id).get()).data()?.name as string) ?? '')
    out.push({
      id: d.id, status: x.status, starts_at: x.starts_at.toDate().toISOString(), ends_at: x.ends_at.toDate().toISOString(),
      service_name: x.service_name, resource_name: resCache.get(rk), customer_note: x.customer_note, cancel_reason: x.cancel_reason,
      business_id: x.business_id, business_name: b.name, business_slug: b.slug, business_phone: b.phone, business_address: b.address,
      timezone: b.timezone, cancel_until_min: b.cancel_until_min, resource_label: b.resource_label,
    })
  }
  return out
})

export const cancelMyBooking = call(async (req) => {
  const { uid } = requirePhoneUser(req)
  const bizId = String(req.data.businessId)
  const ref = sub(bizId, 'bookings').doc(String(req.data.bookingId))
  const biz = await loadBiz(bizId)
  await db().runTransaction(async (tx) => {
    const s = await tx.get(ref)
    const x = s.data() as BookingDoc | undefined
    if (!x || x.customer_user_id !== uid) throw fail('NOT_FOUND', 'not-found')
    if (!ACTIVE(x.status)) throw fail('NOT_CANCELLABLE')
    if (x.status === 'confirmed' && x.starts_at.toMillis() - Date.now() < biz.cancel_until_min * 60_000) throw fail('CANCEL_TOO_LATE')
    tx.update(ref, { status: 'cancelled', active: false, cancelled_by: 'customer', cancel_reason: str(req.data.reason, 300), updated_at: Timestamp.now() })
    bumpPulse(tx, bizId)
  })
  return { ok: true }
})

export const forgetMe = call(async (req) => {
  const { uid } = requirePhoneUser(req)
  const batch = db().batch()
  const future = await db().collectionGroup('bookings').where('customer_user_id', '==', uid).where('starts_at', '>=', Timestamp.now()).get()
  const touched = new Set<string>()
  for (const d of future.docs) {
    const x = d.data() as BookingDoc
    if (ACTIVE(x.status)) { batch.update(d.ref, { status: 'cancelled', active: false, cancelled_by: 'customer', cancel_reason: 'Müşteri verilerini sildi' }); touched.add(x.business_id) }
  }
  const all = await db().collectionGroup('bookings').where('customer_user_id', '==', uid).get()
  all.docs.forEach((d) => batch.update(d.ref, { customer_name: 'Silinmiş kullanıcı', customer_phone: null, customer_user_id: null }))
  const cards = await db().collectionGroup('customers').where('user_id', '==', uid).get()
  cards.docs.forEach((d) => batch.update(d.ref, { name: 'Silinmiş kullanıcı', phone: null, note: null, user_id: null }))
  batch.delete(db().doc(`users/${uid}`))
  await batch.commit()
  await Promise.all([...touched].map((b) => bumpPulse(null, b)))
  // Bir işletmede ekip üyesi değilse hesabı da tamamen sil
  const memberships = await db().collectionGroup('members').where('uid', '==', uid).limit(1).get()
  if (memberships.empty) await getAuth().deleteUser(uid)
  return { ok: true, accountDeleted: memberships.empty }
})

// ---------------------------------------------------------------------------
//  İşletme oluştur / güncelle
// ---------------------------------------------------------------------------
function cleanHours(v: unknown): Range[] {
  if (!Array.isArray(v)) throw fail('HOURS_REQUIRED', 'invalid-argument')
  const out: Range[] = v.map((h) => ({ weekday: Number(h.weekday), start: String(h.start), end: String(h.end) }))
  for (const h of out) {
    if (!(h.weekday >= 1 && h.weekday <= 7) || !isHhmm(h.start) || !isHhmm(h.end) || h.end <= h.start) throw fail('HOURS_INVALID', 'invalid-argument')
  }
  for (const a of out) for (const b of out) if (a !== b && a.weekday === b.weekday && a.start < b.end && b.start < a.end) throw fail('HOURS_OVERLAP', 'invalid-argument')
  return out
}
const SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$/

export const createBusiness = call(async (req) => {
  const { uid, phone } = requirePhoneUser(req)
  const d = req.data
  const name = str(d.name, 80), slug = String(d.slug ?? '').toLowerCase().trim()
  const label = str(d.resourceLabel, 30) ?? 'Personel', resName = str(d.resourceName, 60), svcName = str(d.serviceName, 80)
  const duration = Number(d.durationMin)
  if (!name || name.length < 2) throw fail('INVALID_NAME', 'invalid-argument')
  if (!SLUG_RE.test(slug)) throw fail('SLUG_INVALID', 'invalid-argument')
  if (RESERVED.includes(slug)) throw fail('SLUG_RESERVED')
  if (!resName || !svcName || !(duration >= 5 && duration <= 1440)) throw fail('INVALID_INPUT', 'invalid-argument')
  const hours = cleanHours(d.hours)
  if (!hours.length) throw fail('HOURS_REQUIRED', 'invalid-argument')
  const owned = await db().collectionGroup('members').where('uid', '==', uid).where('role', '==', 'owner').get()
  if (owned.size >= 5) throw fail('TOO_MANY_BUSINESSES', 'resource-exhausted')
  const me = (await db().doc(`users/${uid}`).get()).data()

  const bRef = db().collection('businesses').doc()
  await db().runTransaction(async (tx) => {
    const slugRef = db().doc(`slugs/${slug}`)
    if ((await tx.get(slugRef)).exists) throw fail('SLUG_TAKEN')
    const biz: Biz = {
      slug, name, description: null, phone: normalizePhone(d.phone), address: null, timezone: 'Europe/Istanbul',
      resource_label: label, booking_mode: 'approval', slot_interval_min: duration <= 240 ? duration : 60,
      min_notice_min: 60, max_advance_days: 30, cancel_until_min: 120, max_active_per_customer: 3,
      weekly_limit_per_customer: null, booking_note: null, is_active: true, created_by: uid,
    }
    tx.set(slugRef, { business_id: bRef.id })
    tx.set(bRef, { ...biz, created_at: FieldValue.serverTimestamp() })
    const rRef = sub(bRef.id, 'resources').doc()
    tx.set(rRef, { name: resName, is_active: true, sort: 0, hours })
    tx.set(sub(bRef.id, 'services').doc(), {
      name: svcName, description: null, duration_min: duration, buffer_min: 0, slot_interval_min: null,
      price_text: null, is_active: true, sort: 0, resource_ids: [],
    })
    tx.set(sub(bRef.id, 'members').doc(uid), { uid, business_id: bRef.id, role: 'owner', resource_id: rRef.id, full_name: me?.full_name ?? null, phone, created_at: FieldValue.serverTimestamp() })
    bumpPulse(tx, bRef.id)
  })
  return { id: bRef.id }
})

const BIZ_FIELDS: Record<string, (v: unknown) => unknown> = {
  name: (v) => { const s = str(v, 80); if (!s || s.length < 2) throw fail('INVALID_NAME', 'invalid-argument'); return s },
  description: (v) => str(v, 500),
  phone: (v) => (v ? normalizePhone(v) : null),
  address: (v) => str(v, 200),
  resource_label: (v) => str(v, 30) ?? 'Personel',
  booking_note: (v) => str(v, 500),
  booking_mode: (v) => (v === 'instant' ? 'instant' : 'approval'),
  is_active: (v) => v === true,
  slot_interval_min: (v) => int(v, 5, 480),
  min_notice_min: (v) => int(v, 0, 43200),
  max_advance_days: (v) => int(v, 1, 365),
  cancel_until_min: (v) => int(v, 0, 43200),
  max_active_per_customer: (v) => int(v, 1, 100),
  weekly_limit_per_customer: (v) => (v === null ? null : int(v, 1, 100)),
}
function int(v: unknown, min: number, max: number) {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw fail('INVALID_INPUT', 'invalid-argument')
  return n
}

export const updateBusiness = call(async (req) => {
  const uid = req.auth?.uid
  const bizId = String(req.data.businessId)
  if ((await memberRole(bizId, uid)) !== 'owner') throw fail('FORBIDDEN', 'permission-denied')
  const patch: Record<string, unknown> = {}
  const input = (req.data.patch ?? {}) as Record<string, unknown>
  for (const [k, v] of Object.entries(input)) if (BIZ_FIELDS[k]) patch[k] = BIZ_FIELDS[k](v)
  const newSlug = typeof input.slug === 'string' ? input.slug.toLowerCase().trim() : null
  await db().runTransaction(async (tx) => {
    const cur = (await tx.get(bizRef(bizId))).data() as Biz
    if (newSlug && newSlug !== cur.slug) {
      if (!SLUG_RE.test(newSlug)) throw fail('SLUG_INVALID', 'invalid-argument')
      if (RESERVED.includes(newSlug)) throw fail('SLUG_RESERVED')
      const nRef = db().doc(`slugs/${newSlug}`)
      if ((await tx.get(nRef)).exists) throw fail('SLUG_TAKEN')
      tx.set(nRef, { business_id: bizId })
      tx.delete(db().doc(`slugs/${cur.slug}`))
      patch.slug = newSlug
    }
    tx.update(bizRef(bizId), patch)
    bumpPulse(tx, bizId)
  })
  return { ok: true }
})

// ---------------------------------------------------------------------------
//  Ekip daveti
// ---------------------------------------------------------------------------
export const invitePreview = call(async (req) => {
  const s = await db().doc(`invites/${String(req.data.code)}`).get()
  const i = s.data()
  if (!i) return null
  const b = (await bizRef(i.business_id).get()).data()
  const r = i.resource_id ? (await sub(i.business_id, 'resources').doc(i.resource_id).get()).data() : null
  return { business_name: b?.name ?? '', resource_name: r?.name ?? null, valid: !i.used_by && i.expires_at.toMillis() > Date.now() }
})

export const acceptInvite = call(async (req) => {
  const { uid, phone } = requirePhoneUser(req)
  const ref = db().doc(`invites/${String(req.data.code)}`)
  const me = (await db().doc(`users/${uid}`).get()).data()
  return db().runTransaction(async (tx) => {
    const i = (await tx.get(ref)).data()
    if (!i || i.used_by || i.expires_at.toMillis() < Date.now()) throw fail('INVITE_INVALID')
    const mRef = sub(i.business_id, 'members').doc(uid)
    if (!(await tx.get(mRef)).exists) {
      tx.set(mRef, { uid, business_id: i.business_id, role: 'staff', resource_id: i.resource_id ?? null, full_name: me?.full_name ?? null, phone, created_at: FieldValue.serverTimestamp() })
    }
    tx.update(ref, { used_by: uid, used_at: FieldValue.serverTimestamp() })
    return { businessId: i.business_id }
  })
})

// ---------------------------------------------------------------------------
//  EKİP: randevu ekle (telefonla arayan müşteri için) / güncelle
// ---------------------------------------------------------------------------
export const staffCreateBooking = call(async (req) => {
  const d = req.data
  const bizId = String(d.businessId)
  if (!(await memberRole(bizId, req.auth?.uid))) throw fail('FORBIDDEN', 'permission-denied')
  const biz = await loadBiz(bizId)
  const svc = (await sub(bizId, 'services').doc(String(d.serviceId)).get()).data() as Svc | undefined
  if (!svc) throw fail('SERVICE_NOT_FOUND', 'not-found')
  const rid = String(d.resourceId)
  if (!(await sub(bizId, 'resources').doc(rid).get()).exists) throw fail('RESOURCE_NOT_FOUND', 'not-found')
  const start = toDate(d.startsAt)
  const dur = d.durationMin ? int(d.durationMin, 5, 1440) : svc.duration_min
  const end = addMinutes(start, dur), blockEnd = addMinutes(start, dur + svc.buffer_min)

  // Müşteri: seçilen kart, aynı numaralı kart ya da yeni kart
  let cid = d.customerId ? String(d.customerId) : null
  let cust: Record<string, unknown> | undefined
  if (cid) {
    cust = (await sub(bizId, 'customers').doc(cid).get()).data()
    if (!cust) throw fail('CUSTOMER_NOT_FOUND', 'not-found')
  } else {
    const name = str(d.name, 80)
    if (!name || name.length < 2) throw fail('INVALID_NAME', 'invalid-argument')
    const phone = d.phone ? normalizePhone(d.phone) : null
    if (d.phone && !phone) throw fail('INVALID_PHONE', 'invalid-argument')
    if (phone) {
      const ex = await sub(bizId, 'customers').where('phone', '==', phone).get()
      const best = ex.docs.sort((a, b) => Number(!!b.data().user_id) - Number(!!a.data().user_id))[0]
      if (best) { cid = best.id; cust = best.data() }
    }
    if (!cid) {
      const ref = sub(bizId, 'customers').doc()
      cust = { user_id: null, name, phone, note: null, is_blocked: false, consent_at: null, created_at: FieldValue.serverTimestamp() }
      await ref.set(cust)
      cid = ref.id
    }
  }

  return db().runTransaction(async (tx) => {
    const locks = await assertResourceFree(tx, bizId, rid, start, blockEnd, biz.timezone)
    const ref = sub(bizId, 'bookings').doc()
    const doc: BookingDoc = {
      business_id: bizId, resource_id: rid, service_id: String(d.serviceId), service_name: svc.name,
      customer_id: cid!, customer_user_id: (cust!.user_id as string) ?? null, customer_name: String(cust!.name), customer_phone: (cust!.phone as string) ?? null,
      starts_at: ts(start), ends_at: ts(end), block_until: ts(blockEnd), status: 'confirmed', active: true, source: 'staff',
      customer_note: null, staff_note: str(d.note, 500), cancel_reason: null, cancelled_by: null,
      created_at: Timestamp.now(), updated_at: Timestamp.now(),
    }
    tx.set(ref, doc)
    touchLocks(tx, locks)
    bumpPulse(tx, bizId)
    return { id: ref.id }
  })
})

const STATUSES = ['pending', 'confirmed', 'cancelled', 'rejected', 'completed', 'no_show']
export const staffUpdateBooking = call(async (req) => {
  const d = req.data
  const bizId = String(d.businessId)
  if (!(await memberRole(bizId, req.auth?.uid))) throw fail('FORBIDDEN', 'permission-denied')
  const biz = await loadBiz(bizId)
  const ref = sub(bizId, 'bookings').doc(String(d.bookingId))
  const status = d.status ? String(d.status) : null
  if (status && !STATUSES.includes(status)) throw fail('INVALID_STATUS', 'invalid-argument')
  const newStart = d.startsAt ? toDate(d.startsAt) : null
  const newRes = d.resourceId ? String(d.resourceId) : null
  if (newRes && !(await sub(bizId, 'resources').doc(newRes).get()).exists) throw fail('RESOURCE_NOT_FOUND', 'not-found')

  await db().runTransaction(async (tx) => {
    const x = (await tx.get(ref)).data() as BookingDoc | undefined
    if (!x) throw fail('NOT_FOUND', 'not-found')
    const st = status ?? x.status
    const start = newStart ?? x.starts_at.toDate()
    const len = x.ends_at.toMillis() - x.starts_at.toMillis()
    const buf = x.block_until.toMillis() - x.ends_at.toMillis()
    const rid = newRes ?? x.resource_id
    const blockEnd = new Date(start.getTime() + len + buf)
    // Aktif hale gelen ya da taşınan randevu yine çakışma kuralından geçer
    let locks: DocumentReference[] = []
    if (ACTIVE(st) && (newStart || newRes || !x.active)) locks = await assertResourceFree(tx, bizId, rid, start, blockEnd, biz.timezone, ref.id)
    const patch: Record<string, unknown> = {
      status: st, active: ACTIVE(st), resource_id: rid,
      starts_at: ts(start), ends_at: ts(new Date(start.getTime() + len)), block_until: ts(blockEnd), updated_at: Timestamp.now(),
    }
    if (typeof d.staffNote === 'string') patch.staff_note = str(d.staffNote, 500)
    if (st === 'cancelled' || st === 'rejected') { patch.cancel_reason = str(d.reason, 300); patch.cancelled_by = 'staff' }
    tx.update(ref, patch)
    touchLocks(tx, locks)
    bumpPulse(tx, bizId)
  })
  return { ok: true }
})

// ---------------------------------------------------------------------------
//  Ayar değişince müşteri ekranlarına "yeniden yükle" sinyali
// ---------------------------------------------------------------------------
const pulseOn = (path: string) => onDocumentWritten(path, async (e) => { await bumpPulse(null, e.params.b) })
// Not: yerel test ortamında (functions/.env.local) kapatılabilir; canlıda her zaman açık.
if (process.env.RANDEVU_DISABLE_TRIGGERS !== '1') {
  Object.assign(exports, {
    pulseResources: pulseOn('businesses/{b}/resources/{id}'),
    pulseServices: pulseOn('businesses/{b}/services/{id}'),
    pulseTimeOff: pulseOn('businesses/{b}/timeOff/{id}'),
  })
}
