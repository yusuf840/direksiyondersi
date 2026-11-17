// Firebase emülatöründe uçtan uca kural testleri.
// Çalıştırma: npm run test:firebase   (firebase emulators:exec ile)
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, signInWithCustomToken } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection, Timestamp } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions'

const PROJECT = 'demo-randevu'
const HOST = '127.0.0.1'
const TZ = 'Europe/Istanbul'
let n = 0, failed = 0

function ok(label, cond, info = '') {
  if (cond) { n++; console.log('ok  ', label) } else { failed++; console.log('FAIL', label, info || `(son hata: ${lastErr})`) }
}
let lastErr = ''
async function err(p) {
  try { await p; lastErr = 'OK'; return 'OK' } catch (e) { lastErr = String(e.message || e).replace(/ \[\d+\]$/, ''); return lastErr }
}

// Telefonla giriş yapmış bir kullanıcı oluşturur (Auth emülatörü SMS göndermez, kodu REST'ten okuruz)
async function phoneUser(phone) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT, appId: 'demo' }, `${phone ?? 'anon'}-${Math.random()}`)
  const auth = getAuth(app); connectAuthEmulator(auth, `http://${HOST}:9099`, { disableWarnings: true })
  const db = getFirestore(app); connectFirestoreEmulator(db, HOST, 8080)
  const fns = getFunctions(app, 'europe-west1'); connectFunctionsEmulator(fns, HOST, 5001)
  if (phone) {
    const r = await fetch(`http://${HOST}:9099/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=demo-key`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phoneNumber: phone }),
    }).then((x) => x.json())
    const codes = await fetch(`http://${HOST}:9099/emulator/v1/projects/${PROJECT}/verificationCodes`).then((x) => x.json())
    const code = codes.verificationCodes.reverse().find((c) => c.sessionInfo === r.sessionInfo).code
    const signed = await fetch(`http://${HOST}:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=demo-key`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionInfo: r.sessionInfo, code }),
    }).then((x) => x.json())
    // SMS kodu doğrulandı ve telefonlu kullanıcı oluştu; SDK oturumunu emülatörün imzasız özel jetonuyla açıyoruz
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const now = Math.floor(Date.now() / 1000)
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit', iat: now, exp: now + 3600, iss: 'firebase-auth-emulator@example.com', sub: 'firebase-auth-emulator@example.com', uid: signed.localId })}.`
    await signInWithCustomToken(auth, token)
  }
  const call = (name) => (data) => httpsCallable(fns, name)(data).then((x) => x.data)
  return { app, auth, db, call, uid: auth.currentUser?.uid }
}

// İstanbul saatinde gün + saat -> ISO
const dayKey = (offset) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(Date.now() + offset * 864e5))
const at = (key, hhmm) => new Date(`${key}T${hhmm}:00+03:00`).toISOString()

const D = dayKey(10)
const owner = await phoneUser('+905300000001')
const B = await phoneUser('+905300000002')
const C = await phoneUser('+905300000003')
const Dd = await phoneUser('+905300000004')
const anon = await phoneUser(null)

