import { useNavigate, useSearchParams } from 'react-router-dom'
import { PhoneLogin } from '../components/PhoneLogin'

export default function Login() {
  const [q] = useSearchParams()
  const nav = useNavigate()
  const next = q.get('next') || '/panel'
  return (
    <div className="page narrow">
      <h1>Giriş</h1>
      <div className="card"><PhoneLogin onDone={() => nav(next, { replace: true })} intro="Şifre yok: numaranıza gelen kodla girersiniz." /></div>
    </div>
  )
}
