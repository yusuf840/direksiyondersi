-- Kural testleri. Çalıştırma: scripts/test-db.sh
\set ON_ERROR_STOP 1
\set owner  '''11111111-1111-1111-1111-111111111111'''
\set cust_b '''22222222-2222-2222-2222-222222222222'''
\set cust_c '''33333333-3333-3333-3333-333333333333'''
\set cust_d '''44444444-4444-4444-4444-444444444444'''

insert into auth.users (id, phone) values
  (:owner, '905300000001'), (:cust_b, '905300000002'), (:cust_c, '905300000003'), (:cust_d, '905300000004');

create or replace function pg_temp.as_user(u uuid) returns void language sql as
$$ select set_config('request.jwt.claim.sub', coalesce(u::text, ''), false) $$;

-- Hata kodunu yakalayıp döndüren yardımcı
create or replace function pg_temp.err(q text) returns text language plpgsql as $$
begin execute q; return 'OK'; exception when others then return sqlerrm; end $$;

create or replace function pg_temp.check(label text, got anyelement, want anyelement) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL % : got %, want %', label, got, want; end if;
  raise notice 'ok  %', label;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

-- Test günü: 10 gün sonrası (İstanbul)
select ((now() at time zone 'Europe/Istanbul')::date + 10) as d \gset

-- 1) Sahip işletmeyi kurar: saatleri KENDİSİ girer (araları dahil)
select pg_temp.as_user(:owner);
set role authenticated;
select public.create_business('Test İşletme', 'test-isletme', 'Uzman', 'Ayşe', 'Görüşme', 50,
  (select jsonb_agg(x) from (
     select jsonb_build_object('weekday', w, 'start', '09:00', 'end', '12:00') x from generate_series(1,7) w
     union all
     select jsonb_build_object('weekday', w, 'start', '13:00', 'end', '18:00') from generate_series(1,7) w) t)
) as bid \gset
update services set buffer_min = 10, slot_interval_min = 60 where business_id = :'bid';
select id as sid from services where business_id = :'bid' \gset
select id as rid from resources where business_id = :'bid' \gset

select pg_temp.check('boş saat sayısı (09,10,11,13..17)',
  (select count(*) from available_slots(:'bid', :'sid', :'d', 1)), 8::bigint);
select pg_temp.check('ilk saat 09:00',
  (select min(starts_at) at time zone 'Europe/Istanbul' from available_slots(:'bid', :'sid', :'d', 1))::time, '09:00'::time);

-- 2) Müşteri B: isim yoksa reddedilir, onay yoksa reddedilir
reset role; select pg_temp.as_user(:cust_b); set role authenticated;
select pg_temp.check('isimsiz', pg_temp.err(format('select book(%L,%L,%L)', :'bid', :'sid', (:'d'::date + time '10:00') at time zone 'Europe/Istanbul')), 'NAME_REQUIRED'::text);
select update_my_name('Bora Müşteri');
select pg_temp.check('KVKK onayı yok', pg_temp.err(format('select book(%L,%L,%L)', :'bid', :'sid', (:'d'::date + time '10:00') at time zone 'Europe/Istanbul')), 'CONSENT_REQUIRED'::text);
select (book(:'bid', :'sid', (:'d'::date + time '10:00') at time zone 'Europe/Istanbul', null, 'not', true))->>'status' as st \gset
select pg_temp.check('onay modunda bekliyor', :'st'::text, 'pending'::text);
select pg_temp.check('aynı kişi üst üste binen 2. randevu alamaz', pg_temp.err(format('select book(%L,%L,%L,null,null,true)', :'bid', :'sid', (:'d'::date + time '10:20') at time zone 'Europe/Istanbul')), 'CUSTOMER_OVERLAP'::text);
select pg_temp.check('çalışma saati dışı', pg_temp.err(format('select book(%L,%L,%L,null,null,true)', :'bid', :'sid', ((:'d'::date + 1) + time '12:00') at time zone 'Europe/Istanbul')), 'SLOT_TAKEN'::text);
select pg_temp.check('müşteri randevu tablosunu doğrudan göremez', (select count(*) from bookings), 0::bigint);
select pg_temp.check('müşteri kartlarını göremez', (select count(*) from customers), 0::bigint);
select pg_temp.check('randevularım', (select count(*) from my_bookings()), 1::bigint);

