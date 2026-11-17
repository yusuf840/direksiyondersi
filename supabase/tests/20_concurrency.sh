#!/usr/bin/env bash
# 20 farklı müşteri AYNI ANDA aynı saate randevu almaya çalışır: tam 1 tanesi başarmalı.
set -euo pipefail
DB=$1
PSQL="psql -X -q -t -A -d $DB"
$PSQL -c "update businesses set weekly_limit_per_customer = null, booking_mode = 'instant'" >/dev/null
read BID SID <<<"$($PSQL -F' ' -c "select b.id, s.id from businesses b join services s on s.business_id=b.id limit 1")"
SLOT=$($PSQL -c "select starts_at from available_slots('$BID','$SID', (now() at time zone 'Europe/Istanbul')::date + 3, 28) limit 1")
for i in $(seq 1 20); do
  U=$(printf '99999999-0000-0000-0000-%012d' $i)
  $PSQL -c "insert into auth.users(id, phone) values ('$U', '9055500000$(printf %02d $i)')" >/dev/null
  $PSQL -c "insert into profiles(id, full_name, phone) values ('$U','Yarış $i', '+9055500000$(printf %02d $i)') on conflict (id) do update set full_name = excluded.full_name" >/dev/null
done
for i in $(seq 1 20); do
  U=$(printf '99999999-0000-0000-0000-%012d' $i)
  ( $PSQL -c "select set_config('request.jwt.claim.sub','$U',false); set role authenticated; select book('$BID','$SID','$SLOT',null,null,true);" >/dev/null 2>&1 && echo WIN || echo LOSE ) &
done > /tmp/race.$$ ; wait
WINS=$(grep -c WIN /tmp/race.$$ || true); rm -f /tmp/race.$$
N=$($PSQL -c "select count(*) from bookings where starts_at = '$SLOT' and status in ('pending','confirmed')")
echo "eşzamanlı 20 istek: kazanan=$WINS, veritabanındaki aktif kayıt=$N"
[ "$WINS" = "1" ] && [ "$N" = "1" ] && echo "ok  yarış testi" || { echo "FAIL yarış testi"; exit 1; }
