import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import type { Business, Member, Resource, Service, TimeOff, WorkingHour } from '../../lib/types'
import { errText } from '../../lib/errors'
import { displayPhone, normalizePhone } from '../../lib/phone'
import { addDays, dayKeyOf, fmtDateTime, fmtDay, fmtTime, hhmm, minutesLabel, todayKey, WEEKDAYS_SHORT, zonedToDate } from '../../lib/time'
import { slugify } from '../../lib/storage'
import { Button, Chip, Empty, Field, Notice, Sheet, Toggle, useToast } from '../../components/ui'
import { HoursEditor, emptyWeek, validateWeek, weekToRows, type WeekHours } from '../../components/HoursEditor'
import { usePanel } from './context'

function Section({ title, summary, children, open: initial = false }: { title: string; summary?: ReactNode; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial)
  return (
    <section className={`settings-section ${open ? 'is-open' : ''}`}>
      <button className="settings-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span><strong>{title}</strong>{summary ? <span className="muted small settings-summary">{summary}</span> : null}</span>
        <span aria-hidden>{open ? '−' : '+'}</span>
      </button>
      {open ? <div className="settings-body">{children}</div> : null}
    </section>
  )
}

/** Dakika değerini dakika / saat / gün birimiyle girdirir */
function DurationInput({ value, onChange, units = ['dk', 'saat', 'gün'] }: { value: number; onChange: (m: number) => void; units?: ('dk' | 'saat' | 'gün')[] }) {
  const factor = { dk: 1, saat: 60, gün: 1440 }
  const best = [...units].reverse().find((u) => value % factor[u] === 0 && value >= factor[u]) ?? units[0]
  const [unit, setUnit] = useState<'dk' | 'saat' | 'gün'>(best)
  return (
    <div className="input-unit">
      <input className="input" type="number" inputMode="numeric" min={0} value={value / factor[unit]}
        onChange={(e) => onChange(Math.round(Number(e.target.value || 0) * factor[unit]))} />
      <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as 'dk')}>
        {units.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
    </div>
  )
}

export default function Settings() {
  const { biz, resources, services } = usePanel()
  return (
    <div className="page narrow">
      <h1>Ayarlar</h1>
      <p className="muted small">Her şey sizin: saatler, aralar, kapalı günler, süreler ve kurallar. Değişiklikler müşteri ekranına anında yansır.</p>
      <Section title="İşletme bilgileri" summary={biz.name}><BusinessInfo /></Section>
      <Section title="Randevu kuralları" summary={biz.booking_mode === 'approval' ? 'Onaylı' : 'Anında onay'}><Rules /></Section>
      <Section title="Hizmetler" summary={`${services.filter((s) => s.is_active).length} aktif`}><Services /></Section>
      <Section title={`${biz.resource_label} ve çalışma saatleri`} summary={`${resources.filter((r) => r.is_active).length} aktif`}><Resources /></Section>
      <Section title="Kapalı zamanlar" summary="Tatil, izin, bakım"><TimeOffs /></Section>
      <Section title="Ekip"><Team /></Section>
      <Section title="Dışa aktar"><Export /></Section>
    </div>
  )
}

// ------------------------------------------------------------------
function useSaveBusiness() {
  const { biz, reload } = usePanel()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const save = async (patch: Partial<Business>) => {
    setBusy(true)
    const { error } = await supabase.from('businesses').update(patch).eq('id', biz.id)
    setBusy(false)
    if (error) { toast(errText(error), 'error'); return false }
    toast('Kaydedildi', 'success'); await reload(); return true
  }
  return { save, busy }
}

