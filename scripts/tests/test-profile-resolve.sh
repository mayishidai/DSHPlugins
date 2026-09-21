#!/bin/bash
# ============================================================================
# 测试：scripts/lib/resolve-profile.sh（DSH profile 运行时探测）
# ============================================================================
#
# 背景（2026-09-21）：安装脚本曾把 profile 路径写死成
#   PROFILE_DIR="${PROFILE_DIR:-/vol2/@appdata/deepseek.harness/dsh-data/profiles/web}"
# 于是只有那一台机器能装。用户原话：「我不止部署一个机器的 DSH」。
#
# ## 铁律：**绝不重写被测逻辑**
# 全部断言都调用**真实的 lib 文件**，在临时目录里搭出假的 DSH 布局，再看它解析到哪。
# 「把被测判据在测试里重新实现一遍」= 测的是测试自己 —— 产品代码改坏了照样绿。
# 本仓库在这里栽过（路由回归用 e2e 测不出来），所以一律 subprocess 调真身。
#
# ## 环境隔离
# 用 `env -i` 起**完全干净的环境**再显式喂变量。理由：开发机/CI 上可能已经
# 导出过 DSH_HOME、PROFILE_DIR 之类，不清空就会「在本机碰巧通过、换机器就红」。
#
# 用法: bash scripts/tests/test-profile-resolve.sh
# 退出码: 0 = 全过；1 = 有失败
# ============================================================================

# 刻意 **不用** `set -e`：本测试大量依赖「命令以非 0 退出」这一事实。
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LIB="$REPO_ROOT/scripts/lib/resolve-profile.sh"
BASH_BIN="$(command -v bash)"
PKG="dsh-plugin-repo-manager"

PASS=0
FAIL=0

ok() { PASS=$((PASS + 1)); printf '  [PASS] %s\n' "$1"; }
no() {
    FAIL=$((FAIL + 1))
    printf '  [FAIL] %s\n' "$1"
    printf '         期望: %s\n' "$2"
    printf '         实际: %s\n' "$3"
}
check() { # name expected actual
    if [ "$2" = "$3" ]; then ok "$1"; else no "$1" "$2" "$3"; fi
}

if [ ! -f "$LIB" ]; then
    echo "ERROR: 找不到 $LIB" >&2
    exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FAKE_HOME="$TMP/home"
mkdir -p "$FAKE_HOME"

# ---- 被测进程的运行环境（每次用例前可重设） ----
EXTRA_ENV=()
CLI_ARGS=()
T_KNOWN_HOMES=""      # 关掉内置「已知数据根」清单，否则真机上的 /vol2/... 会混进来
T_NO_SEARCH="1"       # 默认关搜索，只有专门的用例才开

reset_env() {
    EXTRA_ENV=()
    CLI_ARGS=()
    T_KNOWN_HOMES=""
    T_NO_SEARCH="1"
}

# 在干净环境里跑真实 lib；stdout 原样返回
_run() {
    env -i \
        PATH="$PATH" \
        HOME="$FAKE_HOME" \
        ${SYSTEMROOT:+SYSTEMROOT="$SYSTEMROOT"} \
        "DSH_KNOWN_HOMES=$T_KNOWN_HOMES" \
        "DSH_NO_PROFILE_SEARCH=$T_NO_SEARCH" \
        ${EXTRA_ENV[@]+"${EXTRA_ENV[@]}"} \
        "$BASH_BIN" "$LIB" ${CLI_ARGS[@]+"${CLI_ARGS[@]}"}
}

# 期望：成功（rc=0）且 stdout 恰好等于期望路径
r_path() { # name want
    local name="$1" want="$2" out rc=0
    out="$(_run 2>/dev/null)" || rc=$?
    if [ "$rc" -eq 0 ] && [ "$out" = "$want" ]; then
        ok "$name"
    else
        no "$name" "$want  (rc=0)" "$out  (rc=$rc)"
    fi
}

