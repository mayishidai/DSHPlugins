#!/bin/bash
# 从 DSH profile 卸载 dsh-plugin-repo-manager
# 安全方案：完全恢复安装前的状态
# 使用方法: bash scripts/uninstall-from-profile.sh

set -euo pipefail

PROFILE_DIR="/vol2/@appdata/deepseek.harness/dsh-data/profiles/web"
PROFILE_NODE_MODULES="$PROFILE_DIR/node_modules/@deepseek-ai"
PROFILE_PACKAGE_JSON="$PROFILE_DIR/package.json"
PROFILE_CORDIS="$PROFILE_DIR/cordis.patch.yml"

echo "=== 从 DSH Profile 卸载 dsh-plugin-repo-manager ==="
echo ""

# 1. 删除插件目录
echo "1. 删除插件目录..."
if [ -d "$PROFILE_NODE_MODULES/dsh-plugin-repo-manager" ]; then
    rm -rf "$PROFILE_NODE_MODULES/dsh-plugin-repo-manager"
    echo "   ✓ 已删除插件目录"
else
    echo "   ✓ 插件目录不存在，跳过"
fi

# 2. 恢复 package.json
echo ""
echo "2. 恢复 package.json..."
python3 -c "
import json
with open('$PROFILE_PACKAGE_JSON', 'r') as f:
    data = json.load(f)

# 移除 dependency
deps = data.get('dependencies', {})
deps.pop('dsh-plugin-repo-manager', None)

# 移除 bundle
bundles = data.get('dsh', {}).get('profile', {}).get('bundles', [])
if 'dsh-plugin-repo-manager' in bundles:
    bundles.remove('dsh-plugin-repo-manager')

with open('$PROFILE_PACKAGE_JSON', 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write('\n')
"
echo "   ✓ 已恢复 package.json"

# 3. 恢复 cordis.patch.yml
echo ""
echo "3. 恢复 cordis.patch.yml..."
if grep -q "dsh-plugin-repo-manager" "$PROFILE_CORDIS" 2>/dev/null; then
    python3 -c "
with open('$PROFILE_CORDIS', 'r') as f:
    content = f.read()

# 移除最后一行（空行）和我们的配置
lines = content.rstrip().split('\n')
while lines and ('dsh-plugin-repo-manager' in lines[-1] or lines[-1].strip() == '' or lines[-1].strip().startswith('#') or lines[-1].strip().startswith('-')):
    lines.pop()

with open('$PROFILE_CORDIS', 'w') as f:
    f.write('\n'.join(lines))
    if lines and not lines[-1].endswith('\n'):
        f.write('\n')
"
    echo "   ✓ 已恢复 cordis.patch.yml"
else
    echo "   ✓ cordis.patch.yml 中没有相关配置，跳过"
fi

echo ""
echo "=== 卸载完成 ==="
echo ""
echo "下一步："
echo "  1. 重启 DSH: pkill -f 'dsh.*web' && sleep 3"
echo "  2. 访问 http://127.0.0.1:2298/ → 设置 → 插件"
echo ""
