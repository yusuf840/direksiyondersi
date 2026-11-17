// Boş saat hesabı (tarayıcıda). Sunucu tarafında aynı kuralı firestore.rules'taki "dolu dilim" kilidi garanti eder.
import { addDays, isoWeekday, zonedToDate } from './time'
import type { Business, HoursRange, Resource, Service, Slot } from './types'

export const CELL_MS = 5 * 60_000
export const cellOf = (ms: number) => Math.floor(ms / CELL_MS)
export const cellsFor = (startMs: number, blockEndMs: number) => {
  const out: number[] = []
  for (let c = cellOf(startMs); c <= cellOf(blockEndMs - 1); c++) out.push(c)
  return out
}

export interface BusyCell { resource_id: string; cell: number }
export interface Off { resource_id: string | null; starts_at: string; ends_at: string }

export function eligibleResources(resources: Resource[], service: Service, only?: string | null) {
  return resources.filter((r) => r.is_active && (!only || r.id === only) && (!service.resource_ids?.length || service.resource_ids.includes(r.id)))
}

export function computeSlots(o: {
  biz: Business; service: Service; resources: Resource[]; busy: BusyCell[]; off: Off[]
  from: string; days: number; resourceId?: string | null; ignoreRules?: boolean; now?: number
}): Slot[] {
  const { biz, service } = o
  const tz = biz.timezone
  const taken = new Set(o.busy.map((b) => `${b.resource_id}_${b.cell}`))
  const offs = o.off.map((t) => ({ rid: t.resource_id, s: Date.parse(t.starts_at), e: Date.parse(t.ends_at) }))
  const len = service.duration_min * 60_000
  const blk = (service.duration_min + service.buffer_min) * 60_000
  const step = (service.slot_interval_min || biz.slot_interval_min) * 60_000
  const now = o.now ?? Date.now()
  const earliest = o.ignoreRules ? -Infinity : now + biz.min_notice_min * 60_000
  const latest = o.ignoreRules ? Infinity : now + biz.max_advance_days * 86_400_000
  const out: Slot[] = []
  for (let i = 0; i < o.days; i++) {
    const day = addDays(o.from, i)
    const wd = isoWeekday(day)
    for (const r of eligibleResources(o.resources, service, o.resourceId)) {
      for (const h of (r.hours ?? []).filter((x: HoursRange) => x.weekday === wd)) {
        const ws = zonedToDate(day, h.start, tz).getTime()
        const we = zonedToDate(day, h.end, tz).getTime()
        for (let t = ws; t + len <= we; t += step) {
          if (t < earliest || t > latest) continue
          if (cellsFor(t, t + blk).some((c) => taken.has(`${r.id}_${c}`))) continue
          if (offs.some((x) => (!x.rid || x.rid === r.id) && x.s < t + len && x.e > t)) continue
          out.push({ resource_id: r.id, starts_at: new Date(t).toISOString() })
        }
      }
    }
  }
  return out.sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.resource_id.localeCompare(b.resource_id))
}
