#!/usr/bin/env bash
# Arayüz akış testi: Supabase API'si Playwright ile taklit edilir (gerçek veritabanı gerekmez).
# Gereksinim: playwright + chromium kurulu olmalı.
set -euo pipefail
cd "$(dirname "$0")/.."
VITE_SUPABASE_URL=http://mock.supabase.test VITE_SUPABASE_ANON_KEY=anon npx vite build --outDir dist-mock >/dev/null
npx vite preview --outDir dist-mock --port 4173 --strictPort >/dev/null 2>&1 &
PID=$!; trap 'kill $PID' EXIT; sleep 2
NODE_PATH=${NODE_PATH:-$(npm root -g)} node tests/ui/run.cjs