function BusinessInfo() {
  const { biz } = usePanel()
  const { save, busy } = useSaveBusiness()
  const [f, setF] = useState({
    name: biz.name, description: biz.description ?? '', phone: biz.phone ? displayPhone(biz.phone) : '', address: biz.address ?? '',
    resource_label: biz.resource_label, booking_note: biz.booking_note ?? '', slug: biz.slug, is_active: biz.is_active,
  })
  const [err, setErr] = useState<string | null>(null)
  return (
    <form className="stack" onSubmit={(e) => {
      e.preventDefault(); setErr(null)
      if (f.phone && !normalizePhone(f.phone)) return setErr('Telefon geçersiz.')
      if (f.slug !== biz.slug && !confirm('Bağlantı adını değiştirirseniz eski bağlantı ve QR kod çalışmaz. Devam edilsin mi?')) return
      void save({
        name: f.name.trim(), description: f.description.trim() || null, phone: f.phone ? normalizePhone(f.phone) : null,
        address: f.address.trim() || null, resource_label: f.resource_label.trim() || 'Personel',
        booking_note: f.booking_note.trim() || null, slug: f.slug, is_active: f.is_active,
      })
    }}>
      <Field label="İşletme adı"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Kısa açıklama"><textarea className="input" rows={2} maxLength={500} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <div className="grid-2">
        <Field label="Telefon"><input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Randevuyu karşılayanlara ne denir?" hint="ör. Personel, Eğitmen, Saha"><input className="input" value={f.resource_label} maxLength={30} onChange={(e) => setF({ ...f, resource_label: e.target.value })} /></Field>
      </div>
      <Field label="Adres"><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
      <Field label="Müşteriye gösterilecek not" hint="ör. “Lütfen 5 dk önce gelin.” Sayfanızın üstünde görünür.">
        <textarea className="input" rows={2} maxLength={500} value={f.booking_note} onChange={(e) => setF({ ...f, booking_note: e.target.value })} />
      </Field>
      <Field label="Bağlantı adı" hint={`${location.host}/${f.slug}`}>
        <input className="input" value={f.slug} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} />
      </Field>
      <Toggle checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} label="Çevrim içi randevu açık" hint="Kapatırsanız sayfanız görünür ama yeni randevu alınamaz." />
      {err ? <Notice kind="danger">{err}</Notice> : null}
      <Button type="submit" loading={busy}>Kaydet</Button>
    </form>
  )
}

function Rules() {
  const { biz } = usePanel()
  const { save, busy } = useSaveBusiness()
  const [f, setF] = useState({
    booking_mode: biz.booking_mode, slot_interval_min: biz.slot_interval_min, min_notice_min: biz.min_notice_min,
    max_advance_days: biz.max_advance_days, cancel_until_min: biz.cancel_until_min,
    max_active_per_customer: biz.max_active_per_customer, weekly_limit_per_customer: biz.weekly_limit_per_customer,
  })
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); void save(f) }}>
      <div className="field">
        <span className="field-label">Gelen randevular</span>
        <label className="radio-card"><input type="radio" checked={f.booking_mode === 'approval'} onChange={() => setF({ ...f, booking_mode: 'approval' })} />
          <span><strong>Ben onaylayayım</strong><span className="muted small">Saat ayrılır, siz onaylayınca kesinleşir.</span></span></label>
        <label className="radio-card"><input type="radio" checked={f.booking_mode === 'instant'} onChange={() => setF({ ...f, booking_mode: 'instant' })} />
          <span><strong>Anında kesinleşsin</strong><span className="muted small">Boş saat seçen müşterinin randevusu hemen onaylanır.</span></span></label>
      </div>
      <Field label="Saat aralığı" hint="Müşteriye hangi sıklıkla saat önerilsin? (Hizmet bazında da değiştirilebilir.)">
        <DurationInput value={f.slot_interval_min} onChange={(v) => setF({ ...f, slot_interval_min: v })} units={['dk', 'saat']} />
      </Field>
      <Field label="En az ne kadar önceden alınabilir?">
        <DurationInput value={f.min_notice_min} onChange={(v) => setF({ ...f, min_notice_min: v })} />
      </Field>
      <Field label="En fazla kaç gün ileriye alınabilir?">
        <input className="input" type="number" min={1} max={365} value={f.max_advance_days} onChange={(e) => setF({ ...f, max_advance_days: Number(e.target.value) })} />
      </Field>
      <Field label="Müşteri en geç ne zamana kadar iptal edebilir?" hint="Randevudan bu kadar önce. Sonrasında müşteri sizi aramalı.">
        <DurationInput value={f.cancel_until_min} onChange={(v) => setF({ ...f, cancel_until_min: v })} />
      </Field>
      <Field label="Bir müşterinin aynı anda en fazla açık randevusu">
        <input className="input" type="number" min={1} max={100} value={f.max_active_per_customer} onChange={(e) => setF({ ...f, max_active_per_customer: Number(e.target.value) })} />
      </Field>
      <Toggle checked={f.weekly_limit_per_customer !== null} label="Haftalık sınır" hint="Bir müşteri bir haftada en fazla kaç randevu alabilir?"
        onChange={(v) => setF({ ...f, weekly_limit_per_customer: v ? 1 : null })} />
      {f.weekly_limit_per_customer !== null ? (
        <div className="chips">
          {[1, 2, 3, 4, 5, 6].map((n) => <Chip key={n} active={f.weekly_limit_per_customer === n} onClick={() => setF({ ...f, weekly_limit_per_customer: n })}>{n}</Chip>)}
          <input className="input input-sm" type="number" min={1} max={100} value={f.weekly_limit_per_customer} onChange={(e) => setF({ ...f, weekly_limit_per_customer: Number(e.target.value) || 1 })} />
        </div>
      ) : null}
      <Button type="submit" loading={busy}>Kaydet</Button>
    </form>
  )
}

