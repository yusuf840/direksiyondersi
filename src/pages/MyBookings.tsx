import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { cancelMyBooking, forgetMe, myBookings } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { MyBooking } from '../lib/types'
import { fmtDateTime, minutesLabel } from '../lib/time'
import { errText } from '../lib/errors'
import { displayPhone, telHref, waHref } from '../lib/phone'
import { downloadIcs } from '../lib/ics'
import { recentPlaces } from '../lib/storage'
import { Button, Empty, Sheet, Spinner, useToast } from '../components/ui'
import { StatusBadge } from '../components/StatusBadge'
import { PhoneLogin } from '../components/PhoneLogin'

export default function MyBookings() {
  const { session, profile, loading, signOut } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [items, setItems] = useState<MyBooking[] | null>(null)
  const [cancelling, setCancelling] = useState<MyBooking | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [forget, setForget] = useState(false)

  const refresh = useCallback(async () => {
    if (!session) return
    try { setItems(await myBookings()) } catch (e) { toast(errText(e), 'error'); setItems([]) }
  }, [session, toast])

  useEffect(() => { void refresh() }, [refresh])
  // Onay durumu değişmiş olabilir: uygulamaya dönünce yenile
  useEffect(() => {
    const f = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', f)
    const t = setInterval(() => void refresh(), 60_000)
    return () => { document.removeEventListener('visibilitychange', f); clearInterval(t) }
  }, [refresh])

  if (loading) return <Spinner />
  if (!session || !profile?.full_name) return (
    <div className="page narrow">
      <h1>Randevularım</h1>
      <div className="card"><PhoneLogin onDone={() => void refresh()} intro="Randevularınızı görmek için telefon numaranızla giriş yapın." /></div>
    </div>
  )

  const now = new Date()
  const upcoming = (items ?? []).filter((b) => new Date(b.ends_at) > now && ['pending', 'confirmed'].includes(b.status)).reverse()
  const past = (items ?? []).filter((b) => !upcoming.includes(b))
  const places = recentPlaces()

  async function doCancel() {
    if (!cancelling) return
    setBusy(true)
    try { await cancelMyBooking(cancelling.business_id, cancelling.id, reason || undefined) } catch (e) { setBusy(false); toast(errText(e), 'error'); return }
    setBusy(false)
    toast('Randevu iptal edildi.', 'success')
    setCancelling(null); setReason('')
    void refresh()
  }

  function canCancel(b: MyBooking) {
    if (b.status === 'pending') return true
    return new Date(b.starts_at).getTime() - Date.now() >= b.cancel_until_min * 60_000
  }

  return (
    <div className="page narrow">
      <div className="row-between">
        <h1>Randevularım</h1>
      </div>
      <p className="muted small">{profile.full_name} · {displayPhone(profile.phone)}</p>

      {items === null ? <Spinner /> : <>
        <h2 className="section-title">Yaklaşan</h2>
        {upcoming.length === 0 ? (
          <Empty title="Yaklaşan randevunuz yok">
            {places.length ? <div className="chips">{places.slice(0, 4).map((p) => <Link key={p.slug} className="chip" to={`/${p.slug}`}>{p.name}</Link>)}</div> : null}
          </Empty>
        ) : upcoming.map((b) => (
          <article key={b.id} className="card booking-card">
            <div className="row-between">
              <Link to={`/${b.business_slug}`} className="strong">{b.business_name}</Link>
              <StatusBadge status={b.status} />
            </div>
            <div className="booking-when">{fmtDateTime(b.starts_at, b.timezone)}</div>
            <div className="muted small">{b.service_name} · {b.resource_label}: {b.resource_name}</div>
            {b.business_address ? <div className="muted small">📍 {b.business_address}</div> : null}
            <div className="actions">
              <Button variant="secondary" onClick={() => downloadIcs({ id: b.id, title: `${b.business_name} – ${b.service_name}`, startsAt: b.starts_at, endsAt: b.ends_at, location: b.business_address })}>Takvime ekle</Button>
              {b.business_phone ? <a className="btn btn-ghost" href={telHref(b.business_phone)}>Ara</a> : null}
              {b.business_phone ? <a className="btn btn-ghost" href={waHref(b.business_phone)} target="_blank" rel="noreferrer">WhatsApp</a> : null}
              {canCancel(b)
                ? <Button variant="danger" onClick={() => setCancelling(b)}>İptal et</Button>
                : <span className="muted small">İptal için işletmeyi arayın ({minutesLabel(b.cancel_until_min)} kuralı)</span>}
            </div>
          </article>
        ))}

        {past.length ? <>
          <h2 className="section-title">Geçmiş</h2>
          <div className="list">
            {past.map((b) => (
              <div key={b.id} className="list-row">
                <div>
                  <div className="strong">{b.business_name}</div>
                  <div className="muted small">{fmtDateTime(b.starts_at, b.timezone)} · {b.service_name}</div>
                </div>
                <StatusBadge status={b.status} />
              </div>
            ))}
          </div>
        </> : null}
      </>}

      <div className="stack top-gap">
        <Button variant="ghost" onClick={() => void signOut().then(() => nav('/'))}>Çıkış yap</Button>
        <button className="link danger center" onClick={() => setForget(true)}>Verilerimi sil</button>
      </div>

      <Sheet open={!!cancelling} onClose={() => setCancelling(null)} title="Randevuyu iptal et"
        footer={<Button variant="danger" loading={busy} onClick={() => void doCancel()}>İptal et</Button>}>
        {cancelling ? <p>{cancelling.business_name} · {fmtDateTime(cancelling.starts_at, cancelling.timezone)}</p> : null}
        <label className="field"><span className="field-label">Sebep (isteğe bağlı)</span>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></label>
      </Sheet>

      <Sheet open={forget} onClose={() => setForget(false)} title="Verilerimi sil"
        footer={<Button variant="danger" loading={busy} onClick={async () => {
          setBusy(true)
          try { await forgetMe() } catch (e) { setBusy(false); toast(errText(e), 'error'); return }
          setBusy(false)
          await signOut(); toast('Verileriniz silindi.', 'success'); nav('/')
        }}>Evet, sil</Button>}>
        <p>Gelecekteki randevularınız iptal edilir, işletmelerdeki adınız ve numaranız silinir. Bu işlem geri alınamaz.</p>
      </Sheet>
    </div>
  )
}