# 期望：失败（指定退出码）且 stdout 为空 —— 「不猜」必须表现为「不输出任何路径」
r_fail() { # name want_rc
    local name="$1" want_rc="$2" out rc=0
    out="$(_run 2>/dev/null)" || rc=$?
    if [ "$rc" -eq "$want_rc" ] && [ -z "$out" ]; then
        ok "$name"
    else
        no "$name" "rc=$want_rc 且 stdout 为空" "rc=$rc  stdout='$out'"
    fi
}

# ---- 搭假布局的两个原语 ----
mkprofile() { # dir —— 造一个「像 DSH profile」的目录
    mkdir -p "$1"
    printf '{"name":"fake-profile","dsh":{"profile":{"bundles":[]}}}\n' > "$1/package.json"
}
mkplugin() { # dir —— 假装本插件已经装在 $1/node_modules 下
    mkdir -p "$1/node_modules/$PKG"
    printf '{"name":"%s"}\n' "$PKG" > "$1/node_modules/$PKG/package.json"
}

echo "=== profile 运行时探测测试 ==="
echo "库: $LIB"
echo ""

# ===========================================================================
echo "1. 显式 PROFILE_DIR —— 权威，且不做任何回退（1.1-1.5）"
# ===========================================================================
reset_env
S1="$TMP/s1"
mkprofile "$S1/data/profiles/web"
mkprofile "$S1/chosen/profiles/web"
EXTRA_ENV+=("DSH_HOME=$S1/data")
EXTRA_ENV+=("PROFILE_DIR=$S1/chosen/profiles/web")
r_path "1.1 显式指定即采用（即使 DSH_HOME 下另有可用 profile 也不改）" \
    "$S1/chosen/profiles/web"

S1OUT="$(_run 2>/dev/null)"
check "1.2 成功时 stdout 恰好一行（可直接放进 \$(...)）" \
    "1" "$(printf '%s\n' "$S1OUT" | wc -l | tr -d ' ')"

reset_env
EXTRA_ENV+=("PROFILE_DIR=$S1/nope")
r_fail "1.3 显式指定的目录不存在 → rc=2（不静默回退到别处）" "2"

reset_env
mkdir -p "$S1/half/profiles/web"          # 有目录、无 package.json
EXTRA_ENV+=("PROFILE_DIR=$S1/half/profiles/web")
r_fail "1.4 显式指定但缺 package.json → rc=2" "2"

reset_env
mkprofile "$S1/data2/profiles/web"
EXTRA_ENV+=("DSH_HOME=$S1/data2")
EXTRA_ENV+=("PROFILE_DIR=$S1/nope")
r_fail "1.5 显式指定无效时，绝不改用旁边的合法候选" "2"

# ===========================================================================
echo ""
echo "2. 自动推导（2.1-2.6）"
# ===========================================================================
reset_env
S2="$TMP/s2"
mkprofile "$S2/data/profiles/web"
EXTRA_ENV+=("DSH_HOME=$S2/data")
r_path "2.1 \$DSH_HOME 下 profiles/web → 采用" "$S2/data/profiles/web"

reset_env
FAKE_HOME="$TMP/s2home"
mkdir -p "$FAKE_HOME"
mkprofile "$FAKE_HOME/.dsh/profiles/web"
r_path "2.2 无 DSH_HOME 时兜底 \$HOME/.dsh/profiles/web" "$FAKE_HOME/.dsh/profiles/web"
FAKE_HOME="$TMP/home"

reset_env
S2B="$TMP/s2b"
mkprofile "$S2B/data/profiles/web"
mkprofile "$S2B/data/profiles/cli"
EXTRA_ENV+=("DSH_HOME=$S2B/data")
r_path "2.3 web 与 cli 并存 → 选标准名 web（本插件只在 Web UI 里跑）" \
    "$S2B/data/profiles/web"

reset_env
EXTRA_ENV+=("DSH_HOME=$S2B/data")
EXTRA_ENV+=("DSH_PROFILE=cli")
r_path "2.4 DSH_PROFILE=<名字> 可显式覆盖" "$S2B/data/profiles/cli"

