#!/data/data/com.termux/files/usr/bin/bash
set -u

cd ~/LOTTERY_PLATFORM || exit 1

echo "======================================================"
echo " LOTTERY_PLATFORM — 5D / 4D REAL E2E FIX"
echo "======================================================"

S="apps/api/scripts/smoke-5d4d.ts"

echo "[1] SOURCE CHECK"
ls -l apps/api/src/modules/game/fived.ts apps/api/src/modules/game/fourd.ts

echo
echo "[2] EXPORT CHECK"
grep -nE 'export .*fiveDRules|export .*fourDRules|fiveDRules|fourDRules' \
  apps/api/src/modules/game/fived.ts \
  apps/api/src/modules/game/fourd.ts || true

echo
echo "[3] BACKUP"
cp "$S" "$S.bak.fix.$(date +%Y%m%d_%H%M%S)"

echo
echo "[4] FIX IMPORT PATH"
python - <<'PY'
from pathlib import Path

p = Path("apps/api/scripts/smoke-5d4d.ts")
s = p.read_text()

repls = {
    "../src/modules/game/fived.js": "../src/modules/game/fived.ts",
    "../src/modules/game/fourd.js": "../src/modules/game/fourd.ts",
    "../src/modules/game/fived": "../src/modules/game/fived.ts",
    "../src/modules/game/fourd": "../src/modules/game/fourd.ts",
}

for a,b in repls.items():
    s = s.replace(a,b)

p.write_text(s)
print("IMPORT FIX: ✅")
PY

echo
echo "[5] CURRENT IMPORTS"
grep -nE 'fived|fourd' "$S" || true

echo
echo "[6] DIRECT 5D/4D MODULE TEST"
npx tsx -e "
import * as F5 from './apps/api/src/modules/game/fived.ts';
import * as F4 from './apps/api/src/modules/game/fourd.ts';

console.log('5D exports:', Object.keys(F5).join(', '));
console.log('4D exports:', Object.keys(F4).join(', '));
console.log('fiveDRules:', !!F5.fiveDRules);
console.log('fourDRules:', !!F4.fourDRules);

if (!F5.fiveDRules || !F4.fourDRules) process.exit(2);
"

RC=$?
if [ "$RC" -ne 0 ]; then
  echo
  echo "❌ 5D/4D EXPORT CHECK FAILED"
  exit "$RC"
fi

echo
echo "[7] RUN REAL 5D/4D E2E"
npx tsx "$S"
E2E_RC=$?

echo
echo "[8] LEDGER CHECK"
npx tsx - <<'TS'
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaMariaDb({
  host: '127.0.0.1',
  port: 3306,
  user: 'lottery',
  password: 'lottery123',
  database: 'lottery_platform',
  connectionLimit: 5
});

const prisma = new PrismaClient({ adapter });

try {
  const txs = await prisma.ledgerTransaction.findMany({
    include: { entries: true }
  });

  let global = 0;
  let bad = 0;
  let entries = 0;

  for (const tx of txs) {
    entries += tx.entries.length;
    const sum = tx.entries.reduce((n,e) => n + Number(e.amount), 0);
    global += sum;
    if (sum !== 0) bad++;
  }

  console.log("Transactions:", txs.length);
  console.log("Ledger entries:", entries);
  console.log("Global ledger sum:", global);
  console.log("Unbalanced:", bad);

  if (global === 0 && bad === 0) {
    console.log("LEDGER INTEGRITY: ✅ PASS");
  } else {
    console.log("LEDGER INTEGRITY: ❌ FAIL");
    process.exit(3);
  }
} finally {
  await prisma.$disconnect();
}
TS

LEDGER_RC=$?

echo
echo "======================================================"
echo " 5D / 4D FINAL RESULT"
echo "======================================================"

if [ "$E2E_RC" -eq 0 ]; then
  echo "5D/4D REAL E2E: ✅ PASS"
else
  echo "5D/4D REAL E2E: ❌ FAIL"
fi

if [ "$LEDGER_RC" -eq 0 ]; then
  echo "Ledger integrity:  ✅ PASS"
else
  echo "Ledger integrity:  ❌ FAIL"
fi

if [ "$E2E_RC" -eq 0 ] && [ "$LEDGER_RC" -eq 0 ]; then
  echo
  echo "======================================================"
  echo " PLATFORM VALIDATION: ✅ READY"
  echo "======================================================"
else
  echo
  echo "======================================================"
  echo " PLATFORM VALIDATION: ❌ NEEDS FIX"
  echo "======================================================"
  exit 1
fi
