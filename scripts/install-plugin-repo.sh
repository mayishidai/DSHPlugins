#!/bin/bash
set -euo pipefail

# Install plugin-repo packages to DSH runtime
# Usage: ./scripts/install-plugin-repo.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DSH_RUNTIME="/vol2/@appdata/deepseek.harness/dsh-runtime"
DSH_NODE_MODULES="$DSH_RUNTIME/node_modules/@deepseek-ai"

echo "=== Installing plugin-repo packages to DSH runtime ==="

# Check DSH runtime exists
if [ ! -d "$DSH_RUNTIME" ]; then
    echo "ERROR: DSH runtime not found at $DSH_RUNTIME"
    exit 1
fi

# Copy host package
echo "Copying host package..."
rm -rf "$DSH_NODE_MODULES/dsh-host-plugin-repo"
cp -r "$REPO_ROOT/packages/host/plugin-repo" "$DSH_NODE_MODULES/"
echo "Host package installed."

# Copy client package
echo "Copying client package..."
rm -rf "$DSH_NODE_MODULES/dsh-client-ui-settings-plugin-repo"
cp -r "$REPO_ROOT/packages/client/ui-settings-plugin-repo" "$DSH_NODE_MODULES/"
echo "Client package installed."

# Update dsh-api-remotes
echo "Updating dsh-api-remotes..."
REMOTES_DIR="$DSH_NODE_MODULES/dsh-api-remotes"
if [ -d "$REMOTES_DIR" ]; then
    if ! grep -q "pluginRepoRemote" "$REMOTES_DIR/lib/types/client/index.js" 2>/dev/null; then
        sed -i "s/import pluginInventoryRemote from '@deepseek-ai\/dsh-host-plugin-inventory\/remote';/import pluginInventoryRemote from '@deepseek-ai\/dsh-host-plugin-inventory\/remote';\nimport pluginRepoRemote from '@deepseek-ai\/dsh-host-plugin-repo\/remote';/" "$REMOTES_DIR/lib/types/client/index.js"
        sed -i "s/pluginInventoryRemote, messageFeedbackRemote/pluginInventoryRemote, pluginRepoRemote, messageFeedbackRemote/" "$REMOTES_DIR/lib/types/client/index.js"
        echo "Updated dsh-api-remotes to include pluginRepoRemote"
    else
        echo "dsh-api-remotes already includes pluginRepoRemote"
    fi
else
    echo "WARNING: dsh-api-remotes not found at $REMOTES_DIR"
fi

echo ""
echo "=== Installation complete ==="
echo "Please restart DSH for changes to take effect."
