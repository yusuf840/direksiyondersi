// Firestore güvenlik kuralları testleri (emülatör). Çalıştırma: npm run test:rules
// Müşteri ekranını atlayıp doğrudan veritabanına yazmaya çalışan "kötü niyetli istemci" senaryoları dahil.
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, signInAnonymously, signInWithCredential, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, collection, writeBatch, updateDoc, setDoc, Timestamp } from 'firebase/firestore'

const PROJECT = 'demo-randevu', HOST = '127.0.0.1'
let passed = 0, failed = 0
const ok = (label, cond, info = '') => { if (cond) { passed++; console.log('ok  ', label) } else { failed++; console.log('FAIL', label, info) } }
const denied = async (p) => { try { await p; return false } catch (e) { return e.code === 'permission-denied' || /permission|insufficient|false for/i.test(e.message) } }
const works = async (p) => { try { await p; return true } catch (e) { console.log('     beklenmeyen hata:', e.message.split('\n')[0]); return false } }

async function user(kind, id) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT, appId: 'demo' }, `${kind}-${id}-${Math.random()}`)
  const auth = getAuth(app); connectAuthEmulator(auth, `http://${HOST}:9099`, { disableWarnings: true })
  const db = getFirestore(app); connectFirestoreEmulator(db, HOST, 8080)
  if (kind === 'google') await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: id, email: `${id}@ornek.com`, email_verified: true, name: id })))
  else await signInAnonymously(auth)
  return { app, db, uid: auth.currentUser.uid }
}

const CELL = 5 * 60_000
const cellOf = (ms) => Math.floor(ms / CELL)
const dayKey = (off) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(Date.now() + off * 864e5))
const at = (key, hhmm) => new Date(`${key}T${hhmm}:00+03:00`)
const D = dayKey(5)

// ---- kurulum: sahip (Google) işletmeyi açar ----
const owner = await user('google', 'sahip')
const anonOwner = await user('anon', 'x')
const bid = 'isletme1', rid = 'kaynak1', sid = 'hizmet1'
function setupBatch(u, b, slug) {
  const w = writeBatch(u.db)
  w.set(doc(u.db, 'slugs', slug), { business_id: b })
  w.set(doc(u.db, 'businesses', b), {
    slug, name: 'Test İşletme', description: null, phone: null, address: null, timezone: 'Europe/Istanbul', resource_label: 'Uzman',
    booking_mode: 'approval', slot_interval_min: 60, min_notice_min: 60, max_advance_days: 30, cancel_until_min: 120,
    max_active_per_customer: 3, weekly_limit_per_customer: null, booking_note: null, is_active: true, created_by: u.uid,
  })
  w.set(doc(u.db, 'businesses', b, 'members', u.uid), { uid: u.uid, business_id: b, role: 'owner', resource_id: rid, full_name: 'Sahip' })
  w.set(doc(u.db, 'users', u.uid, 'memberships', b), { business_id: b })
  w.set(doc(u.db, 'businesses', b, 'resources', rid), { name: 'Ayşe', is_active: true, sort: 0, hours: [1, 2, 3, 4, 5, 6, 7].flatMap((x) => [{ weekday: x, start: '09:00', end: '12:00' }, { weekday: x, start: '13:00', end: '18:00' }]) })
  w.set(doc(u.db, 'businesses', b, 'services', sid), { name: 'Görüşme', description: null, duration_min: 50, buffer_min: 10, slot_interval_min: 60, price_text: null, is_active: true, sort: 0, resource_ids: [] })
  return w.commit()
}
ok('hesapsız (anonim) kullanıcı işletme açamaz', await denied(setupBatch(anonOwner, 'kotu', 'kotu-isletme')))
ok('sahip Google hesabıyla işletmeyi kurar', await works(setupBatch(owner, bid, 'test-isletme')))
const other = await user('google', 'baskasi')
ok('başkası aynı bağlantı adını alamaz', await denied(setupBatch(other, 'isletme2', 'test-isletme')))
ok('başkası var olan işletmeye kendini sahip yazamaz', await denied(setDoc(doc(other.db, 'businesses', bid, 'members', other.uid), { uid: other.uid, business_id: bid, role: 'owner' })))

