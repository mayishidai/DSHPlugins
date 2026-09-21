#!/bin/bash
# ============================================================================
# DSH profile 目录解析器 —— **全仓库唯一一处实现**
# ============================================================================
#
# 为什么需要它（2026-09-21）：
#   安装脚本曾把 profile 路径写死成
#       PROFILE_DIR="${PROFILE_DIR:-/vol2/@appdata/deepseek.harness/dsh-data/profiles/web}"
#   于是**只有那一台机器**能装。换个部署（另一台 NAS / 另一个容器 / 另一个数据根）
#   立刻报：
#       ERROR: DSH profile 不存在: /vol2/@appdata/...
#   用户原话：「我不止部署一个机器的 DSH」。
#
#   这与「skillsDir 写死 ~/.dsh/skills」是**同一类问题**：
#   `写死宿主路径 → 宿主其实在别处 → 文件写到没人看的地方`。
#   凡宿主路径，一律**运行时探测**，且探测结果要能自证、要能报错时吐全部候选。
#
# 设计原则（与 skillsDir 那套同构）：
#   1. **绝不写死**：没有任何一个绝对路径是「唯一默认」。全部只是**候选**，
#      必须实际存在于本机才会被采用。
#   2. **显式优先且不猜**：`PROFILE_DIR` 一旦设置就是权威。它指向无效目录时
#      **直接报错**，绝不悄悄回退到别的候选人 —— 否则「智能纠偏」会写到另一个错地方。
#   3. **唯一命中才采用**：多个候选都合法 → **不猜**，列出全部 + 告诉用户怎么指定。
#   4. **stdout 只有结果**：本函数用 `$(...)` 取值，所有诊断一律走 stderr。
#   5. **输出可自证**：`--list` 把「每个候选 + 各自检查结果」全部摊开。
#
# 只被这两个脚本 source（一个写、一个删，无法合并）：
#   scripts/install-to-profile.sh
#   scripts/uninstall-from-profile.sh
# 由 validate_repo.py 的 2.7 / 2.10 结构性守住「不得再有第二份实现」。
#
# 也可直接执行（诊断模式，不改动任何东西）：
#   bash scripts/lib/resolve-profile.sh              # 打印解析结果 + 依据
#   bash scripts/lib/resolve-profile.sh --list       # 列出全部候选与检查结果
#   bash scripts/lib/resolve-profile.sh --json       # 机器可读
#
# 环境变量：
#   PROFILE_DIR                 显式指定 profile 目录（最高权威）
#   DSH_PROFILE                 路径，或 profile 名（在已知 DSH_HOME 下展开）
#   DSH_HOME                    DSH 数据根（权威：其下 profiles/ 优先）
#   DSH_PLUGIN_HOME             本项目约定的数据根别名
#   DSH_KNOWN_HOMES             覆盖内置「已知数据根」清单（设为空可完全禁用）
#   DSH_PROFILE_SEARCH_ROOT     受限搜索的起始根（默认 /vol1 /vol2 /volume1 …）
#   DSH_NO_PROFILE_SEARCH=1     完全禁用受限搜索（测试与快速失败用）
# ============================================================================

# 默认包名。仅用于「升级路径」判据：哪个 profile 里**已经装过本插件**。
# 卸载脚本必须算出与安装完全相同的落点，所以这个默认值也必须一致。
DSH_PLUGIN_PKG_DEFAULT="dsh-plugin-repo-manager"

# 内置的「已知 DSH 数据根」清单 —— 只是**搜索起点**，不是默认值。
# ⚠️ 它们全部要经过存在性检查；不存在就只是候选表里的一个「·」。
# 多机部署实测/文档出现过的布局：fnOS / 群晖 / 通用 Linux。
DSH_KNOWN_HOMES_DEFAULT="/vol2/@appdata/deepseek.harness/dsh-data
/vol1/@appdata/deepseek.harness/dsh-data
/vol1/1000/@appdata/deepseek.harness/dsh-data
/volume1/@appdata/deepseek.harness/dsh-data
/volume1/docker/deepseek.harness/dsh-data
/srv/deepseek.harness/dsh-data
/opt/deepseek.harness/dsh-data"

# ---------------------------------------------------------------------------
# 低层判据
# ---------------------------------------------------------------------------

