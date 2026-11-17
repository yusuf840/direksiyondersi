#!/usr/bin/env bash
# Firestore güvenlik kuralları testleri (Firebase emülatörü; Java 11+ ve firebase-tools gerekir)
set -euo pipefail
cd "$(dirname "$0")/.."
${FIREBASE:-npx firebase} emulators:exec --project demo-randevu --only auth,firestore "node tests/emulator/run.mjs"