// ---- müşteri randevusu (uygulamanın yaptığı toplu yazmanın aynısı) ----
function bookBatch(u, { start, minutes = 50, buffer = 10, status = 'pending', cells = 'all', phone = '+905300000002', resource = rid, source = 'customer' }) {
  const s = start.getTime(), e = s + minutes * 60_000, blk = e + buffer * 60_000
  const ref = doc(collection(u.db, 'businesses', bid, 'bookings'))
  const w = writeBatch(u.db)
  w.set(ref, {
    business_id: bid, resource_id: resource, service_id: sid, service_name: 'Görüşme',
    customer_id: u.uid, customer_user_id: u.uid, customer_name: 'Müşteri', customer_phone: phone,
    starts_at: Timestamp.fromMillis(s), ends_at: Timestamp.fromMillis(e), block_until: Timestamp.fromMillis(blk),
    cell_first: cellOf(s), cell_last: cellOf(blk - 1), status, active: true, source,
    customer_note: null, cancel_reason: null, cancelled_by: null, created_at: Timestamp.now(), updated_at: Timestamp.now(),
  })
  const list = []
  for (let c = cellOf(s); c <= cellOf(blk - 1); c++) list.push(c)
  const chosen = cells === 'all' ? list : []
  for (const c of chosen) w.set(doc(u.db, 'businesses', bid, 'cells', `${resource}_${c}`), { business_id: bid, resource_id: resource, cell: c, booking_id: ref.id })
  w.set(doc(u.db, 'users', u.uid, 'myBookings', ref.id), { business_id: bid })
  return { ref, commit: () => w.commit() }
}

const B = await user('anon', 'B'), C = await user('anon', 'C'), Dd = await user('anon', 'D')
const b1 = bookBatch(B, { start: at(D, '10:00') })
ok('müşteri boş saate randevu alır (hesapsız)', await works(b1.commit()))
ok('başka müşteri aynı saate yazamaz', await denied(bookBatch(C, { start: at(D, '10:00') }).commit()))
ok('kısmen çakışan saate (10:30) yazamaz', await denied(bookBatch(C, { start: at(D, '10:30') }).commit()))
ok('önceki randevunun arasına (10:55) yazamaz', await denied(bookBatch(C, { start: at(D, '10:55'), minutes: 5, buffer: 0 }).commit()))
ok('dilim kilidi olmadan randevu yazılamaz', await denied(bookBatch(C, { start: at(D, '15:00'), cells: 'none' }).commit()))
ok('onaylı modda kendini "onaylandı" yazamaz', await denied(bookBatch(C, { start: at(D, '15:00'), status: 'confirmed' }).commit()))
ok('hizmet süresini kısaltamaz', await denied(bookBatch(C, { start: at(D, '15:00'), minutes: 10 }).commit()))
ok('arayı (buffer) atlayamaz', await denied(bookBatch(C, { start: at(D, '15:00'), buffer: 0 }).commit()))
ok('"ekip" kaynağıyla randevu yazamaz', await denied(bookBatch(C, { start: at(D, '15:00'), status: 'confirmed', source: 'staff' }).commit()))
ok('en az önceden haber süresinden (60 dk) yakın saate yazamaz', await denied(bookBatch(C, { start: new Date(Math.ceil((Date.now() + 20 * 60_000) / CELL) * CELL) }).commit()))
ok('ileri tarih sınırının (30 gün) ötesine yazamaz', await denied(bookBatch(C, { start: at(dayKey(40), '10:00') }).commit()))

ok('müşteri tüm randevuları okuyamaz', await denied(getDocs(collection(C.db, 'businesses', bid, 'bookings'))))
ok('müşteri başkasının randevusunu okuyamaz', await denied(getDoc(doc(C.db, 'businesses', bid, 'bookings', b1.ref.id))))
ok('müşteri kendi randevusunu okur', await works(getDoc(doc(B.db, 'businesses', bid, 'bookings', b1.ref.id))))
ok('müşteri müşteri listesini okuyamaz', await denied(getDocs(collection(C.db, 'businesses', bid, 'customers'))))
ok('başkasının randevusunun kilidini silemez', await denied((async () => { const w = writeBatch(C.db); w.delete(doc(C.db, 'businesses', bid, 'cells', `${rid}_${cellOf(at(D, '10:00').getTime())}`)); await w.commit() })()))
ok('başkasının randevusunu iptal edemez', await denied(updateDoc(doc(C.db, 'businesses', bid, 'bookings', b1.ref.id), { status: 'cancelled', active: false, cancelled_by: 'customer', cancel_reason: null, updated_at: Timestamp.now() })))
ok('boş saatler (dolu dilimler) herkese açık', await works(getDocs(collection(C.db, 'businesses', bid, 'cells'))))

// ---- iptal ----
async function cancel(u, ref, start) {
  const w = writeBatch(u.db)
  w.update(ref, { status: 'cancelled', active: false, cancelled_by: 'customer', cancel_reason: 'işim çıktı', updated_at: Timestamp.now() })
  for (let c = cellOf(start.getTime()); c <= cellOf(start.getTime() + 60 * 60_000 - 1); c++) w.delete(doc(u.db, 'businesses', bid, 'cells', `${rid}_${c}`))
  return w.commit()
}
ok('müşteri kendi bekleyen randevusunu iptal eder, saat boşalır', await works(cancel(B, b1.ref, at(D, '10:00'))))
const c1 = bookBatch(C, { start: at(D, '10:00'), phone: '+905300000003' })
ok('boşalan saati başkası alır', await works(c1.commit()))