// ------------------------------------------------------------------
function Services() {
  const { biz, services, resources, links, reload } = usePanel()
  const toast = useToast()
  const [edit, setEdit] = useState<Partial<Service> | null>(null)
  const [sel, setSel] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  function open(s: Partial<Service>) {
    setEdit(s)
    setSel(s.id ? links.filter((l) => l.service_id === s.id).map((l) => l.resource_id) : [])
  }

  async function save() {
    if (!edit) return
    if (!edit.name?.trim()) { toast('Hizmet adı gerekli', 'error'); return }
    if (!edit.duration_min || edit.duration_min < 5) { toast('Süre en az 5 dakika olmalı', 'error'); return }
    setBusy(true)
    const row = {
      business_id: biz.id, name: edit.name.trim(), description: edit.description?.trim() || null,
      duration_min: edit.duration_min, buffer_min: edit.buffer_min ?? 0, slot_interval_min: edit.slot_interval_min || null,
      price_text: edit.price_text?.trim() || null, is_active: edit.is_active ?? true,
    }
    const res = edit.id
      ? await supabase.from('services').update(row).eq('id', edit.id).select().single()
      : await supabase.from('services').insert({ ...row, sort: services.length }).select().single()
    if (res.error) { setBusy(false); toast(errText(res.error), 'error'); return }
    const sid = res.data.id as string
    await supabase.from('service_resources').delete().eq('service_id', sid)
    if (sel.length && sel.length < resources.length) {
      await supabase.from('service_resources').insert(sel.map((rid) => ({ business_id: biz.id, service_id: sid, resource_id: rid })))
    }
    setBusy(false); setEdit(null); toast('Kaydedildi', 'success'); void reload()
  }

  async function remove() {
    if (!edit?.id || !confirm('Hizmet silinsin mi? Geçmiş randevular silinmez.')) return
    const { error } = await supabase.from('services').delete().eq('id', edit.id)
    if (error) { toast(errText(error), 'error'); return }
    setEdit(null); void reload()
  }

  return (
    <div className="stack">
      {services.length === 0 ? <Empty title="Henüz hizmet yok" /> : (
        <div className="list">
          {services.map((s) => (
            <button key={s.id} className="list-row" onClick={() => open(s)}>
              <span><strong>{s.name}</strong>{!s.is_active ? <span className="badge"> pasif</span> : null}</span>
              <span className="muted small">{minutesLabel(s.duration_min)}{s.buffer_min ? ` + ${s.buffer_min} dk ara` : ''}</span>
            </button>
          ))}
        </div>
      )}
      <Button variant="secondary" onClick={() => open({ is_active: true, buffer_min: 0 })}>+ Hizmet ekle</Button>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Hizmeti düzenle' : 'Yeni hizmet'}
        footer={<div className="actions">{edit?.id ? <Button variant="ghost" className="danger" onClick={() => void remove()}>Sil</Button> : null}<Button loading={busy} onClick={() => void save()}>Kaydet</Button></div>}>
        {edit ? (
          <div className="stack">
            <Field label="Ad"><input className="input" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Açıklama (isteğe bağlı)"><input className="input" value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <div className="grid-2">
              <Field label="Süre (dk)"><input className="input" type="number" min={5} value={edit.duration_min ?? ''} onChange={(e) => setEdit({ ...edit, duration_min: Number(e.target.value) })} /></Field>
              <Field label="Sonrasında ara (dk)" hint="Hazırlık / temizlik / yol"><input className="input" type="number" min={0} value={edit.buffer_min ?? 0} onChange={(e) => setEdit({ ...edit, buffer_min: Number(e.target.value) })} /></Field>
            </div>
            <div className="grid-2">
              <Field label="Saat aralığı (dk)" hint={`Boş bırakılırsa ${biz.slot_interval_min} dk`}><input className="input" type="number" min={5} value={edit.slot_interval_min ?? ''} onChange={(e) => setEdit({ ...edit, slot_interval_min: e.target.value ? Number(e.target.value) : null })} /></Field>
              <Field label="Fiyat (isteğe bağlı)" hint="ör. 500 ₺"><input className="input" value={edit.price_text ?? ''} onChange={(e) => setEdit({ ...edit, price_text: e.target.value })} /></Field>
            </div>
            {resources.length > 1 ? (
              <div className="field">
                <span className="field-label">Bu hizmeti kimler veriyor?</span>
                <span className="field-hint">Hiçbiri seçili değilse hepsi verir.</span>
                <div className="chips">{resources.map((r) => <Chip key={r.id} active={sel.includes(r.id)} onClick={() => setSel(sel.includes(r.id) ? sel.filter((x) => x !== r.id) : [...sel, r.id])}>{r.name}</Chip>)}</div>
              </div>
            ) : null}
            <Toggle checked={edit.is_active ?? true} onChange={(v) => setEdit({ ...edit, is_active: v })} label="Müşterilere göster" />
          </div>
        ) : null}
      </Sheet>
    </div>
  )
}

