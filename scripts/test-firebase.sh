#!/usr/bin/env bash
# Firebase emülatöründe (Auth + Firestore + Functions) uçtan uca kural ve yarış testleri.
# Gereksinim: Java 11+, firebase-tools (npx firebase).
set -euo pipefail
cd "$(dirname "$0")/.."
(cd functions && npm run build >/dev/null)
# Bazı ağ ortamlarında emülatör tetikleyici kaydı engellenebiliyor; testte ayar tetikleyicileri gerekmez
echo "RANDEVU_DISABLE_TRIGGERS=${RANDEVU_DISABLE_TRIGGERS:-0}" > functions/.env.local
trap 'rm -f functions/.env.local' EXIT
${FIREBASE:-npx firebase} emulators:exec --project demo-randevu --only auth,firestore,functions "node tests/emulator/run.mjs"
