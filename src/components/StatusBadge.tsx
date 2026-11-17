import type { BookingStatus } from '../lib/types'

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'Onay bekliyor', confirmed: 'Onaylandı', cancelled: 'İptal', rejected: 'Reddedildi',
  completed: 'Tamamlandı', no_show: 'Gelmedi',
}
export function StatusBadge({ status }: { status: BookingStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>
}
