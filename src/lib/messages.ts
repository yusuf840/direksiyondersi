// WhatsApp şablonları — sektörden bağımsız; işletme adı, hizmet ve saat doldurulur.
import { fmtDay, fmtTime, dayKeyOf } from './time'

export type TemplateKind = 'onay' | 'hatirlatma' | 'degisiklik' | 'iptal'
export const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  onay: 'Onay', hatirlatma: 'Hatırlatma', degisiklik: 'Değişiklik', iptal: 'İptal',
}

export function template(kind: TemplateKind, v: {
  customer: string; business: string; service: string; startsAt: string; tz: string; address?: string | null; link?: string
}) {
  const gun = fmtDay(dayKeyOf(v.startsAt, v.tz))
  const saat = fmtTime(v.startsAt, v.tz)
  const ad = v.customer.split(' ')[0]
  switch (kind) {
    case 'onay':
      return `Merhaba ${ad},\n\n✅ Randevunuz onaylandı.\n\n📅 ${gun}\n⏰ ${saat}\n📝 ${v.service}${v.address ? `\n📍 ${v.address}` : ''}\n\n${v.business}`
    case 'hatirlatma':
      return `Merhaba ${ad},\n\n⏰ Randevunuzu hatırlatırız:\n\n📅 ${gun}\n⏰ ${saat}\n📝 ${v.service}\n\nGelemeyecekseniz lütfen haber verin.${v.link ? `\n${v.link}` : ''}\n\n${v.business}`
    case 'degisiklik':
      return `Merhaba ${ad},\n\n🔄 Randevu saatiniz değişti. Yeni saat:\n\n📅 ${gun}\n⏰ ${saat}\n📝 ${v.service}\n\nUygun değilse lütfen bize yazın.\n\n${v.business}`
    case 'iptal':
      return `Merhaba ${ad},\n\n⚠️ ${gun} ${saat} randevunuzu maalesef iptal etmek zorundayız.\n\nYeni bir saat için:${v.link ? `\n${v.link}` : ' bize yazabilirsiniz.'}\n\nÖzür dileriz.\n${v.business}`
  }
}
