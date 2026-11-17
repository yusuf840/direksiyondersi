-- =====================================================================
--  Randevu — veritabanı şeması (Supabase / Postgres 15+)
--
--  Temel ilke: Kurallar arayüzde değil BURADA uygulanır.
--  - Çakışma: aynı kaynağa üst üste binen iki aktif randevu fiziksel
--    olarak imkansızdır (EXCLUDE kısıtı).
--  - Müşteri tablolara doğrudan yazamaz; sadece RPC fonksiyonları
--    üzerinden (book, cancel_my_booking ...) işlem yapar.
--  - Hiçbir saat / gün / süre kodda sabit değildir; hepsi işletmenin
--    kendi ayarlarından gelir.
-- =====================================================================

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
--  Yardımcılar
-- ---------------------------------------------------------------------

-- Telefonu tek biçime getirir: +905xxxxxxxxx
create or replace function public.normalize_phone(p text)
returns text language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if d = '' then return null; end if;
  if length(d) = 11 and left(d, 1) = '0' then d := '90' || substr(d, 2);
  elsif length(d) = 10 and left(d, 1) = '5' then d := '90' || d;
  end if;
  if length(d) < 10 or length(d) > 15 then return null; end if;
  return '+' || d;
end $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ---------------------------------------------------------------------
--  Profil: her giriş yapan kişi (telefonla doğrulanmış)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text check (char_length(full_name) <= 80),
  phone       text,               -- auth.users.phone'dan kopyalanır (doğrulanmış)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Yeni kullanıcı oluşunca / telefonu değişince profili senkronla
create or replace function public.sync_profile_from_auth()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone)
  values (new.id, public.normalize_phone(new.phone))
  on conflict (id) do update set phone = excluded.phone;
  return new;
end $$;

create trigger on_auth_user_changed
  after insert or update of phone on auth.users
  for each row execute function public.sync_profile_from_auth();

