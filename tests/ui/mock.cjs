// Supabase API'sini taklit eden Playwright route'ları (sadece arayüz testi için)
const B = { id: 'b1', slug: 'ornek', name: 'Örnek Stüdyo', description: 'Randevu ile çalışıyoruz.', phone: '+905301112233', address: 'Kadıköy, İstanbul',
  timezone: 'Europe/Istanbul', resource_label: 'Eğitmen', booking_mode: 'approval', slot_interval_min: 60, min_notice_min: 60, max_advance_days: 30,
  cancel_until_min: 120, max_active_per_customer: 3, weekly_limit_per_customer: 2, booking_note: 'Lütfen 5 dk önce gelin.', is_active: true }
const services = [
  { id: 's1', business_id: 'b1', name: 'Bireysel seans', description: 'Birebir çalışma', duration_min: 50, buffer_min: 10, slot_interval_min: 60, price_text: '750 ₺', is_active: true, sort: 0 },
  { id: 's2', business_id: 'b1', name: 'Ön görüşme', description: null, duration_min: 20, buffer_min: 0, slot_interval_min: null, price_text: 'Ücretsiz', is_active: true, sort: 1 },
]
const resources = [{ id: 'r1', business_id: 'b1', name: 'Ayşe', is_active: true, sort: 0 }, { id: 'r2', business_id: 'b1', name: 'Mert', is_active: true, sort: 1 }]
const hours = [1,2,3,4,5].flatMap((d) => [{ id: 'h'+d+'a', business_id: 'b1', resource_id: 'r1', weekday: d, start_time: '09:00:00', end_time: '12:00:00' }, { id: 'h'+d+'b', business_id: 'b1', resource_id: 'r1', weekday: d, start_time: '13:00:00', end_time: '18:00:00' }])
function key(d) { return d.toISOString().slice(0, 10) }
function slots(from, days) {
  const out = []
  const start = new Date(from + 'T00:00:00Z')
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 864e5)
    const wd = d.getUTCDay(); if (wd === 0) continue
    for (const h of [9, 10, 11, 13, 14, 15, 16, 17]) {
      if ((i + h) % 5 === 0) continue // bazıları dolu
      if (wd === 6 && h > 12) continue
      const iso = `${key(d)}T${String(h).padStart(2, '0')}:00:00+03:00`
      if (new Date(iso) < new Date(Date.now() + 3600e3)) continue
      out.push({ resource_id: 'r1', starts_at: new Date(iso).toISOString() })
    }
  }
  return out
}
const now = Date.now()
const at = (dayOffset, h, m = 0) => { const d = new Date(now + dayOffset * 864e5); const k = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d); return new Date(`${k}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00+03:00`).toISOString() }
const plus = (iso, min) => new Date(new Date(iso).getTime() + min * 60e3).toISOString()
const cust = (id, name, phone, user_id = 'u') => ({ id, name, phone, is_blocked: false, user_id })
const bookings = [
  { id: 'k1', business_id: 'b1', resource_id: 'r1', service_id: 's1', service_name: 'Bireysel seans', customer_id: 'c1', starts_at: at(0, 9), ends_at: plus(at(0, 9), 50), block_until: plus(at(0, 9), 60), status: 'completed', source: 'customer', customer_note: null, staff_note: null, cancel_reason: null, cancelled_by: null, created_at: at(-2, 9), customer: cust('c1', 'Zeynep Kaya', '+905301234567') },
  { id: 'k2', business_id: 'b1', resource_id: 'r2', service_id: 's2', service_name: 'Ön görüşme', customer_id: 'c2', starts_at: at(0, 11), ends_at: plus(at(0, 11), 20), block_until: plus(at(0, 11), 20), status: 'confirmed', source: 'staff', customer_note: null, staff_note: 'Telefonla aradı', cancel_reason: null, cancelled_by: null, created_at: at(-1, 9), customer: cust('c2', 'Ali Demir', '+905309876543', null) },
  { id: 'k3', business_id: 'b1', resource_id: 'r1', service_id: 's1', service_name: 'Bireysel seans', customer_id: 'c3', starts_at: at(0, 15), ends_at: plus(at(0, 15), 50), block_until: plus(at(0, 15), 60), status: 'pending', source: 'customer', customer_note: 'İlk kez geleceğim', staff_note: null, cancel_reason: null, cancelled_by: null, created_at: at(0, 8), customer: cust('c3', 'Elif Şahin', '+905305556677') },
  { id: 'k4', business_id: 'b1', resource_id: 'r1', service_id: 's1', service_name: 'Bireysel seans', customer_id: 'c4', starts_at: at(0, 16), ends_at: plus(at(0, 16), 50), block_until: plus(at(0, 16), 60), status: 'confirmed', source: 'customer', customer_note: null, staff_note: null, cancel_reason: null, cancelled_by: null, created_at: at(-3, 8), customer: cust('c4', 'Burak Yılmaz', '+905301110000') },
]
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const USER = { id: 'u1', aud: 'authenticated', role: 'authenticated', phone: '905301112244', app_metadata: { provider: 'phone' }, user_metadata: {}, created_at: new Date().toISOString() }
const exp = Math.floor(Date.now() / 1000) + 3600 * 24
const TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', exp, aud: 'authenticated', phone: USER.phone, session_id: 'x' })}.sig`
const SESSION = { access_token: TOKEN, token_type: 'bearer', expires_in: 86400, expires_at: exp, refresh_token: 'r', user: USER }

