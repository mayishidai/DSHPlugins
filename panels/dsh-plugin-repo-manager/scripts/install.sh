#!/bin/bash
set -euo pipefail

# 安装 dsh-plugin-repo-manager 到 DSH profile（用户数据区）。
#
# 设计原则：
#   - 只写入 DSH 的 profile 目录，绝不修改 DSH 运行时源码；
#   - 不复制 node_modules / src / 构建脚本，避免递归自包含与体积膨胀；
#   - 幂等，可重复执行。
#
# 用法:
#   bash scripts/install.sh
#   PROFILE_DIR=/path/to/profile bash scripts/install.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_SRC="$(cd "$SCRIPT_DIR/.." && pwd)"

PROFILE_DIR="${PROFILE_DIR:-/vol2/@appdata/deepseek.harness/dsh-data/profiles/web}"
PROFILE_NODE_MODULES="$PROFILE_DIR/node_modules/@deepseek-ai"
PKG_NAME="dsh-plugin-repo-manager"
TARGET_DIR="$PROFILE_NODE_MODULES/$PKG_NAME"
REPO_SCRIPTS="$(cd "$PLUGIN_SRC/../.." && pwd)/scripts"

echo "=== 安装 $PKG_NAME ==="

if [ ! -d "$PROFILE_DIR" ]; then
    echo "ERROR: DSH profile 不存在: $PROFILE_DIR" >&2
    echo "请用 PROFILE_DIR=... 指定正确路径。" >&2
    exit 1
fi

# 编译产物必须存在——这是「编译好直接用」的前提
for f in "dist/index.js" "client/client.js" "cordis.patch.yml"; do
    if [ ! -f "$PLUGIN_SRC/$f" ]; then
        echo "ERROR: 缺少 $f" >&2
        echo "请先在仓库执行 npm run build（服务端需编译为 JS）" >&2
        exit 1
    fi
done

echo "复制运行文件 → $TARGET_DIR"
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
(
    cd "$PLUGIN_SRC"
    tar -cf - \
        --exclude='./node_modules' \
        --exclude='./src' \
        --exclude='./scripts' \
        --exclude='./tsconfig.json' \
        --exclude='./tsconfig.build.json' \
        --exclude='./generate-client.mjs' \
        dist client cordis.patch.yml manifest.json package.json README.md 2>/dev/null \
        | (cd "$TARGET_DIR" && tar -xf -)
)
echo "   ✓ 已复制（dist/ + client/ + 配置）"

echo ""
echo "下一步：注册到 profile 并重启 DSH。推荐直接用仓库根的脚本（会自动注册）："
echo "    bash $REPO_SCRIPTS/install-to-profile.sh"
echo ""
