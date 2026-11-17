const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const esc = (s: string) => s.replace(/[\\,;]/g, (m) => '\\' + m).replace(/\n/g, '\\n')

/** Takvime ekle (.ics) — telefonun kendi takvimi hatırlatmayı yapar. */
export function downloadIcs(o: { id: string; title: string; startsAt: string; endsAt: string; location?: string | null; description?: string }) {
  const body = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Randevu//TR', 'BEGIN:VEVENT',
    `UID:${o.id}@randevu`, `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(o.startsAt)}`, `DTEND:${stamp(o.endsAt)}`,
    `SUMMARY:${esc(o.title)}`,
    o.location ? `LOCATION:${esc(o.location)}` : '',
    o.description ? `DESCRIPTION:${esc(o.description)}` : '',
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Randevu hatırlatma', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }))
  a.download = 'randevu.ics'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