// ------------------------------------------------------------------
function Resources() {
  const { biz, resources, reload } = usePanel()
  const toast = useToast()
  const [hours, setHours] = useState<WorkingHour[]>([])
  const [edit, setEdit] = useState<Partial<Resource> | null>(null)
  const [week, setWeek] = useState<WeekHours>(emptyWeek)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const loadHours = useCallback(async () => {
    const { data } = await supabase.from('working_hours').select('*').eq('business_id', biz.id).order('start_time')
    setHours((data ?? []) as WorkingHour[])
  }, [biz.id])
  useEffect(() => { void loadHours() }, [loadHours])

  function open(r: Partial<Resource>) {
    const w = emptyWeek()
    for (const h of hours.filter((x) => x.resource_id === r.id)) w[h.weekday].push({ start: hhmm(h.start_time), end: hhmm(h.end_time) })
    setWeek(w); setEdit(r); setErr(null)
  }

  async function save() {
    if (!edit) return
    if (!edit.name?.trim()) return setErr('Ad gerekli.')
    const v = validateWeek(week)
    if (v && edit.is_active !== false) return setErr(v)
    setBusy(true); setErr(null)
    const res = edit.id
      ? await supabase.from('resources').update({ name: edit.name.trim(), is_active: edit.is_active ?? true }).eq('id', edit.id).select().single()
      : await supabase.from('resources').insert({ business_id: biz.id, name: edit.name.trim(), sort: resources.length }).select().single()
    if (res.error) { setBusy(false); return setErr(errText(res.error)) }
    const { error } = await supabase.rpc('set_working_hours', { p_resource: res.data.id, p_hours: weekToRows(week) })
    setBusy(false)
    if (error) return setErr(/HOURS_OVERLAP/.test(error.message) ? 'Aynı gün içinde aralıklar üst üste biniyor.' : errText(error))
    toast('Kaydedildi', 'success'); setEdit(null); void loadHours(); void reload()
  }

  async function remove() {
    if (!edit?.id || !confirm('Silinsin mi?')) return
    const { error } = await supabase.from('resources').delete().eq('id', edit.id)
    if (error) { toast('Geçmiş randevusu olduğu için silinemez; bunun yerine pasif yapın.', 'error'); return }
    setEdit(null); void reload()
  }

  const summary = (rid: string) => {
    const hs = hours.filter((h) => h.resource_id === rid)
    if (!hs.length) return 'Saat girilmemiş'
    const days = [...new Set(hs.map((h) => h.weekday))].sort()
    return days.map((d) => WEEKDAYS_SHORT[d - 1]).join(', ')
  }

  return (
    <div className="stack">
      <div className="list">
        {resources.map((r) => (
          <button key={r.id} className="list-row" onClick={() => open(r)}>
            <span><strong>{r.name}</strong>{!r.is_active ? <span className="badge"> pasif</span> : null}</span>
            <span className="muted small">{summary(r.id)}</span>
          </button>
        ))}
      </div>
      <Button variant="secondary" onClick={() => open({ is_active: true })}>+ {biz.resource_label} ekle</Button>
      <p className="muted small">Her biri ayrı takvimdir: aynı saatte iki müşteri ancak iki ayrı {biz.resource_label.toLocaleLowerCase('tr-TR')} varsa randevu alabilir.</p>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? edit.name ?? '' : `Yeni ${biz.resource_label.toLocaleLowerCase('tr-TR')}`}
        footer={<div className="actions">{edit?.id ? <Button variant="ghost" className="danger" onClick={() => void remove()}>Sil</Button> : null}<Button loading={busy} onClick={() => void save()}>Kaydet</Button></div>}>
        {edit ? (
          <div className="stack">
            <Field label="Ad"><input className="input" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Toggle checked={edit.is_active ?? true} onChange={(v) => setEdit({ ...edit, is_active: v })} label="Randevu alabilir" />
            <div className="field-label">Çalışma saatleri</div>
            <HoursEditor value={week} onChange={setWeek} />
            {err ? <Notice kind="danger">{err}</Notice> : null}
          </div>
        ) : null}
      </Sheet>
    </div>
  )
}