-- 3) Müşteri C aynı saate: çakışma
reset role; select pg_temp.as_user(:cust_c); set role authenticated;
select update_my_name('Cem Müşteri');
select pg_temp.check('ızgara dışı saat (11:20) reddedilir', pg_temp.err(format('select book(%L,%L,%L,null,null,true)', :'bid', :'sid', (:'d'::date + time '11:20') at time zone 'Europe/Istanbul')), 'SLOT_TAKEN'::text);
select pg_temp.check('dolu saat', pg_temp.err(format('select book(%L,%L,%L,null,null,true)', :'bid', :'sid', (:'d'::date + time '10:00') at time zone 'Europe/Istanbul')), 'SLOT_TAKEN'::text);
select pg_temp.check('boş saat 7 kaldı', (select count(*) from available_slots(:'bid', :'sid', :'d', 1)), 7::bigint);
select pg_temp.check('ara süre: 11:00 hâlâ müsait (10:50+10dk)',
  exists(select 1 from available_slots(:'bid', :'sid', :'d', 1) where starts_at = (:'d'::date + time '11:00') at time zone 'Europe/Istanbul'), true);

-- 4) Sahip haftalık sınırı 1 yapar -> B aynı hafta ikinci randevu alamaz
reset role; select pg_temp.as_user(:owner); set role authenticated;
update businesses set weekly_limit_per_customer = 1 where id = :'bid';
reset role; select pg_temp.as_user(:cust_b); set role authenticated;
select pg_temp.check('haftalık sınır', pg_temp.err(format('select book(%L,%L,%L,null,null,true)', :'bid', :'sid', (:'d'::date + time '15:00') at time zone 'Europe/Istanbul')), 'WEEKLY_LIMIT'::text);

-- 5) Sahip kapalı zaman ekler (13:00-15:00) -> 13 ve 14 kaybolur
reset role; select pg_temp.as_user(:owner); set role authenticated;
update businesses set weekly_limit_per_customer = null where id = :'bid';
insert into time_off (business_id, resource_id, starts_at, ends_at, reason)
values (:'bid', null, (:'d'::date + time '13:00') at time zone 'Europe/Istanbul', (:'d'::date + time '15:00') at time zone 'Europe/Istanbul', 'Toplantı');
select pg_temp.check('kapalı zaman sonrası 5 saat', (select count(*) from available_slots(:'bid', :'sid', :'d', 1)), 5::bigint);

-- 6) Telefonla arayan D'yi sahip elle ekler; D sonra giriş yapınca kartı sahiplenir
select staff_create_booking(:'bid', :'sid', :'rid', (:'d'::date + time '16:00') at time zone 'Europe/Istanbul', null, 'Deniz (telefon)', '0530 000 00 04') as sbk \gset
select pg_temp.check('ekip çakışan saate ekleyemez', pg_temp.err(format('select staff_create_booking(%L,%L,%L,%L,null,%L,null)', :'bid', :'sid', :'rid', (:'d'::date + time '16:30') at time zone 'Europe/Istanbul', 'X Y')), 'SLOT_TAKEN'::text);
reset role; select pg_temp.as_user(:cust_d); set role authenticated;
select update_my_name('Deniz Doğan');
select book(:'bid', :'sid', ((:'d'::date + 1) + time '09:00') at time zone 'Europe/Istanbul', null, null, true);
select pg_temp.check('D iki randevusunu da görür', (select count(*) from my_bookings()), 2::bigint);
reset role; select pg_temp.as_user(:owner); set role authenticated;
select pg_temp.check('D için tek müşteri kartı', (select count(*) from customers where phone = '+905300000004'), 1::bigint);

