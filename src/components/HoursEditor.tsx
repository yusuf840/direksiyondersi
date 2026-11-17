import { WEEKDAYS } from '../lib/time'

export type Range = { start: string; end: string }
export type WeekHours = Record<number, Range[]>

export const emptyWeek = (): WeekHours => ({ 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] })

export function validateWeek(w: WeekHours): string | null {
  let any = false
  for (let d = 1; d <= 7; d++) {
    const rs = [...w[d]].sort((a, b) => a.start.localeCompare(b.start))
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i]
      if (!r.start || !r.end) return `${WEEKDAYS[d - 1]}: başlangıç ve bitiş saatini girin.`
      if (r.end <= r.start) return `${WEEKDAYS[d - 1]}: bitiş saati başlangıçtan sonra olmalı.`
      if (i > 0 && rs[i - 1].end > r.start) return `${WEEKDAYS[d - 1]}: aralıklar üst üste biniyor.`
      any = true
    }
  }
  return any ? null : 'En az bir gün için çalışma saati girin.'
}

/**
 * Haftalık çalışma saatleri. Hiçbir saat varsayılan değildir: işletme gün açar ve saatini yazar.
 * Bir güne birden çok aralık eklenebilir; aralar arasındaki boşluk (öğle arası vb.) kapalı sayılır.
 */
export function HoursEditor({ value, onChange }: { value: WeekHours; onChange: (w: WeekHours) => void }) {
  const set = (d: number, rs: Range[]) => onChange({ ...value, [d]: rs })
  const lastFilled = (): Range[] | null => {
    for (let d = 1; d <= 7; d++) if (value[d].length && value[d].every((r) => r.start && r.end)) return value[d]
    return null
  }

  return (
    <div className="hours">
      {[1, 2, 3, 4, 5, 6, 7].map((d) => {
        const rs = value[d]
        const open = rs.length > 0
        return (
          <div key={d} className={`hours-day ${open ? '' : 'hours-closed'}`}>
            <label className="hours-toggle">
              <input type="checkbox" className="switch" checked={open}
                onChange={(e) => set(d, e.target.checked ? (lastFilled()?.map((r) => ({ ...r })) ?? [{ start: '', end: '' }]) : [])} />
              <span className="strong">{WEEKDAYS[d - 1]}</span>
            </label>
            {open ? (
              <div className="hours-ranges">
                {rs.map((r, i) => (
                  <div key={i} className="hours-range">
                    <input className="input" type="time" step={300} value={r.start} aria-label="Başlangıç"
                      onChange={(e) => set(d, rs.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} />
                    <span>–</span>
                    <input className="input" type="time" step={300} value={r.end} aria-label="Bitiş"
                      onChange={(e) => set(d, rs.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} />
                    <button type="button" className="icon-btn" aria-label="Aralığı sil" onClick={() => set(d, rs.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
                <div className="hours-actions">
                  <button type="button" className="link small" onClick={() => set(d, [...rs, { start: '', end: '' }])}>+ aralık ekle (ara vermek için)</button>
                  {rs.every((r) => r.start && r.end) ? (
                    <button type="button" className="link small" onClick={() => {
                      const next = { ...value }
                      for (let x = 1; x <= 7; x++) if (x !== d && next[x].length) next[x] = rs.map((r) => ({ ...r }))
                      onChange(next)
                    }}>Açık diğer günlere uygula</button>
                  ) : null}
                </div>
              </div>
            ) : <span className="muted small">Kapalı</span>}
          </div>
        )
      })}
    </div>
  )
}

export function weekToRows(w: WeekHours) {
  const rows: { weekday: number; start: string; end: string }[] = []
  for (let d = 1; d <= 7; d++) for (const r of w[d]) rows.push({ weekday: d, start: r.start, end: r.end })
  return rows
}