# 一个目录是否「像 DSH profile」—— 目录存在且有 package.json。
# 安装脚本本来就要写这个 package.json，所以这是必要条件，不是充分条件。
# ⚠️ 一律写成显式 if/fi：`A && B && C` 作为函数体最后一条语句时，
#    返回非 0 会让调用了 `set -e` 的脚本直接退出（本库被 set -euo pipefail 的脚本 source）。
dsh_profile_validate() {
    if [ -n "${1:-}" ] && [ -d "$1" ] && [ -f "$1/package.json" ]; then
        return 0
    fi
    return 1
}

# 目录存在但没有 package.json —— 半成品 profile，应当单独报告而不是当作不存在。
dsh_profile_dir_only() {
    if [ -n "${1:-}" ] && [ -d "$1" ] && [ ! -f "$1/package.json" ]; then
        return 0
    fi
    return 1
}

# 更强判据：package.json 的顶层有 "dsh" 键（profile 的真实签名）。
# **只在「受限搜索」里用** —— 搜索结果没有结构上下文，误报概率高。
_dsh_pkg_has_dsh_key() {
    local pj="$1/package.json"
    [ -f "$pj" ] || return 1
    if command -v python3 >/dev/null 2>&1; then
        python3 -c 'import json,sys
try:
    d = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    sys.exit(1)
sys.exit(0 if isinstance(d.get("dsh"), (dict, list)) else 1)' "$pj" 2>/dev/null
    else
        grep -qE '^[[:space:]]*"dsh"[[:space:]]*:' "$pj" 2>/dev/null
    fi
}

# 本插件（或其历史错误落点）是否装在这个 profile 里。
_dsh_plugin_installed_in() {
    local dir="$1" pkg="$2"
    if [ -f "$dir/node_modules/$pkg/package.json" ]; then return 0; fi
    if [ -f "$dir/node_modules/@deepseek-ai/$pkg/package.json" ]; then return 0; fi
    return 1
}

# ---------------------------------------------------------------------------
# 候选枚举
# ---------------------------------------------------------------------------

# DSH 数据根候选（按优先级）。显式 env 在最前，其余只是常见布局的**猜测**。
dsh_home_candidates() {
    local h
    for h in "${DSH_HOME:-}" "${DSH_PLUGIN_HOME:-}"; do
        if [ -n "$h" ]; then printf '%s\n' "${h%/}"; fi
    done
    if [ -n "${HOME:-}" ]; then
        printf '%s\n' "${HOME%/}/.dsh"
        printf '%s\n' "${HOME%/}/.deepseek/harness"
    fi
    if [ -d "/root/.dsh" ]; then printf '%s\n' "/root/.dsh"; fi
    # `${VAR-default}`（单横线）：未设置→用内置清单；设为空串→完全禁用内置清单。
    printf '%s\n' "${DSH_KNOWN_HOMES-$DSH_KNOWN_HOMES_DEFAULT}"
}

