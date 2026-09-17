#!/bin/bash
set -euo pipefail

# 安装 dsh-plugin-repo-manager 到 DSH 的 profile（用户级），
# 通过 profile package.json 的 dependencies + dsh.profile.bundles 注册。
#
# 设计原则（重要）：
#   1. 只写入 DSH 的 **profile 目录**（用户数据区），绝不修改 DSH 运行时源码；
#   2. 不依赖任何外部命令做文本替换——package.json 一律用 python3 json 库读写，
#      保证 JSON 结构永远合法；
#   3. 可重复执行（幂等），已装则原地更新；
#   4. 卸载走同目录的 uninstall-from-profile.sh，可完整还原。
#
# 用法:
#   bash scripts/install-to-profile.sh              # 安装
#   PROFILE_DIR=/path/to/profile bash scripts/...   # 指定 profile

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLUGIN_SRC="$REPO_ROOT/panels/dsh-plugin-repo-manager"

# 路径规范化：在 Git Bash / Cygwin 上，python3 是原生 Windows 程序，
# 认不出 /tmp/... 这类 MSYS 路径，需要转成 Windows 形式。Linux 上原样返回。
to_native() {
    if command -v cygpath >/dev/null 2>&1; then
        cygpath -w "$1" 2>/dev/null || printf '%s' "$1"
    else
        printf '%s' "$1"
    fi
}

# DSH profile 目录。可用环境变量覆盖，便于在不同部署上使用。
PROFILE_DIR="${PROFILE_DIR:-/vol2/@appdata/deepseek.harness/dsh-data/profiles/web}"
PROFILE_NODE_MODULES="$PROFILE_DIR/node_modules/@deepseek-ai"
PKG_NAME="dsh-plugin-repo-manager"
TARGET_DIR="$PROFILE_NODE_MODULES/$PKG_NAME"

# 供 python 使用的原生路径
PROFILE_PKG_NATIVE="$(to_native "$PROFILE_DIR/package.json")"

echo "=== 安装 $PKG_NAME 到 DSH profile ==="
echo "插件源: $PLUGIN_SRC"
echo "目标:   $TARGET_DIR"
echo ""

if [ ! -d "$PLUGIN_SRC" ]; then
    echo "ERROR: 插件源目录不存在: $PLUGIN_SRC" >&2
    exit 1
fi

if [ ! -d "$PROFILE_DIR" ]; then
    echo "ERROR: DSH profile 不存在: $PROFILE_DIR" >&2
    echo "请确认 DSH 已安装，或用 PROFILE_DIR=... 指定正确路径。" >&2
    exit 1
fi

if [ ! -f "$PROFILE_DIR/package.json" ]; then
    echo "ERROR: 找不到 $PROFILE_DIR/package.json" >&2
    exit 1
fi

# 0. 编译产物必须存在——这是「编译好直接用」的前提
if [ ! -f "$PLUGIN_SRC/dist/index.js" ]; then
    echo "ERROR: 缺少编译产物 $PLUGIN_SRC/dist/index.js" >&2
    echo "请先在仓库中执行: npm run build" >&2
    exit 1
fi
if [ ! -f "$PLUGIN_SRC/client/client.js" ]; then
    echo "ERROR: 缺少客户端产物 $PLUGIN_SRC/client/client.js" >&2
    echo "请先在仓库中执行: npm run build" >&2
    exit 1
fi

# 1. 复制插件（只带运行所需文件，用 tar 排除源码/依赖/构建脚本，
#    避免把 node_modules 一起拷进去形成递归自包含）
echo "1. 复制插件运行文件..."
mkdir -p "$TARGET_DIR"
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
        --exclude='./dist/*.map' \
        dist client cordis.patch.yml manifest.json package.json README.md 2>/dev/null \
        | (cd "$TARGET_DIR" && tar -xf -)
)
echo "   ✓ 已复制（dist/ + client/ + 配置）"

# 2. 备份 package.json（幂等安装前留档）
STAMP="$(date +%Y%m%d-%H%M%S)"
cp "$PROFILE_DIR/package.json" "$PROFILE_DIR/package.json.bak-$STAMP"
echo "2. 已备份 profile package.json → package.json.bak-$STAMP"

# 3. 用 python3 写 package.json（保证 JSON 合法，不依赖任何行内容）
echo "3. 注册到 profile package.json..."
python3 - "$PROFILE_PKG_NATIVE" "$PKG_NAME" <<'PYEOF'
import json
import sys

pkg_path, pkg_name = sys.argv[1], sys.argv[2]

with open(pkg_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# dependencies：用 file: 指向 profile 内已复制好的目录
deps = data.setdefault('dependencies', {})
deps[pkg_name] = "file:./node_modules/@deepseek-ai/" + pkg_name

# dsh.profile.bundles：注册为运行时 bundle
dsh = data.setdefault('dsh', {})
profile = dsh.setdefault('profile', {})
bundles = profile.setdefault('bundles', [])
if pkg_name not in bundles:
    bundles.append(pkg_name)

with open(pkg_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write('\n')

print("   ✓ dependencies 与 dsh.profile.bundles 已更新")
PYEOF

# 4. 校验 JSON 合法性
python3 -c "import json,sys; json.load(open(sys.argv[1], encoding='utf-8'))" "$PROFILE_PKG_NATIVE" \
    && echo "4. ✓ package.json JSON 校验通过"

# 5. 输出验证信息
echo ""
echo "5. 验证:"
echo "   插件位置: $TARGET_DIR"
echo "   服务端入口: $TARGET_DIR/dist/index.js"
echo "   客户端入口: $TARGET_DIR/client/client.js"
echo ""
echo "   cordis.patch.yml:"
sed 's/^/     /' "$TARGET_DIR/cordis.patch.yml"

echo ""
echo "=== 安装完成 ==="
echo ""
echo "下一步："
echo "  1. 重启 DSH"
echo "  2. 访问 http://127.0.0.1:2298/ → 设置 → 插件 → 「我的插件仓库」"
echo ""
echo "卸载: bash $SCRIPT_DIR/uninstall-from-profile.sh"
echo ""