-- ---------------------------------------------------------------------
--  İşletme
-- ---------------------------------------------------------------------
create table public.businesses (
  id                        uuid primary key default gen_random_uuid(),
  slug                      text not null unique
                              check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$'),
  name                      text not null check (char_length(name) between 2 and 80),
  description               text check (char_length(description) <= 500),
  phone                     text,
  address                   text check (char_length(address) <= 200),
  timezone                  text not null default 'Europe/Istanbul',
  -- Arayüzde kullanılacak kelimeler: işletme kendi dilini seçer
  resource_label            text not null default 'Personel' check (char_length(resource_label) between 1 and 30),
  -- Kurallar
  booking_mode              text not null default 'approval' check (booking_mode in ('instant', 'approval')),
  slot_interval_min         int  not null default 30  check (slot_interval_min between 5 and 480),
  min_notice_min            int  not null default 60  check (min_notice_min between 0 and 43200),
  max_advance_days          int  not null default 30  check (max_advance_days between 1 and 365),
  cancel_until_min          int  not null default 120 check (cancel_until_min between 0 and 43200),
  max_active_per_customer   int  not null default 3   check (max_active_per_customer between 1 and 100),
  weekly_limit_per_customer int           check (weekly_limit_per_customer between 1 and 100),
  booking_note              text check (char_length(booking_note) <= 500), -- müşteriye gösterilen not
  is_active                 boolean not null default true,
  created_by                uuid not null references auth.users(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create trigger businesses_updated before update on public.businesses
  for each row execute function public.set_updated_at();

-- Kaynak: randevuyu karşılayan kişi / alan / ekipman (adı işletmeye ait)
create table public.resources (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  is_active    boolean not null default true,
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);
create index on public.resources (business_id);

-- Hizmet: süre + sonrasında bırakılacak boşluk
create table public.services (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses(id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 80),
  description        text check (char_length(description) <= 300),
  duration_min       int  not null check (duration_min between 5 and 1440),
  buffer_min         int  not null default 0 check (buffer_min between 0 and 240),
  slot_interval_min  int  check (slot_interval_min between 5 and 480), -- boşsa işletme ayarı
  price_text         text check (char_length(price_text) <= 40),
  is_active          boolean not null default true,
  sort               int not null default 0,
  created_at         timestamptz not null default now()
);
create index on public.services (business_id);

-- Hangi hizmeti hangi kaynak verir. Bir hizmet için hiç satır yoksa: hepsi verir.
create table public.service_resources (
  business_id  uuid not null references public.businesses(id) on delete cascade,
  service_id   uuid not null references public.services(id) on delete cascade,
  resource_id  uuid not null references public.resources(id) on delete cascade,
  primary key (service_id, resource_id)
);

-- Çalışma saatleri: bir gün için birden çok aralık olabilir (aralar böyle tanımlanır)
create table public.working_hours (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  resource_id  uuid not null references public.resources(id) on delete cascade,
  weekday      smallint not null check (weekday between 1 and 7), -- ISO: 1=Pzt ... 7=Paz
  start_time   time not null,
  end_time     time not null,
  check (end_time > start_time)
);
create index on public.working_hours (resource_id, weekday);

-- Kapalı zamanlar: tatil, izin, bakım... (resource_id boşsa tüm işletme)
create table public.time_off (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  resource_id  uuid references public.resources(id) on delete cascade,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  reason       text check (char_length(reason) <= 120),
  created_at   timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on public.time_off (business_id, starts_at);

-- Ekip
create table public.business_members (
  business_id  uuid not null references public.businesses(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner', 'staff')),
  resource_id  uuid references public.resources(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index on public.business_members (user_id);

create table public.business_invites (
  code         text primary key default encode(gen_random_bytes(9), 'hex'),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  resource_id  uuid references public.resources(id) on delete set null,
  created_by   uuid not null references auth.users(id),
  expires_at   timestamptz not null default now() + interval '7 days',
  used_by      uuid references auth.users(id),
  used_at      timestamptz
);

-- Müşteri: işletmeye özel kart. user_id boşsa işletmenin elle eklediği
-- (telefonla arayan) kişidir; o telefon sisteme giriş yapınca bağlanır.
create table public.customers (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  user_id           uuid references auth.users(id) on delete set null,
  name              text not null check (char_length(name) between 1 and 80),
  phone             text,
  note              text check (char_length(note) <= 500), -- sadece işletme görür
  is_blocked        boolean not null default false,
  consent_at        timestamptz,
  created_at        timestamptz not null default now()
);
create unique index customers_business_user on public.customers (business_id, user_id) where user_id is not null;
create index customers_business_phone on public.customers (business_id, phone);

-- Randevu
create table public.bookings (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  resource_id    uuid not null references public.resources(id) on delete restrict,
  service_id     uuid references public.services(id) on delete set null,
  service_name   text not null,             -- o anki ad (hizmet sonradan değişse de kayıt bozulmaz)
  customer_id    uuid not null references public.customers(id) on delete cascade,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  block_until    timestamptz not null,      -- ends_at + ara süre; çakışma bu aralıkla ölçülür
  status         text not null default 'pending'
                   check (status in ('pending', 'confirmed', 'cancelled', 'rejected', 'completed', 'no_show')),
  source         text not null default 'customer' check (source in ('customer', 'staff')),
  customer_note  text check (char_length(customer_note) <= 500),
  staff_note     text check (char_length(staff_note) <= 500),
  cancel_reason  text check (char_length(cancel_reason) <= 300),
  cancelled_by   text check (cancelled_by in ('customer', 'staff')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (ends_at > starts_at and block_until >= ends_at),
  -- ÇAKIŞMA KURALI: aynı kaynakta aktif (bekleyen/onaylı) iki randevu üst üste binemez.
  constraint bookings_no_overlap exclude using gist (
    resource_id with =,
    tstzrange(starts_at, block_until, '[)') with &&
  ) where (status in ('pending', 'confirmed'))
);
create index on public.bookings (business_id, starts_at);
create index on public.bookings (customer_id, starts_at);
create trigger bookings_updated before update on public.bookings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
--  Nabız: herkese açık, kişisel veri içermeyen "bir şey değişti" sinyali.
--  Müşteri ekranları buna abone olur ve boş saatleri yeniden çeker.
-- ---------------------------------------------------------------------
create table public.business_pulse (
  business_id  uuid primary key references public.businesses(id) on delete cascade,
  version      bigint not null default 0,
  changed_at   timestamptz not null default now()
);

create or replace function public.bump_pulse()
returns trigger language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  if tg_table_name = 'businesses' then
    b := new.id;
  elsif tg_op = 'DELETE' then
    b := old.business_id;
  else
    b := new.business_id;
  end if;
  insert into public.business_pulse (business_id, version, changed_at)
  values (b, 1, now())
  on conflict (business_id) do update
    set version = public.business_pulse.version + 1, changed_at = now();
  return coalesce(new, old);
end $$;

create trigger pulse_bookings after insert or update or delete on public.bookings
  for each row execute function public.bump_pulse();
create trigger pulse_time_off after insert or update or delete on public.time_off
  for each row execute function public.bump_pulse();
create trigger pulse_hours after insert or update or delete on public.working_hours
  for each row execute function public.bump_pulse();
create trigger pulse_services after insert or update or delete on public.services
  for each row execute function public.bump_pulse();
create trigger pulse_resources after insert or update or delete on public.resources
  for each row execute function public.bump_pulse();
create trigger pulse_service_resources after insert or update or delete on public.service_resources
  for each row execute function public.bump_pulse();
create trigger pulse_business after insert or update on public.businesses
  for each row execute function public.bump_pulse();

-- ---------------------------------------------------------------------
--  Yetki yardımcıları
-- ---------------------------------------------------------------------
create or replace function public.is_member(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members where business_id = b and user_id = auth.uid())
$$;

create or replace function public.is_owner(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_members where business_id = b and user_id = auth.uid() and role = 'owner')
$$;

-- Giriş yapan kişinin doğrulanmış telefonu
create or replace function public.my_phone()
returns text language sql stable security definer set search_path = public as $$
  select public.normalize_phone(phone) from auth.users where id = auth.uid()
$$;

-- ---------------------------------------------------------------------
--  Satır düzeyi güvenlik
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.businesses        enable row level security;
alter table public.resources         enable row level security;
alter table public.services          enable row level security;
alter table public.service_resources enable row level security;
alter table public.working_hours     enable row level security;
alter table public.time_off          enable row level security;
alter table public.business_members  enable row level security;
alter table public.business_invites  enable row level security;
alter table public.customers         enable row level security;
alter table public.bookings          enable row level security;
alter table public.business_pulse    enable row level security;

-- Profil: herkes sadece kendini
create policy profiles_self_select on public.profiles for select using (id = auth.uid());
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- İşletme vitrini herkese açık; düzenleme sadece sahibe
create policy businesses_public on public.businesses for select using (is_active or public.is_member(id));
create policy businesses_owner_update on public.businesses for update using (public.is_owner(id)) with check (public.is_owner(id));

-- Vitrin bilgileri (kaynak, hizmet, saatler) herkese açık; yönetim sahibe
create policy resources_public on public.resources for select using (true);
create policy resources_owner on public.resources for all using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy services_public on public.services for select using (true);
create policy services_owner on public.services for all using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy sr_public on public.service_resources for select using (true);
create policy sr_owner on public.service_resources for all using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy wh_public on public.working_hours for select using (true);
create policy wh_owner on public.working_hours for all using (public.is_owner(business_id)) with check (public.is_owner(business_id));

-- Kapalı zamanlar: ekip görür ve yönetir (personel kendi iznini girebilsin)
create policy time_off_member on public.time_off for all using (public.is_member(business_id)) with check (public.is_member(business_id));

-- Ekip
create policy members_select on public.business_members for select using (user_id = auth.uid() or public.is_member(business_id));
create policy members_owner_delete on public.business_members for delete using (public.is_owner(business_id) and role <> 'owner');
create policy members_owner_update on public.business_members for update using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy invites_owner on public.business_invites for all using (public.is_owner(business_id)) with check (public.is_owner(business_id));

-- Müşteri kartları ve randevular: sadece ekip. Müşteri kendi verisini RPC ile görür.
create policy customers_member_select on public.customers for select using (public.is_member(business_id));
create policy customers_member_update on public.customers for update using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy bookings_member_select on public.bookings for select using (public.is_member(business_id));

create policy pulse_public on public.business_pulse for select using (true);

-- ---------------------------------------------------------------------
--  BOŞ SAATLER
--  Çalışma aralıkları içinde, hizmet süresi sığan, aktif randevu ve
--  kapalı zamanla çakışmayan başlangıç anlarını döndürür.
-- ---------------------------------------------------------------------
create or replace function public.available_slots(
  p_business uuid,
  p_service  uuid,
  p_from     date,
  p_days     int  default 7,
  p_resource uuid default null,
  p_ignore_rules boolean default false   -- ekip için: önceden haber / ileri tarih sınırı uygulanmaz
)
returns table (resource_id uuid, starts_at timestamptz)
language sql stable security definer set search_path = public as $$
  with b as (
    select * from businesses where id = p_business and (is_active or public.is_member(id))
  ),
  s as (
    select sv.* from services sv join b on b.id = sv.business_id
    where sv.id = p_service and (sv.is_active or p_ignore_rules)
  ),
  prm as (
    select b.timezone as tz,
           make_interval(mins => s.duration_min)                as len,
           make_interval(mins => s.duration_min + s.buffer_min) as blk,
           make_interval(mins => coalesce(s.slot_interval_min, b.slot_interval_min)) as step,
           case when p_ignore_rules and public.is_member(b.id) then '-infinity'::timestamptz
                else now() + make_interval(mins => b.min_notice_min) end as earliest,
           case when p_ignore_rules and public.is_member(b.id) then 'infinity'::timestamptz
                else now() + make_interval(days => b.max_advance_days) end as latest
    from b, s
  ),
  days as (
    select (p_from + i) as day
    from generate_series(0, least(greatest(p_days, 1), 62) - 1) as i
  ),
  res as (
    select r.id from resources r
    where r.business_id = p_business and r.is_active
      and (p_resource is null or r.id = p_resource)
      and (
        not exists (select 1 from service_resources sr where sr.service_id = p_service)
        or exists (select 1 from service_resources sr where sr.service_id = p_service and sr.resource_id = r.id)
      )
  ),
  windows as (
    select res.id as rid,
           (d.day + wh.start_time) at time zone prm.tz as w_start,
           (d.day + wh.end_time)   at time zone prm.tz as w_end
    from res
    cross join days d
    cross join prm
    join working_hours wh on wh.resource_id = res.id and wh.weekday = extract(isodow from d.day)
  ),
  cands as (
    select w.rid, gs as st
    from windows w, prm,
         generate_series(w.w_start, w.w_end - prm.len, prm.step) as gs
  )
  select c.rid, c.st
  from cands c, prm
  where c.st >= prm.earliest
    and c.st <= prm.latest
    and not exists (
      select 1 from bookings bk
      where bk.resource_id = c.rid
        and bk.status in ('pending', 'confirmed')
        and tstzrange(bk.starts_at, bk.block_until, '[)') && tstzrange(c.st, c.st + prm.blk, '[)')
    )
    and not exists (
      select 1 from time_off t
      where t.business_id = p_business
        and (t.resource_id is null or t.resource_id = c.rid)
        and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(c.st, c.st + prm.len, '[)')
    )
  order by c.st, c.rid
$$;

-- ---------------------------------------------------------------------
--  Profil adı
-- ---------------------------------------------------------------------
create or replace function public.update_my_name(p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) < 2 or char_length(p_name) > 80 then raise exception 'INVALID_NAME'; end if;
  insert into profiles (id, full_name, phone) values (auth.uid(), p_name, public.my_phone())
  on conflict (id) do update set full_name = excluded.full_name;
  -- Bu kişinin işletmelerdeki müşteri kartlarında adı güncelle
  update customers set name = p_name where user_id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
--  Müşteri kartını bul / oluştur (doğrulanmış telefonla eşleştir)
-- ---------------------------------------------------------------------
create or replace function public._ensure_customer(p_business uuid, p_consent boolean)
returns public.customers language plpgsql security definer set search_path = public as $$
declare
  c customers;
  v_phone text := public.my_phone();
  v_name  text;
begin
  select full_name into v_name from profiles where id = auth.uid();
  if v_name is null or char_length(v_name) < 2 then raise exception 'NAME_REQUIRED'; end if;

  select * into c from customers where business_id = p_business and user_id = auth.uid();
  if not found and v_phone is not null then
    -- İşletmenin daha önce elle eklediği (telefonla aramış) kart varsa sahiplen.
    -- Telefon SMS ile doğrulandığı için bu güvenlidir.
    update customers set user_id = auth.uid(), name = v_name
    where id = (
      select id from customers
      where business_id = p_business and user_id is null and phone = v_phone
      order by created_at limit 1
    )
    returning * into c;
  end if;
  if c.id is null then
    insert into customers (business_id, user_id, name, phone, consent_at)
    values (p_business, auth.uid(), v_name, v_phone, case when p_consent then now() end)
    returning * into c;
  elsif p_consent and c.consent_at is null then
    update customers set consent_at = now() where id = c.id returning * into c;
  end if;
  -- Aynı işletmede bu kişiye ait tüm elle eklenmiş kartları da bağla
  if v_phone is not null then
    update bookings set customer_id = c.id
    where customer_id in (select id from customers where business_id = p_business and user_id is null and phone = v_phone);
  end if;
  return c;
end $$;

-- ---------------------------------------------------------------------
--  RANDEVU AL (müşteri)
-- ---------------------------------------------------------------------
create or replace function public.book(
  p_business  uuid,
  p_service   uuid,
  p_starts_at timestamptz,
  p_resource  uuid default null,
  p_note      text default null,
  p_consent   boolean default false
)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  b        businesses;
  s        services;
  c        customers;
  v_rid    uuid;
  v_day    date;
  v_status text;
  v_id     uuid;
  v_active int;
  v_week   int;
  v_week_start timestamptz;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if public.my_phone() is null then raise exception 'PHONE_REQUIRED'; end if;

  select * into b from businesses where id = p_business and is_active;
  if not found then raise exception 'BUSINESS_NOT_FOUND'; end if;
  select * into s from services where id = p_service and business_id = p_business and is_active;
  if not found then raise exception 'SERVICE_NOT_FOUND'; end if;

  c := public._ensure_customer(p_business, p_consent);
  if c.consent_at is null then raise exception 'CONSENT_REQUIRED'; end if;

  -- Engellenen numara
  if exists (select 1 from customers where business_id = p_business and phone = c.phone and is_blocked) then
    raise exception 'BLOCKED';
  end if;

  -- Aynı kişinin eşzamanlı isteklerini sıraya sok (limit kontrolleri için)
  perform pg_advisory_xact_lock(hashtextextended(p_business::text || coalesce(c.phone, c.id::text), 0));

  -- Açık randevu sınırı
  select count(*) into v_active from bookings
  where customer_id = c.id and status in ('pending', 'confirmed') and starts_at > now();
  if v_active >= b.max_active_per_customer then raise exception 'ACTIVE_LIMIT'; end if;

  -- Haftalık sınır (işletmenin saat diliminde Pazartesi başlangıçlı hafta)
  if b.weekly_limit_per_customer is not null then
    v_week_start := date_trunc('week', p_starts_at at time zone b.timezone) at time zone b.timezone;
    select count(*) into v_week from bookings
    where customer_id = c.id
      and status in ('pending', 'confirmed', 'completed')
      and starts_at >= v_week_start and starts_at < v_week_start + interval '7 days';
    if v_week >= b.weekly_limit_per_customer then raise exception 'WEEKLY_LIMIT'; end if;
  end if;

  -- Müşteri aynı anda iki yerde olamaz
  if exists (
    select 1 from bookings
    where customer_id = c.id and status in ('pending', 'confirmed')
      and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, p_starts_at + make_interval(mins => s.duration_min), '[)')
  ) then raise exception 'CUSTOMER_OVERLAP'; end if;

  -- Saat gerçekten boş mu? Kaynak seçilmediyse o gün en az dolu olanı ver.
  v_day := (p_starts_at at time zone b.timezone)::date;
  select a.resource_id into v_rid
  from public.available_slots(p_business, p_service, v_day, 1, p_resource) a
  where a.starts_at = p_starts_at
  order by (
    select count(*) from bookings x
    where x.resource_id = a.resource_id and x.status in ('pending', 'confirmed')
      and (x.starts_at at time zone b.timezone)::date = v_day
  ), random()
  limit 1;
  if v_rid is null then raise exception 'SLOT_TAKEN'; end if;

  v_status := case when b.booking_mode = 'instant' then 'confirmed' else 'pending' end;

  begin
    insert into bookings (business_id, resource_id, service_id, service_name, customer_id,
                          starts_at, ends_at, block_until, status, source, customer_note)
    values (p_business, v_rid, s.id, s.name, c.id,
            p_starts_at,
            p_starts_at + make_interval(mins => s.duration_min),
            p_starts_at + make_interval(mins => s.duration_min + s.buffer_min),
            v_status, 'customer', nullif(btrim(coalesce(p_note, '')), ''))
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN';
  end;

  return jsonb_build_object('id', v_id, 'status', v_status, 'resource_id', v_rid,
                            'starts_at', p_starts_at,
                            'ends_at', p_starts_at + make_interval(mins => s.duration_min));
end $$;

-- ---------------------------------------------------------------------
--  Müşteri: randevularım / iptal / verilerimi sil
-- ---------------------------------------------------------------------
create or replace function public.my_bookings()
returns table (
  id uuid, status text, starts_at timestamptz, ends_at timestamptz,
  service_name text, resource_name text, customer_note text, cancel_reason text,
  business_id uuid, business_name text, business_slug text, business_phone text,
  business_address text, timezone text, cancel_until_min int, resource_label text
)
language sql stable security definer set search_path = public as $$
  select bk.id, bk.status, bk.starts_at, bk.ends_at, bk.service_name, r.name, bk.customer_note, bk.cancel_reason,
         b.id, b.name, b.slug, b.phone, b.address, b.timezone, b.cancel_until_min, b.resource_label
  from bookings bk
  join customers c on c.id = bk.customer_id
  join businesses b on b.id = bk.business_id
  join resources r on r.id = bk.resource_id
  where c.user_id = auth.uid()
  order by bk.starts_at desc
  limit 200
$$;

create or replace function public.cancel_my_booking(p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare bk bookings; b businesses;
begin
  select bk2.* into bk from bookings bk2 join customers c on c.id = bk2.customer_id
  where bk2.id = p_id and c.user_id = auth.uid() for update of bk2;
  if not found then raise exception 'NOT_FOUND'; end if;
  if bk.status not in ('pending', 'confirmed') then raise exception 'NOT_CANCELLABLE'; end if;
  select * into b from businesses where id = bk.business_id;
  -- Onaylanmış randevu, işletmenin belirlediği süreden sonra iptal edilemez
  if bk.status = 'confirmed' and bk.starts_at - now() < make_interval(mins => b.cancel_until_min) then
    raise exception 'CANCEL_TOO_LATE';
  end if;
  update bookings set status = 'cancelled', cancelled_by = 'customer',
                      cancel_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_id;
end $$;

create or replace function public.forget_me()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  update bookings set status = 'cancelled', cancelled_by = 'customer', cancel_reason = 'Müşteri verilerini sildi'
  where customer_id in (select id from customers where user_id = auth.uid())
    and status in ('pending', 'confirmed') and starts_at > now();
  update customers set name = 'Silinmiş kullanıcı', phone = null, note = null, user_id = null
  where user_id = auth.uid();
  update profiles set full_name = null where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
--  İşletme oluştur (kurulum sihirbazı)
--  Saatler, günler, hizmet adı ve süresi tamamen kullanıcıdan gelir.
-- ---------------------------------------------------------------------
create or replace function public.create_business(
  p_name            text,
  p_slug            text,
  p_resource_label  text,
  p_resource_name   text,
  p_service_name    text,
  p_duration_min    int,
  p_hours           jsonb,        -- [{"weekday":1,"start":"09:00","end":"12:00"}, ...]
  p_phone           text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_bid uuid; v_rid uuid; v_sid uuid; h jsonb;
  reserved text[] := array['panel','giris','randevularim','katil','kvkk','yeni','api','admin','app','www','assets','hesap'];
begin
  if auth.uid() is null or public.my_phone() is null then raise exception 'AUTH_REQUIRED'; end if;
  if (select count(*) from business_members where user_id = auth.uid() and role = 'owner') >= 5 then
    raise exception 'TOO_MANY_BUSINESSES';
  end if;
  p_slug := lower(btrim(p_slug));
  if p_slug = any(reserved) then raise exception 'SLUG_RESERVED'; end if;
  if exists (select 1 from businesses where slug = p_slug) then raise exception 'SLUG_TAKEN'; end if;
  if jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) = 0 then raise exception 'HOURS_REQUIRED'; end if;

  insert into businesses (slug, name, resource_label, phone, created_by)
  values (p_slug, btrim(p_name), coalesce(nullif(btrim(p_resource_label), ''), 'Personel'), p_phone, auth.uid())
  returning id into v_bid;

  insert into resources (business_id, name) values (v_bid, btrim(p_resource_name)) returning id into v_rid;
  insert into business_members (business_id, user_id, role, resource_id) values (v_bid, auth.uid(), 'owner', v_rid);
  insert into services (business_id, name, duration_min) values (v_bid, btrim(p_service_name), p_duration_min)
  returning id into v_sid;

  for h in select * from jsonb_array_elements(p_hours) loop
    insert into working_hours (business_id, resource_id, weekday, start_time, end_time)
    values (v_bid, v_rid, (h->>'weekday')::smallint, (h->>'start')::time, (h->>'end')::time);
  end loop;

  return v_bid;
end $$;

-- ---------------------------------------------------------------------
--  Ekip daveti
-- ---------------------------------------------------------------------
create or replace function public.accept_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare i business_invites;
begin
  if auth.uid() is null or public.my_phone() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into i from business_invites where code = p_code for update;
  if not found or i.used_at is not null or i.expires_at < now() then raise exception 'INVITE_INVALID'; end if;
  insert into business_members (business_id, user_id, role, resource_id)
  values (i.business_id, auth.uid(), 'staff', i.resource_id)
  on conflict (business_id, user_id) do nothing;
  update business_invites set used_by = auth.uid(), used_at = now() where code = p_code;
  return i.business_id;
end $$;

create or replace function public.invite_preview(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('business_name', b.name, 'resource_name', r.name,
                            'valid', i.used_at is null and i.expires_at > now())
  from business_invites i join businesses b on b.id = i.business_id
  left join resources r on r.id = i.resource_id
  where i.code = p_code
$$;

create or replace function public.list_members(p_business uuid)
returns table (user_id uuid, role text, resource_id uuid, full_name text, phone text)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.role, m.resource_id, p.full_name, p.phone
  from business_members m left join profiles p on p.id = m.user_id
  where m.business_id = p_business and public.is_member(p_business)
  order by m.role desc, m.created_at
$$;

-- ---------------------------------------------------------------------
--  EKİP: randevu ekle (telefonla arayan müşteri için) / güncelle
-- ---------------------------------------------------------------------
create or replace function public.staff_create_booking(
  p_business     uuid,
  p_service      uuid,
  p_resource     uuid,
  p_starts_at    timestamptz,
  p_customer_id  uuid default null,
  p_name         text default null,
  p_phone        text default null,
  p_note         text default null,
  p_duration_min int  default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare s services; v_cid uuid; v_phone text; v_dur int; v_id uuid;
begin
  if not public.is_member(p_business) then raise exception 'FORBIDDEN'; end if;
  select * into s from services where id = p_service and business_id = p_business;
  if not found then raise exception 'SERVICE_NOT_FOUND'; end if;
  if not exists (select 1 from resources where id = p_resource and business_id = p_business) then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if p_customer_id is not null then
    select id into v_cid from customers where id = p_customer_id and business_id = p_business;
    if v_cid is null then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  else
    v_phone := public.normalize_phone(p_phone);
    if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'INVALID_NAME'; end if;
    if v_phone is not null then
      select id into v_cid from customers where business_id = p_business and phone = v_phone
      order by (user_id is not null) desc, created_at limit 1;
    end if;
    if v_cid is null then
      insert into customers (business_id, name, phone) values (p_business, btrim(p_name), v_phone)
      returning id into v_cid;
    end if;
  end if;

  v_dur := coalesce(p_duration_min, s.duration_min);
  begin
    insert into bookings (business_id, resource_id, service_id, service_name, customer_id,
                          starts_at, ends_at, block_until, status, source, staff_note)
    values (p_business, p_resource, s.id, s.name, v_cid,
            p_starts_at, p_starts_at + make_interval(mins => v_dur),
            p_starts_at + make_interval(mins => v_dur + s.buffer_min),
            'confirmed', 'staff', nullif(btrim(coalesce(p_note, '')), ''))
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN';
  end;
  return v_id;
end $$;

create or replace function public.staff_update_booking(
  p_id         uuid,
  p_status     text default null,
  p_starts_at  timestamptz default null,
  p_resource   uuid default null,
  p_staff_note text default null,
  p_reason     text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare bk bookings; v_len interval; v_buf interval;
begin
  select * into bk from bookings where id = p_id for update;
  if not found or not public.is_member(bk.business_id) then raise exception 'FORBIDDEN'; end if;
  if p_status is not null and p_status not in ('pending','confirmed','cancelled','rejected','completed','no_show') then
    raise exception 'INVALID_STATUS';
  end if;
  if p_resource is not null and not exists (select 1 from resources where id = p_resource and business_id = bk.business_id) then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;
  v_len := bk.ends_at - bk.starts_at;
  v_buf := bk.block_until - bk.ends_at;
  begin
    update bookings set
      status        = coalesce(p_status, status),
      starts_at     = coalesce(p_starts_at, starts_at),
      ends_at       = coalesce(p_starts_at, starts_at) + v_len,
      block_until   = coalesce(p_starts_at, starts_at) + v_len + v_buf,
      resource_id   = coalesce(p_resource, resource_id),
      staff_note    = case when p_staff_note is null then staff_note else nullif(btrim(p_staff_note), '') end,
      cancel_reason = case when p_status in ('cancelled', 'rejected') then nullif(btrim(coalesce(p_reason, '')), '') else cancel_reason end,
      cancelled_by  = case when p_status in ('cancelled', 'rejected') then 'staff' else cancelled_by end
    where id = p_id;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN';
  end;
end $$;

-- ---------------------------------------------------------------------
--  Yetkiler: tablolar RLS ile korunur; fonksiyonları sadece girişli
--  kullanıcılar çağırabilir (boş saatler ve davet önizleme herkese açık).
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function public.available_slots(uuid, uuid, date, int, uuid, boolean) to anon, authenticated;
grant execute on function public.invite_preview(text) to anon, authenticated;
grant execute on function public.normalize_phone(text) to anon, authenticated;
grant execute on function public.is_member(uuid), public.is_owner(uuid) to anon, authenticated;
grant execute on function
  public.my_phone(), public.update_my_name(text), public.book(uuid, uuid, timestamptz, uuid, text, boolean),
  public.my_bookings(), public.cancel_my_booking(uuid, text), public.forget_me(),
  public.create_business(text, text, text, text, text, int, jsonb, text),
  public.accept_invite(text), public.list_members(uuid),
  public.staff_create_booking(uuid, uuid, uuid, timestamptz, uuid, text, text, text, int),
  public.staff_update_booking(uuid, text, timestamptz, uuid, text, text)
to authenticated;
revoke execute on function public._ensure_customer(uuid, boolean) from authenticated;

-- ---------------------------------------------------------------------
--  Anlık güncellemeler (Supabase Realtime)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.business_pulse, public.bookings;
  end if;
end $$;

-- Sütun düzeyinde kısıt: ekip müşteri kartında sadece bu alanları değiştirebilir
revoke update on public.customers from anon, authenticated;
grant update (name, phone, note, is_blocked) on public.customers to authenticated;
revoke update on public.business_members from anon, authenticated;
grant update (resource_id) on public.business_members to authenticated;
revoke update on public.businesses from anon, authenticated;
grant update (name, description, phone, address, resource_label, booking_mode, slot_interval_min,
              min_notice_min, max_advance_days, cancel_until_min, max_active_per_customer,
              weekly_limit_per_customer, booking_note, is_active, slug, timezone)
  on public.businesses to authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;
