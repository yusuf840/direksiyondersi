import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errText } from '../lib/errors'
import { save } from '../lib/storage'
import { Button, Empty, Notice, Spinner } from '../components/ui'
import { PhoneLogin } from '../components/PhoneLogin'

/** Ekip daveti: /katil/:kod */
export default function Join() {
  const { code = '' } = useParams()
  const { session, profile } = useAuth()
  const nav = useNavigate()
  const [info, setInfo] = useState<{ business_name: string; resource_name: string | null; valid: boolean } | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { supabase.rpc('invite_preview', { p_code: code }).then(({ data }) => setInfo(data ?? null)) }, [code])

  if (info === undefined) return <Spinner />
  if (!info || !info.valid) return <div className="page narrow"><Empty title="Davet geçersiz">Bağlantının süresi dolmuş ya da kullanılmış olabilir. İşletme sahibinden yeni bir davet isteyin.</Empty></div>

  async function accept() {
    setBusy(true); setError(null)
    const { data, error } = await supabase.rpc('accept_invite', { p_code: code })
    setBusy(false)
    if (error) { setError(errText(error)); return }
    save('panelBusiness', data)
    nav('/panel', { replace: true })
  }

  return (
    <div className="page narrow">
      <h1>{info.business_name}</h1>
      <p className="lead">Ekibe katılmaya davet edildiniz{info.resource_name ? ` (${info.resource_name})` : ''}.</p>
      <div className="card">
        {!session || !profile?.full_name ? <PhoneLogin onDone={() => {}} /> : (
          <div className="stack">
            {error ? <Notice kind="danger">{error}</Notice> : null}
            <Button loading={busy} onClick={() => void accept()}>Ekibe katıl</Button>
          </div>
        )}
      </div>
    </div>
  )
}
