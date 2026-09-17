#!/usr/bin/env python3
"""从各 SKILL.md 的 frontmatter 生成/刷新 manifest.json。

用途：本仓库收录了外部技能（如 cloudflare/skills）。上游更新后重新复制目录，
       需要重建 manifest.json——本脚本从 SKILL.md **读取** description，
       不手抄，保证与上游始终一致。

用法:
    python3 scripts/gen-manifest.py <仓库根目录> [技能名...]

    python3 scripts/gen-manifest.py .                     # 刷新已登记的技能
    python3 scripts/gen-manifest.py . wrangler cloudflare  # 只刷新指定技能

注意（Windows / Git Bash）：
    python3 是原生 Windows 程序，不认 /c/... 形式路径。请传原生路径：
        python3 scripts/gen-manifest.py "$(cygpath -w "$(pwd)")"
    Linux / NAS 上直接传路径即可。
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

UPSTREAM_VERSION = "1.0.0"
UPSTREAM_AUTHOR = "Cloudflare"
UPSTREAM_REPO = "https://github.com/cloudflare/skills"
UPSTREAM_LICENSE = "Apache-2.0"

DEFAULT_SKILLS = [
    "agents-sdk",
    "cloudflare",
    "cloudflare-email-service",
    "cloudflare-one",
    "cloudflare-one-migrations",
    "durable-objects",
    "nextjs-on-cloudflare",
    "sandbox-migrate-to-next",
    "sandbox-next",
    "sandbox-stable",
    "turnstile-spin",
    "web-perf",
    "workers-best-practices",
    "wrangler",
]


def read_frontmatter(skill_md: Path) -> dict:
    """从 SKILL.md 提取 YAML frontmatter 的顶层标量键值。"""
    text = skill_md.read_text(encoding="utf-8")
    if not text.startswith("---"):
        raise ValueError("首行不是 ---")
    end = text.find("\n---", 3)
    if end == -1:
        raise ValueError("frontmatter 未闭合")
    out = {}
    for line in text[3:end].splitlines():
        m = re.match(r"^([a-zA-Z_-]+):\s*(.*)$", line)
        if m:
            out[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return out


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    repo = Path(sys.argv[1]).resolve()
    names = sys.argv[2:] or DEFAULT_SKILLS
    made = 0
    for name in names:
        d = repo / "skills" / name
        skill_md = d / "SKILL.md"
        if not skill_md.is_file():
            print(f"SKIP {name}: 无 SKILL.md（{skill_md}）")
            continue
        try:
            fm = read_frontmatter(skill_md)
        except ValueError as e:
            print(f"FAIL {name}: {e}")
            continue
        fm_name = fm.get("name", "")
        if fm_name != name:
            print(f"WARN {name}: frontmatter name='{fm_name}' 与目录名不一致")
        desc = fm.get("description", "")
        manifest = {
            "name": name,
            "version": UPSTREAM_VERSION,
            "description": desc,
            "author": UPSTREAM_AUTHOR,
            "type": "skill",
            "source": UPSTREAM_REPO,
            "license": UPSTREAM_LICENSE,
            "whenToUse": desc,
            "invocation": {"modelInvocable": True, "userInvocable": True},
        }
        (d / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        made += 1
        print(f"OK   {name}")
    print(f"\n生成/刷新 {made} 个 manifest.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