reset_env
EXTRA_ENV+=("DSH_PROFILE=$S2B/data/profiles/cli")
r_path "2.5 DSH_PROFILE=<绝对路径> 直接采用" "$S2B/data/profiles/cli"

reset_env
S2C="$TMP/s2c"
mkprofile "$S2C/data/profiles/web"
EXTRA_ENV+=("DSH_PLUGIN_HOME=$S2C/data")
r_path "2.6 DSH_PLUGIN_HOME 也被认作数据根" "$S2C/data/profiles/web"

# ===========================================================================
echo ""
echo "3. DSH_HOME 权威 + 升级路径（3.1-3.4）"
# ===========================================================================
reset_env
S3="$TMP/s3"
mkprofile "$S3/data/profiles/web"                 # DSH_HOME 下的（权威）
mkprofile "$S3/stale/profiles/web"                # 别处的旧副本
mkplugin "$S3/stale/profiles/web"                 # 且里面装过插件
FAKE_HOME="$TMP/s3home"; mkdir -p "$FAKE_HOME"
# 把 old 那个挂到 ~/.dsh 下，使其进入候选集
mkdir -p "$FAKE_HOME/.dsh"; cp -r "$S3/stale/profiles" "$FAKE_HOME/.dsh/profiles"
EXTRA_ENV+=("DSH_HOME=$S3/data")
r_path "3.1 DSH_HOME 是权威 → 即使别处有旧副本也不偏离" "$S3/data/profiles/web"
FAKE_HOME="$TMP/home"

reset_env
S3B="$TMP/s3b"
mkprofile "$S3B/data/profiles/web"
mkprofile "$S3B/data/profiles/alt"
mkplugin "$S3B/data/profiles/alt"
EXTRA_ENV+=("DSH_HOME=$S3B/data")
r_path "3.2 同一数据根下：插件已装在 alt → 更新 alt（升级不换地方）" \
    "$S3B/data/profiles/alt"

reset_env
S3C="$TMP/s3c"
mkdir -p "$S3C/data/profiles"                      # 数据根在、但一个 profile 都没有
FAKE_HOME="$TMP/s3chome"; mkdir -p "$FAKE_HOME"
mkprofile "$FAKE_HOME/.dsh/profiles/web"
EXTRA_ENV+=("DSH_HOME=$S3C/data")
r_path "3.3 DSH_HOME 下空集（不是断言，只是没找到）→ 退到别处而不是直接失败" \
    "$FAKE_HOME/.dsh/profiles/web"
FAKE_HOME="$TMP/home"

reset_env
FAKE_HOME="$TMP/s3dhome"; mkdir -p "$FAKE_HOME"
mkprofile "$FAKE_HOME/.dsh/profiles/web"
EXTRA_ENV+=("DSH_HOME=$S3C/data")
ERR="$(_run 2>&1 >/dev/null)"
case "$ERR" in
    *"DSH_HOME=$S3C/data 下没有任何可用 profile"*)
        ok "3.4 权威来源落空时**主动告警**（不能悄悄换一个目录）" ;;
    *)  no "3.4 权威来源落空时**主动告警**（不能悄悄换一个目录）" \
           "stderr 含告警" "$ERR" ;;
esac
FAKE_HOME="$TMP/home"

# ===========================================================================
echo ""
echo "4. 有歧义就不猜（4.1-4.3）"
# ===========================================================================
reset_env
S4="$TMP/s4"
FAKE_HOME="$TMP/s4home"; mkdir -p "$FAKE_HOME"
mkprofile "$FAKE_HOME/.dsh/profiles/web"
mkprofile "$S4/other/profiles/web"
EXTRA_ENV+=("DSH_PLUGIN_HOME=$S4/other")
r_fail "4.1 两个 profiles/web 都可用 → rc=3（不挑一个碰运气）" "3"
FAKE_HOME="$TMP/home"

reset_env
FAKE_HOME="$TMP/s4bhome"; mkdir -p "$FAKE_HOME"
mkprofile "$FAKE_HOME/.dsh/profiles/alpha"
mkprofile "$FAKE_HOME/.dsh/profiles/beta"
r_fail "4.2 多个非 web 候选 → rc=3" "3"
FAKE_HOME="$TMP/home"