// ------------------------------------------------------------------
function TimeOffs() {
  const { biz, resources, role, myResourceId } = usePanel()
  const toast = useToast()
  const tz = biz.timezone
  const [list, setList] = useState<TimeOff[]>([])
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ resource_id: '', allDay: true, from: '', to: '', start: '', end: '', reason: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('time_off').select('*').eq('business_id', biz.id).gte('ends_at', new Date().toISOString()).order('starts_at')
    setList((data ?? []) as TimeOff[])
  }, [biz.id])
  useEffect(() => { void load() }, [load])

  async function add() {
    setErr(null)
    if (!f.from) return setErr('Tarih seçin.')
    let s: Date, e: Date
    if (f.allDay) {
      const to = f.to || f.from
      if (to < f.from) return setErr('Bitiş tarihi başlangıçtan önce olamaz.')
      s = zonedToDate(f.from, '00:00', tz); e = zonedToDate(addDays(to, 1), '00:00', tz)
    } else {
      if (!f.start || !f.end || f.end <= f.start) return setErr('Başlangıç ve bitiş saatini doğru girin.')
      s = zonedToDate(f.from, f.start, tz); e = zonedToDate(f.from, f.end, tz)
    }
    setBusy(true)
    // Bu aralıkta zaten randevu var mı? Uyar ama engelleme (mevcut randevular kendiliğinden iptal olmaz).
    const { count } = await supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('business_id', biz.id)
      .in('status', ['pending', 'confirmed']).lt('starts_at', e.toISOString()).gt('ends_at', s.toISOString())
      .match(f.resource_id ? { resource_id: f.resource_id } : {})
    if (count && !confirm(`Bu aralıkta ${count} aktif randevu var. Kapalı zaman eklenecek ama o randevular iptal edilmeyecek; ajandadan tek tek iptal edip müşterilere haber verebilirsiniz. Devam?`)) { setBusy(false); return }
    const { error } = await supabase.from('time_off').insert({ business_id: biz.id, resource_id: f.resource_id || null, starts_at: s.toISOString(), ends_at: e.toISOString(), reason: f.reason.trim() || null })
    setBusy(false)
    if (error) return setErr(errText(error))
    toast('Eklendi', 'success'); setAdding(false); void load()
  }

  async function remove(id: string) {
    if (!confirm('Kaldırılsın mı?')) return
    await supabase.from('time_off').delete().eq('id', id); void load()
  }

  const label = (t: TimeOff) => {
    const sk = dayKeyOf(t.starts_at, tz), ek = dayKeyOf(new Date(new Date(t.ends_at).getTime() - 1), tz)
    const whole = fmtTime(t.starts_at, tz) === '00:00' && fmtTime(t.ends_at, tz) === '00:00'
    if (whole) return sk === ek ? fmtDay(sk) : `${fmtDay(sk, { day: 'numeric', month: 'long' })} – ${fmtDay(ek, { day: 'numeric', month: 'long' })}`
    return `${fmtDateTime(t.starts_at, tz)} – ${fmtTime(t.ends_at, tz)}`
  }

  return (
    <div className="stack">
      {list.length === 0 ? <p className="muted small">Yaklaşan kapalı zaman yok.</p> : (
        <div className="list">
          {list.map((t) => (
            <div key={t.id} className="list-row">
              <span><strong>{label(t)}</strong><span className="muted small"> · {t.resource_id ? resources.find((r) => r.id === t.resource_id)?.name : 'Tüm işletme'}{t.reason ? ` · ${t.reason}` : ''}</span></span>
              <button className="icon-btn" aria-label="Kaldır" onClick={() => void remove(t.id)}>✕</button>
            </div>
          ))}
        </div>
      )}
      <Button variant="secondary" onClick={() => { setF({ resource_id: role === 'staff' ? myResourceId ?? '' : '', allDay: true, from: todayKey(tz), to: '', start: '', end: '', reason: '' }); setErr(null); setAdding(true) }}>+ Kapalı zaman ekle</Button>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Kapalı zaman" footer={<Button loading={busy} onClick={() => void add()}>Ekle</Button>}>
        <div className="stack">
          {resources.length > 1 ? (
            <div className="chips">
              <Chip active={!f.resource_id} onClick={() => setF({ ...f, resource_id: '' })}>Tüm işletme</Chip>
              {resources.map((r) => <Chip key={r.id} active={f.resource_id === r.id} onClick={() => setF({ ...f, resource_id: r.id })}>{r.name}</Chip>)}
            </div>
          ) : null}
          <Toggle checked={f.allDay} onChange={(v) => setF({ ...f, allDay: v })} label="Tüm gün" hint="Kapatırsanız gün içinde belirli saatleri kapatırsınız." />
          {f.allDay ? (
            <div className="grid-2">
              <Field label="Başlangıç günü"><input className="input" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
              <Field label="Bitiş günü" hint="Tek günse boş bırakın"><input className="input" type="date" value={f.to} min={f.from} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
            </div>
          ) : (
            <>
              <Field label="Gün"><input className="input" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
              <div className="grid-2">
                <Field label="Başlangıç"><input className="input" type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
                <Field label="Bitiş"><input className="input" type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
              </div>
            </>
          )}
          <Field label="Sebep (sadece ekip görür)"><input className="input" value={f.reason} maxLength={120} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
          {err ? <Notice kind="danger">{err}</Notice> : null}
        </div>
      </Sheet>
    </div>
  )
}

