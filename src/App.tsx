import { lazy, Suspense } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { APP_NAME, isConfigured } from './lib/supabase'
import { Spinner, ThemeToggle, ToastProvider } from './components/ui'
import Home from './pages/Home'
import Book from './pages/Book'

// Panel ve nadiren açılan sayfalar ayrı yüklenir: müşteri sayfası hızlı açılsın
const MyBookings = lazy(() => import('./pages/MyBookings'))
const Login = lazy(() => import('./pages/Login'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Join = lazy(() => import('./pages/Join'))
const Kvkk = lazy(() => import('./pages/Kvkk'))
const PanelLayout = lazy(() => import('./pages/panel/PanelLayout'))
const Agenda = lazy(() => import('./pages/panel/Agenda'))
const Customers = lazy(() => import('./pages/panel/Customers'))
const Settings = lazy(() => import('./pages/panel/Settings'))
const Share = lazy(() => import('./pages/panel/Share'))

function TopBar() {
  const { session } = useAuth()
  const loc = useLocation()
  const inPanel = loc.pathname.startsWith('/panel')
  return (
    <header className="topbar no-print">
      <Link to="/" className="brand"><img src="/icon.svg" alt="" width={26} height={26} />{APP_NAME}</Link>
      <nav className="row-gap">
        {!inPanel ? <Link className="link small" to="/randevularim">Randevularım</Link> : null}
        {session && !inPanel ? <Link className="link small" to="/panel">Panel</Link> : null}
        <ThemeToggle />
      </nav>
    </header>
  )
}

function NotConfigured() {
  return (
    <div className="page narrow prose">
      <h1>Kurulum gerekli</h1>
      <p><code>VITE_SUPABASE_URL</code> ve <code>VITE_SUPABASE_ANON_KEY</code> ortam değişkenleri tanımlı değil.</p>
      <p>README dosyasındaki “Kurulum” adımlarını izleyin (Supabase projesi + Vercel ortam değişkenleri).</p>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <TopBar />
          {!isConfigured ? <NotConfigured /> : (
            <Suspense fallback={<Spinner />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/giris" element={<Login />} />
                <Route path="/yeni" element={<Onboarding />} />
                <Route path="/randevularim" element={<MyBookings />} />
                <Route path="/katil/:code" element={<Join />} />
                <Route path="/kvkk" element={<Kvkk />} />
                <Route path="/panel" element={<PanelLayout />}>
                  <Route index element={<Agenda />} />
                  <Route path="musteriler" element={<Customers />} />
                  <Route path="ayarlar" element={<Settings />} />
                  <Route path="paylas" element={<Share />} />
                </Route>
                <Route path="/:slug" element={<Book />} />
              </Routes>
            </Suspense>
          )}
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