// ---- ekip işlemleri + geç iptal ----
ok('sahip randevuyu onaylar', await works(updateDoc(doc(owner.db, 'businesses', bid, 'bookings', c1.ref.id), { status: 'confirmed', active: true, updated_at: Timestamp.now() })))
ok('sahip iptal süresini değiştirir', await works(updateDoc(doc(owner.db, 'businesses', bid), { cancel_until_min: 43200 })))
ok('onaylı randevu süre geçtikten sonra müşteri tarafından iptal edilemez', await denied(cancel(C, c1.ref, at(D, '10:00'))))
ok('müşteri işletme ayarını değiştiremez', await denied(updateDoc(doc(C.db, 'businesses', bid), { name: 'hack' })))
ok('müşteri çalışma saatlerini değiştiremez', await denied(updateDoc(doc(C.db, 'businesses', bid, 'resources', rid), { hours: [] })))
ok('müşteri kapalı zaman ekleyemez', await denied(setDoc(doc(C.db, 'businesses', bid, 'timeOff', 'x'), { resource_id: null, starts_at: Timestamp.now(), ends_at: Timestamp.fromMillis(Date.now() + 1e6) })))
ok('müşteri engelli listesine yazamaz', await denied(setDoc(doc(C.db, 'businesses', bid, 'blocked', '+905300000004'), { at: 1 })))

// ---- engelleme ----
ok('sahip numarayı engeller', await works(setDoc(doc(owner.db, 'businesses', bid, 'blocked', '+905300000004'), { at: Timestamp.now() })))
ok('engelli numara randevu alamaz', await denied(bookBatch(Dd, { start: at(D, '16:00'), phone: '+905300000004' }).commit()))

// ---- ekip daveti ----
const staff = await user('google', 'ekip')
const inv = doc(collection(owner.db, 'invites'))
ok('sahip davet oluşturur', await works(setDoc(inv, { business_id: bid, resource_id: rid, created_by: owner.uid, used_by: null, used_at: null, expires_at: Timestamp.fromMillis(Date.now() + 864e5) })))
ok('davetsiz kişi ekip üyesi olamaz', await denied(setDoc(doc(other.db, 'businesses', bid, 'members', other.uid), { uid: other.uid, business_id: bid, role: 'staff', invite_code: 'uydurma' })))
async function accept(u, code) {
  const w = writeBatch(u.db)
  w.set(doc(u.db, 'businesses', bid, 'members', u.uid), { uid: u.uid, business_id: bid, role: 'staff', resource_id: rid, full_name: 'Ekip', invite_code: code })
  w.set(doc(u.db, 'users', u.uid, 'memberships', bid), { business_id: bid })
  w.update(doc(u.db, 'invites', code), { used_by: u.uid, used_at: Timestamp.now() })
  return w.commit()
}
ok('davetli ekibe katılır', await works(accept(staff, inv.id)))
ok('davet ikinci kez kullanılamaz', await denied(accept(other, inv.id)))
ok('ekip üyesi randevuları okur', await works(getDocs(collection(staff.db, 'businesses', bid, 'bookings'))))
ok('ekip üyesi ayar değiştiremez', await denied(updateDoc(doc(staff.db, 'businesses', bid), { name: 'x' })))
ok('ekip de dolu saate randevu ekleyemez', await denied(bookBatch(staff, { start: at(D, '10:00'), status: 'confirmed', source: 'staff' }).commit()))

// ---- YARIŞ: 20 kişi aynı anda aynı saate ----
const racers = await Promise.all(Array.from({ length: 20 }, (_, i) => user('anon', `y${i}`)))
const target = at(dayKey(6), '14:00')
const results = await Promise.all(racers.map((u, i) => bookBatch(u, { start: target, phone: `+9055500000${String(i).padStart(2, '0')}` }).commit()
  .then(() => 'OK', (e) => (/permission/i.test(e.message) ? 'REDDEDİLDİ' : e.message.split('\n')[0]))))
const wins = results.filter((r) => r === 'OK').length
const stored = (await getDocs(collection(owner.db, 'businesses', bid, 'bookings'))).docs.filter((d) => d.data().active && d.data().starts_at.toMillis() === target.getTime()).length
console.log('     yarış:', JSON.stringify(results.reduce((a, r) => ({ ...a, [r]: (a[r] ?? 0) + 1 }), {})))
ok(`yarış: 20 eşzamanlı istekten tam 1 kazanan (kazanan=${wins}, kayıt=${stored})`, wins === 1 && stored === 1)

for (const u of [owner, anonOwner, other, B, C, Dd, staff, ...racers]) await deleteApp(u.app)
console.log(failed ? `\n${failed} TEST BAŞARISIZ, ${passed} geçti` : `\nTÜM KURAL TESTLERİ GEÇTİ (${passed})`)
process.exit(failed ? 1 : 0)
