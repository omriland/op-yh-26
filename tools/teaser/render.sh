#!/usr/bin/env bash
# Renders tools/teaser/teaser.html to a square PNG with headless Chrome.
#
# The stage pulls src/styles/{tokens,base,components}.css directly, so every card
# in the image is the real "רשומה" component — edit the markup in teaser.html
# (copied from the matching .tsx) rather than restyling anything here.
#
#   ./tools/teaser/render.sh [out.png]
#
# Output is 2160×2160 (device scale 2). Downscale to 1080×1080 for WhatsApp.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${1:-$HERE/teaser.png}"
PROFILE="$(mktemp -d)"
trap 'rm -rf "$PROFILE"' EXIT

CHROME="${CHROME:-google-chrome}"
command -v "$CHROME" >/dev/null || {
  echo "Chrome not found. Set CHROME=/path/to/chrome" >&2
  exit 1
}

rm -f "$OUT"

# Fonts come from Google Fonts, same as index.html — the render needs network.
timeout 180 "$CHROME" \
  --headless=new \
  --disable-gpu \
  --no-sandbox \
  --disable-dev-shm-usage \
  --no-first-run \
  --no-default-browser-check \
  --user-data-dir="$PROFILE" \
  --allow-file-access-from-files \
  --hide-scrollbars \
  --force-device-scale-factor=2 \
  --window-size=1080,1080 \
  --virtual-time-budget=9000 \
  --screenshot="$OUT" \
  "file://$HERE/teaser.html" >/dev/null 2>&1 || true

[ -f "$OUT" ] || {
  echo "render failed: no screenshot written" >&2
  exit 1
}
echo "wrote $OUT"
