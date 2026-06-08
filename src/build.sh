#!/usr/bin/env bash
# Concatenate modular sources into a single self-contained HTML for Cowork artifact.
# Usage:
#   ./build.sh                 → produces dist.html in the same folder
#   ./build.sh path/to/out.html → produces at given path
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$DIR/dist.html}"

# Order matters: gas-client → helpers → data → algorithms → stats → state → field-svg → render-{home,input,viewer,admin,modal} → handlers → app
JS_FILES=(
  gas-client.js
  helpers.js
  data.js
  algorithms.js
  stats.js
  state.js
  field-svg.js
  render-home.js
  render-input.js
  render-viewer.js
  render-analytics.js
  render-admin.js
  render-standings.js
  render-report.js
  render-modal.js
  handlers.js
  app.js
)

{
  cat <<'HTML_HEAD'
<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lacrosse Stats — mockup</title>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-5YGD00QZV9"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-5YGD00QZV9');
</script>
<style>
HTML_HEAD
  cat "$DIR/styles.css"
  cat <<'HTML_MID'
</style>
</head>
<body>
<div id="app"></div>
<script>
'use strict';
HTML_MID
  for f in "${JS_FILES[@]}"; do
    echo ""
    echo "// =============================================================================="
    echo "// $f"
    echo "// =============================================================================="
    # Strip 'use strict'; from individual files (single one at top of combined block is enough)
    sed -e "s/^'use strict';$//" "$DIR/$f"
  done
  cat <<'HTML_TAIL'
</script>
</body>
</html>
HTML_TAIL
} > "$OUT"

echo "Built: $OUT"
wc -l "$OUT"

# Aktualizuj docs/index.html (GitHub Pages demo) jeśli budujemy domyślny dist.html
if [ "$OUT" = "$DIR/dist.html" ]; then
  cp "$OUT" "$DIR/../docs/index.html"
  echo "Updated: docs/index.html"
fi
