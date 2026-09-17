#!/bin/bash
# DSH with plugin-repo-manager loaded via --patch

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$SCRIPT_DIR/panels/dsh-plugin-repo-manager"
DSH_RUNTIME="/vol2/@appdata/deepseek.harness/dsh-runtime"
DSH_BIN="$DSH_RUNTIME/node_modules/@deepseek-ai/dsh/lib/bin.js"

echo "=== Starting DSH with plugin-repo-manager ==="
echo "Plugin: $PLUGIN_DIR"
echo "Patch: $PLUGIN_DIR/cordis.patch.yml"
echo ""

# Start DSH with patch overlay
exec node "$DSH_BIN" web --port 2298 --no-open --patch "$PLUGIN_DIR/cordis.patch.yml" "$@"
