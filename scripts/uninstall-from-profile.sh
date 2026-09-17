#!/bin/bash
set -euo pipefail

# 从 DSH profile 卸载 dsh-plugin-repo-manager。
#
# 策略：优先用安装时留下的 package.json 备份**完整还原**（最可靠），
# 找不到备份时再退回「精确删除本插件的键」（用 python3，保证 JSON 合法）。
#
# 用法:
#   bash scripts/uninstall-from-profile.sh
#   PROFILE_DIR=/path/to/profile bash scripts/uninstall-from-profile.sh

PROFILE_DIR="${PROFILE_DIR:-/vol2/@appdata/deepseek.harness/dsh-data/profiles/web}"
PROFILE_NODE_MODULES="$PROFILE_DIR/node_modules/@deepseek-ai"
PROFILE_PACKAGE_JSON="$PROFILE_DIR/package.json"
PKG_NAME="dsh-plugin-repo-manager"
TARGET_DIR="$PROFILE_NODE_MODULES/$PKG_NAME"

# 路径规范化：Git Bash / Cygwin 下 python3 是原生程序，认不出 MSYS 路径。
to_native() {
    if command -v cygpath >/dev/null 2>&1; then
        cygpath -w "$1" 2>/dev/null || printf '%s' "$1"
    else
        printf '%s' "$1"
    fi
}
PROFILE_PKG_NATIVE="$(to_native "$PROFILE_PACKAGE_JSON")"

echo "=== 从 DSH profile 卸载 $PKG_NAME ==="
echo ""

if [ ! -d "$PROFILE_DIR" ]; then
    echo "ERROR: DSH profile 不存在: $PROFILE_DIR" >&2
    exit 1
fi

# 1. 删除插件目录
echo "1. 删除插件目录..."
if [ -d "$TARGET_DIR" ]; then
    rm -rf "$TARGET_DIR"
    echo "   ✓ 已删除 $TARGET_DIR"
else
    echo "   ✓ 插件目录不存在，跳过"
fi

# 2. 还原 package.json
echo ""
echo "2. 还原 profile package.json..."

LATEST_BAK="$(ls -1t "$PROFILE_DIR"/package.json.bak-* 2>/dev/null | head -1 || true)"

if [ -n "$LATEST_BAK" ] && [ -f "$LATEST_BAK" ]; then
    # 备份里若已含本插件（说明备份是「安装前」的快照，正常不含），
    # 仍以备份为准还原；随后再用 python 兜底清理一次，确保干净。
    cp "$LATEST_BAK" "$PROFILE_PACKAGE_JSON"
    echo "   ✓ 已从备份还原: $(basename "$LATEST_BAK")"
fi

python3 - "$PROFILE_PKG_NATIVE" "$PKG_NAME" <<'PYEOF'
import json
import sys

pkg_path, pkg_name = sys.argv[1], sys.argv[2]

with open(pkg_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

changed = []

deps = data.get('dependencies')
if isinstance(deps, dict) and pkg_name in deps:
    deps.pop(pkg_name)
    changed.append('dependencies')

dsh = data.get('dsh')
if isinstance(dsh, dict):
    prof = dsh.get('profile')
    if isinstance(prof, dict):
        bundles = prof.get('bundles')
        if isinstance(bundles, list) and pkg_name in bundles:
            bundles.remove(pkg_name)
            changed.append('dsh.profile.bundles')

with open(pkg_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write('\n')

if changed:
    print("   ✓ 已移除: " + ", ".join(changed))
else:
    print("   ✓ 无需清理（未注册）")
PYEOF

# 3. 校验 JSON 合法性
python3 -c "import json,sys; json.load(open(sys.argv[1], encoding='utf-8'))" "$PROFILE_PKG_NATIVE" \
    && echo "3. ✓ package.json JSON 校验通过"

echo ""
echo "=== 卸载完成 ==="
echo ""
echo "下一步：重启 DSH 使改动生效。"
echo ""
