#!/usr/bin/env bash
# Yerel Postgres'te şemayı kurar ve kural testlerini çalıştırır.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-randevu_test}
PSQL="psql -X -q -v ON_ERROR_STOP=1"
$PSQL -d postgres -c "drop database if exists $DB" -c "create database $DB"
$PSQL -d $DB -f supabase/tests/00_supabase_stub.sql $(ls supabase/migrations/*.sql | sed "s/^/-f /")
$PSQL -d $DB -f supabase/tests/10_rules.sql
bash supabase/tests/20_concurrency.sh "$DB"
