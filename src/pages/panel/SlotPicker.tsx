import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Business, Slot } from '../../lib/types'
import { fmtTime, zonedToDate } from '../../lib/time'
import { Spinner } from '../../components/ui'

/** Ekip için saat seçici: çalışma saatlerine göre boş saatleri önerir, istenirse özel saat girilir. */
export function SlotPicker({ biz, serviceId, resourceId, day, value, onChange }: {
  biz: Business; serviceId: string; resourceId: string; day: string; value: string | null; onChange: (iso: string | null) => void
}) {
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [custom, setCustom] = useState('')

  useEffect(() => {
    let off = false
    setSlots(null)
    supabase.rpc('available_slots', { p_business: biz.id, p_service: serviceId, p_from: day, p_days: 1, p_resource: resourceId, p_ignore_rules: true })
      .then(({ data }) => { if (!off) setSlots((data ?? []) as Slot[]) })
    return () => { off = true }
  }, [biz.id, serviceId, resourceId, day])

  return (
    <div className="stack-sm">
      {slots === null ? <Spinner /> : slots.length ? (
        <div className="slot-grid">
          {slots.map((s) => (
            <button type="button" key={s.starts_at} className={`slot ${value === s.starts_at ? 'slot-active' : ''}`}
              onClick={() => { setCustom(''); onChange(s.starts_at) }}>{fmtTime(s.starts_at, biz.timezone)}</button>
          ))}
        </div>
      ) : <p className="muted small">Bu gün çalışma saatlerinde boş yer yok.</p>}
      <label className="inline-field">
        <span className="small">Özel saat:</span>
        <input className="input input-sm" type="time" value={custom}
          onChange={(e) => { setCustom(e.target.value); onChange(e.target.value ? zonedToDate(day, e.target.value, biz.timezone).toISOString() : null) }} />
      </label>
      <p className="muted small">Özel saat çalışma saati dışında olabilir; yine de başka bir randevuyla çakışamaz.</p>
    </div>
  )
}