// ------------------------------------------------------------------
function Team() {
  const { biz, resources } = usePanel()
  const toast = useToast()
  const [members, setMembers] = useState<Member[]>([])
  const [invite, setInvite] = useState<string | null>(null)
  const [invRes, setInvRes] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('list_members', { p_business: biz.id })
    setMembers((data ?? []) as Member[])
  }, [biz.id])
  useEffect(() => { void load() }, [load])

  async function create() {
    const { data: u } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('business_invites').insert({ business_id: biz.id, resource_id: invRes || null, created_by: u.user!.id }).select('code').single()
    if (error) { toast(errText(error), 'error'); return }
    setInvite(`${location.origin}/katil/${data.code}`)
  }

  async function setRes(uid: string, rid: string) {
    await supabase.from('business_members').update({ resource_id: rid || null }).eq('business_id', biz.id).eq('user_id', uid); void load()
  }
  async function remove(uid: string) {
    if (!confirm('Ekipten çıkarılsın mı?')) return
    await supabase.from('business_members').delete().eq('business_id', biz.id).eq('user_id', uid); void load()
  }

  return (
    <div className="stack">
      <div className="list">
        {members.map((m) => (
          <div key={m.user_id} className="list-row">
            <span><strong>{m.full_name ?? '—'}</strong><span className="muted small"> · {m.role === 'owner' ? 'Sahip' : 'Ekip'} · {displayPhone(m.phone)}</span></span>
            <span className="row-gap">
              <select className="input input-sm" value={m.resource_id ?? ''} onChange={(e) => void setRes(m.user_id, e.target.value)} aria-label={biz.resource_label}>
                <option value="">—</option>{resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              {m.role !== 'owner' ? <button className="icon-btn" aria-label="Çıkar" onClick={() => void remove(m.user_id)}>✕</button> : null}
            </span>
          </div>
        ))}
      </div>
      <p className="muted small">Ekip üyeleri ajandayı ve müşterileri görür, randevu ekler/düzenler; ayarları sadece sahip değiştirir.</p>
      <div className="row-gap">
        <select className="input input-sm" value={invRes} onChange={(e) => setInvRes(e.target.value)} aria-label="Bağlanacak kayıt">
          <option value="">{biz.resource_label} seçmeden</option>{resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <Button variant="secondary" onClick={() => void create()}>Davet bağlantısı oluştur</Button>
      </div>
      {invite ? (
        <Notice kind="success">
          <div className="stack-sm">
            <span>7 gün geçerli, tek kullanımlık:</span>
            <code className="break">{invite}</code>
            <div className="actions">
              <Button variant="secondary" onClick={() => navigator.clipboard.writeText(invite).then(() => toast('Kopyalandı', 'success'))}>Kopyala</Button>
              <a className="btn btn-wa" href={`https://wa.me/?text=${encodeURIComponent(`${biz.name} ekibine katıl: ${invite}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
            </div>
          </div>
        </Notice>
      ) : null}
    </div>
  )
}

// ------------------------------------------------------------------
function Export() {
  const { biz, resources } = usePanel()
  const tz = biz.timezone
  const [from, setFrom] = useState(() => addDays(todayKey(tz), -30))
  const [to, setTo] = useState(() => addDays(todayKey(tz), 30))
  const [busy, setBusy] = useState(false)

  async function csv() {
    setBusy(true)
    const { data } = await supabase.from('bookings').select('*, customer:customers(name, phone)').eq('business_id', biz.id)
      .gte('starts_at', zonedToDate(from, '00:00', tz).toISOString()).lt('starts_at', zonedToDate(addDays(to, 1), '00:00', tz).toISOString()).order('starts_at')
    setBusy(false)
    const STATUS: Record<string, string> = { pending: 'Bekliyor', confirmed: 'Onaylı', cancelled: 'İptal', rejected: 'Ret', completed: 'Geldi', no_show: 'Gelmedi' }
    const rows = [['Tarih', 'Başlangıç', 'Bitiş', 'Müşteri', 'Telefon', 'Hizmet', biz.resource_label, 'Durum', 'Kaynak', 'Müşteri notu', 'Ekip notu']]
    for (const b of data ?? []) rows.push([
      dayKeyOf(b.starts_at, tz), fmtTime(b.starts_at, tz), fmtTime(b.ends_at, tz), b.customer?.name ?? '', displayPhone(b.customer?.phone),
      b.service_name, resources.find((r) => r.id === b.resource_id)?.name ?? '', STATUS[b.status] ?? b.status,
      b.source === 'staff' ? 'Elle' : 'Çevrim içi', b.customer_note ?? '', b.staff_note ?? '',
    ])
    // Türkçe Excel ';' ayracı ve UTF-8 BOM bekler
    const body = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }))
    a.download = `${biz.slug}-randevular-${from}_${to}.csv`; a.click()
  }

  return (
    <div className="stack">
      <div className="grid-2">
        <Field label="Başlangıç"><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Bitiş"><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <Button variant="secondary" loading={busy} onClick={() => void csv()}>Excel (CSV) indir</Button>
      <p className="muted small">PDF için: Ajanda'da günü açın → “Yazdır” → “PDF olarak kaydet”.</p>
    </div>
  )
}
