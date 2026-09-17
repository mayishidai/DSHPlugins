#!/bin/bash
# 安装 dsh-plugin-repo-manager 到 DSH profile
# 使用方法: bash scripts/install-to-profile.sh

set -euo pipefail

PLUGIN_DIR="/vol1/1000/AI/DSHPlugin/panels/dsh-plugin-repo-manager"
PROFILE_DIR="/vol2/@appdata/deepseek.harness/dsh-data/profiles/web"
PROFILE_NODE_MODULES="$PROFILE_DIR/node_modules/@deepseek-ai"
PROFILE_PACKAGE_JSON="$PROFILE_DIR/package.json"

echo "=== 安装 dsh-plugin-repo-manager 到 DSH Profile ==="
echo ""

# 1. 复制插件到 profile node_modules
echo "1. 复制插件到 profile node_modules..."
if [ -d "$PROFILE_NODE_MODULES/dsh-plugin-repo-manager" ]; then
    echo "   ✓ 插件已存在，跳过复制"
else
    cp -r "$PLUGIN_DIR" "$PROFILE_NODE_MODULES/"
    echo "   ✓ 已复制插件"
fi

# 2. 更新 package.json
echo ""
echo "2. 更新 profile package.json..."
if grep -q '"dsh-plugin-repo-manager"' "$PROFILE_PACKAGE_JSON" 2>/dev/null; then
    echo "   ✓ 插件已在 dependencies 中"
else
    # 添加依赖
    sed -i 's/"dsh-better-sidebar": "\^0.19.0"/"dsh-better-sidebar": "^0.19.0",\n    "dsh-plugin-repo-manager": "file:..\node_modules\@deepseek-ai\dsh-plugin-repo-manager"/' "$PROFILE_PACKAGE_JSON"
    echo "   ✓ 已添加 dependency"
fi

if grep -q '"dsh-plugin-repo-manager"' "$PROFILE_PACKAGE_JSON" 2>/dev/null && grep -A 20 '"bundles"' "$PROFILE_PACKAGE_JSON" | grep -q '"dsh-plugin-repo-manager"'; then
    echo "   ✓ 插件已在 bundles 中"
else
    # 添加到 bundles
    sed -i 's/"dsh-better-sidebar"/"dsh-better-sidebar",\n        "dsh-plugin-repo-manager"/' "$PROFILE_PACKAGE_JSON"
    echo "   ✓ 已添加到 bundles"
fi

# 3. 验证配置
echo ""
echo "3. 验证配置..."
echo "   Profile: $PROFILE_DIR"
echo "   插件位置: $PROFILE_NODE_MODULES/dsh-plugin-repo-manager"
echo "   cordis.patch.yml:"
cat "$PROFILE_NODE_MODULES/dsh-plugin-repo-manager/cordis.patch.yml" | sed 's/^/   /'

echo ""
echo "=== 安装完成 ==="
echo ""
echo "下一步："
echo "  1. 重启 DSH: pkill -f 'dsh.*web' && sleep 3"
echo "  2. 访问 http://127.0.0.1:2298/ → 设置 → 插件 → 「我的插件仓库」"
echo ""
