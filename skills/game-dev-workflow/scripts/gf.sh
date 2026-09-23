#!/usr/bin/env bash
# gf.sh —— gameflow 痕迹目录（.gameflow/）辅助脚本（可用可不用；不可用时按 trace-spec.md 手工创建）
# 用法:
#   gf.sh init <项目根> [skill目录]   初始化 .gameflow/（复制模板使项目自包含）
#   gf.sh new  <项目根> <slug>        创建新 WS 目录骨架并给出 INDEX 行
#   gf.sh find <项目根> <ID或关键词>  在 .gameflow/ 与 git 历史中检索
#   gf.sh index <项目根>              校验 INDEX 与实际 WS 目录一致性
set -euo pipefail

# 只取「从第 2 行起连续的 # 注释块」——不能 grep '^#'（会把脚本内其它行首 # 也捞进来，
# 例如 CONFIG.md heredoc 里的 `# gameflow 项目配置` 会污染帮助输出）
usage() { awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"; }

resolve_root() {  # $1=项目根；输出绝对路径，消除「从哪个 cwd 调用」的差异
  [ -d "$1" ] || { echo "!! 项目根不存在: $1" >&2; exit 1; }
  (cd "$1" && pwd)
}

gitignore_check() {  # $1=项目根；.gitignore 若吃掉 .gameflow/ 则打印补丁行（只提示，不改文件）
  # 判据交给 git 自己（check-ignore），不手工解析 .gitignore —— 与 git 的匹配语义天然一致
  local root="$1" hit inner
  command -v git >/dev/null 2>&1 || return 0
  hit="$(git -C "$root" check-ignore -v .gameflow/CONFIG.md 2>/dev/null || true)"
  [ -n "$hit" ] || return 0
  inner="$(git -C "$root" check-ignore -v .gameflow/.templates/task-board.md 2>/dev/null || true)"
  echo
  echo "!! 警告: .gitignore 会忽略痕迹目录 —— git add 会直接报错，痕迹进不了仓库"
  echo "   命中规则: $hit"
  if [ -n "$inner" ]; then echo "   内层同样被忽略: $inner"; fi
  echo "   请在 $root/.gitignore 末尾追加这两行（第二行必需，否则 .templates/ 仍被吃掉）:"
  echo "     !.gameflow/"
  echo "     !.gameflow/**"
  return 0
}

ws_scaffold() {  # $1=项目根 $2=WS目录名
  local root="$1" ws="$2" d="$1/.gameflow/$2"
  mkdir -p "$d"/{tasks,decisions,05-qa}
  for t in intake design-doc task-board art-design integration-log retrospective; do
    [ -f "$root/.gameflow/.templates/$t.md" ] && cp "$root/.gameflow/.templates/$t.md" "$d/$t.md.tmp"
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
    root="$(resolve_root "${2:?用法: gf.sh init <项目根> [skill目录]}")"
    skill="${3:-$(cd "$(dirname "$0")/.." && pwd)}"
    [ -d "$root/.git" ] || { echo "!! $root 不是 git 仓库"; exit 1; }
    [ -e "$root/.gameflow" ] && { echo "!! $root/.gameflow 已存在"; exit 1; }
    mkdir -p "$root/.gameflow/.templates"
    cp "$skill"/references/templates/*.md "$root/.gameflow/.templates/"
    chmod 644 "$root/.gameflow/.templates"/*.md   # 源文件可能是 000 模式（ACL 文件系统），复制后须放开
    cat > "$root/.gameflow/CONFIG.md" <<'EOF'
# gameflow 项目配置
- engine: <引擎与版本>
- code_dirs: <代码目录，逗号分隔>
- art_dirs: <美术目录，逗号分隔>
- branch_strategy: feat/WS-yyyymmdd-slug -> develop(PR)
- gates_manual: G1, G5
- art_spec: <美术规范链接或简述>
- lesson_float_to_skill: 需人工确认
EOF
    printf '# 工作流总索引（仅主控维护）\n\n| WS | 名称 | 类型 | 状态 | 分支 | 主要代码目录 | 创建 | 最近更新 |\n|---|---|---|---|---|---|---|---|\n' > "$root/.gameflow/INDEX.md"
    printf '# 项目级经验库（通用经验经 retro/lesson 上浮到 skill）\n\n格式同 skill 的 references/knowledge/lessons.md，编号续接 skill 全局 L-### 或使用 P-###。\n' > "$root/.gameflow/LESSONS.md"
    echo "OK 已初始化 $root/.gameflow（含 .templates 自包含模板）"
    gitignore_check "$root"
    ;;

  new)
    root="$(resolve_root "${2:?用法: gf.sh new <项目根> <slug>}")"
    slug="${3:?用法: gf.sh new <项目根> <slug>}"
    [ -d "$root/.gameflow" ] || { echo "!! 先执行 init"; exit 1; }
    ws="WS-$(date '+%Y%m%d')-${slug}"
    [ -e "$root/.gameflow/$ws" ] && { echo "!! $ws 已存在"; exit 1; }
    ws_scaffold "$root" "$ws"
    echo "OK 创建 $ws"
    echo ">> 请在 .gameflow/INDEX.md 追加一行：| $ws | <名称> | feature | intake | feat/$ws | | $(date '+%Y-%m-%d') | $(date '+%Y-%m-%d') |"
    echo ">> 建议分支: git checkout -b feat/$ws"
    ;;

  find)
    root="$(resolve_root "${2:?用法: gf.sh find <项目根> <ID或关键词>}")"
    kw="${3:?用法: gf.sh find <项目根> <ID或关键词>}"
    echo "== .gameflow/ 痕迹 =="
    grep -rn --color=never "$kw" "$root/.gameflow" || echo "(无)"
    echo "== git 提交 =="
    git -C "$root" log --oneline --all --grep="$kw" 2>/dev/null || echo "(无/非git)"
    ;;

  index)
    root="$(resolve_root "${2:?用法: gf.sh index <项目根>}")"
    echo "== 目录中存在但 INDEX 未登记 =="
    for d in "$root"/.gameflow/WS-*/; do
      ws=$(basename "$d")
      grep -q "$ws" "$root/.gameflow/INDEX.md" || echo "未登记: $ws"
    done
    echo "== INDEX 登记但目录缺失 =="
    for ws in $(grep -oE 'WS-[0-9]{8}-[a-z0-9-]+' "$root/.gameflow/INDEX.md" | sort -u || true); do
      [ -d "$root/.gameflow/$ws" ] || echo "缺目录: $ws"
    done
    ;;

  *) usage; exit 1 ;;
esac
