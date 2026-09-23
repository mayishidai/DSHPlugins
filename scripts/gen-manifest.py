#!/usr/bin/env python3
"""从各 SKILL.md 的 frontmatter 生成/刷新 manifest.json。

用途：本仓库收录了多个外部来源的技能。上游更新后重新复制目录，
       需要重建 manifest.json——本脚本从 SKILL.md **读取** description，
       不手抄，保证与上游始终一致。

本仓库有**两个**上游来源，各自的 author / source / license 不同，
所以溯源信息按「上游」分组登记在 PROVENANCE 里，再用 SKILL_PROVENANCE
把技能名映射到上游。新增第三方技能时必须两处都登记，否则会套用错许可证。

用法:
    python3 scripts/gen-manifest.py <仓库根目录> [技能名...] [--provenance <上游>]

    python3 scripts/gen-manifest.py .                          # 刷新默认上游（Cloudflare 14 个）
    python3 scripts/gen-manifest.py . wrangler cloudflare       # 只刷新指定技能
    python3 scripts/gen-manifest.py . --provenance cloudflare-tunnel-skill
                                                              # 刷新该上游下的全部已登记技能
    python3 scripts/gen-manifest.py . --list                   # 看已登记的上游与技能
    python3 scripts/gen-manifest.py . my-skill --provenance cloudflare-tunnel-skill
                                                              # 新技能：显式指定上游

注意（Windows / Git Bash）：
    python3 是原生 Windows 程序，不认 /c/... 形式路径。请传原生路径：
        python3 scripts/gen-manifest.py "$(cygpath -w "$(pwd)")"
    Linux / NAS 上直接传路径即可。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# --- 上游来源登记表 ---------------------------------------------------------
# key = 上游标识（kebab-case），值 = 该来源的溯源信息。
PROVENANCE: dict[str, dict[str, str]] = {
    "cloudflare-skills": {
        "author": "Cloudflare",
        "source": "https://github.com/cloudflare/skills",
        "license": "Apache-2.0",
        "version": "1.0.0",
    },
    "cloudflare-tunnel-skill": {
        "author": "xiaoyuboi",
        "source": "https://github.com/xiaoyuboi/cloudflare-tunnel-skill",
        "license": "MIT",
        "version": "1.0.0",
    },
    "jdgold": {
        "author": "京东金融 (JD Finance)",
        "source": "https://caifu-h5.s3.cn-north-1.jdcloud-oss.com/gold-skill/jdgold-1.0.0.zip",
        "license": "未附许可证（官方分发包）",
        "version": "1.0.0",
    },
}

# 未显式登记的技能默认归到哪个上游。
DEFAULT_PROVENANCE = "cloudflare-skills"

# 技能名 → 上游 key。收录第三方技能时必须在这里补一行。
SKILL_PROVENANCE: dict[str, str] = {
    "cloudflare-tunnel": "cloudflare-tunnel-skill",
    "jdgold": "jdgold",
}

# 本仓库自研技能：manifest.json 是手写的（含自定义 keywords/scripts 字段），
# 不来自任何上游，**绝不能被本脚本覆盖**。仅用于 --list 正确归类 + 写入护栏。
LOCAL_SKILLS = {"hello-plugin", "lucky-api", "game-dev-workflow", "app-dev-workflow"}

# 不带技能名时的刷新范围：Cloudflare 官方 14 个（保持历史行为不变）。
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


def provenance_key_for(name: str) -> str:
    return SKILL_PROVENANCE.get(name, DEFAULT_PROVENANCE)


def skills_of(prov_key: str) -> list[str]:
    """该上游下已登记的技能名（按名字排序，结果稳定）。"""
    return sorted(n for n in SKILL_PROVENANCE if SKILL_PROVENANCE[n] == prov_key)


def write_manifest(name: str, d: Path, prov_key: str) -> None:
    skill_md = d / "SKILL.md"
    if not skill_md.is_file():
        print(f"SKIP {name}: 无 SKILL.md（{skill_md}）")
        return
    try:
        fm = read_frontmatter(skill_md)
    except ValueError as e:
        print(f"FAIL {name}: {e}")
        return
    fm_name = fm.get("name", "")
    if fm_name != name:
        print(f"WARN {name}: frontmatter name='{fm_name}' 与目录名不一致")
    desc = fm.get("description", "")
    # whenToUse 优先取 frontmatter 里**显式**的 whenToUse；没有才退回 description。
    # 有些上游技能只有 name+description（如官方分发包），两者含义不同：
    # description 是"是什么"，whenToUse 是"何时该用"，后者更具体，不该被覆盖掉。
    when = fm.get("whenToUse") or desc
    prov = PROVENANCE[prov_key]
    manifest = {
        "name": name,
        "version": prov["version"],
        "description": desc,
        "author": prov["author"],
        "type": "skill",
        "source": prov["source"],
        "license": prov["license"],
        "whenToUse": when,
        "invocation": {"modelInvocable": True, "userInvocable": True},
    }
    (d / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"OK   {name}  [{prov_key} / {prov['license']}]")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="从 SKILL.md frontmatter 生成/刷新 manifest.json",
    )
    parser.add_argument("repo", help="仓库根目录（Windows 下用 cygpath -w 转过的原生路径）")
    parser.add_argument("names", nargs="*", help="技能名；省略则刷新该上游下的全部已登记技能")
    parser.add_argument("--provenance", help=f"上游标识，可选：{', '.join(PROVENANCE)}")
    parser.add_argument("--list", action="store_true", help="列出已登记的上游与技能后退出")
    args = parser.parse_args()

    if args.list:
        repo = Path(args.repo).resolve()
        sdir = repo / "skills"
        # 按磁盘实际存在的技能目录计算归属，比只看登记表准
        # （未显式登记的第三方技能走 DEFAULT_PROVENANCE 兜底）。
        on_disk = sorted(p.name for p in sdir.iterdir() if p.is_dir()) if sdir.is_dir() else []
        if not on_disk:
            print(f"（{sdir} 下没有技能目录）")
        local = [n for n in on_disk if n in LOCAL_SKILLS]
        third_party = [n for n in on_disk if n not in LOCAL_SKILLS]
        for key, prov in PROVENANCE.items():
            members = [n for n in third_party if provenance_key_for(n) == key]
            print(f"{key}  ({prov['license']}, {prov['author']})")
            print(f"  source: {prov['source']}")
            print(f"  技能({len(members)}): {', '.join(members) if members else '（无）'}")
            explicit = [n for n in members if n in SKILL_PROVENANCE]
            implicit = [n for n in members if n not in SKILL_PROVENANCE]
            if implicit:
                print(f"    ├ 显式登记: {', '.join(explicit) if explicit else '（无）'}")
                print(f"    └ 默认兜底: {', '.join(implicit)}")
        print(f"本仓库自研（手写 manifest，脚本不覆盖）({len(local)}): {', '.join(local) if local else '（无）'}")
        return 0

    repo = Path(args.repo).resolve()

    # 护栏：自研技能的 manifest 是手写的（含 keywords/scripts 等本脚本不产出的字段），
    # 一旦被覆盖就会静默丢失。显式点名也照样拒绝。
    blocked = sorted(set(args.names) & LOCAL_SKILLS)
    if blocked:
        print(f"FAIL 拒绝覆盖自研技能的手写 manifest: {', '.join(blocked)}")
        print("     这些技能的 manifest.json 由人工维护，不在本脚本职责内。")
        return 2

    if args.provenance and args.provenance not in PROVENANCE:
        print(f"FAIL 未登记的上游 '{args.provenance}'，可选：{', '.join(PROVENANCE)}")
        return 2

    if args.provenance:
        names = args.names or skills_of(args.provenance)
        if not names:
            print(f"FAIL 上游 '{args.provenance}' 下没有已登记技能；请显式给出技能名")
            return 2
        keys = {n: args.provenance for n in names}
    else:
        names = args.names or DEFAULT_SKILLS
        keys = {n: provenance_key_for(n) for n in names}

    made = 0
    for name in names:
        write_manifest(name, repo / "skills" / name, keys[name])
        made += 1
    print(f"\n生成/刷新 {made} 个 manifest.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
