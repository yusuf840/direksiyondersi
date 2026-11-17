import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { loadBusinessMeta, myMemberships } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { load, save } from '../../lib/storage'
import type { Business } from '../../lib/types'
import { Spinner } from '../../components/ui'
import { PanelContext, type PanelCtx } from './context'

interface Membership { role: 'owner' | 'staff'; resource_id: string | null; business: Business }

export default function PanelLayout() {
  const { session, profile, loading } = useAuth()
  const loc = useLocation()
  const [memberships, setMemberships] = useState<Membership[] | null>(null)
  const [bizId, setBizId] = useState<string | null>(() => load('panelBusiness', null))
  const [meta, setMeta] = useState<Omit<PanelCtx, 'biz' | 'role' | 'myResourceId' | 'reload'> | null>(null)

  const loadMemberships = useCallback(async () => {
    if (!session) return
    setMemberships(await myMemberships(session.uid).catch(() => []))
  }, [session])

  useEffect(() => { void loadMemberships() }, [loadMemberships])

  const current = memberships?.find((m) => m.business.id === bizId) ?? memberships?.[0] ?? null

  const reload = useCallback(async () => {
    if (!current) return
    const id = current.business.id
    const meta = await loadBusinessMeta(id)
    if (!meta) return
    setMemberships((ms) => ms?.map((m) => m.business.id === id ? { ...m, business: meta.biz } : m) ?? ms)
    setMeta({ resources: meta.resources, services: meta.services, links: meta.links })
  }, [current?.business.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setMeta(null); void reload() }, [reload])
  useEffect(() => { if (current) { save('panelBusiness', current.business.id); save('lastPlace', '/panel') } }, [current])

  if (loading) return <Spinner />
  if (!session || !profile?.full_name) return <Navigate to={`/giris?next=${encodeURIComponent(loc.pathname)}`} replace />
  if (!memberships) return <Spinner />
  if (!current) return <Navigate to="/yeni" replace />
  if (!meta) return <Spinner />

  const ctx: PanelCtx = { biz: current.business, role: current.role, myResourceId: current.resource_id, ...meta, reload }

  return (
    <PanelContext.Provider value={ctx}>
      <div className="panel-top">
        {memberships.length > 1 ? (
          <select className="biz-select" value={current.business.id} onChange={(e) => setBizId(e.target.value)} aria-label="İşletme seç">
            {memberships.map((m) => <option key={m.business.id} value={m.business.id}>{m.business.name}</option>)}
          </select>
        ) : <strong className="biz-title">{current.business.name}</strong>}
        <Link className="link small" to={`/${current.business.slug}`} target="_blank">Müşteri sayfası ↗</Link>
      </div>
      <main className="panel-main"><Outlet /></main>
      <nav className="tabbar" aria-label="Panel">
        <NavLink end to="/panel"><span aria-hidden>📅</span>Ajanda</NavLink>
        <NavLink to="/panel/musteriler"><span aria-hidden>👥</span>Müşteriler</NavLink>
        {ctx.role === 'owner' ? <NavLink to="/panel/ayarlar"><span aria-hidden>⚙️</span>Ayarlar</NavLink> : null}
        <NavLink to="/panel/paylas"><span aria-hidden>🔗</span>Paylaş</NavLink>
      </nav>
    </PanelContext.Provider>
  )
}