function install(page, state) {
  state.calls = []
  return page.route('http://mock.supabase.test/**', async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname
    const accept = req.headers()['accept'] || ''
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    const rows = (list) => accept.includes('vnd.pgrst.object') ? (list.length ? json(list[0]) : json({ code: 'PGRST116', message: 'no rows', details: '0 rows' }, 406)) : json(list)
    state.calls.push(req.method() + ' ' + p + url.search)
    if (p.startsWith('/auth/v1/otp')) return json({})
    if (p.startsWith('/auth/v1/verify')) { state.loggedIn = true; return json(SESSION) }
    if (p.startsWith('/auth/v1/user')) return json(USER)
    if (p.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204 })
    if (p.startsWith('/auth/v1/token')) return json(SESSION)
    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.split('/').pop(); const body = JSON.parse(req.postData() || '{}')
      if (fn === 'available_slots') return json(slots(body.p_from, body.p_days))
      if (fn === 'update_my_name') { state.name = body.p_name; return route.fulfill({ status: 204 }) }
      if (fn === 'book') { state.booked = body; return json({ id: 'new1', status: 'pending', starts_at: body.p_starts_at, ends_at: plus(body.p_starts_at, 50) }) }
      if (fn === 'my_bookings') return json(state.booked ? [{ id: 'new1', status: 'pending', starts_at: state.booked.p_starts_at, ends_at: plus(state.booked.p_starts_at, 50), service_name: 'Bireysel seans', resource_name: 'Ayşe', customer_note: null, cancel_reason: null, business_id: 'b1', business_name: B.name, business_slug: 'ornek', business_phone: B.phone, business_address: B.address, timezone: B.timezone, cancel_until_min: 120, resource_label: 'Eğitmen' }] : [])
      if (fn === 'list_members') return json([{ user_id: 'u1', role: 'owner', resource_id: 'r1', full_name: 'Ayşe Öz', phone: '+905301112244' }])
      if (fn === 'create_business') return json('b1')
      return json(null)
    }
    if (p.startsWith('/rest/v1/')) {
      const t = p.split('/').pop()
      if (t === 'businesses') return url.searchParams.get('slug') === 'eq.ornek' || url.searchParams.get('id') ? rows([B]) : rows([])
      if (t === 'services') return rows(services)
      if (t === 'resources') return rows(resources)
      if (t === 'service_resources') return rows([])
      if (t === 'working_hours') return rows(hours)
      if (t === 'time_off') return rows([])
      if (t === 'profiles') return rows(state.name ? [{ id: 'u1', full_name: state.name, phone: '+905301112244' }] : [])
      if (t === 'business_members') return rows([{ role: 'owner', resource_id: 'r1', business: B }])
      if (t === 'bookings') {
        if (url.searchParams.get('status') === 'eq.pending') return rows(bookings.filter((b) => b.status === 'pending'))
        return rows(bookings)
      }
      if (t === 'customers') return rows(bookings.map((b) => ({ ...b.customer, business_id: 'b1', note: null, created_at: b.created_at })))
      return rows([])
    }
    return route.fulfill({ status: 404, body: '' })
  })
}
module.exports = { install, SESSION }
