import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Customer } from '../../lib/types'
import { errText } from '../../lib/errors'
import { displayPhone, normalizePhone } from '../../lib/phone'
import { minutesLabel } from '../../lib/time'
import { Button, Chip, Field, Notice, Sheet, useToast } from '../../components/ui'
import { usePanel } from './context'
import { SlotPicker } from './SlotPicker'

/** Telefonla arayan ya da kapıdan gelen müşteri için hızlı randevu girişi */
export function NewBookingSheet({ open, day, presetCustomer, onClose, onCreated }: {
  open: boolean; day: string; presetCustomer?: Customer | null; onClose: () => void; onCreated: () => void
}) {
  const { biz, services, resources, links, myResourceId } = usePanel()
  const toast = useToast()
  const activeServices = services.filter((s) => s.is_active)
  const [serviceId, setServiceId] = useState('')
  const [resourceId, setResourceId] = useState('')
  const [d, setD] = useState(day)
  const [at, setAt] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Customer[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setD(day); setAt(null); setError(null); setNote('')
    setServiceId((s) => s || activeServices[0]?.id || '')
    setCustomer(presetCustomer ?? null); setQ(''); setName(''); setPhone('')
  }, [open, day, presetCustomer]) // eslint-disable-line react-hooks/exhaustive-deps

  const eligible = (() => {
    const ids = links.filter((l) => l.service_id === serviceId).map((l) => l.resource_id)
    return resources.filter((r) => r.is_active && (!ids.length || ids.includes(r.id)))
  })()
  useEffect(() => {
    if (!eligible.some((r) => r.id === resourceId)) setResourceId(eligible.find((r) => r.id === myResourceId)?.id ?? eligible[0]?.id ?? '')
  }, [eligible, resourceId, myResourceId])

  // Müşteri arama (ad ya da numara)
  useEffect(() => {
    if (!open || customer || q.trim().length < 2) { setFound([]); return }
    const t = setTimeout(async () => {
      const term = q.trim().replace(/[%,()]/g, '')
      const digits = term.replace(/\D/g, '')
      let req = supabase.from('customers').select('*').eq('business_id', biz.id).limit(6)
      req = digits.length >= 3 ? req.ilike('phone', `%${digits.replace(/^0/, '')}%`) : req.ilike('name', `%${term}%`)
      const { data } = await req
      setFound((data ?? []) as Customer[])
    }, 250)
    return () => clearTimeout(t)
  }, [q, open, customer, biz.id])

  async function save() {
    setError(null)
    if (!serviceId || !resourceId) return setError('Hizmet seçin.')
    if (!at) return setError('Saat seçin.')
    if (!customer) {
      if (name.trim().length < 2) return setError('Müşterinin adını yazın.')
      if (phone && !normalizePhone(phone)) return setError('Telefon numarası geçersiz.')
    }
    setBusy(true)
    const { error } = await supabase.rpc('staff_create_booking', {
      p_business: biz.id, p_service: serviceId, p_resource: resourceId, p_starts_at: at,
      p_customer_id: customer?.id ?? null, p_name: customer ? null : name.trim(), p_phone: customer ? null : (phone || null), p_note: note || null,
    })
    setBusy(false)
    if (error) { setError(errText(error)); return }
    toast('Randevu eklendi', 'success')
    onCreated(); onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Randevu ekle" footer={<Button loading={busy} onClick={() => void save()}>Kaydet</Button>}>
      <div className="stack">
        {customer ? (
          <div className="row-between card-flat">
            <span><strong>{customer.name}</strong> <span className="muted small">{displayPhone(customer.phone)}</span></span>
            <button className="link" onClick={() => setCustomer(null)}>Değiştir</button>
          </div>
        ) : (
          <>
            <Field label="Müşteri" hint="Kayıtlı müşteriyi ad ya da numarayla arayın; yoksa aşağıya yazın.">
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara…" />
            </Field>
            {found.length ? (
              <div className="list">
                {found.map((c) => <button key={c.id} className="list-row" onClick={() => setCustomer(c)}><span>{c.name}</span><span className="muted small">{displayPhone(c.phone)}</span></button>)}
              </div>
            ) : null}
            <div className="grid-2">
              <Field label="Ad soyad"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Telefon"><input className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            </div>
            <p className="muted small">Bu kişi sonra aynı numarayla giriş yaparsa randevuyu kendi telefonundan da görür.</p>
          </>
        )}

        {activeServices.length > 1 ? (
          <div className="chips">{activeServices.map((s) => <Chip key={s.id} active={serviceId === s.id} onClick={() => { setServiceId(s.id); setAt(null) }}>{s.name} · {minutesLabel(s.duration_min)}</Chip>)}</div>
        ) : null}
        {eligible.length > 1 ? (
          <div className="chips">{eligible.map((r) => <Chip key={r.id} active={resourceId === r.id} onClick={() => { setResourceId(r.id); setAt(null) }}>{r.name}</Chip>)}</div>
        ) : null}
        <Field label="Gün"><input className="input" type="date" value={d} onChange={(e) => { setD(e.target.value); setAt(null) }} /></Field>
        {serviceId && resourceId && d ? <SlotPicker biz={biz} serviceId={serviceId} resourceId={resourceId} day={d} value={at} onChange={setAt} /> : null}
        <Field label="Not (sadece ekip görür)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
        {error ? <Notice kind="danger">{error}</Notice> : null}
      </div>
    </Sheet>
  )
}