# 受限搜索：常见数据根下的 */profiles/*/ （目录名就叫 profiles）。
# 只在「正常候选全部落空」时才跑，避免日常执行被拖慢。
dsh_search_profile_dirs() {
    if [ "${DSH_NO_PROFILE_SEARCH:-0}" = "1" ]; then return 0; fi
    local roots="${DSH_PROFILE_SEARCH_ROOT-/vol1 /vol2 /volume1 /volume2 /opt /srv /data}"
    local root pd c
    for root in $roots; do
        if [ -z "$root" ] || [ ! -d "$root" ]; then continue; fi
        while IFS= read -r pd; do
            [ -n "$pd" ] || continue
            for c in "$pd"/*/; do
                [ -d "$c" ] || continue
                c="${c%/}"
                dsh_profile_validate "$c" || continue
                # 搜索结果必须过更强判据，否则会把 /opt/foo/profiles/bar 之类当 profile
                _dsh_pkg_has_dsh_key "$c" || continue
                printf '%s\n' "$c"
            done
        done < <(find "$root" -maxdepth 5 -type d -name profiles -print 2>/dev/null)
    done
}

# 输出所有候选：每行 `<目录>\t<来源>`，**保持优先级顺序**。
# 不做去重（调用方负责），这样 --list 能原样展示重复来源。
dsh_profile_candidates() {
    local pkg="${1:-$DSH_PLUGIN_PKG_DEFAULT}"
    local h p

    # ① 显式指定 —— 用户说了算
    if [ -n "${PROFILE_DIR:-}" ]; then
        printf '%s\t%s\n' "${PROFILE_DIR%/}" "env:PROFILE_DIR"
    fi

    # ② DSH_PROFILE：既可以是路径，也可以是 profile 名
    if [ -n "${DSH_PROFILE:-}" ]; then
        case "$DSH_PROFILE" in
            */*) printf '%s\t%s\n' "${DSH_PROFILE%/}" "env:DSH_PROFILE(路径)" ;;
            *)   while IFS= read -r h; do
                     [ -n "$h" ] || continue
                     printf '%s\t%s\n' "$h/profiles/$DSH_PROFILE" \
                         "env:DSH_PROFILE=$DSH_PROFILE @ $h"
                 done < <(dsh_home_candidates)
                 ;;
        esac
    fi

    # ③ 「已经装过本插件」的位置 —— 升级路径，最强信号。
    #    装在哪就更新哪，绝不因为「这台机器的标准 profile 叫 web」而换地方。
    while IFS= read -r h; do
        [ -n "$h" ] || continue
        for p in "$h"/profiles/*/; do
            [ -d "$p" ] || continue
            if _dsh_plugin_installed_in "${p%/}" "$pkg"; then
                printf '%s\t%s\n' "${p%/}" "已装 $pkg @ $h"
            fi
        done
    done < <(dsh_home_candidates)

    # ④ 标准 profile 名（web 是 DSH Web UI 的默认名，本插件只在 Web UI 里跑）
    while IFS= read -r h; do
        [ -n "$h" ] || continue
        printf '%s\t%s\n' "$h/profiles/web" "DSH_HOME=$h"
    done < <(dsh_home_candidates)
    while IFS= read -r h; do
        [ -n "$h" ] || continue
        printf '%s\t%s\n' "$h/profiles/default" "DSH_HOME=$h"
    done < <(dsh_home_candidates)

    # ⑤ DSH_HOME 下的其它 profile（web / default 之外的）
    while IFS= read -r h; do
        [ -n "$h" ] || continue
        for p in "$h"/profiles/*/; do
            [ -d "$p" ] || continue
            printf '%s\t%s\n' "${p%/}" "DSH_HOME=$h 下其它 profile"
        done
    done < <(dsh_home_candidates)

    # ⑥ 受限搜索（兜底）
    while IFS= read -r p; do
        [ -n "$p" ] || continue
        printf '%s\t%s\n' "$p" "搜索:$(dirname "$(dirname "$p")")"
    done < <(dsh_search_profile_dirs)
}

# ---------------------------------------------------------------------------
# 候选状态（供报告与自证用）
# ---------------------------------------------------------------------------

# 打印「目录<TAB>状态」，状态取值：missing / dir-only / ok
dsh_profile_candidate_states() {
    local pkg="${1:-$DSH_PLUGIN_PKG_DEFAULT}"
    local d s
    while IFS=$'\t' read -r d s; do
        [ -n "$d" ] || continue
        if dsh_profile_validate "$d"; then
            printf '%s\tok\t%s\n' "$d" "$s"
        elif dsh_profile_dir_only "$d"; then
            printf '%s\tdir-only\t%s\n' "$d" "$s"
        else
            printf '%s\tmissing\t%s\n' "$d" "$s"
        fi
    done < <(dsh_profile_candidates "$pkg" | awk -F'\t' '!seen[$1]++')
}

# 人读报告：所有候选 + 各自检查结果 + 怎么手动指定。
# 全部走 stderr（被人为调用时才需要重定向到 stdout）。
dsh_profile_report() {
    local pkg="${1:-$DSH_PLUGIN_PKG_DEFAULT}"
    local d st s n_ok=0

    printf '\n已检查的 profile 候选（★=可用 · =存在但无 package.json · ·=不存在）:\n'
    while IFS=$'\t' read -r d st s; do
        case "$st" in
            ok)       printf '  ★ %-58s ← %s\n' "$d" "$s"; n_ok=$((n_ok + 1)) ;;
            dir-only) printf '  = %-58s ← %s（缺 package.json，不是完整 profile）\n' "$d" "$s" ;;
            *)        printf '  · %-58s ← %s\n' "$d" "$s" ;;
        esac
    done < <(dsh_profile_candidate_states "$pkg")

    if [ "$n_ok" -gt 1 ]; then
        printf '\n⚠  有 %d 个候选都可用 → 不做猜测，必须显式指定。\n' "$n_ok"
    fi

    cat >&2 <<'EOF'

