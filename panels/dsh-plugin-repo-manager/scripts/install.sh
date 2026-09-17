#!/bin/bash
set -euo pipefail

# Install plugin-repo-manager to DSH runtime
# Usage: ./scripts/install-plugin-repo-manager.sh

PLUGIN_DIR="/vol1/1000/AI/DSHPlugin/panels/dsh-plugin-repo-manager"
DSH_RUNTIME="/vol2/@appdata/deepseek.harness/dsh-runtime"
DSH_NODE_MODULES="$DSH_RUNTIME/node_modules/@deepseek-ai"

echo "=== Installing dsh-plugin-repo-manager ==="

# Check DSH runtime exists
if [ ! -d "$DSH_RUNTIME" ]; then
    echo "ERROR: DSH runtime not found at $DSH_RUNTIME"
    exit 1
fi

# Copy plugin package
echo "Copying plugin package..."
rm -rf "$DSH_NODE_MODULES/dsh-plugin-repo-manager"
cp -r "$PLUGIN_DIR" "$DSH_NODE_MODULES/"
echo "Plugin package installed."

# Update dsh-api-remotes if needed
echo "Updating dsh-api-remotes..."
REMOTES_DIR="$DSH_NODE_MODULES/dsh-api-remotes"
if [ -d "$REMOTES_DIR" ]; then
    if ! grep -q "pluginRepoRemote" "$REMOTES_DIR/lib/types/client/index.js" 2>/dev/null; then
        # Add import
        sed -i "s/import pluginInventoryRemote from '@deepseek-ai\/dsh-host-plugin-inventory\/remote';/import pluginInventoryRemote from '@deepseek-ai\/dsh-host-plugin-inventory\/remote';\nimport pluginRepoRemote from '@deepseek-ai\/dsh-plugin-repo-manager\/remote';/" "$REMOTES_DIR/lib/types/client/index.js" 2>/dev/null || true
        # Add to mount list
        sed -i "s/pluginInventoryRemote, messageFeedbackRemote/pluginInventoryRemote, pluginRepoRemote, messageFeedbackRemote/" "$REMOTES_DIR/lib/types/client/index.js" 2>/dev/null || true
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
