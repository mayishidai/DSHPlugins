#!/bin/bash
set -euo pipefail

# 以 --patch 方式临时叠加加载 dsh-plugin-repo-manager（不改 DSH 源码、不改 profile）。
#
# ⚠️ 这是**临时/调试**路径，不是常规安装方式。
#    常规安装请用：bash scripts/install-to-profile.sh
#
# ⚠️ `--patch` 只是把 patch 行插进 loader，**不会**把包放进 node_modules。
#    patch 里写的是裸包名 `dsh-plugin-repo-manager`，Node 按裸标识符解析，
#    所以仍需该包在解析路径上可见（即先跑过 install-to-profile.sh，
#    或把本机插件目录暴露给 DSH 运行时）。
#    没装过而直接跑本脚本，大概率仍报：
#      invalid plugin, expect function or object with an "apply" method, received undefined
#
# 用法:
#   bash scripts/start-dsh-with-plugin.sh
#   DSH_RUNTIME=/path/to/dsh-runtime bash scripts/start-dsh-with-plugin.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ⚠️ 这里曾是 `$SCRIPT_DIR/panels/...` —— SCRIPT_DIR 是 scripts/，
#    拼出来是 scripts/panels/... ，**该目录并不存在**，脚本必然失败。
#    插件在仓库根的 panels/ 下，要往上一级。
PLUGIN_DIR="$REPO_ROOT/panels/dsh-plugin-repo-manager"

DSH_RUNTIME="${DSH_RUNTIME:-/vol2/@appdata/deepseek.harness/dsh-runtime}"
DSH_BIN="$DSH_RUNTIME/node_modules/@deepseek-ai/dsh/lib/bin.js"
PATCH_FILE="$PLUGIN_DIR/cordis.patch.yml"

# 先做存在性检查再 exec，否则报的是 node 的「找不到模块」，看不出真正原因
for f in "$PLUGIN_DIR/dist/index.js" "$PLUGIN_DIR/client/client.js" "$PATCH_FILE"; do
    if [ ! -f "$f" ]; then
        echo "ERROR: 缺少 $f" >&2
        echo "       请先在仓库里编译：npm run build（或 make build）" >&2
        exit 1
    fi
done

if [ ! -f "$DSH_BIN" ]; then
    echo "ERROR: 找不到 DSH 入口 $DSH_BIN" >&2
    echo "       请确认 DSH 已安装，或用 DSH_RUNTIME=... 指定运行时目录。" >&2
    exit 1
fi

if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: 找不到 node 命令（本脚本需要 node 才能启动 DSH）" >&2
    exit 1
fi

echo "=== 以 --patch 临时加载 dsh-plugin-repo-manager ==="
echo "插件: $PLUGIN_DIR"
echo "Patch: $PATCH_FILE"
echo "运行时: $DSH_RUNTIME"
echo ""

exec node "$DSH_BIN" web --port 2298 --no-open --patch "$PATCH_FILE" "$@"
