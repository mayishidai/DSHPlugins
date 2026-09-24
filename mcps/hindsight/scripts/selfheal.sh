#!/usr/bin/env bash
# hindsight MCP 断链自愈 —— 无人值守版（供定时自动化 / cron 调用）
#
# 本脚本是**薄封装**，三件事分工明确：
#   落点怎么算     → hindsight_paths.py        （唯一实现，本脚本**不再自己算一份**）
#   探测最新地址   → resolve_hindsight_url.py
#   比对 + 写回    → apply_to_config.py
#
# ⚠️ 历史坑（2026-09-23 修）：本脚本曾写死两份默认值
#      MCP_CONFIG="${MCP_CONFIG:-$HOME/.workbuddy/mcp.json}"
#      LOG="${SELFHEAL_LOG:-$HOME/.workbuddy/hindsight_selfheal.log}"
#    容器里 $HOME 是 /root，而真实数据卷挂在别处 → 每次都报「配置文件不存在」，
#    而报错里**看不出正确的文件其实在别处**。这与 2026-09-21 那次 profile 路径写死
#    是同一个病：**把「某台机器观察到的事实」当成了「普适默认值」**。
#    ⇒ 现在只问 hindsight_paths.py；解析失败时把**全部候选**写进日志再退出。
#
# 用法：
#   bash selfheal.sh                      # 运行时探测落点后自愈
#   bash selfheal.sh --dry-run            # 只看不做
#   bash selfheal.sh --where              # 只打印落点解析（排查第一步）
#   MCP_CONFIG=/path/to/mcp.json bash selfheal.sh    # 显式指定目标配置
#
# 环境变量：
#   MCP_CONFIG                  显式指定 MCP 配置文件（最高优先）
#   SELFHEAL_LOG                日志文件落点
#   SELFHEAL_LOG_MAX_BYTES      日志轮转阈值，默认 1048576（1MB）
#   SELFHEAL_LOG_KEEP_LINES     轮转时旧日志保留行数，默认 2000
#
# 退出码：0 = 成功或无需变更；1 = 失败（落点解析失败 / 跳板不通 / 握手失败 / 配置异常）
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPLY_PY="$SCRIPT_DIR/apply_to_config.py"
PATHS_PY="$SCRIPT_DIR/hindsight_paths.py"

# 日志轮转参数：不设上限时这个文件会无声长到几十 MB（实测曾达 21MB，无任何提示）
LOG_MAX_BYTES="${SELFHEAL_LOG_MAX_BYTES:-1048576}"
LOG_KEEP_LINES="${SELFHEAL_LOG_KEEP_LINES:-2000}"

MODE="${1:-}"
DRY_RUN=""
[ "$MODE" = "--dry-run" ] && DRY_RUN="--dry-run"

# ---------- 路径转换 ----------
# Git Bash 下 python3 是**原生 Windows 程序**，认不出 /c/... 这类 MSYS 路径，
# 会当成 \c\... 报 FileNotFoundError。
to_native() {
    if command -v cygpath >/dev/null 2>&1; then
        cygpath -w "$1" 2>/dev/null || printf '%s' "$1"
    else
        printf '%s' "$1"
    fi
}

# 在**入口处**归一化一次，之后（含 python 子进程）拿到的都是原生形式。
# 这样 hindsight_paths.py / apply_to_config.py 都能直接读环境变量，
# 不必由本脚本把路径再转发一遍 —— 转发本身就又是一份「落点逻辑」。
if [ -n "${MCP_CONFIG:-}" ]; then
    MCP_CONFIG="$(to_native "$MCP_CONFIG")"
    export MCP_CONFIG
fi
if [ -n "${SELFHEAL_LOG:-}" ]; then
    SELFHEAL_LOG="$(to_native "$SELFHEAL_LOG")"
    export SELFHEAL_LOG
fi

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

if [ ! -f "$PATHS_PY" ]; then
    echo "ERROR 找不到 $PATHS_PY（仓库是否已 clone / 路径是否正确？）" >&2
    exit 1
fi

