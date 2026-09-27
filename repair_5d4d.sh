#!/data/data/com.termux/files/usr/bin/bash
set -u

cd ~/LOTTERY_PLATFORM || exit 1

echo "======================================================"
echo " LOTTERY_PLATFORM — 5D / 4D SOURCE DISCOVERY + REPAIR"
echo "======================================================"

echo
echo "[1] ACTUAL GAME FILES"
find apps/api/src -type f \
  \( -iname '*5d*' -o -iname '*four*d*' -o -iname '*fived*' -o -iname '*fourd*' \) \
  -print | sort

echo
echo "[2] ALL GAME MODULE FILES"
find apps/api/src/modules/game -maxdepth 3 -type f -name '*.ts' \
  -print | sort | head -200

echo
echo "[3] FIND 5D/4D RULE EXPORTS"
grep -RniE \
  'fiveDRules|fourDRules|FiveDRules|FourDRules|fiveD.*Rules|fourD.*Rules' \
  apps/api/src 2>/dev/null | head -100 || true

echo
echo "[4] FIND GAME CODES"
grep -RniE \
  '5D_1M|4D_1M|5D|4D' \
  apps/api/src/modules/game 2>/dev/null | head -150 || true

echo
echo "[5] FIND EXISTING SMOKE/E2E"
find apps/api/scripts -maxdepth 1 -type f -name '*.ts' -print | sort

echo
echo "[6] FIND EXISTING 5D/4D TESTS"
find apps/api -type f \( -name '*5d*.test.ts' -o -name '*4d*.test.ts' \) -print

echo
echo "======================================================"
echo " DISCOVERY COMPLETE"
echo "======================================================"
echo
echo "ऊपर जो ACTUAL paths/export names आए हैं वही सही source हैं."
echo "अब इसी output को देखकर exact E2E patch बनाया जाएगा."
