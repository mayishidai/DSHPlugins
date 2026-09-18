#!/usr/bin/env bash
# hindsight MCP 断链自愈 —— 无人值守版（供定时自动化 / cron 调用）
#
# 本脚本是**薄封装**：真正的逻辑在同一个目录下的两个 Python 脚本里：
#   resolve_hindsight_url.py   探测跳板 302 → 拿到当前隧道直连地址
#   apply_to_config.py         比对 → 握手验证 → 备份 → 原子写回配置
#
# 之所以单独做一个 .sh：定时自动化用 bash 调用更方便，且需要日志与退出码。
# **不要在这里重复实现探测/写入逻辑** —— 那是曾经的坑（三处各有一份，
# 改一处漏两处）。要改逻辑请改上面两个 .py。
#
# 用法：
#   bash selfheal.sh                      # 默认修 ~/.workbuddy/mcp.json
#   MCP_CONFIG=/path/to/mcp.json bash selfheal.sh
#   bash selfheal.sh --dry-run            # 只看不做
#
# 退出码：0 = 成功或无需变更；1 = 失败（跳板不通 / 握手失败 / 配置异常）
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPLY_PY="$SCRIPT_DIR/apply_to_config.py"

MCP_CONFIG="${MCP_CONFIG:-$HOME/.workbuddy/mcp.json}"
LOG="${SELFHEAL_LOG:-$HOME/.workbuddy/hindsight_selfheal.log}"

DRY_RUN=""
[ "${1:-}" = "--dry-run" ] && DRY_RUN="--dry-run"

# ---------- 路径转换 ----------
# Git Bash 下 python3 是**原生 Windows 程序**，认不出 /c/... 这类 MSYS 路径，
# 会当成 \c\... 报 FileNotFoundError。所有传给 python 的路径必须先转成原生形式。
to_native() {
    if command -v cygpath >/dev/null 2>&1; then
        cygpath -w "$1" 2>/dev/null || printf '%s' "$1"
    else
        printf '%s' "$1"
    fi
}

# ---------- 找 python ----------
find_python() {
    if command -v python3 >/dev/null 2>&1; then
        command -v python3; return 0
    fi
    if command -v python >/dev/null 2>&1; then
        command -v python; return 0
    fi
    # Git Bash 下受管 Python（Windows 上是 python.exe；也有无扩展名的 shim）
    local base="$HOME/.workbuddy/binaries/python/versions"
    for cand in "$base"/*/python.exe "$base"/*/python3; do
        [ -x "$cand" ] && { echo "$cand"; return 0; }
    done
    return 1
}

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

log "--- selfheal 触发 ---"

if [ ! -f "$APPLY_PY" ]; then
    log "ERROR 找不到 $APPLY_PY（仓库是否已 clone / 路径是否正确？）"
    exit 1
fi

PY="$(find_python)" || { log "ERROR 未找到可用的 python3"; exit 1; }

if [ ! -f "$MCP_CONFIG" ]; then
    log "ERROR 配置文件不存在: $MCP_CONFIG"
    exit 1
fi

APPLY_PY_NATIVE="$(to_native "$APPLY_PY")"
MCP_CONFIG_NATIVE="$(to_native "$MCP_CONFIG")"

# ---------- 先探活 ----------
# 关键：python 自身启动失败（路径错/脚本语法错）也会返回非零码，
# 且可能与 apply_to_config.py 的业务退出码 1/2/3 撞车。
# 所以先确认脚本能被 python 载入，之后才信任退出码语义。
if ! "$PY" "$APPLY_PY_NATIVE" --help >/dev/null 2>&1; then
    log "ERROR 无法执行 apply_to_config.py（python 不可用或路径错误）"
    log "       python: $PY"
    log "       script: $APPLY_PY_NATIVE"
    exit 1
fi

# ---------- 交给唯一实现 ----------
OUT="$("$PY" "$APPLY_PY_NATIVE" --config "$MCP_CONFIG_NATIVE" $DRY_RUN 2>&1)"
RC=$?

# 逐行写日志，便于回溯
while IFS= read -r line; do
    [ -n "$line" ] && log "  $line"
done <<< "$OUT"

case "$RC" in
    0)
        if printf '%s' "$OUT" | grep -q "地址未变"; then
            log "OK 地址未变，无需操作"
        elif [ -n "$DRY_RUN" ]; then
            log "OK dry-run 完成（未写入）"
        else
            log "UPDATED 配置已更新（请在 MCP 管理页重连 hindsight 生效）"
        fi
        exit 0
        ;;
    1)
        log "WARN 探测失败：跳板不可达或未返回 302。可能是网络/服务端整体故障，未改动配置"
        exit 1
        ;;
    2)
        log "ERROR 新地址未通过握手验证，已中止（未写入）"
        exit 1
        ;;
    3)
        log "ERROR 配置文件异常（缺 mcpServers / 缺 hindsight 条目 / JSON 非法）"
        exit 1
        ;;
    *)
        log "ERROR 未知退出码 $RC"
        exit 1
        ;;
esac
