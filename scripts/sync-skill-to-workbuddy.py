#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把仓库里的技能同步到 WorkBuddy 用户级技能目录。

为什么需要它：同一个技能要在两个地方可用——

  · DSH（NAS）      读 $DSH_HOME/skills/    <- 仓库 skills/<name>/ 安装过去
  · WorkBuddy（本机）读 ~/.workbuddy/skills/ <- 本脚本生成

两处各维护一份内容必然漂移，所以约定
**本仓库的 skills/<name>/ 是唯一实现来源**，用户级那份由本脚本生成：

  - scripts/ + references/  : 原样递归复制（排除 __pycache__ / *.pyc）
  - SKILL.md                : 取仓库版**正文**，套上 WorkBuddy 需要的 frontmatter
                              （仓库版 frontmatter 是 DSH 用的 whenToUse/invocation）
  - `## 本仓库接入说明` 一节 : 属于仓库自述，不复制给用户级

用法:
  python3 scripts/sync-skill-to-workbuddy.py lucky-api
  python3 scripts/sync-skill-to-workbuddy.py --all
  python3 scripts/sync-skill-to-workbuddy.py lucky-api --dry-run
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
REPO_SKILLS = REPO_ROOT / "skills"
USER_SKILLS = Path.home() / ".workbuddy" / "skills"

# 仓库版 SKILL.md 里的这一段是仓库自述，不进用户级副本
STOP_HEADING = "## 本仓库接入说明"

# 用户级 frontmatter 里这几项由本脚本生成，不取仓库版（仓库版装的是 DSH 元数据）
WB_FIXED = {"agent_created": "true", "author": "workbuddy"}
SKIP_DIRS = {"__pycache__", "node_modules", ".git"}
SKIP_SUFFIX = {".pyc", ".pyo"}


def split_repo_skill(text):
    """把仓库版 SKILL.md 拆成 (frontmatter 原文, 正文, 仓库自述段)。"""
    if not text.startswith("---"):
        raise ValueError("SKILL.md 缺少 frontmatter")
    parts = text.split("---", 2)
    if len(parts) < 3:
        raise ValueError("SKILL.md frontmatter 未闭合")
    front, body = parts[1], parts[2]
    if STOP_HEADING in body:
        head, _, tail = body.partition(STOP_HEADING)
        return front, head.rstrip() + "\n", STOP_HEADING + tail
    return front, body.rstrip() + "\n", ""


def build_frontmatter(manifest):
    """用 manifest.json 的字段生成 WorkBuddy 版 frontmatter。"""
    lines = ["---"]
    lines.append(f"name: {manifest['name']}")
    # description 可能含冒号，用 JSON 字符串写法（合法 YAML）
    lines.append("description: " + json.dumps(manifest.get("description", ""),
                                              ensure_ascii=False))
    lines.append(f"agent_created: {WB_FIXED['agent_created']}")
    lines.append(f"version: {manifest.get('version', '0.0.0')}")
    lines.append(f"author: {WB_FIXED['author']}")
    kw = manifest.get("keywords") or []
    if kw:
        lines.append("tags: [" + ", ".join(kw) + "]")
    lines.append('metadata: {"openclaw": {"requires": {}, "install": []}}')
    lines.append("---")
    return "\n".join(lines) + "\n"


def copy_tree(src, dst, dry_run, report):
    """递归复制，跳过缓存目录，内容一致则跳过写入。"""
    if not src.is_dir():
        return
    for item in sorted(src.rglob("*")):
        rel = item.relative_to(src)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        if item.is_dir():
            continue
        if item.suffix in SKIP_SUFFIX:
            continue
        target = dst / rel
        data = item.read_bytes()
        existed = target.exists()
        if existed and target.read_bytes() == data:
            report["unchanged"].append(str(target))
            continue
        report["updated" if existed else "created"].append(str(target))
        if dry_run:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        shutil.copystat(item, target, follow_symlinks=False)


def sync_one(name, dry_run=False):
    src_dir = REPO_SKILLS / name
    if not src_dir.is_dir():
        print(f"[error] 仓库里没有 skills/{name}/", file=sys.stderr)
        return False
    manifest_path = src_dir / "manifest.json"
    if not manifest_path.exists():
        print(f"[error] 缺少 {manifest_path}", file=sys.stderr)
        return False
    skill_md = src_dir / "SKILL.md"
    if not skill_md.exists():
        print(f"[error] 缺少 {skill_md}", file=sys.stderr)
        return False

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    front, body, _repo_part = split_repo_skill(skill_md.read_text(encoding="utf-8"))
    new_text = build_frontmatter(manifest) + "\n" + body.lstrip("\n")

    dst_dir = USER_SKILLS / name
    report = {"created": [], "updated": [], "unchanged": []}

    target_md = dst_dir / "SKILL.md"
    old_text = target_md.read_text(encoding="utf-8") if target_md.exists() else None
    if old_text == new_text:
        report["unchanged"].append(str(target_md))
    else:
        key = "updated" if old_text is not None else "created"
        report[key].append(str(target_md))
        if not dry_run:
            dst_dir.mkdir(parents=True, exist_ok=True)
            # 显式 LF：Windows 下 write_text 默认会写成 CRLF，导致每次运行
            # 都被判定为「有变动」。仓库索引统一存 LF，这里保持一致。
            with target_md.open("w", encoding="utf-8", newline="\n") as fh:
                fh.write(new_text)

    copy_tree(src_dir / "scripts", dst_dir / "scripts", dry_run, report)
    copy_tree(src_dir / "references", dst_dir / "references", dry_run, report)

    tag = " [dry-run]" if dry_run else ""
    print(f"== {name} -> {dst_dir}{tag}")
    for key, label in (("created", "新增"), ("updated", "更新"), ("unchanged", "未变")):
        if report[key]:
            print(f"   {label} {len(report[key])} 个")
            for p in report[key]:
                print(f"     - {p}")
    if not any(report.values()):
        print("   （无文件）")
    return True


def main():
    ap = argparse.ArgumentParser(description="同步仓库技能到 ~/.workbuddy/skills/")
    ap.add_argument("names", nargs="*", help="技能名（目录名）")
    ap.add_argument("--all", action="store_true", help="同步 skills/ 下全部技能")
    ap.add_argument("--dry-run", action="store_true", help="只报告，不写文件")
    args = ap.parse_args()

    if args.all:
        names = sorted(p.name for p in REPO_SKILLS.iterdir()
                       if p.is_dir() and (p / "SKILL.md").exists())
    else:
        names = args.names
    if not names:
        ap.print_help()
        return 1

    print(f"仓库 : {REPO_SKILLS}")
    print(f"用户级: {USER_SKILLS}\n")
    ok = all(sync_one(n, args.dry_run) for n in names)
    print("\n" + ("[OK] 同步完成" if ok else "[FAIL] 存在错误"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
