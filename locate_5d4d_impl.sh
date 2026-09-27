#!/data/data/com.termux/files/usr/bin/bash
set -u

cd ~/LOTTERY_PLATFORM || exit 1

echo "======================================================"
echo " LOTTERY_PLATFORM — EXACT 5D / 4D IMPLEMENTATION FIND"
echo "======================================================"

echo
echo "[1] TEST IMPORT LINES"
sed -n '1,25p' apps/api/src/modules/game/fived.test.ts
echo
sed -n '1,25p' apps/api/src/modules/game/fourd.test.ts

echo
echo "[2] FIND IMPORT TARGET"
grep -nE "from ['\"].*['\"]" \
  apps/api/src/modules/game/fived.test.ts \
  apps/api/src/modules/game/fourd.test.ts

echo
echo "[3] SEARCH fiveDRules/fourDRules IN WHOLE PROJECT"
grep -RniE \
  'fiveDRules|fourDRules' \
  apps/api/src apps/api/prisma 2>/dev/null | head -250

echo
echo "[4] SEARCH 5D / 4D GAME REGISTRATION"
grep -RniE \
  "gameCode.*5D|gameCode.*4D|['\"]5D['\"]|['\"]4D['\"]|5D_1M|4D_1M" \
  apps/api/src apps/api/prisma 2>/dev/null | head -250

echo
echo "[5] RULE ENGINE FILES"
find apps/api/src -type f -name '*.ts' -print | sort | while read f; do
  if grep -qE 'validateSelection|displayOdds|resolve' "$f" 2>/dev/null; then
    echo "RULE-CANDIDATE: $f"
  fi
done

echo
echo "[6] PERIOD / DRAW / BET ROUTING"
grep -RniE \
  'periodService|PeriodService|resolve.*rules|rules.*resolve|BET_MATRIX|betType|selection' \
  apps/api/src/modules/game 2>/dev/null | head -300

echo
echo "======================================================"
echo " EXACT IMPLEMENTATION LOCATION ABOVE"
echo "======================================================"