PY="$(find_python)" || { echo "ERROR 未找到可用的 python3" >&2; exit 1; }
PATHS_PY_NATIVE="$(to_native "$PATHS_PY")"

# ---------- 落点解析（唯一实现）----------
# 只捕获 stdout（纯路径），python 的告警走 stderr 不污染赋值。
CONFIG="$("$PY" "$PATHS_PY_NATIVE" --show-config 2>/dev/null || true)"

# --where：只报告落点，什么都不做（排查链路的第一步）
if [ "$MODE" = "--where" ]; then
    "$PY" "$PATHS_PY_NATIVE" --explain
    [ -n "$CONFIG" ] || exit 1
    exit 0
fi

LOG="$("$PY" "$PATHS_PY_NATIVE" --show-log 2>/dev/null || true)"
if [ -z "$LOG" ]; then
    # 落点解析不出来 → 连日志该写哪儿都不知道，只能用临时目录兜底并明说。
    LOG="${TMPDIR:-${TEMP:-/tmp}}/hindsight_selfheal.log"
    LOG_FALLBACK="1"
else
    LOG_FALLBACK=""
fi
mkdir -p "$(dirname "$LOG")" 2>/dev/null || true

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

# ---------- 日志轮转 ----------
# 没有它这个文件只增不减：每 6 小时 3 行，跑几个月就是几十 MB，且**没有任何提示**。
rotate_log() {
    [ -f "$LOG" ] || return 0
    local size
    size="$(wc -c < "$LOG" 2>/dev/null | tr -d ' ')"
    case "$size" in ''|*[!0-9]*) return 0;; esac
    [ "$size" -gt "$LOG_MAX_BYTES" ] || return 0

    local keep="$LOG.1"
    if tail -n "$LOG_KEEP_LINES" "$LOG" > "$keep.tmp" 2>/dev/null; then
        mv -f "$keep.tmp" "$keep" 2>/dev/null || { rm -f "$keep.tmp"; return 0; }
    else
        rm -f "$keep.tmp"
        return 0
    fi
    # 主日志截断（保留的旧内容已在 .1 里，不是丢弃）
    : > "$LOG"
    log "ROTATE 日志已达 ${size} 字节（上限 ${LOG_MAX_BYTES}）→ 已轮转"
    log "        旧内容保留最后 ${LOG_KEEP_LINES} 行于 $keep"
}

rotate_log
log "--- selfheal 触发 ---"
[ -n "$LOG_FALLBACK" ] && log "WARN 落点解析失败，日志临时写在 $LOG（兜底位置）"

if [ -z "$CONFIG" ]; then
    log "ERROR 落点解析失败：没有任何可用的 MCP 配置文件候选"
    log "        把全部候选追加到日志下方，便于判断是「路径没找对」还是「确实没有配置」"
    "$PY" "$PATHS_PY_NATIVE" --explain >> "$LOG" 2>&1
    exit 1
fi

if [ ! -f "$CONFIG" ]; then
    log "ERROR 配置文件不存在: $CONFIG"
    log "        （可能是落点错位：把全部候选追加到日志下方，看别处有没有现成的）"
    "$PY" "$PATHS_PY_NATIVE" --explain >> "$LOG" 2>&1
    exit 1
fi

if [ ! -f "$APPLY_PY" ]; then
    log "ERROR 找不到 $APPLY_PY（仓库是否已 clone / 路径是否正确？）"
    exit 1
fi

APPLY_PY_NATIVE="$(to_native "$APPLY_PY")"

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
# 不传 --config：apply_to_config.py 自己会问 hindsight_paths.py，
# 传一遍就等于把「落点逻辑」又搬到本脚本里。
OUT="$("$PY" "$APPLY_PY_NATIVE" $DRY_RUN 2>&1)"
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
        log "ERROR 配置文件异常（落点无法确定 / 文件不存在 / 缺 mcpServers / 缺 hindsight 条目 / JSON 非法）"
        log "        排查：bash selfheal.sh --where   # 打印全部候选与各自状态"
        exit 1
        ;;
    *)
        log "ERROR 未知退出码 $RC"
        exit 1
        ;;
esac
