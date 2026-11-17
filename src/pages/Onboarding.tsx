import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createBusiness, slugTaken } from '../lib/api'
import { useAuth } from '../lib/auth'
import { errText } from '../lib/errors'
import { save, slugify } from '../lib/storage'
import { isTrMobile, normalizePhone } from '../lib/phone'
import { Button, Chip, Field, Notice, Spinner } from '../components/ui'
import { PhoneLogin } from '../components/PhoneLogin'
import { HoursEditor, emptyWeek, validateWeek, weekToRows, type WeekHours } from '../components/HoursEditor'

const LABEL_IDEAS = ['Personel', 'Uzman', 'Eğitmen', 'Doktor', 'Usta', 'Saha', 'Masa', 'Oda', 'Araç']
const DURATION_IDEAS = [15, 20, 30, 45, 60, 90]

export default function Onboarding() {
  const { session, profile, loading } = useAuth()
  const nav = useNavigate()
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [slugState, setSlugState] = useState<'idle' | 'checking' | 'free' | 'taken'>('idle')
  const [phone, setPhone] = useState('')
  const [label, setLabel] = useState('')
  const [resource, setResource] = useState('')
  const [service, setService] = useState('')
  const [duration, setDuration] = useState<number | ''>('')
  const [week, setWeek] = useState<WeekHours>(emptyWeek)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (!slugTouched) setSlug(slugify(name)) }, [name, slugTouched])
  useEffect(() => { if (profile?.phone && !phone) setPhone('0' + profile.phone.replace('+90', '')) }, [profile, phone])
  useEffect(() => {
    if (slug.length < 3) { setSlugState('idle'); return }
    setSlugState('checking')
    const t = setTimeout(async () => {
      const taken = await slugTaken(slug).catch(() => false)
      setSlugState(taken ? 'taken' : 'free')
    }, 350)
    return () => clearTimeout(t)
  }, [slug])

  if (loading) return <Spinner />
  if (!session || !profile?.full_name) return (
    <div className="page narrow">
      <h1>İşletmenizi ekleyin</h1>
      <div className="card"><PhoneLogin onDone={() => {}} intro="Önce numaranızı doğrulayalım. Şifre yok; her girişte SMS kodu yeterli." /></div>
    </div>
  )

  function next() {
    setError(null)
    if (step === 1) {
      if (name.trim().length < 2) return setError('İşletme adını yazın.')
      if (!/^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$/.test(slug)) return setError('Bağlantı adı 3–40 karakter; küçük harf, rakam ve tire olabilir.')
      if (slugState === 'taken') return setError('Bu bağlantı adı alınmış.')
      if (phone && !normalizePhone(phone)) return setError('Telefon numarası geçersiz.')
    }
    if (step === 2) {
      if (!label.trim()) return setError('Bir kelime seçin ya da yazın.')
      if (resource.trim().length < 1) return setError(`İlk ${label.toLocaleLowerCase('tr-TR')} için bir ad yazın.`)
    }
    if (step === 3) {
      if (service.trim().length < 1) return setError('Hizmetin adını yazın.')
      if (!duration || duration < 5 || duration > 1440) return setError('Süre 5 ile 1440 dakika arasında olmalı.')
    }
    setStep(step + 1)
  }

  async function finish() {
    const v = validateWeek(week)
    if (v) { setError(v); return }
    setBusy(true); setError(null)
    try {
      const r = await createBusiness({
        name: name.trim(), slug, resourceLabel: label.trim(), resourceName: resource.trim(),
        serviceName: service.trim(), durationMin: Number(duration), hours: weekToRows(week),
        phone: phone ? normalizePhone(phone) : null,
      })
      save('panelBusiness', r.id)
    } catch (e) { setBusy(false); setError(errText(e)); return }
    setBusy(false)
    nav('/panel/paylas?yeni=1', { replace: true })
  }

  return (
    <div className="page narrow">
      <div className="progress" aria-label={`Adım ${step}/4`}><span style={{ width: `${step * 25}%` }} /></div>
      <h1>İşletmenizi ekleyin</h1>
      <p className="muted small">Adım {step} / 4 · Hepsini sonradan ayarlardan değiştirebilirsiniz.</p>

      <div className="card stack">
        {step === 1 ? <>
          <Field label="İşletme adı">
            <input className="input input-lg" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} />
          </Field>
          <Field label="Bağlantınız" hint={
            slugState === 'taken' ? <span className="danger">Bu ad alınmış</span>
              : slugState === 'free' ? <span className="ok">✓ Uygun — {location.host}/{slug}</span>
              : `${location.host}/${slug || '…'}`}>
            <div className="input-prefix"><span>{location.host}/</span>
              <input className="input" value={slug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)) }} /></div>
          </Field>
          <Field label="İşletme telefonu" hint="Müşterileriniz sayfanızdan sizi arayabilsin / WhatsApp'tan yazabilsin. İsteğe bağlı.">
            <input className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          {phone && !isTrMobile(phone) && normalizePhone(phone) ? <p className="muted small">Sabit hat girdiyseniz WhatsApp düğmesi çalışmayabilir.</p> : null}
        </> : null}

        {step === 2 ? <>
          <p>Randevuyu <strong>kim ya da ne</strong> karşılıyor? Aynı saatte iki ayrı randevu ancak iki ayrı kayıt varsa alınabilir.</p>
          <Field label="Bunlara ne diyorsunuz?">
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} placeholder="ör. Personel" />
          </Field>
          <div className="chips">{LABEL_IDEAS.map((l) => <Chip key={l} active={label === l} onClick={() => setLabel(l)}>{l}</Chip>)}</div>
          <Field label={`İlk ${(label || 'kayıt').toLocaleLowerCase('tr-TR')} adı`} hint="Diğerlerini sonra ekleyebilirsiniz.">
            <input className="input" value={resource} onChange={(e) => setResource(e.target.value)} maxLength={60} />
          </Field>
        </> : null}

        {step === 3 ? <>
          <p>Müşteri neye randevu alacak? İlk hizmeti ekleyin, diğerlerini sonra eklersiniz.</p>
          <Field label="Hizmet adı"><input className="input" value={service} onChange={(e) => setService(e.target.value)} maxLength={80} /></Field>
          <Field label="Süresi (dakika)">
            <input className="input" type="number" inputMode="numeric" min={5} max={1440} value={duration}
              onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : '')} />
          </Field>
          <div className="chips">{DURATION_IDEAS.map((d) => <Chip key={d} active={duration === d} onClick={() => setDuration(d)}>{d} dk</Chip>)}</div>
          <p className="muted small">Randevular arası mola, saat aralığı, fiyat gibi ayrıntıları Ayarlar → Hizmetler'den girebilirsiniz.</p>
        </> : null}

        {step === 4 ? <>
          <p><strong>{resource}</strong> hangi gün ve saatlerde randevu alabilir? Öğle arası gibi molalar için güne ikinci bir aralık ekleyin.</p>
          <HoursEditor value={week} onChange={(w) => { setWeek(w); setError(null) }} />
          <p className="muted small">Tatil, izin ve kapalı günleri kurulumdan sonra Ayarlar → Kapalı zamanlar'dan eklersiniz.</p>
        </> : null}

        {error ? <Notice kind="danger">{error}</Notice> : null}
        <div className="row-between">
          {step > 1 ? <Button variant="ghost" onClick={() => { setError(null); setStep(step - 1) }}>Geri</Button> : <span />}
          {step < 4 ? <Button onClick={next}>İleri</Button> : <Button loading={busy} onClick={() => void finish()}>Kurulumu bitir</Button>}
        </div>
      </div>
    </div>
  )
}
