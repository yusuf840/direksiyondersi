import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type ButtonHTMLAttributes } from 'react'

export function Button({ variant = 'primary', loading, children, className = '', ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'wa'; loading?: boolean }) {
  return (
    <button className={`btn btn-${variant} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <span className="spinner" aria-hidden /> : null}
      {children}
    </button>
  )
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

export function Spinner({ label }: { label?: string }) {
  return <div className="center-pad"><span className="spinner spinner-lg" aria-hidden />{label ? <p className="muted">{label}</p> : null}</div>
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><strong>{title}</strong>{children ? <div className="muted">{children}</div> : null}</div>
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'success' | 'warning' | 'danger'; children: ReactNode }) {
  return <div className={`notice notice-${kind}`} role={kind === 'danger' ? 'alert' : undefined}>{children}</div>
}

/** Alttan açılan panel (telefonda), ortada pencere (geniş ekranda) */
export function Sheet({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Kapat">✕</button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </div>
  )
}

export function Chip({ active, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <button type="button" className={`chip ${active ? 'chip-active' : ''}`} aria-pressed={active} {...rest}>{children}</button>
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="toggle-row">
      <span><span className="toggle-label">{label}</span>{hint ? <span className="field-hint">{hint}</span> : null}</span>
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

// ---- Bildirim (toast) ----
type Toast = { id: number; text: string; kind: 'info' | 'success' | 'error' }
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {})
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, text, kind }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark' ||
    (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches))
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    try { localStorage.setItem('theme', dark ? 'dark' : 'light') } catch { /* yok say */ }
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0f172a' : '#1a3a6c')
  }, [dark])
  return <button className="icon-btn" onClick={() => setDark(!dark)} aria-label="Temayı değiştir">{dark ? '☀︎' : '☾'}</button>
}
