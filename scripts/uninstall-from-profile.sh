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
#   DSH_HOME=/path/to/dsh-data bash scripts/uninstall-from-profile.sh
#   bash scripts/lib/resolve-profile.sh --list     # 只列出全部候选与检查结果
#
# ⚠️ profile 目录**运行时探测**：与安装脚本**共用同一份实现**
# （scripts/lib/resolve-profile.sh）。一个写、一个删，必须算出同一条路径 ——
# 两份各自实现必然漂移，漂移的后果是「装到 A、卸载删 B」，
# 更糟时会在错误的目录上 rm -rf。由 validate_repo.py 2.7 / 2.10 结构性守住。

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/resolve-profile.sh
. "$SCRIPT_DIR/lib/resolve-profile.sh"

PKG_NAME="dsh-plugin-repo-manager"

echo "=== 从 DSH profile 卸载 $PKG_NAME ==="
echo ""

PROFILE_DIR="$(resolve_dsh_profile_dir "$PKG_NAME")" || exit $?
PROFILE_NODE_MODULES="$PROFILE_DIR/node_modules"
PROFILE_PACKAGE_JSON="$PROFILE_DIR/package.json"
TARGET_DIR="$PROFILE_NODE_MODULES/$PKG_NAME"
# 遗留的错误落点：2026-09-18 之前装到这里（与包名不符，导致加载失败）。
# 卸载时一并清掉，避免残留一份永远不会被解析、却可能被误认为「已安装」的副本。
LEGACY_DIR="$PROFILE_NODE_MODULES/@deepseek-ai/$PKG_NAME"

# 多机 / 多 profile 场景下，别的地方可能还有一份副本。
# 卸载只作用于**解析出来的那一个** profile，所以这里主动提示剩下哪些。
OTHERS_INSTALLED="$(dsh_profiles_where_installed "$PKG_NAME" | grep -vxF "$PROFILE_DIR" || true)"
if [ -n "$OTHERS_INSTALLED" ]; then
    echo "⚠  除了本次卸载的目标，另有一些 profile 里也有 $PKG_NAME 的副本：" >&2
    printf '%s\n' "$OTHERS_INSTALLED" | sed 's/^/     /' >&2
    echo "   → 本脚本一次只处理一个 profile。要清掉上面这些，请对每个都用" >&2
    echo "     PROFILE_DIR=<该路径> bash $SCRIPT_DIR/uninstall-from-profile.sh" >&2
    echo "" >&2
fi

# 路径规范化：Git Bash / Cygwin 下 python3 是原生程序，认不出 MSYS 路径。
to_native() {
    if command -v cygpath >/dev/null 2>&1; then
        cygpath -w "$1" 2>/dev/null || printf '%s' "$1"
    else
        printf '%s' "$1"
    fi
}
PROFILE_PKG_NATIVE="$(to_native "$PROFILE_PACKAGE_JSON")"

# PROFILE_DIR 由 resolve_dsh_profile_dir 保证「存在且含 package.json」，
# 解析失败时脚本已在那一步退出（退出码 1/2/3，并打印全部候选）。
# 这里**刻意不再重复检查** —— 重复一份判据必然与 resolver 漂移。

# 1. 删除插件目录（含历史错误落点）
echo "1. 删除插件目录..."
if [ -d "$TARGET_DIR" ]; then
    rm -rf "$TARGET_DIR"
    echo "   ✓ 已删除 $TARGET_DIR"
else
    echo "   ✓ 插件目录不存在，跳过"
fi
if [ -d "$LEGACY_DIR" ]; then
    rm -rf "$LEGACY_DIR"
    echo "   ✓ 已删除遗留的错误落点 $LEGACY_DIR"
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