// 1) Sahip kurar: saatleri KENDİSİ girer (öğle arası iki aralıkla)
await owner.call('updateMyName')({ name: 'Ayşe Sahip' })
const hours = [1, 2, 3, 4, 5, 6, 7].flatMap((w) => [{ weekday: w, start: '09:00', end: '12:00' }, { weekday: w, start: '13:00', end: '18:00' }])
ok('çakışan çalışma saatleri reddedilir', (await err(owner.call('createBusiness')({ name: 'Deneme', slug: 'xx-yy', resourceLabel: 'U', resourceName: 'A', serviceName: 'S', durationMin: 30, hours: [{ weekday: 1, start: '09:00', end: '12:00' }, { weekday: 1, start: '11:00', end: '13:00' }] }))) === 'HOURS_OVERLAP')
const { id: bid } = await owner.call('createBusiness')({ name: 'Test İşletme', slug: 'test-isletme', resourceLabel: 'Uzman', resourceName: 'Ayşe', serviceName: 'Görüşme', durationMin: 50, hours })
ok('aynı bağlantı adı ikinci kez alınamaz', (await err(owner.call('createBusiness')({ name: 'Başka', slug: 'test-isletme', resourceLabel: 'U', resourceName: 'A', serviceName: 'S', durationMin: 30, hours }))) === 'SLUG_TAKEN')
const svcs = await getDocs(collection(owner.db, 'businesses', bid, 'services'))
const sid = svcs.docs[0].id
await setDoc(doc(owner.db, 'businesses', bid, 'services', sid), { ...svcs.docs[0].data(), buffer_min: 10, slot_interval_min: 60 })
const rid = (await getDocs(collection(owner.db, 'businesses', bid, 'resources'))).docs[0].id
const slots = (u, key = D) => u.call('availableSlots')({ businessId: bid, serviceId: sid, from: key, days: 1 })

let s = await slots(anon)
ok('boş saat sayısı 8 (09,10,11,13..17)', s.length === 8, s.length)
ok('giriş yapmamış ziyaretçi bağlantıdan işletmeyi bulur', (await getDoc(doc(anon.db, 'slugs', 'test-isletme'))).data()?.business_id === bid)

// 2) Müşteri B
const bookB = (u, hhmm, extra = {}) => u.call('book')({ businessId: bid, serviceId: sid, startsAt: at(D, hhmm), consent: true, ...extra })
ok('isimsiz müşteri reddedilir', (await err(bookB(B, '10:00'))) === 'NAME_REQUIRED')
await B.call('updateMyName')({ name: 'Bora Müşteri' })
ok('KVKK onayı olmadan reddedilir', (await err(bookB(B, '10:00', { consent: false }))) === 'CONSENT_REQUIRED')
const r1 = await bookB(B, '10:00', { note: 'not' })
ok('onaylı modda talep beklemede', r1.status === 'pending')
ok('aynı kişi üst üste binen 2. randevu alamaz', (await err(bookB(B, '10:00'))) === 'CUSTOMER_OVERLAP')
ok('çalışma saati dışı (12:00) reddedilir', (await err(B.call('book')({ businessId: bid, serviceId: sid, startsAt: at(dayKey(11), '12:00'), consent: true }))) === 'SLOT_TAKEN')
ok('müşteri randevu listesini doğrudan okuyamaz', /permission|false for/i.test(await err(getDocs(collection(B.db, 'businesses', bid, 'bookings')))))
ok('müşteri müşteri kartlarını okuyamaz', /permission|false for/i.test(await err(getDocs(collection(B.db, 'businesses', bid, 'customers')))))
ok('müşteri randevuyu doğrudan yazamaz', /permission|false for/i.test(await err(addDoc(collection(B.db, 'businesses', bid, 'bookings'), { x: 1 }))))
ok('randevularım: 1', (await B.call('myBookings')({})).length === 1)

// 3) C aynı saate
await C.call('updateMyName')({ name: 'Cem Müşteri' })
ok('dolu saat reddedilir', (await err(bookB(C, '10:00'))) === 'SLOT_TAKEN')
ok('ızgara dışı saat (11:20) reddedilir', (await err(bookB(C, '11:20'))) === 'SLOT_TAKEN')
s = await slots(anon)
ok('boş saat 7 kaldı', s.length === 7, s.length)
ok('ara süre: 11:00 hâlâ müsait (10:50 + 10 dk)', s.some((x) => x.starts_at === at(D, '11:00')))

// 4) Haftalık sınır
await owner.call('updateBusiness')({ businessId: bid, patch: { weekly_limit_per_customer: 1 } })
ok('haftalık sınır', (await err(bookB(B, '15:00'))) === 'WEEKLY_LIMIT')
await owner.call('updateBusiness')({ businessId: bid, patch: { weekly_limit_per_customer: null } })
ok('müşteri işletme ayarını değiştiremez', (await err(C.call('updateBusiness')({ businessId: bid, patch: { name: 'hack' } }))) === 'FORBIDDEN')
ok('müşteri çalışma saatlerini değiştiremez', /permission|false for/i.test(await err(updateDoc(doc(C.db, 'businesses', bid, 'resources', rid), { hours: [] }))))

