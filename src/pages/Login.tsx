import { useNavigate, useSearchParams } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { OwnerLogin } from '../components/OwnerLogin'

export default function Login() {
  const [q] = useSearchParams()
  const nav = useNavigate()
  const next = q.get('next') || '/panel'
  const { isRealUser } = useAuth()
  useEffect(() => { if (isRealUser) nav(next, { replace: true }) }, [isRealUser, next, nav])
  return (
    <div className="page narrow">
      <h1>İşletme girişi</h1>
      <div className="card"><OwnerLogin intro="İşletme sahibi ve ekip, Google hesabıyla girer. Şifre yok. (Randevu almak için giriş gerekmez.)" /></div>
    </div>
  )
}