reset_env
S4C="$TMP/s4c"
mkprofile "$S4C/data/profiles/web"
mkprofile "$S4C/data/profiles/alt"
mkplugin "$S4C/data/profiles/web"
mkplugin "$S4C/data/profiles/alt"
EXTRA_ENV+=("DSH_HOME=$S4C/data")
r_fail "4.3 两个 profile 都装过插件 → rc=3（不猜该更新哪个）" "3"

# ===========================================================================
echo ""
echo "5. 受限搜索兜底（5.1-5.3）"
# ===========================================================================
reset_env
S5="$TMP/s5"
mkprofile "$S5/deep/data/profiles/web"
EXTRA_ENV+=("DSH_PROFILE_SEARCH_ROOT=$S5")
r_fail "5.1 关掉搜索时找不到（证明搜索确实是必要的一环）" "1"

reset_env
T_NO_SEARCH="0"
EXTRA_ENV+=("DSH_PROFILE_SEARCH_ROOT=$S5")
r_path "5.2 放开搜索且唯一命中 → 采用" "$S5/deep/data/profiles/web"

reset_env
T_NO_SEARCH="0"
S5B="$TMP/s5b"
mkprofile "$S5B/a/data/profiles/web"
mkprofile "$S5B/b/data/profiles/web"
EXTRA_ENV+=("DSH_PROFILE_SEARCH_ROOT=$S5B")
r_fail "5.3 搜索命中两个同名 web → rc=3" "3"

# ===========================================================================
echo ""
echo "6. 诊断模式 / 只读性（6.1-6.4）"
# ===========================================================================
reset_env
S6="$TMP/s6"
mkprofile "$S6/data/profiles/web"
EXTRA_ENV+=("DSH_HOME=$S6/data")
CLI_ARGS=(--list)
OUT6="$(_run 2>&1)"
case "$OUT6" in
    *"profile 候选"*"$S6/data/profiles/web"*) ok "6.1 --list 列出候选与检查结果" ;;
    *) no "6.1 --list 列出候选与检查结果" "含候选清单与目标路径" "$(printf '%s' "$OUT6" | head -3)" ;;
esac

CLI_ARGS=(--json)
OUT6J="$(_run 2>/dev/null)"
if command -v python3 >/dev/null 2>&1; then
    if printf '%s' "$OUT6J" | python3 -c 'import json,sys
d = json.load(sys.stdin)
assert d["resolved"].endswith("/profiles/web"), d
assert d["exitCode"] == 0, d' 2>/dev/null; then
        ok "6.2 --json 输出合法且含 resolved/exitCode"
    else
        no "6.2 --json 输出合法且含 resolved/exitCode" "可解析的 JSON" "$OUT6J"
    fi
else
    case "$OUT6J" in
        *'"resolved"'*) ok "6.2 --json 输出含 resolved（无 python3，退化为文本判据）" ;;
        *) no "6.2 --json 输出含 resolved" '"resolved"' "$OUT6J" ;;
    esac
fi

# 只读性：解析前后目录树必须一模一样（探测绝不能顺手写点什么）
reset_env
S6B="$TMP/s6b"
mkprofile "$S6B/data/profiles/web"
mkplugin "$S6B/data/profiles/other-not-profile"
EXTRA_ENV+=("DSH_HOME=$S6B/data")
SNAP_BEFORE="$(find "$S6B" | sort)"
_run >/dev/null 2>&1
SNAP_AFTER="$(find "$S6B" | sort)"
check "6.3 探测是只读的（前后目录树逐字一致）" "$SNAP_BEFORE" "$SNAP_AFTER"

reset_env
r_fail "6.4 什么都没找到 → rc=1" "1"

# ===========================================================================
echo ""
echo "=== 结果 ==="
echo "  通过: $PASS    失败: $FAIL"
if [ "$FAIL" -gt 0 ]; then
    echo ""
    echo "存在失败项。"
    exit 1
fi
echo ""
echo "全部通过。"
exit 0
