#!/bin/bash
set -euo pipefail

# 一条命令完成「拉取最新 → 重装面板插件」。
#
# 为什么需要这个脚本：
#   DSH 读的是 profile 里**复制过去的独立副本**（不是软链接），所以
#       git pull   只更新「源」          → 面板现象不变
#       install    才更新「已装的那份」  → 需要重启 DSH 才生效
#   两步必须都做，少一步都会让人以为「改了没效果」。
#
# ⚠️ 本脚本 **不内联任何落点逻辑**，只做两件事：
#       ① 在已有仓库里 git pull
#       ② exec 到唯一实现 scripts/install-to-profile.sh
#   「同一套逻辑只能有一份实现」是本仓库铁律，且由
#   validate_repo.py 的 2.6（check_install_impl_uniqueness）结构性守住 ——
#   在这里重写一遍落点必然漂移（历史上已经发生过一次）。
#
# 路径全部相对自身定位：仓库放在任何目录都能跑，不写死 /vol1/1000/AI/DSHPlugin。
#
# 用法:
#   bash scripts/update-and-install.sh                 # 拉取 + 重装面板
#   bash scripts/update-and-install.sh --skills        # 另外重装 skills/ 下全部技能
#   bash scripts/update-and-install.sh --no-pull       # 只重装，不拉取
#   PROFILE_DIR=/path/to/profile bash scripts/update-and-install.sh
#
# 环境变量:
#   REPO_REMOTE   拉取用的远端名（默认 origin）
#   REPO_BRANCH   拉取的分支（默认：当前所在分支）
#   DSH_HOME      技能安装目标（默认 $HOME/.dsh，与 Makefile 一致）

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALLER="$SCRIPT_DIR/install-to-profile.sh"

REPO_REMOTE="${REPO_REMOTE:-origin}"

DO_PULL=1
DO_SKILLS=0
while [ $# -gt 0 ]; do
    case "$1" in
        --no-pull) DO_PULL=0 ;;
        --skills)  DO_SKILLS=1 ;;
        --pull)    DO_PULL=1 ;;
        -h|--help)
            sed -n '/^# 用法:/,/^#$/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *)
            echo "ERROR: 未知参数 $1（可用: --no-pull --skills --help）" >&2
            exit 2
            ;;
    esac
    shift
done

echo "=== 更新并安装面板插件 ==="
echo "仓库:   $REPO_ROOT"
echo ""

# ---------- 1. 拉取最新 ----------
if [ "$DO_PULL" = "1" ]; then
    if [ ! -d "$REPO_ROOT/.git" ]; then
        echo "1. 跳过拉取：$REPO_ROOT 不是 git 工作区（没有 .git）"
        echo "   → 若是从压缩包解出来的目录，直接继续用当前内容安装即可。"
    elif [ ! -d "$REPO_ROOT/$REPO_REMOTE" ] && ! git -C "$REPO_ROOT" remote get-url "$REPO_REMOTE" >/dev/null 2>&1; then
        echo "1. 跳过拉取：未配置远端 $REPO_REMOTE"
        echo "   → 如需联网更新，先执行: git -C \"$REPO_ROOT\" remote add $REPO_REMOTE <url>"
    else
        echo "1. 拉取最新（$REPO_REMOTE）..."

        # 有本地改动时**明确报错退出**，不要静默 stash/覆盖 —— 数据安全优先。
        if [ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
            echo "ERROR: 工作区有未提交的本地改动，为避免覆盖已停止拉取。" >&2
            echo "" >&2
            git -C "$REPO_ROOT" status --short | sed 's/^/       /' >&2
            echo "" >&2
            echo "       请先 commit / stash，或改用：bash scripts/update-and-install.sh --no-pull" >&2
            exit 3
        fi

        BEFORE="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo '?')"

        # 指定了 REPO_BRANCH 就拉那条分支，否则跟随当前分支
        if [ -n "${REPO_BRANCH:-}" ]; then
            git -C "$REPO_ROOT" pull --ff-only "$REPO_REMOTE" "$REPO_BRANCH"
        else
            git -C "$REPO_ROOT" pull --ff-only
        fi

        AFTER="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo '?')"
        if [ "$BEFORE" = "$AFTER" ]; then
            echo "   ✓ 已是最新（$AFTER）"
        else
            echo "   ✓ 已更新 $BEFORE → $AFTER"
        fi
    fi
else
    echo "1. 按参数要求跳过拉取（--no-pull）"
fi
echo ""

# ---------- 2. 安装技能（可选） ----------
# 技能与面板的落点**完全不同**（技能 → $DSH_HOME/skills/，面板 → profile 的 node_modules/）。
# 技能的安装逻辑是「平铺复制目录」，本身没有第二份实现的漂移风险，
# 故此处直接复制即可；面板那一半仍必须转发到唯一实现。
if [ "$DO_SKILLS" = "1" ]; then
    DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
    SKILLS_SRC="$REPO_ROOT/skills"
    echo "2. 安装技能到 $DSH_HOME/skills ..."
    if [ ! -d "$SKILLS_SRC" ]; then
        echo "   ⚠ 跳过：$SKILLS_SRC 不存在"
    else
        mkdir -p "$DSH_HOME/skills"
        n=0
        for d in "$SKILLS_SRC"/*/; do
            [ -d "$d" ] || continue
            [ -f "$d/SKILL.md" ] || continue
            name="$(basename "$d")"
            rm -rf "$DSH_HOME/skills/$name"
            cp -r "$d" "$DSH_HOME/skills/$name"
            echo "   ✓ $name"
            n=$((n + 1))
        done
        echo "   ✓ 共 $n 个技能"
    fi
    echo ""
fi

# ---------- 3. 安装面板（转发到唯一实现，不在此处重写落点） ----------
echo "3. 安装面板插件到 DSH profile..."
echo ""
exec bash "$INSTALLER"
