#!/usr/bin/env bash
# Arayüz uçtan uca testi: uygulama Firebase emülatörüne bağlanır, Playwright tıklar.
# Gereksinim: Java 11+, firebase-tools, playwright + chromium.
set -euo pipefail
cd "$(dirname "$0")/.."
(cd functions && npm run build >/dev/null)
VITE_USE_EMULATORS=1 npx vite build --outDir dist-emu >/dev/null
echo "RANDEVU_DISABLE_TRIGGERS=${RANDEVU_DISABLE_TRIGGERS:-0}" > functions/.env.local
trap 'rm -f functions/.env.local' EXIT
${FIREBASE:-npx firebase} emulators:exec --project demo-randevu --only auth,firestore,functions \
  "bash -c 'npx vite preview --outDir dist-emu --host 127.0.0.1 --port 4173 --strictPort >/dev/null 2>&1 & sleep 2; NODE_PATH=\${NODE_PATH:-\$(npm root -g)} node tests/ui/run.cjs; s=\$?; kill %1; exit \$s'"
