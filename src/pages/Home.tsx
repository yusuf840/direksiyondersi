import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { APP_NAME } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { load, recentPlaces } from '../lib/storage'

export default function Home() {
  const nav = useNavigate()
  const { session } = useAuth()
  const places = recentPlaces()

  // Ana ekrandan açıldıysa en son kullanılan yere götür (işletme sayfası ya da panel)
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone
    const last = load<string | null>('lastPlace', null)
    if (standalone && last && !sessionStorage.getItem('homeVisited')) { sessionStorage.setItem('homeVisited', '1'); nav(last, { replace: true }) }
  }, [nav])

  return (
    <div className="page narrow">
      <section className="hero">
        <h1>{APP_NAME}</h1>
        <p className="lead">Telefonla aramadan, sıra beklemeden randevu. İşletme kurallarını koyar, müşteri boş saati seçer.</p>
      </section>

      {places.length ? (
        <section className="card">
          <div className="card-title">Son baktığınız işletmeler</div>
          <div className="list">
            {places.map((p) => <Link key={p.slug} className="list-row" to={`/${p.slug}`}><span className="strong">{p.name}</span><span aria-hidden>›</span></Link>)}
          </div>
        </section>
      ) : null}

      <div className="tiles">
        <Link className="tile" to="/randevularim"><strong>Randevularım</strong><span className="muted small">Aldığınız randevuları görün, iptal edin</span></Link>
        <Link className="tile" to={session ? '/panel' : '/giris?next=/panel'}><strong>İşletme paneli</strong><span className="muted small">Randevuları yönetin, saatlerinizi ayarlayın</span></Link>
        <Link className="tile tile-accent" to="/yeni"><strong>İşletmenizi ekleyin</strong><span className="small">2 dakikada kurulum, ücretsiz deneyin</span></Link>
      </div>

      <section className="how">
        <h2 className="section-title">Nasıl çalışır?</h2>
        <ol className="steps-list">
          <li><strong>İşletme</strong> hizmetlerini, çalışma saatlerini, aralarını ve kurallarını kendisi girer.</li>
          <li>Kendi bağlantısını ya da QR kodunu müşterilerine verir.</li>
          <li><strong>Müşteri</strong> boş saati seçer, telefonunu bir kez SMS ile doğrular, randevu hazır.</li>
          <li>Aynı saate iki kişi asla yazılamaz; değişiklikler herkesin ekranına anında düşer.</li>
        </ol>
      </section>
      <footer className="page-foot muted small"><Link to="/kvkk">Aydınlatma metni</Link></footer>
    </div>
  )
}
