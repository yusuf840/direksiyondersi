import { useEffect, useMemo, useRef, useState } from 'react'
import { watchBookings, watchPending } from '../../lib/api'
import type { Booking } from '../../lib/types'
import { addDays, dayKeyOf, dayRange, fmtDay, fmtDateTime, fmtTime, relativeDay, todayKey, weekStart } from '../../lib/time'
import { Button, Chip, Empty, Spinner, useToast } from '../../components/ui'
import { StatusBadge } from '../../components/StatusBadge'
import { usePanel } from './context'
import { BookingSheet } from './BookingSheet'
import { NewBookingSheet } from './NewBookingSheet'


function beep() {
  try {
    const ctx = new AudioContext()
    const o = ctx.createOscillator(); const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.08
    o.start(); o.stop(ctx.currentTime + 0.18)
  } catch { /* sessiz */ }
}

export default function Agenda() {
  const { biz, resources } = usePanel()
  const toast = useToast()
  const tz = biz.timezone
  const [day, setDay] = useState(() => todayKey(tz))
  const [resFilter, setResFilter] = useState('')
  const [pending, setPending] = useState<Booking[]>([])
  const [open, setOpen] = useState<Booking | null>(null)
  const [adding, setAdding] = useState(false)
  const [showCancelled, setShowCancelled] = useState(false)
  const [notifOk, setNotifOk] = useState(() => typeof Notification !== 'undefined' && Notification.permission === 'granted')
  const ws = weekStart(day)

  // Haftanın tüm randevuları anlık izlenir; gün listesi ve sayılar buradan türetilir
  const [weekItems, setWeekItems] = useState<Booking[] | null>(null)
  useEffect(() => {
    setWeekItems(null)
    const [from] = dayRange(ws, tz)
    const [, to] = dayRange(addDays(ws, 6), tz)
    return watchBookings(biz.id, from, to, (list, changes, initial) => {
      setWeekItems(list)
      if (initial) return
      for (const c of changes) {
        const n = c.booking
        let msg: string | null = null
        if (c.type === 'added' && n.source === 'customer') msg = `Yeni ${n.status === 'pending' ? 'randevu talebi' : 'randevu'}: ${n.customer_name} · ${fmtDateTime(n.starts_at, tz)}`
        if (c.type === 'modified' && n.status === 'cancelled' && n.cancelled_by === 'customer') msg = `Müşteri iptal etti: ${n.customer_name} · ${fmtDateTime(n.starts_at, tz)}`
        if (msg) notify(msg, n.id)
      }
    })
  }, [biz.id, ws, tz]) // eslint-disable-line react-hooks/exhaustive-deps

  // Bekleyen talepler (hafta dışındakiler de); yeni gelen talep başka haftadaysa da haber ver
  const seenPending = useRef<Set<string> | null>(null)
  const wsRef = useRef(ws); wsRef.current = ws
  useEffect(() => {
    seenPending.current = null
    return watchPending(biz.id, (list) => {
      const seen = seenPending.current
      if (seen) for (const b of list) {
        const k = dayKeyOf(b.starts_at, tz)
        const outsideWeek = k < wsRef.current || k > addDays(wsRef.current, 6) // hafta içindekileri haftalık izleyici bildiriyor
        if (!seen.has(b.id) && b.source === 'customer' && outsideWeek) notify(`Yeni randevu talebi: ${b.customer_name} · ${fmtDateTime(b.starts_at, tz)}`, b.id)
      }
      seenPending.current = new Set(list.map((b) => b.id))
      setPending(list)
    })
  }, [biz.id, tz]) // eslint-disable-line react-hooks/exhaustive-deps

  function notify(msg: string, tag: string) {
    toast(msg, 'info'); beep(); navigator.vibrate?.(200)
    if (document.visibilityState === 'hidden' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(biz.name, { body: msg, icon: '/icon-192.png', tag })
    }
  }

  const items = useMemo(() => weekItems?.filter((b) => dayKeyOf(b.starts_at, tz) === day) ?? null, [weekItems, day, tz])
  const weekCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const b of weekItems ?? []) if (b.active) { const k = dayKeyOf(b.starts_at, tz); c[k] = (c[k] ?? 0) + 1 }
    return c
  }, [weekItems, tz])

  const shown = useMemo(() => (items ?? []).filter((b) =>
    (!resFilter || b.resource_id === resFilter) && (showCancelled || !['cancelled', 'rejected'].includes(b.status))), [items, resFilter, showCancelled])
  const cancelledCount = (items ?? []).filter((b) => ['cancelled', 'rejected'].includes(b.status)).length
  const nowIso = new Date().toISOString()
  const resName = (id: string) => resources.find((r) => r.id === id)?.name

  return (
    <div className="page">
      {pending.length ? (
        <section className="card card-warning">
          <div className="card-title">Onay bekleyen {pending.length} talep</div>
          <div className="list">
            {pending.map((b) => (
              <button key={b.id} className="list-row" onClick={() => setOpen(b)}>
                <span><strong>{b.customer?.name}</strong><span className="muted small"> · {b.service_name}</span></span>
                <span className="small">{fmtDateTime(b.starts_at, tz)}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="week-head">
        <button className="icon-btn" onClick={() => setDay(addDays(day, -7))} aria-label="Önceki hafta">‹</button>
        <div className="week-days">
          {Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((d) => (
            <button key={d} className={`wday ${d === day ? 'wday-active' : ''} ${d === todayKey(tz) ? 'wday-today' : ''}`} onClick={() => setDay(d)}>
              <span className="small">{fmtDay(d, { weekday: 'short' })}</span>
              <strong>{fmtDay(d, { day: 'numeric' })}</strong>
              <span className="wday-count">{weekCounts[d] ? weekCounts[d] : ''}</span>
            </button>
          ))}
        </div>
        <button className="icon-btn" onClick={() => setDay(addDays(day, 7))} aria-label="Sonraki hafta">›</button>
      </div>

      <div className="row-between">
        <h2 className="day-title">{relativeDay(day, tz)}, {fmtDay(day, { day: 'numeric', month: 'long' })}</h2>
        <div className="row-gap">
          {day !== todayKey(tz) ? <button className="link small" onClick={() => setDay(todayKey(tz))}>Bugün</button> : null}
          <button className="link small no-print" onClick={() => window.print()}>Yazdır</button>
        </div>
      </div>

      {resources.length > 1 ? (
        <div className="chips no-print">
          <Chip active={!resFilter} onClick={() => setResFilter('')}>Tümü</Chip>
          {resources.map((r) => <Chip key={r.id} active={resFilter === r.id} onClick={() => setResFilter(r.id)}>{r.name}</Chip>)}
        </div>
      ) : null}

      {items === null ? <Spinner /> : shown.length === 0 ? (
        <Empty title="Bu gün randevu yok">Telefonla arayan biri mi var? “+ Randevu” ile ekleyin.</Empty>
      ) : (
        <div className="timeline">
          {shown.map((b) => {
            const isPast = b.ends_at < nowIso
            const isNow = b.starts_at <= nowIso && b.ends_at > nowIso
            return (
              <button key={b.id} className={`tl-item tl-${b.status} ${isPast ? 'tl-past' : ''} ${isNow ? 'tl-now' : ''}`} onClick={() => setOpen(b)}>
                <span className="tl-time"><strong>{fmtTime(b.starts_at, tz)}</strong><span className="muted small">{fmtTime(b.ends_at, tz)}</span></span>
                <span className="tl-body">
                  <span className="strong">{b.customer?.name}{b.source === 'staff' ? <span className="muted small"> · elle</span> : null}</span>
                  <span className="muted small">{b.service_name}{resources.length > 1 ? ` · ${resName(b.resource_id)}` : ''}</span>
                  {b.customer_note ? <span className="small">“{b.customer_note}”</span> : null}
                </span>
                <StatusBadge status={b.status} />
              </button>
            )
          })}
        </div>
      )}
      {cancelledCount ? <button className="link small no-print" onClick={() => setShowCancelled(!showCancelled)}>{showCancelled ? 'İptalleri gizle' : `${cancelledCount} iptal/ret göster`}</button> : null}

      {!notifOk && typeof Notification !== 'undefined' ? (
        <p className="muted small no-print">
          Panel açıkken yeni talepler sesli bildirilir. <button className="link" onClick={() => Notification.requestPermission().then((p) => setNotifOk(p === 'granted'))}>Arka planda da bildir</button>
        </p>
      ) : null}

      <Button className="fab no-print" onClick={() => setAdding(true)}>+ Randevu</Button>

      <BookingSheet booking={open} onClose={() => setOpen(null)} onChanged={() => {}} />
      <NewBookingSheet open={adding} day={day >= todayKey(tz) ? day : todayKey(tz)} onClose={() => setAdding(false)} onCreated={() => {}} />
    </div>
  )
}
