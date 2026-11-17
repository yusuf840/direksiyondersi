import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errText } from '../lib/errors'
import { displayPhone, isTrMobile, normalizePhone } from '../lib/phone'
import { load, save } from '../lib/storage'
import { Button, Field, Notice } from './ui'

/**
 * Tek giriş yolu: telefon numarası + SMS kodu.
 * Şifre yok, e-posta yok. Aynı hesap hem müşteri hem işletme sahibi olabilir.
 * Adım 3 (ad) sadece ilk kez gelenlere sorulur.
 */
export function PhoneLogin({ onDone, intro }: { onDone: () => void; intro?: string }) {
  const { session, profile, refreshProfile } = useAuth()
  const [step, setStep] = useState<'phone' | 'code' | 'name'>(session ? 'name' : 'phone')
  const [phone, setPhone] = useState(() => load('lastPhone', ''))
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  // Oturum açık ve ad biliniyorsa doğrudan bitir
  useEffect(() => {
    if (session && profile?.full_name) onDone()
    else if (session && profile && !profile.full_name) setStep('name')
  }, [session, profile, onDone])

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn(resendIn - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  async function sendCode() {
    setError(null)
    if (!isTrMobile(phone)) { setError('05 ile başlayan 11 haneli cep numaranızı girin.'); return }
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({ phone: normalizePhone(phone)! })
    setBusy(false)
    if (error) { setError(errText(error)); return }
    save('lastPhone', phone)
    setStep('code'); setResendIn(60); setCode('')
    setTimeout(() => codeRef.current?.focus(), 50)
  }

  async function verify(token = code) {
    setError(null)
    if (token.length < 6) return
    setBusy(true)
    const { error } = await supabase.auth.verifyOtp({ phone: normalizePhone(phone)!, token, type: 'sms' })
    setBusy(false)
    if (error) { setError(errText(error)); setCode(''); return }
    // profil yüklenince useEffect ya bitirir ya da ad sorar
  }

  async function saveName() {
    setError(null)
    if (name.trim().length < 2) { setError('Adınızı ve soyadınızı yazın.'); return }
    setBusy(true)
    const { error } = await supabase.rpc('update_my_name', { p_name: name.trim() })
    setBusy(false)
    if (error) { setError(errText(error)); return }
    await refreshProfile()
    onDone()
  }

  if (step === 'phone') return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); void sendCode() }}>
      {intro ? <p className="muted">{intro}</p> : null}
      <Field label="Cep telefonunuz" hint="Numaranıza tek kullanımlık bir kod göndereceğiz." error={error}>
        <input className="input input-lg" type="tel" inputMode="tel" autoComplete="tel" placeholder="05XX XXX XX XX"
          value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
      </Field>
      <Button type="submit" loading={busy}>Kod gönder</Button>
    </form>
  )

  if (step === 'code') return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); void verify() }}>
      <p className="muted"><strong>{displayPhone(phone)}</strong> numarasına gelen 6 haneli kodu girin.</p>
      <Field label="SMS kodu" error={error}>
        <input ref={codeRef} className="input input-lg input-code" inputMode="numeric" autoComplete="one-time-code"
          maxLength={6} placeholder="••••••" value={code}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); if (v.length === 6) void verify(v) }} />
      </Field>
      <Button type="submit" loading={busy} disabled={code.length < 6}>Doğrula</Button>
      <div className="row-between">
        <button type="button" className="link" onClick={() => setStep('phone')}>Numarayı değiştir</button>
        <button type="button" className="link" disabled={resendIn > 0 || busy} onClick={() => void sendCode()}>
          {resendIn > 0 ? `Tekrar gönder (${resendIn})` : 'Tekrar gönder'}
        </button>
      </div>
    </form>
  )

  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); void saveName() }}>
      <Notice kind="success">Numaranız doğrulandı. Son olarak adınızı yazın; işletme sizi bu adla görecek.</Notice>
      <Field label="Ad soyad" error={error}>
        <input className="input input-lg" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} />
      </Field>
      <Button type="submit" loading={busy}>Devam</Button>
    </form>
  )
}
