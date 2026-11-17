import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { saveMyInfo } from '../lib/api'
import { errText } from '../lib/errors'
import { displayPhone, isTrMobile } from '../lib/phone'
import { Button, Field } from './ui'

/**
 * Müşteri bilgisi: hesap, şifre, e-posta yok. Ad ve telefon bu cihazda hatırlanır;
 * işletme sizi bu numaradan arar / WhatsApp'tan yazar.
 */
export function CustomerForm({ onDone, intro }: { onDone: () => void; intro?: string }) {
  const { profile, refreshProfile } = useAuth()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ? displayPhone(profile.phone) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    if (name.trim().length < 2) return setError('Adınızı ve soyadınızı yazın.')
    if (!isTrMobile(phone)) return setError('05 ile başlayan 11 haneli cep numaranızı girin.')
    setBusy(true)
    try { await saveMyInfo(name, phone); await refreshProfile() } catch (e) { setBusy(false); return setError(errText(e)) }
    setBusy(false)
    onDone()
  }

  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); void submit() }}>
      {intro ? <p className="muted">{intro}</p> : null}
      <Field label="Ad soyad">
        <input className="input input-lg" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
      </Field>
      <Field label="Cep telefonunuz" hint="İşletme randevunuzla ilgili size bu numaradan ulaşır.">
        <input className="input input-lg" type="tel" inputMode="tel" autoComplete="tel" placeholder="05XX XXX XX XX" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      {error ? <span className="field-error">{error}</span> : null}
      <Button type="submit" loading={busy}>Devam</Button>
    </form>
  )
}
