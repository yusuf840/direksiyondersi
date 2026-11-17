import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { acceptInvite, invitePreview } from '../lib/api'
import { useAuth } from '../lib/auth'
import { errText } from '../lib/errors'
import { save } from '../lib/storage'
import { Button, Empty, Notice, Spinner } from '../components/ui'
import { OwnerLogin } from '../components/OwnerLogin'

/** Ekip daveti: /katil/:kod */
export default function Join() {
  const { code = '' } = useParams()
  const { isRealUser } = useAuth()
  const nav = useNavigate()
  const [info, setInfo] = useState<{ business_name: string; resource_name: string | null; valid: boolean } | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { invitePreview(code).then((d) => setInfo(d ?? null), () => setInfo(null)) }, [code])

  if (info === undefined) return <Spinner />
  if (!info || !info.valid) return <div className="page narrow"><Empty title="Davet geçersiz">Bağlantının süresi dolmuş ya da kullanılmış olabilir. İşletme sahibinden yeni bir davet isteyin.</Empty></div>

  async function accept() {
    setBusy(true); setError(null)
    try {
      const r = await acceptInvite(code)
      save('panelBusiness', r.businessId)
    } catch (e) { setBusy(false); setError(errText(e)); return }
    setBusy(false)
    nav('/panel', { replace: true })
  }

  return (
    <div className="page narrow">
      <h1>{info.business_name}</h1>
      <p className="lead">Ekibe katılmaya davet edildiniz{info.resource_name ? ` (${info.resource_name})` : ''}.</p>
      <div className="card">
        {!isRealUser ? <OwnerLogin intro="Ekibe katılmak için Google hesabınızla girin." /> : (
          <div className="stack">
            {error ? <Notice kind="danger">{error}</Notice> : null}
            <Button loading={busy} onClick={() => void accept()}>Ekibe katıl</Button>
          </div>
        )}
      </div>
    </div>
  )
}
