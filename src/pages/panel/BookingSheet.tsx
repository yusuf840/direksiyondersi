import { useState } from 'react'
import { staffUpdateBooking } from '../../lib/api'
import type { Booking, BookingStatus } from '../../lib/types'
import { dayKeyOf, fmtDateTime, fmtTime } from '../../lib/time'
import { errText } from '../../lib/errors'
import { displayPhone, telHref, waHref } from '../../lib/phone'
import { template, TEMPLATE_LABELS, type TemplateKind } from '../../lib/messages'
import { Button, Chip, Notice, Sheet, useToast } from '../../components/ui'
import { StatusBadge } from '../../components/StatusBadge'
import { usePanel } from './context'
import { SlotPicker } from './SlotPicker'

export function BookingSheet({ booking, onClose, onChanged }: { booking: Booking | null; onClose: () => void; onChanged: () => void }) {
  const { biz, resources } = usePanel()
  const toast = useToast()
  const [mode, setMode] = useState<'view' | 'move' | 'wa'>('view')
  const [busy, setBusy] = useState<string | null>(null)
  const [moveDay, setMoveDay] = useState('')
  const [moveRes, setMoveRes] = useState('')
  const [moveAt, setMoveAt] = useState<string | null>(null)
  const [waText, setWaText] = useState('')
  const [reason, setReason] = useState('')

  if (!booking) return null
  const b = booking
  const tz = biz.timezone
  const name = b.customer?.name ?? 'Müşteri'
  const phone = b.customer?.phone ?? null
  const link = `${location.origin}/${biz.slug}`

  function close() { setMode('view'); setMoveAt(null); setReason(''); onClose() }

  async function update(args: { status?: BookingStatus; startsAt?: string; resourceId?: string; reason?: string }, label: string, then?: TemplateKind) {
    setBusy(label)
    try { await staffUpdateBooking({ businessId: biz.id, bookingId: b.id, ...args }) } catch (e) { setBusy(null); toast(errText(e), 'error'); return }
    setBusy(null)
    toast(label, 'success')
    onChanged()
    if (then && phone) {
      setWaText(template(then, { customer: name, business: biz.name, service: b.service_name, startsAt: args.startsAt ?? b.starts_at, tz, address: biz.address, link }))
      setMode('wa')
    } else close()
  }

  function openWa(kind: TemplateKind) {
    setWaText(template(kind, { customer: name, business: biz.name, service: b.service_name, startsAt: b.starts_at, tz, address: biz.address, link }))
    setMode('wa')
  }

  const active = b.status === 'pending' || b.status === 'confirmed'
  const past = new Date(b.starts_at) < new Date()

  return (
    <Sheet open onClose={close} title={mode === 'move' ? 'Saati değiştir' : mode === 'wa' ? 'WhatsApp mesajı' : name}>
      {mode === 'view' ? (
        <div className="stack">
          <div className="row-between"><span className="booking-when">{fmtDateTime(b.starts_at, tz)} – {fmtTime(b.ends_at, tz)}</span><StatusBadge status={b.status} /></div>
          <dl className="summary">
            <dt>Hizmet</dt><dd>{b.service_name}</dd>
            {resources.length > 1 ? <><dt>{biz.resource_label}</dt><dd>{resources.find((r) => r.id === b.resource_id)?.name}</dd></> : null}
            <dt>Telefon</dt><dd>{phone ? displayPhone(phone) : '—'} {b.customer?.user_id ? <span className="badge badge-confirmed">doğrulanmış</span> : <span className="badge">elle eklendi</span>}</dd>
            {b.customer_note ? <><dt>Müşteri notu</dt><dd>{b.customer_note}</dd></> : null}
            {b.cancel_reason ? <><dt>İptal sebebi</dt><dd>{b.cancel_reason} ({b.cancelled_by === 'customer' ? 'müşteri' : 'işletme'})</dd></> : null}
          </dl>
          {b.customer?.is_blocked ? <Notice kind="danger">Bu müşteri engellenmiş.</Notice> : null}

          {phone ? (
            <div className="actions">
              <a className="btn btn-secondary" href={telHref(phone)}>Ara</a>
              <Button variant="wa" onClick={() => openWa(b.status === 'pending' ? 'onay' : 'hatirlatma')}>WhatsApp</Button>
            </div>
          ) : null}

          {b.status === 'pending' ? (
            <div className="actions">
              <Button variant="success" loading={busy === 'Onaylandı'} onClick={() => void update({ status: 'confirmed' }, 'Onaylandı', 'onay')}>Onayla</Button>
              <Button variant="danger" loading={busy === 'Reddedildi'} onClick={() => void update({ status: 'rejected', reason: reason }, 'Reddedildi')}>Reddet</Button>
            </div>
          ) : null}

          {active && past ? (
            <div className="actions">
              <Button variant="success" loading={busy === 'Geldi'} onClick={() => void update({ status: 'completed' }, 'Geldi')}>Geldi</Button>
              <Button variant="secondary" loading={busy === 'Gelmedi'} onClick={() => void update({ status: 'no_show' }, 'Gelmedi')}>Gelmedi</Button>
            </div>
          ) : null}

          {active ? (
            <div className="actions">
              <Button variant="secondary" onClick={() => { setMoveDay(dayKeyOf(b.starts_at, tz)); setMoveRes(b.resource_id); setMoveAt(null); setMode('move') }}>Saati değiştir</Button>
              <Button variant="ghost" className="danger" loading={busy === 'İptal edildi'} onClick={() => { if (confirm('Randevu iptal edilsin mi?')) void update({ status: 'cancelled', reason: reason }, 'İptal edildi', 'iptal') }}>İptal et</Button>
            </div>
          ) : null}
          {active ? <input className="input input-sm" placeholder="İptal / ret sebebi (isteğe bağlı)" value={reason} onChange={(e) => setReason(e.target.value)} /> : null}

          {!active && b.status !== 'completed' && !past ? (
            <Button variant="ghost" onClick={() => void update({ status: 'confirmed' }, 'Yeniden açıldı')}>Randevuyu geri al</Button>
          ) : null}
        </div>
      ) : null}

      {mode === 'move' ? (
        <div className="stack">
          <label className="field"><span className="field-label">Gün</span>
            <input className="input" type="date" value={moveDay} onChange={(e) => { setMoveDay(e.target.value); setMoveAt(null) }} /></label>
          {resources.length > 1 ? (
            <div className="chips">{resources.filter((r) => r.is_active).map((r) => <Chip key={r.id} active={moveRes === r.id} onClick={() => { setMoveRes(r.id); setMoveAt(null) }}>{r.name}</Chip>)}</div>
          ) : null}
          {b.service_id && moveDay ? <SlotPicker biz={biz} serviceId={b.service_id} resourceId={moveRes} day={moveDay} value={moveAt} onChange={setMoveAt} /> : null}
          <div className="actions">
            <Button variant="ghost" onClick={() => setMode('view')}>Vazgeç</Button>
            <Button disabled={!moveAt} loading={busy === 'Saat değişti'} onClick={() => void update({ startsAt: moveAt!, resourceId: moveRes }, 'Saat değişti', 'degisiklik')}>Kaydet</Button>
          </div>
        </div>
      ) : null}

      {mode === 'wa' && phone ? (
        <div className="stack">
          <div className="chips">{(Object.keys(TEMPLATE_LABELS) as TemplateKind[]).map((k) => <Chip key={k} onClick={() => openWa(k)}>{TEMPLATE_LABELS[k]}</Chip>)}</div>
          <textarea className="input" rows={9} value={waText} onChange={(e) => setWaText(e.target.value)} />
          <a className="btn btn-wa" href={waHref(phone, waText)} target="_blank" rel="noreferrer" onClick={() => setTimeout(close, 300)}>WhatsApp'ta aç</a>
          <button className="link center" onClick={close}>Mesaj göndermeden kapat</button>
        </div>
      ) : null}
    </Sheet>
  )
}