怎么办（任选其一）:
  · 直接告诉它 profile 在哪（推荐，最准）:
      PROFILE_DIR=<你的 DSH 数据根>/profiles/web bash scripts/install-to-profile.sh
  · 只知道数据根也行（它会自己找其下的 profiles/web）:
      DSH_HOME=<你的 DSH 数据根> bash scripts/install-to-profile.sh
  · 有多个 profile，指定名字:
      DSH_PROFILE=web DSH_HOME=<数据根> bash scripts/install-to-profile.sh
  · 数据盘不在默认位置，放开搜索范围:
      DSH_PROFILE_SEARCH_ROOT=/你的数据盘 bash scripts/lib/resolve-profile.sh --list
  · 只想看看它到底找过哪些地方:
      bash scripts/lib/resolve-profile.sh --list
EOF
}

# ---------------------------------------------------------------------------
# 解析主函数
# ---------------------------------------------------------------------------
#
# 成功：stdout 打印**一行**绝对路径，返回 0
# 失败：stdout 为空，stderr 打印原因 + 全部候选，返回非 0
#   exit 2 = 显式指定但无效（不猜，直接失败）
#   exit 3 = 找到多个都可用（不猜，要求显式指定）
#   exit 1 = 一个都没找到（附完整候选表）
resolve_dsh_profile_dir() {
    local pkg="${1:-$DSH_PLUGIN_PKG_DEFAULT}"

    # ---------- ① 显式 PROFILE_DIR：权威，且不做任何回退 ----------
    if [ -n "${PROFILE_DIR:-}" ]; then
        local explicit="${PROFILE_DIR%/}"
        if dsh_profile_validate "$explicit"; then
            printf '%s\n' "$explicit"
            printf '  profile: %s  （来自 env:PROFILE_DIR）\n' "$explicit" >&2
            return 0
        fi
        {
            printf 'ERROR: PROFILE_DIR 指向的不是一个有效 profile: %s\n' "$explicit"
            printf '       要求：目录存在，且含 package.json。\n'
            printf '       已显式指定，故不自动改用它处（避免写到另一个错误的 profile）。\n'
        } >&2
        dsh_profile_report "$pkg" >&2
        return 2
    fi

    # ---------- ② 收集候选并去重（保持优先级顺序） ----------
    local -a dirs=()
    local -a srcs=()
    local d s i hit

    while IFS=$'\t' read -r d s; do
        [ -n "$d" ] || continue
        hit=0
        if [ "${#dirs[@]}" -gt 0 ]; then
            for i in "${dirs[@]}"; do
                if [ "$i" = "$d" ]; then hit=1; break; fi
            done
        fi
        [ "$hit" = "1" ] && continue
        dirs+=("$d")
        srcs+=("$s")
    done < <(dsh_profile_candidates "$pkg")

    # ---------- ③ 只留「真的存在」的候选 ----------
    local -a vdirs=()
    local -a vsrcs=()
    if [ "${#dirs[@]}" -gt 0 ]; then
        local idx
        for idx in "${!dirs[@]}"; do
            if dsh_profile_validate "${dirs[$idx]}"; then
                vdirs+=("${dirs[$idx]}")
                vsrcs+=("${srcs[$idx]}")
            fi
        done
    fi

    # ---------- ④ 正常候选全落空 → 放开受限搜索再试一次 ----------
    if [ "${#vdirs[@]}" -eq 0 ]; then
        while IFS= read -r d; do
            [ -n "$d" ] || continue
            hit=0
            if [ "${#vdirs[@]}" -gt 0 ]; then
                for i in "${vdirs[@]}"; do
                    if [ "$i" = "$d" ]; then hit=1; break; fi
                done
            fi
            [ "$hit" = "1" ] && continue
            vdirs+=("$d")
            vsrcs+=("搜索命中（$(dirname "$(dirname "$d")")）")
        done < <(dsh_search_profile_dirs)
    fi

    # ---------- ⑤ 一个都没有 ----------
    if [ "${#vdirs[@]}" -eq 0 ]; then
        echo "ERROR: 在本机找不到 DSH profile（一个可用候选都没有）。" >&2
        dsh_profile_report "$pkg" >&2
        return 1
    fi

    # ---------- ⑥ 显式来源优先（env:PROFILE_DIR / env:DSH_PROFILE） ----------
    # 候选表最前面连续的一段 `env:*` 就是显式来源（PROFILE_DIR 已在 ① 处理过，
    # 这里主要是 DSH_PROFILE）。显式来源只要命中就直接采用 —— 它代表「用户说了算」，
    # **优先级高于后面的任何启发式**（包括「profile 叫 web」这种偏好）。
    # ⚠️ 这一步必须放在 DSH_HOME 范围收窄之前：DSH_PROFILE=/abs/path 完全可能
    #    指到 DSH_HOME 之外，先收窄会把它自己过滤掉。
    local -a edirs=()
    local ei
    for ei in "${!vsrcs[@]}"; do
        case "${vsrcs[$ei]}" in
            env:*) edirs+=("${vdirs[$ei]}") ;;
            *) break ;;
        esac
    done
    if [ "${#edirs[@]}" -eq 1 ]; then
        printf '%s\n' "${edirs[0]}"
        printf '  profile: %s\n' "${edirs[0]}" >&2
        printf '  依据:    显式指定的 profile（DSH_PROFILE）\n' >&2
        return 0
    elif [ "${#edirs[@]}" -gt 1 ]; then
        echo "ERROR: DSH_PROFILE 展开出 ${#edirs[@]} 个可用 profile，无法判断用哪一个。" >&2
        for ei in "${!edirs[@]}"; do
            printf '         [%d] %s\n' "$((ei + 1))" "${edirs[$ei]}" >&2
        done
        printf '         改法：把 DSH_PROFILE 写成**绝对路径**，或用 PROFILE_DIR= 指定。\n' >&2
        return 3
    fi

    # ---------- ⑦ DSH_HOME 权威：只要它下面有可用 profile，就只在其中挑 ----------
    # 与 skillsDir 那套同构：**权威来源一旦给出答案，就不许偏离到别处**。
    # 但「权威来源一个都没给出」时不能死守 —— 那不是权威断言，只是空集，
    # 此时退到其它候选并**大声告警**，比直接失败更有用。
    if [ -n "${DSH_HOME:-}" ]; then
        local dh="${DSH_HOME%/}"
        local -a sdirs=()
        local -a ssrcs=()
        local sidx
        for sidx in "${!vdirs[@]}"; do
            case "${vdirs[$sidx]}" in
                "$dh"/*)
                    sdirs+=("${vdirs[$sidx]}")
                    ssrcs+=("${vsrcs[$sidx]}")
                    ;;
            esac
        done
        if [ "${#sdirs[@]}" -gt 0 ]; then
            vdirs=("${sdirs[@]}")
            vsrcs=("${ssrcs[@]}")
        else
            printf '  ⚠ DSH_HOME=%s 下没有任何可用 profile → 改在其它候选中寻找。\n' "$dh" >&2
            printf '    若这就是你指定的数据根，请检查它下面是否真有 profiles/<名字>/package.json。\n' >&2
        fi
    fi

    # ---------- ⑧ 在（可能的）限定范围内选一个：按明确度降序 ----------
    local pick="" why="" ambiguous=0

    # ⑧a 已经装过本插件的位置 → 那就是升级目标
    local -a inst=()
    for i in "${vdirs[@]}"; do
        if _dsh_plugin_installed_in "$i" "$pkg"; then inst+=("$i"); fi
    done
    if [ "${#inst[@]}" -eq 1 ]; then
        pick="${inst[0]}"
        why="该 profile 里已装过 $pkg"
    elif [ "${#inst[@]}" -gt 1 ]; then
        # 多个 profile 都装过 → **立刻**判为歧义。
        # ⚠️ 这里不能继续往下走「web 偏好」：既然两份都存在，说明用户确实用过多个
        #    profile，替他挑一个等于把另一份悄悄留在旧版本（实测过这个错）。
        ambiguous=1
        printf '  ⚠ 有 %d 个 profile 里都装过 %s（各有一份副本）。\n' \
            "${#inst[@]}" "$pkg" >&2
    fi

    # ⑧b 只有一个可用候选 → 采用
    if [ "$ambiguous" = "0" ] && [ -z "$pick" ] && [ "${#vdirs[@]}" -eq 1 ]; then
        pick="${vdirs[0]}"
        why="本机唯一可用候选"
    fi

    # ⑦b 只有一个可用候选 → 采用
    if [ -z "$pick" ] && [ "${#vdirs[@]}" -eq 1 ]; then
        pick="${vdirs[0]}"
        why="本机唯一可用候选"
    fi

    # ⑦c 恰好一个候选叫 web（DSH Web UI 的标准 profile 名）→ 采用
    if [ "$ambiguous" = "0" ] && [ -z "$pick" ]; then
        local -a webhits=()
        for i in "${vdirs[@]}"; do
            if [ "$(basename "$i")" = "web" ]; then webhits+=("$i"); fi
        done
        if [ "${#webhits[@]}" -eq 1 ]; then
            pick="${webhits[0]}"
            why="名为 web 的标准 profile（唯一一个）"
        fi
    fi

    # ⑦d 还是有歧义 → 不猜
    if [ -z "$pick" ]; then
        if [ "$ambiguous" = "1" ]; then
            echo "ERROR: 多个 profile 里都装过 $pkg，无法判断该更新哪一个（不做猜测）。" >&2
        else
            echo "ERROR: 找到 ${#vdirs[@]} 个可用 profile，无法判断该用哪一个（不做猜测）。" >&2
        fi
        local k
        for k in "${!vdirs[@]}"; do
            printf '         [%d] %s\n' "$((k + 1))" "${vdirs[$k]}" >&2
            printf '             来源: %s\n' "${vsrcs[$k]}" >&2
        done
        dsh_profile_report "$pkg" >&2
        return 3
    fi

    printf '%s\n' "$pick"
    printf '  profile: %s\n' "$pick" >&2
    printf '  依据:    %s\n' "$why" >&2
    return 0
}

# 本插件装在哪些候选 profile 里（一行一个）。卸载时用来提示「别的地方还有一份」。
dsh_profiles_where_installed() {
    local pkg="${1:-$DSH_PLUGIN_PKG_DEFAULT}"
    local d
    while IFS=$'\t' read -r d _st _s; do
        [ -n "$d" ] || continue
        if _dsh_plugin_installed_in "$d" "$pkg"; then printf '%s\n' "$d"; fi
    done < <(dsh_profile_candidate_states "$pkg")
}

# ---------------------------------------------------------------------------
# 直接执行时的 CLI（诊断模式，只读）
# ---------------------------------------------------------------------------
_dsh_cli() {
    local mode="${1:-resolve}"
    local pkg="${2:-$DSH_PLUGIN_PKG_DEFAULT}"
    local out rc

    case "$mode" in
        --list|-l)
            echo "=== profile 候选清单（只读，不修改任何东西）==="
            dsh_profile_report "$pkg" 2>&1 | sed '1{/^$/d;}'
            return 0
            ;;
        --json|-j)
            printf '{\n'
            printf '  "candidates": [\n'
            local first=1 d st s
            while IFS=$'\t' read -r d st s; do
                [ -n "$d" ] || continue
                [ "$first" = "1" ] || printf ',\n'
                first=0
                printf '    {"dir": "%s", "state": "%s", "source": "%s"}' "$d" "$st" "$s"
            done < <(dsh_profile_candidate_states "$pkg")
            printf '\n  ],\n'
            out="$(resolve_dsh_profile_dir "$pkg" 2>/dev/null)"
            rc=$?
            printf '  "resolved": "%s",\n' "$out"
            printf '  "exitCode": %d\n' "$rc"
            printf '}\n'
            return 0
            ;;
        --help|-h)
            sed -n '3,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
            return 0
            ;;
    esac

    out="$(resolve_dsh_profile_dir "$pkg")"
    rc=$?
    if [ "$rc" -eq 0 ]; then
        # ⚠️ stdout **只有**路径本身，装饰文字一律走 stderr ——
        # 这样 `x="$(bash resolve-profile.sh)"` 也能直接拿到干净结果，
        # 与函数版 `x="$(resolve_dsh_profile_dir)"` 语义完全一致。
        printf '%s\n' "$out"
        printf '解析成功（退出码 0）\n' >&2
    else
        printf '解析失败（退出码 %d）\n' "$rc" >&2
    fi
    return "$rc"
}

# source 时不自动执行；直接执行时进入 CLI。
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    _dsh_cli "$@"
    exit $?
fi
