import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { availableSlots, book, getBusinessBySlug, myBookings, watchPulse } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Business, MyBooking, Resource, Service, ServiceResource, Slot } from '../lib/types'
import { addDays, dayKeyOf, fmtDateTime, fmtDay, fmtTime, minutesLabel, relativeDay, todayKey } from '../lib/time'
import { errText } from '../lib/errors'
import { displayPhone, telHref, waHref } from '../lib/phone'
import { load, rememberPlace, save } from '../lib/storage'
import { downloadIcs } from '../lib/ics'
import { Button, Chip, Empty, Notice, Sheet, Spinner, useToast } from '../components/ui'
import { CustomerForm } from '../components/CustomerForm'
import { StatusBadge } from '../components/StatusBadge'

const WINDOW_DAYS = 14

interface Done { id: string; status: string; starts_at: string; ends_at: string }

export default function Book() {
  const { slug = '' } = useParams()
  const { session, profile } = useAuth()
  const toast = useToast()

  const [biz, setBiz] = useState<Business | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [links, setLinks] = useState<ServiceResource[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')

  const [serviceId, setServiceId] = useState<string | null>(null)
  const [resourceId, setResourceId] = useState<string>('') // '' = fark etmez
  const [windowStart, setWindowStart] = useState<string | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [day, setDay] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null) // starts_at

  const [sheet, setSheet] = useState(false)
  const [note, setNote] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Done | null>(null)
  const [mine, setMine] = useState<MyBooking[]>([])

  // ---- İşletme vitrini ----
  useEffect(() => {
    let off = false
    ;(async () => {
      setState('loading')
      const meta = await getBusinessBySlug(slug).catch(() => null)
      if (off) return
      if (!meta) { setState('missing'); return }
      const b = meta.biz
      const activeServices = meta.services.filter((x) => x.is_active)
      setBiz(b)
      setServices(activeServices)
      setResources(meta.resources.filter((x) => x.is_active))
      setLinks(meta.links)
      setWindowStart(todayKey(b.timezone))
      if (activeServices.length === 1) setServiceId(activeServices[0].id)
      setConsent(load(`consent:${b.id}`, false))
      setState('ready')
      rememberPlace({ slug: b.slug, name: b.name })
      document.title = b.name
    })()
    return () => { off = true }
  }, [slug])

  const service = services.find((s) => s.id === serviceId) ?? null
  const eligible = useMemo(() => {
    if (!serviceId) return resources
    const ids = links.filter((l) => l.service_id === serviceId).map((l) => l.resource_id)
    return ids.length ? resources.filter((r) => ids.includes(r.id)) : resources
  }, [serviceId, resources, links])

  useEffect(() => { if (resourceId && !eligible.some((r) => r.id === resourceId)) setResourceId('') }, [eligible, resourceId])

  // ---- Boş saatler ----
  const pickedRef = useRef(picked)
  pickedRef.current = picked
  const loadSlots = useCallback(async (silent = false) => {
    if (!biz || !serviceId || !windowStart) return
    if (!silent) setSlotsLoading(true)
    let list: Slot[]
    try {
      list = await availableSlots({ businessId: biz.id, serviceId, from: windowStart, days: WINDOW_DAYS, resourceId: resourceId || null })
    } catch (e) {
      if (!silent) { setSlotsLoading(false); toast(errText(e), 'error') }
      return
    }
    if (!silent) setSlotsLoading(false)
    setSlots(list)
    if (pickedRef.current && !list.some((s) => s.starts_at === pickedRef.current)) {
      setPicked(null)
      if (silent) toast('Seçtiğiniz saat az önce başkası tarafından alındı.', 'error')
    }
  }, [biz, serviceId, windowStart, resourceId, toast])

  useEffect(() => { void loadSlots() }, [loadSlots])

  // Anlık: işletmede bir şey değişince (yeni randevu, iptal, saat değişikliği) yeniden çek
  useEffect(() => {
    if (!biz) return
    let t: ReturnType<typeof setTimeout>
    const stop = watchPulse(biz.id, () => { clearTimeout(t); t = setTimeout(() => void loadSlots(true), 300) })
    const onVis = () => document.visibilityState === 'visible' && void loadSlots(true)
    document.addEventListener('visibilitychange', onVis)
    return () => { clearTimeout(t); stop(); document.removeEventListener('visibilitychange', onVis) }
  }, [biz, loadSlots])

  // Gün bazında grupla; "fark etmez" seçiliyse aynı saatteki kaynakları birleştir
  const byDay = useMemo(() => {
    const m = new Map<string, string[]>()
    if (!biz) return m
    for (const s of slots) {
      const k = dayKeyOf(s.starts_at, biz.timezone)
      const arr = m.get(k) ?? []
      if (arr[arr.length - 1] !== s.starts_at) arr.push(s.starts_at)
      m.set(k, arr)
    }
    return m
  }, [slots, biz])

  const days = useMemo(() => windowStart ? Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(windowStart, i)) : [], [windowStart])

  useEffect(() => {
    if (!days.length) return
    if (!day || !days.includes(day) || !byDay.get(day)?.length) {
      const first = days.find((d) => byDay.get(d)?.length)
      if (first && first !== day) setDay(first)
    }
  }, [byDay, days, day])

  // ---- Bu işletmedeki kendi randevularım ----
  const loadMine = useCallback(async () => {
    if (!session || !biz) { setMine([]); return }
    const data = await myBookings().catch(() => [] as MyBooking[])
    setMine(data.filter((b) => b.business_id === biz.id && ['pending', 'confirmed'].includes(b.status) && new Date(b.ends_at) > new Date()))
  }, [session, biz])
  useEffect(() => { void loadMine() }, [loadMine])

  async function confirm() {
    if (!biz || !service || !picked) return
    if (!consent) { toast('Lütfen aydınlatma metnini onaylayın.', 'error'); return }
    setBusy(true)
    let data: Done
    try {
      data = await book({ businessId: biz.id, serviceId: service.id, startsAt: picked, resourceId: resourceId || null, note: note.trim() || null, consent: true })
    } catch (e) {
      setBusy(false)
      toast(errText(e), 'error')
      if (/SLOT_TAKEN/.test(String((e as Error).message))) { setSheet(false); setPicked(null); void loadSlots(true) }
      return
    }
    setBusy(false)
    save(`consent:${biz.id}`, true)
    setDone(data)
    setSheet(false); setPicked(null); setNote('')
    void loadMine(); void loadSlots(true)
  }

  if (state === 'loading') return <Spinner />
  if (state === 'missing' || !biz) return (
    <div className="page"><Empty title="İşletme bulunamadı">Bağlantıyı kontrol edin. <Link to="/">Ana sayfa</Link></Empty></div>
  )

  const tz = biz.timezone
  const daySlots = day ? byDay.get(day) ?? [] : []
  const canGoNext = windowStart && addDays(windowStart, WINDOW_DAYS) <= addDays(todayKey(tz), biz.max_advance_days)
  const resourceName = (id: string) => resources.find((r) => r.id === id)?.name ?? ''

  if (done) {
    const pending = done.status === 'pending'
    return (
      <div className="page">
        <div className="card success-card">
          <div className="big-check" aria-hidden>{pending ? '⏳' : '✓'}</div>
          <h2>{pending ? 'Talebiniz alındı' : 'Randevunuz hazır'}</h2>
          <p className="lead">{service?.name ?? 'Randevu'} · {fmtDateTime(done.starts_at, tz)}</p>
          {pending
            ? <Notice kind="warning">{biz.name} onayladığında burada ve “Randevularım” sayfasında görünecek. Saat sizin için ayrıldı.</Notice>
            : <Notice kind="success">{biz.name} sizi bekliyor.</Notice>}
          <div className="stack">
            <Button variant="secondary" onClick={() => downloadIcs({ id: done.id, title: `${biz.name} – ${service?.name ?? 'Randevu'}`, startsAt: done.starts_at, endsAt: done.ends_at, location: biz.address })}>Takvimime ekle</Button>
            <Link className="btn btn-ghost" to="/randevularim">Randevularım</Link>
            <button className="link" onClick={() => setDone(null)}>Başka bir randevu al</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page page-with-bar">
      <section className="biz-head">
        <h1>{biz.name}</h1>
        {biz.description ? <p className="muted">{biz.description}</p> : null}
        <div className="biz-meta">
          {biz.address ? <span>📍 {biz.address}</span> : null}
          {biz.phone ? <a href={telHref(biz.phone)}>📞 {displayPhone(biz.phone)}</a> : null}
        </div>
        {!biz.is_active ? <Notice kind="warning">Bu işletme şu an çevrim içi randevu almıyor.</Notice> : null}
        {biz.booking_note ? <Notice>{biz.booking_note}</Notice> : null}
      </section>

      {mine.length ? (
        <section className="card card-accent">
          <div className="card-title">Yaklaşan randevunuz</div>
          {mine.map((m) => (
            <div key={m.id} className="row-between">
              <span>{m.service_name} · {fmtDateTime(m.starts_at, tz)}</span>
              <StatusBadge status={m.status} />
            </div>
          ))}
          <Link to="/randevularim" className="link">Yönet / iptal et →</Link>
        </section>
      ) : null}

      {biz.is_active ? <>
        {services.length > 1 || !service ? (
          <section className="step">
            <h2 className="step-title"><span className="step-no">1</span> Ne için?</h2>
            {services.length === 0 ? <Empty title="Henüz hizmet eklenmemiş" /> : (
              <div className="option-list">
                {services.map((s) => (
                  <button key={s.id} className={`option ${s.id === serviceId ? 'option-active' : ''}`}
                    onClick={() => { setServiceId(s.id); setPicked(null) }} aria-pressed={s.id === serviceId}>
                    <span className="option-main">
                      <strong>{s.name}</strong>
                      {s.description ? <span className="muted small">{s.description}</span> : null}
                    </span>
                    <span className="option-side">
                      <span>{minutesLabel(s.duration_min)}</span>
                      {s.price_text ? <span className="muted small">{s.price_text}</span> : null}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : (
          <div className="pill-line"><strong>{service.name}</strong> · {minutesLabel(service.duration_min)}{service.price_text ? ` · ${service.price_text}` : ''}</div>
        )}

        {service && eligible.length > 1 ? (
          <section className="step">
            <h2 className="step-title"><span className="step-no">2</span> {biz.resource_label}</h2>
            <div className="chips">
              <Chip active={!resourceId} onClick={() => { setResourceId(''); setPicked(null) }}>Fark etmez</Chip>
              {eligible.map((r) => (
                <Chip key={r.id} active={resourceId === r.id} onClick={() => { setResourceId(r.id); setPicked(null) }}>{r.name}</Chip>
              ))}
            </div>
          </section>
        ) : null}

        {service ? (
          <section className="step">
            <h2 className="step-title"><span className="step-no">{eligible.length > 1 ? 3 : 2}</span> Gün ve saat</h2>
            <div className="day-strip" role="tablist">
              {windowStart && windowStart > todayKey(tz) ? (
                <button className="day day-nav" onClick={() => setWindowStart(addDays(windowStart, -WINDOW_DAYS))} aria-label="Önceki günler">‹</button>
              ) : null}
              {days.map((d) => {
                const n = byDay.get(d)?.length ?? 0
                return (
                  <button key={d} role="tab" aria-selected={d === day} disabled={!n}
                    className={`day ${d === day ? 'day-active' : ''}`} onClick={() => { setDay(d); setPicked(null) }}>
                    <span className="day-w">{fmtDay(d, { weekday: 'short' })}</span>
                    <span className="day-n">{fmtDay(d, { day: 'numeric' })}</span>
                    <span className="day-c">{n ? `${n} boş` : 'dolu'}</span>
                  </button>
                )
              })}
              {canGoNext ? (
                <button className="day day-nav" onClick={() => setWindowStart(addDays(windowStart!, WINDOW_DAYS))} aria-label="Sonraki günler">›</button>
              ) : null}
            </div>

            {slotsLoading ? <Spinner /> : !day || !daySlots.length ? (
              <Empty title="Bu aralıkta boş saat yok">
                {canGoNext ? 'Sonraki günlere bakabilirsiniz.' : biz.phone ? <>İşletmeyi arayabilirsiniz: <a href={telHref(biz.phone)}>{displayPhone(biz.phone)}</a></> : null}
              </Empty>
            ) : (
              <>
                <div className="muted small day-caption">{relativeDay(day, tz)}, {fmtDay(day, { day: 'numeric', month: 'long' })}</div>
                <div className="slot-grid">
                  {daySlots.map((st) => (
                    <button key={st} className={`slot ${picked === st ? 'slot-active' : ''}`} onClick={() => setPicked(st)} aria-pressed={picked === st}>
                      {fmtTime(st, tz)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
        ) : null}
      </> : null}

      <footer className="page-foot muted small">
        <Link to="/randevularim">Randevularım</Link> · <Link to="/kvkk">Aydınlatma metni</Link>
      </footer>

      {picked && service ? (
        <div className="bottom-bar">
          <div className="bottom-bar-info">
            <strong>{fmtTime(picked, tz)}</strong>
            <span className="muted small">{relativeDay(dayKeyOf(picked, tz), tz)} · {service.name}</span>
          </div>
          <Button onClick={() => setSheet(true)}>Devam</Button>
        </div>
      ) : null}

      <Sheet open={sheet} onClose={() => setSheet(false)} title={session && profile?.full_name && profile.phone ? 'Randevuyu onayla' : 'Bilgileriniz'}>
        {!session || !profile?.full_name || !profile.phone ? (
          <CustomerForm onDone={() => { /* bilgiler kaydedilince onay görünümüne geçer */ }}
            intro="Hesap açmanız gerekmez. Bilgileriniz bu cihazda hatırlanır, sonraki randevularda tekrar sorulmaz." />
        ) : picked && service ? (
          <div className="stack">
            <dl className="summary">
              <dt>İşletme</dt><dd>{biz.name}</dd>
              <dt>Hizmet</dt><dd>{service.name} ({minutesLabel(service.duration_min)})</dd>
              <dt>Zaman</dt><dd>{fmtDateTime(picked, tz)}</dd>
              {resourceId ? <><dt>{biz.resource_label}</dt><dd>{resourceName(resourceId)}</dd></> : null}
              <dt>Adınız</dt><dd>{profile.full_name} · {displayPhone(profile.phone)}</dd>
            </dl>
            <label className="field">
              <span className="field-label">İşletmeye not <span className="muted">(isteğe bağlı)</span></span>
              <textarea className="input" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <label className="check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>Ad ve telefon bilgimin randevu amacıyla {biz.name} ile paylaşılmasını kabul ediyorum. <Link to="/kvkk" target="_blank">Aydınlatma metni</Link></span>
            </label>
            {biz.booking_mode === 'approval'
              ? <Notice kind="info">Bu işletme randevuları onaylıyor. Saat sizin için ayrılır, onay gelince bildirilir.</Notice>
              : null}
            {biz.cancel_until_min > 0 ? <p className="muted small">Randevudan {minutesLabel(biz.cancel_until_min)} öncesine kadar uygulamadan iptal edebilirsiniz.</p> : null}
            <Button onClick={() => void confirm()} loading={busy} disabled={!consent}>
              {biz.booking_mode === 'approval' ? 'Randevu talebi gönder' : 'Randevuyu onayla'}
            </Button>
            {biz.phone ? <a className="link center" href={waHref(biz.phone)} target="_blank" rel="noreferrer">Sorunuz mu var? WhatsApp'tan yazın</a> : null}
          </div>
        ) : null}
      </Sheet>
    </div>
  )
}
