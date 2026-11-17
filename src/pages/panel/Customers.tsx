import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Booking, Customer } from '../../lib/types'
import { fmtDateTime } from '../../lib/time'
import { errText } from '../../lib/errors'
import { displayPhone, telHref, waHref } from '../../lib/phone'
import { Button, Empty, Field, Sheet, Spinner, Toggle, useToast } from '../../components/ui'
import { StatusBadge } from '../../components/StatusBadge'
import { usePanel } from './context'
import { NewBookingSheet } from './NewBookingSheet'
import { todayKey } from '../../lib/time'

export default function Customers() {
  const { biz } = usePanel()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [list, setList] = useState<Customer[] | null>(null)
  const [sel, setSel] = useState<Customer | null>(null)
  const [history, setHistory] = useState<Booking[]>([])
  const [draft, setDraft] = useState({ name: '', phone: '', note: '', is_blocked: false })
  const [busy, setBusy] = useState(false)
  const [booking, setBooking] = useState<Customer | null>(null)

  const load = useCallback(async () => {
    let req = supabase.from('customers').select('*').eq('business_id', biz.id).order('created_at', { ascending: false }).limit(100)
    const term = q.trim().replace(/[%,()]/g, '')
    if (term) {
      const digits = term.replace(/\D/g, '')
      req = digits.length >= 3 ? req.ilike('phone', `%${digits.replace(/^0/, '')}%`) : req.ilike('name', `%${term}%`)
    }
    const { data } = await req
    setList((data ?? []) as Customer[])
  }, [biz.id, q])

  useEffect(() => { const t = setTimeout(() => void load(), 250); return () => clearTimeout(t) }, [load])

  async function openCustomer(c: Customer) {
    setSel(c)
    setDraft({ name: c.name, phone: c.phone ?? '', note: c.note ?? '', is_blocked: c.is_blocked })
    const { data } = await supabase.from('bookings').select('*').eq('customer_id', c.id).order('starts_at', { ascending: false }).limit(50)
    setHistory((data ?? []) as Booking[])
  }

  async function save() {
    if (!sel) return
    setBusy(true)
    const { error } = await supabase.from('customers').update({
      name: draft.name.trim(), note: draft.note.trim() || null, is_blocked: draft.is_blocked,
      ...(sel.user_id ? {} : { phone: draft.phone.trim() || null }),
    }).eq('id', sel.id)
    setBusy(false)
    if (error) { toast(errText(error), 'error'); return }
    toast('Kaydedildi', 'success'); setSel(null); void load()
  }

  const stats = (s: string) => history.filter((h) => h.status === s).length

  return (
    <div className="page">
      <h1>Müşteriler</h1>
      <input className="input" placeholder="Ad ya da numara ile ara" value={q} onChange={(e) => setQ(e.target.value)} />
      {list === null ? <Spinner /> : list.length === 0 ? <Empty title="Müşteri yok">İlk randevu alındığında müşteriler burada listelenir.</Empty> : (
        <div className="list top-gap">
          {list.map((c) => (
            <button key={c.id} className="list-row" onClick={() => void openCustomer(c)}>
              <span><strong>{c.name}</strong>{c.is_blocked ? <span className="badge badge-rejected"> engelli</span> : null}</span>
              <span className="muted small">{displayPhone(c.phone)}</span>
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel?.name ?? ''} footer={<Button loading={busy} onClick={() => void save()}>Kaydet</Button>}>
        {sel ? (
          <div className="stack">
            {sel.phone ? (
              <div className="actions">
                <a className="btn btn-secondary" href={telHref(sel.phone)}>Ara</a>
                <a className="btn btn-wa" href={waHref(sel.phone)} target="_blank" rel="noreferrer">WhatsApp</a>
                <Button variant="ghost" onClick={() => { setBooking(sel); setSel(null) }}>+ Randevu</Button>
              </div>
            ) : null}
            <div className="stats-row">
              <span><strong>{stats('completed')}</strong> geldi</span>
              <span><strong>{stats('no_show')}</strong> gelmedi</span>
              <span><strong>{history.filter((h) => h.status === 'cancelled' && h.cancelled_by === 'customer').length}</strong> iptal</span>
            </div>
            <Field label="Ad"><input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="Telefon" hint={sel.user_id ? 'Müşteri bu numarayı SMS ile doğruladı; değiştirilemez.' : undefined}>
              <input className="input" value={sel.user_id ? displayPhone(draft.phone) : draft.phone} disabled={!!sel.user_id} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            </Field>
            <Field label="Not (sadece ekip görür)"><textarea className="input" rows={2} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></Field>
            <Toggle checked={draft.is_blocked} onChange={(v) => setDraft({ ...draft, is_blocked: v })} label="Engelle" hint="Bu numara çevrim içi randevu alamaz." />
            {history.length ? <>
              <div className="card-title">Geçmiş</div>
              <div className="list">
                {history.map((h) => <div key={h.id} className="list-row"><span className="small">{fmtDateTime(h.starts_at, biz.timezone)} · {h.service_name}</span><StatusBadge status={h.status} /></div>)}
              </div>
            </> : null}
          </div>
        ) : null}
      </Sheet>
      <NewBookingSheet open={!!booking} presetCustomer={booking} day={todayKey(biz.timezone)} onClose={() => setBooking(null)} onCreated={() => {}} />
    </div>
  )
}