// 5) Kapalı zaman (13-15)
await addDoc(collection(owner.db, 'businesses', bid, 'timeOff'), { resource_id: null, starts_at: Timestamp.fromDate(new Date(at(D, '13:00'))), ends_at: Timestamp.fromDate(new Date(at(D, '15:00'))), reason: 'Toplantı' })
s = await slots(anon)
ok('kapalı zaman sonrası 5 saat', s.length === 5, s.length)
ok('müşteri kapalı zaman ekleyemez', /permission|false for/i.test(await err(addDoc(collection(C.db, 'businesses', bid, 'timeOff'), { resource_id: null, starts_at: Timestamp.now(), ends_at: Timestamp.now(), reason: null }))))

// 6) Telefonla arayan D'yi sahip elle ekler; D sonra giriş yapınca kartı sahiplenir
await owner.call('staffCreateBooking')({ businessId: bid, serviceId: sid, resourceId: rid, startsAt: at(D, '16:00'), name: 'Deniz (telefon)', phone: '0530 000 00 04' })
ok('ekip de çakışan saate ekleyemez', (await err(owner.call('staffCreateBooking')({ businessId: bid, serviceId: sid, resourceId: rid, startsAt: at(D, '16:30'), name: 'X Y' }))) === 'SLOT_TAKEN')
ok('müşteri ekip işlemi yapamaz', (await err(C.call('staffCreateBooking')({ businessId: bid, serviceId: sid, resourceId: rid, startsAt: at(D, '17:00'), name: 'X Y' }))) === 'FORBIDDEN')
await Dd.call('updateMyName')({ name: 'Deniz Doğan' })
await Dd.call('book')({ businessId: bid, serviceId: sid, startsAt: at(dayKey(11), '09:00'), consent: true })
ok('D iki randevusunu da görür', (await Dd.call('myBookings')({})).length === 2)
const custs = (await getDocs(collection(owner.db, 'businesses', bid, 'customers'))).docs.map((d) => d.data())
ok('D için tek müşteri kartı', custs.filter((c) => c.phone === '+905300000004').length === 1)

// 7) Onay + iptal kuralları
const bk = (await getDocs(collection(owner.db, 'businesses', bid, 'bookings'))).docs.find((d) => d.data().customer_user_id === B.uid)
await owner.call('staffUpdateBooking')({ businessId: bid, bookingId: bk.id, status: 'confirmed' })
await owner.call('updateBusiness')({ businessId: bid, patch: { cancel_until_min: 43200 } })
ok('geç iptal reddedilir', (await err(B.call('cancelMyBooking')({ businessId: bid, bookingId: bk.id }))) === 'CANCEL_TOO_LATE')
await owner.call('updateBusiness')({ businessId: bid, patch: { cancel_until_min: 60 } })
ok('başkasının randevusu iptal edilemez', (await err(C.call('cancelMyBooking')({ businessId: bid, bookingId: bk.id }))) === 'NOT_FOUND')
await B.call('cancelMyBooking')({ businessId: bid, bookingId: bk.id, reason: 'işim çıktı' })
ok('iptal sonrası saat boşaldı', (await slots(anon)).some((x) => x.starts_at === at(D, '10:00')))
ok('iptal edilen randevu geri açılınca yine çakışma kontrolünden geçer', (await err((async () => {
  await bookB(C, '10:00')
  await owner.call('staffUpdateBooking')({ businessId: bid, bookingId: bk.id, status: 'confirmed' })
})())) === 'SLOT_TAKEN')

