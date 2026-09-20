#!/usr/bin/env bash
# gf.sh —— gameflow 痕迹目录辅助脚本（可用可不用；不可用时按 trace-spec.md 手工创建）
# 用法:
#   gf.sh init <项目根> [skill目录]   初始化 gameflow/（复制模板使项目自包含）
#   gf.sh new  <项目根> <slug>        创建新 WS 目录骨架并给出 INDEX 行
#   gf.sh find <项目根> <ID或关键词>  在 gameflow/ 与 git 历史中检索
#   gf.sh index <项目根>              校验 INDEX 与实际 WS 目录一致性
set -euo pipefail

usage() { grep '^#' "$0" | sed 's/^# \{0,1\}//' | tail -n +2; }

ws_scaffold() {  # $1=项目根 $2=WS目录名
  local root="$1" ws="$2" d="$1/gameflow/$2"
  mkdir -p "$d"/{tasks,decisions,05-qa}
  for t in intake design-doc task-board art-design integration-log retrospective; do
    [ -f "$root/gameflow/.templates/$t.md" ] && cp "$root/gameflow/.templates/$t.md" "$d/$t.md.tmp"
  done
  mv "$d/intake.md.tmp"        "$d/00-intake.md"        2>/dev/null || true
  mv "$d/design-doc.md.tmp"    "$d/01-design.md"        2>/dev/null || true
  mv "$d/task-board.md.tmp"    "$d/02-task-board.md"    2>/dev/null || true
  mv "$d/art-design.md.tmp"    "$d/03-art-design.md"    2>/dev/null || true
  mv "$d/integration-log.md.tmp" "$d/04-integration-log.md" 2>/dev/null || true
  mv "$d/retrospective.md.tmp" "$d/06-retrospective.md" 2>/dev/null || true
  rm -f "$d"/*.tmp
  chmod 644 "$d"/*.md 2>/dev/null || true
  printf '# timeline —— %s\n\n## %s | 主控\n- [%s] 创建工作流\n' \
    "$ws" "$(date '+%Y-%m-%d %H:%M')" "$ws" > "$d/timeline.md"
}

case "${1:-}" in
  init)
    root="${2:?用法: gf.sh init <项目根> [skill目录]}"
    skill="${3:-$(cd "$(dirname "$0")/.." && pwd)}"
    [ -d "$root/.git" ] || { echo "!! $root 不是 git 仓库"; exit 1; }
    [ -e "$root/gameflow" ] && { echo "!! $root/gameflow 已存在"; exit 1; }
    mkdir -p "$root/gameflow/.templates"
    cp "$skill"/references/templates/*.md "$root/gameflow/.templates/"
    chmod 644 "$root/gameflow/.templates"/*.md   # 源文件可能是 000 模式（ACL 文件系统），复制后须放开
    cat > "$root/gameflow/CONFIG.md" <<'EOF'
# gameflow 项目配置
- engine: <引擎与版本>
- code_dirs: <代码目录，逗号分隔>
- art_dirs: <美术目录，逗号分隔>
- branch_strategy: feat/WS-yyyymmdd-slug -> develop(PR)
- gates_manual: G1, G5
- art_spec: <美术规范链接或简述>
- lesson_float_to_skill: 需人工确认
EOF
    printf '# 工作流总索引（仅主控维护）\n\n| WS | 名称 | 类型 | 状态 | 分支 | 主要代码目录 | 创建 | 最近更新 |\n|---|---|---|---|---|---|---|---|\n' > "$root/gameflow/INDEX.md"
    printf '# 项目级经验库（通用经验经 retro/lesson 上浮到 skill）\n\n格式同 skill 的 references/knowledge/lessons.md，编号续接 skill 全局 L-### 或使用 P-###。\n' > "$root/gameflow/LESSONS.md"
    echo "OK 已初始化 $root/gameflow（含 .templates 自包含模板）"
    ;;

  new)
    root="${2:?用法: gf.sh new <项目根> <slug>}"
    slug="${3:?用法: gf.sh new <项目根> <slug>}"
    [ -d "$root/gameflow" ] || { echo "!! 先执行 init"; exit 1; }
    ws="WS-$(date '+%Y%m%d')-${slug}"
    [ -e "$root/gameflow/$ws" ] && { echo "!! $ws 已存在"; exit 1; }
    ws_scaffold "$root" "$ws"
    echo "OK 创建 $ws"
    echo ">> 请在 gameflow/INDEX.md 追加一行：| $ws | <名称> | feature | intake | feat/$ws | | $(date '+%Y-%m-%d') | $(date '+%Y-%m-%d') |"
    echo ">> 建议分支: git checkout -b feat/$ws"
    ;;

  find)
    root="${2:?用法: gf.sh find <项目根> <ID或关键词>}"
    kw="${3:?用法: gf.sh find <项目根> <ID或关键词>}"
    echo "== gameflow/ 痕迹 =="
    grep -rn --color=never "$kw" "$root/gameflow" || echo "(无)"
    echo "== git 提交 =="
    git -C "$root" log --oneline --all --grep="$kw" 2>/dev/null || echo "(无/非git)"
    ;;

  index)
    root="${2:?用法: gf.sh index <项目根>}"
    echo "== 目录中存在但 INDEX 未登记 =="
    for d in "$root"/gameflow/WS-*/; do
      ws=$(basename "$d")
      grep -q "$ws" "$root/gameflow/INDEX.md" || echo "未登记: $ws"
    done
    echo "== INDEX 登记但目录缺失 =="
    for ws in $(grep -oE 'WS-[0-9]{8}-[a-z0-9-]+' "$root/gameflow/INDEX.md" | sort -u || true); do
      [ -d "$root/gameflow/$ws" ] || echo "缺目录: $ws"
    done
    ;;

  *) usage; exit 1 ;;
esac
