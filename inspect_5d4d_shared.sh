#!/data/data/com.termux/files/usr/bin/bash
set -u

cd ~/LOTTERY_PLATFORM || exit 1

echo "======================================================"
echo " LOTTERY_PLATFORM — 5D / 4D SHARED + API AUDIT"
echo "======================================================"

echo
echo "[1] @lp/shared LOCATION"
find packages apps -type f \
  \( -name 'index.ts' -o -name '*.ts' \) \
  2>/dev/null | while read f; do
    if grep -qE 'fiveDRules|fourDRules|FiveDResult|FourDResult' "$f" 2>/dev/null; then
      echo "FOUND: $f"
    fi
  done

echo
echo "[2] EXACT fiveDRules SOURCE"
grep -RniE \
  'export.*fiveDRules|const fiveDRules|fiveDRules\s*=' \
  packages apps 2>/dev/null | head -100 || true

echo
echo "[3] EXACT fourDRules SOURCE"
grep -RniE \
  'export.*fourDRules|const fourDRules|fourDRules\s*=' \
  packages apps 2>/dev/null | head -100 || true

echo
echo "[4] SHARED PACKAGE FILES"
find packages -maxdepth 4 -type f -name '*.ts' -print 2>/dev/null | sort | head -250

echo
echo "[5] 5D/4D GAME REGISTRATION"
grep -RniE \
  '5D_1M|4D_1M|5D|4D|fiveD|fourD' \
  apps/api/src packages 2>/dev/null | head -300 || true

echo
echo "[6] GAMES REGISTRY / GAME CATALOG"
grep -RniE \
  'const GAMES|export.*GAMES|GAMES\s*=|gameCode|roomKey' \
  apps/api/src/modules/game apps/api/src 2>/dev/null | head -300 || true

echo
echo "[7] ROOM CREATION / RULE SELECTION"
grep -RniE \
  'getRules|rulesFor|rulesBy|wingoRules|k3Rules|fiveDRules|fourDRules|roomKey' \
  apps/api/src 2>/dev/null | head -300 || true

echo
echo "[8] SHARED PACKAGE CONFIG"
cat packages/shared/package.json 2>/dev/null || true

echo
echo "======================================================"
echo " AUDIT COMPLETE"
echo "======================================================"