// 8) Engelleme
await updateDoc(doc(owner.db, 'businesses', bid, 'customers', C.uid), { is_blocked: true })
ok('ekip müşteri kartını başka kullanıcıya bağlayamaz', /permission|false for/i.test(await err(updateDoc(doc(owner.db, 'businesses', bid, 'customers', C.uid), { user_id: B.uid }))))
ok('ekip doğrulanmış numarayı değiştiremez', /permission|false for/i.test(await err(updateDoc(doc(owner.db, 'businesses', bid, 'customers', C.uid), { phone: '+905559999999' }))))
ok('engelli numara randevu alamaz', (await err(C.call('book')({ businessId: bid, serviceId: sid, startsAt: at(dayKey(12), '09:00'), consent: true }))) === 'BLOCKED')

// 9) Giriş yapmamış ziyaretçi
ok('ziyaretçi randevu alamaz', (await err(anon.call('book')({ businessId: bid, serviceId: sid, startsAt: at(D, '17:00'), consent: true }))) === 'AUTH_REQUIRED')

// 10) Ekip daveti
const inviteRef = await addDoc(collection(owner.db, 'invites'), { business_id: bid, resource_id: rid, created_by: owner.uid, used_by: null, used_at: null, expires_at: Timestamp.fromMillis(Date.now() + 864e5) })
ok('müşteri davet oluşturamaz', /permission|false for/i.test(await err(addDoc(collection(C.db, 'invites'), { business_id: bid, resource_id: null, created_by: C.uid, used_by: null, used_at: null, expires_at: Timestamp.now() }))))
const staff = await phoneUser('+905300000009')
await staff.call('updateMyName')({ name: 'Ekip Üyesi' })
await staff.call('acceptInvite')({ code: inviteRef.id })
ok('ekip üyesi randevuları okur', (await getDocs(collection(staff.db, 'businesses', bid, 'bookings'))).size > 0)
ok('davet ikinci kez kullanılamaz', (await err(B.call('acceptInvite')({ code: inviteRef.id }))) === 'INVITE_INVALID')
ok('ekip üyesi ayar değiştiremez', (await err(staff.call('updateBusiness')({ businessId: bid, patch: { name: 'x' } }))) === 'FORBIDDEN')

// 11) YARIŞ: 20 kişi aynı anda aynı saate (anında onay modunda)
await owner.call('updateBusiness')({ businessId: bid, patch: { booking_mode: 'instant' } })
const R = dayKey(13)
const racers = await Promise.all(Array.from({ length: 20 }, (_, i) => phoneUser(`+9055500000${String(i).padStart(2, '0')}`)))
await Promise.all(racers.map((u, i) => u.call('updateMyName')({ name: `Yarışçı ${i}` })))
const target = (await slots(anon, R))[0].starts_at
const results = await Promise.all(racers.map((u) => err(u.call('book')({ businessId: bid, serviceId: sid, startsAt: target, consent: true }))))
const wins = results.filter((r) => r === 'OK').length
const stored = (await getDocs(collection(owner.db, 'businesses', bid, 'bookings'))).docs.filter((d) => d.data().active && d.data().starts_at.toDate().toISOString() === target).length
console.log('     yarış sonuçları:', JSON.stringify(results.reduce((a, r) => ({ ...a, [r]: (a[r] ?? 0) + 1 }), {})))
ok(`yarış: 20 eşzamanlı istekten tam 1 kazanan (kazanan=${wins}, kayıt=${stored})`, wins === 1 && stored === 1)

// 12) Verilerimi sil
await B.call('forgetMe')({})
const bCard = (await getDoc(doc(owner.db, 'businesses', bid, 'customers', B.uid))).data()
ok('verilerimi sil: ad ve numara silinir', bCard.name === 'Silinmiş kullanıcı' && bCard.phone === null)

for (const u of [owner, B, C, Dd, anon, staff, ...racers]) await deleteApp(u.app)
console.log(failed ? `\n${failed} TEST BAŞARISIZ, ${n} geçti` : `\nTÜM TESTLER GEÇTİ (${n})`)
process.exit(failed ? 1 : 0)