-- 7) Onay + iptal kuralları
select id as bk_b from bookings where customer_id = (select id from customers where phone = '+905300000002') \gset
select staff_update_booking(:'bk_b', 'confirmed');
update businesses set cancel_until_min = 60*24*30 where id = :'bid';  -- 30 gün öncesine kadar iptal
reset role; select pg_temp.as_user(:cust_b); set role authenticated;
select pg_temp.check('geç iptal reddedilir', pg_temp.err(format('select cancel_my_booking(%L)', :'bk_b')), 'CANCEL_TOO_LATE'::text);
reset role; select pg_temp.as_user(:owner); set role authenticated;
update businesses set cancel_until_min = 60 where id = :'bid';
reset role; select pg_temp.as_user(:cust_c); set role authenticated;
select pg_temp.check('başkasının randevusu iptal edilemez', pg_temp.err(format('select cancel_my_booking(%L)', :'bk_b')), 'NOT_FOUND'::text);
reset role; select pg_temp.as_user(:cust_b); set role authenticated;
select cancel_my_booking(:'bk_b', 'işim çıktı');
select pg_temp.check('iptal sonrası saat boşaldı',
  exists(select 1 from available_slots(:'bid', :'sid', :'d', 1) where starts_at = (:'d'::date + time '10:00') at time zone 'Europe/Istanbul'), true);

-- 8) Engellenen numara
reset role; select pg_temp.as_user(:cust_c); set role authenticated;
select book(:'bid', :'sid', ((:'d'::date + 2) + time '09:00') at time zone 'Europe/Istanbul', null, null, true);
reset role; select pg_temp.as_user(:owner); set role authenticated;
update customers set is_blocked = true where phone = '+905300000003';
select pg_temp.check('ekip müşteriyi başka kullanıcıya bağlayamaz', pg_temp.err(format('update customers set user_id = %L', :cust_b)), 'permission denied for table customers'::text);
reset role; select pg_temp.as_user(:cust_c); set role authenticated;
select pg_temp.check('engelli numara', pg_temp.err(format('select book(%L,%L,%L,null,null,true)', :'bid', :'sid', (:'d'::date + time '17:00') at time zone 'Europe/Istanbul')), 'BLOCKED'::text);

-- 9) Başkasının işletmesini düzenleyemez
update businesses set name = 'hack' where id = :'bid';
reset role;
select pg_temp.check('yabancı işletmeyi güncelleyemez', (select name from businesses where id = :'bid'), 'Test İşletme'::text);
select pg_temp.as_user(:cust_c); set role authenticated;

-- 10) Anonim (giriş yapmamış) ziyaretçi
reset role; select pg_temp.as_user(null); set role anon;
select pg_temp.check('ziyaretçi boş saatleri görür', (select count(*) > 0 from available_slots(:'bid', :'sid', :'d', 1)), true);
select pg_temp.check('ziyaretçi randevu alamaz', pg_temp.err(format('select book(%L,%L,%L,null,null,true)', :'bid', :'sid', (:'d'::date + time '17:00') at time zone 'Europe/Istanbul')), 'permission denied for function book'::text);
reset role;

-- 11) Çalışma saatleri tek işlemde değişir; çakışan aralık reddedilir
select pg_temp.as_user(:owner); set role authenticated;
select pg_temp.check('çakışan aralık reddedilir', pg_temp.err(format('select set_working_hours(%L, %L)', :'rid',
  '[{"weekday":1,"start":"09:00","end":"12:00"},{"weekday":1,"start":"11:00","end":"14:00"}]')), 'HOURS_OVERLAP'::text);
select pg_temp.check('hata sonrası eski saatler duruyor', (select count(*) from working_hours where resource_id = :'rid'), 14::bigint);
select set_working_hours(:'rid', '[{"weekday":1,"start":"10:00","end":"16:00"}]');
select pg_temp.check('yeni saatler', (select count(*) from working_hours where resource_id = :'rid'), 1::bigint);
reset role; select pg_temp.as_user(:cust_b); set role authenticated;
select pg_temp.check('müşteri saat değiştiremez', pg_temp.err(format('select set_working_hours(%L, %L)', :'rid', '[]')), 'FORBIDDEN'::text);
reset role;
\echo SAAT_TESTLERI_GECTI
