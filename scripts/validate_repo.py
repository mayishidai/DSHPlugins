#!/usr/bin/env python3
"""
DSHPlugins 仓库校验（零依赖，仅用标准库）。

校验仓库结构完整性与「编译好即可安装」契约：
  - 顶层类型目录存在，名称均为 kebab-case
  - 技能型：SKILL.md frontmatter 齐全，name 与目录名一致
  - 面板型：编译产物齐全（dist/ 服务端 + client/ 客户端），main 指向 JS 而非 TS
  - 安装脚本不得原位改写 DSH 源码
  - 凭据粗筛

用法:
    python3 scripts/validate_repo.py            # 校验整个仓库
    python3 scripts/validate_repo.py skills/lucky-api   # 校验单个插件

退出码: 0 = 全部通过（可能有 warn）；1 = 存在 FAIL
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

KEBAB = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
TYPE_DIRS = {"skills": "skill", "agents": "agent", "mcps": "mcp", "panels": "runtime"}

PASS = 0
FAIL = 0
WARN = 0


def ok(msg: str) -> None:
    global PASS
    PASS += 1
    print(f"  [OK]   {msg}")


def bad(msg: str) -> None:
    global FAIL
    FAIL += 1
    print(f"  [FAIL] {msg}")


def warn(msg: str) -> None:
    global WARN
    WARN += 1
    print(f"  [warn] {msg}")


def find_keyword(text: str, key: str) -> str | None:
    """从 frontmatter 文本中取 key 的值（支持引号）。"""
    m = re.search(rf"^{key}:\s*(.+)$", text, re.MULTILINE)
    if not m:
        return None
    return m.group(1).strip().strip("\"'")


def check_skill(plugin: Path, name: str) -> None:
    skill_md = plugin / "SKILL.md"
    if not skill_md.is_file():
        bad(f"{name}: 缺 SKILL.md")
        return
    ok(f"{name}: SKILL.md 存在")

    text = skill_md.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        bad(f"{name}: SKILL.md 首行不是 ---")
        return
    end = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end = i
            break
    if end is None:
        bad(f"{name}: SKILL.md frontmatter 未闭合")
        return
    ok(f"{name}: frontmatter 闭合")

    fm = "\n".join(lines[1:end])
    fm_name = find_keyword(fm, "name")
    if fm_name == name:
        ok(f"{name}: frontmatter name 与目录一致")
    elif fm_name is None:
        bad(f"{name}: frontmatter 缺 name")
    else:
        bad(f"{name}: frontmatter name='{fm_name}' ≠ 目录名")

    if find_keyword(fm, "description"):
        ok(f"{name}: 含 description")
    else:
        bad(f"{name}: 缺 description")


def check_manifest(plugin: Path, name: str, expected_type: str) -> None:
    mf = plugin / "manifest.json"
    if not mf.is_file():
        warn(f"{name}: 缺 manifest.json（可选）")
        return
    try:
        data = json.loads(mf.read_text(encoding="utf-8"))
    except Exception as e:
        bad(f"{name}: manifest.json 无法解析 ({e})")
        return
    ok(f"{name}: manifest.json 可解析")

    if data.get("name") == name:
        ok(f"{name}: manifest name 与目录一致")
    else:
        bad(f"{name}: manifest name='{data.get('name')}' ≠ 目录名")

    if data.get("version"):
        ok(f"{name}: manifest 有 version ({data['version']})")
    else:
        bad(f"{name}: manifest 缺 version")

    mtype = data.get("type")
    if mtype == expected_type:
        ok(f"{name}: manifest type 合法 ({mtype})")
    elif mtype is None:
        warn(f"{name}: manifest 缺 type")
    else:
        bad(f"{name}: manifest type='{mtype}' ≠ 目录类型 '{expected_type}'")


def check_panel(plugin: Path, name: str) -> None:
    """面板型：核心是「编译产物齐备、装了就能用」。"""
    # 服务端编译产物
    dist_js = plugin / "dist" / "index.js"
    if dist_js.is_file():
        ok(f"{name}: dist/index.js 存在（服务端已编译）")
        src = dist_js.read_text(encoding="utf-8", errors="replace")
        # 粗筛残留 TS 语法
        if re.search(r"^\s*(interface|type)\s+\w+\s*[={]", src, re.MULTILINE):
            warn(f"{name}: dist/index.js 疑似含 TS 语法残留")
        if re.search(r":\s*(string|number|boolean|any)\b", src):
            warn(f"{name}: dist/index.js 疑似含 TS 类型标注残留")
    else:
        bad(f"{name}: 缺 dist/index.js（服务端未编译，需 npm run build）")

    # 客户端产物
    client_js = plugin / "client" / "client.js"
    if client_js.is_file():
        ok(f"{name}: client/client.js 存在")
    else:
        bad(f"{name}: 缺 client/client.js")

    # package.json 契约
    pkg_path = plugin / "package.json"
    if pkg_path.is_file():
        try:
            pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
        except Exception as e:
            bad(f"{name}: package.json 无法解析 ({e})")
            pkg = {}
        main = pkg.get("main", "")
        if main.endswith(".ts"):
            bad(f"{name}: package.json main 指向 .ts（应为 dist/index.js）")
        elif main:
            ok(f"{name}: main = {main}")
        else:
            warn(f"{name}: package.json 缺 main")

        files = pkg.get("files", [])
        if "dist" in files:
            ok(f"{name}: files 含 dist")
        else:
            warn(f"{name}: files 未含 dist（打包时会缺编译产物）")
    else:
        bad(f"{name}: 缺 package.json")

    if (plugin / "cordis.patch.yml").is_file():
        ok(f"{name}: cordis.patch.yml 存在")
    else:
        bad(f"{name}: 缺 cordis.patch.yml")


def check_install_scripts(repo: Path) -> None:
    scripts = repo / "scripts"
    if not scripts.is_dir():
        warn("scripts/ 不存在")
        return
    for sh in sorted(scripts.glob("*.sh")):
        if sh.name == "preflight.sh":
            continue
        text = sh.read_text(encoding="utf-8", errors="replace")
        hit = False
        for line in text.splitlines():
            s = line.strip()
            if s.startswith("#"):
                continue
            if re.search(r"sed\s+(-\w+\s+)*-i", s):
                hit = True
                break
        if hit:
            bad(f"{sh.name}: 含原位改写（sed -i）")
        else:
            ok(f"{sh.name}: 未见原位改写")


PLACEHOLDER = re.compile(
    r"your[-_]|_here$|-here$|xxx|<[a-z_-]+>|\$\{?[A-Z_]+\}?|example|placeholder|"
    r"changeme|redacted|dummy|fake|test-|sample",
    re.IGNORECASE,
)


def check_credentials(repo: Path) -> None:
    """粗筛明文凭据。

    注意：文档类仓库（如 skills/*/references/）里必然出现**占位示例**，
    例如 `export CLOUDFLARE_API_TOKEN="your_token_here"`、反面教材
    `const secret = 'your-turn-key-secret'`、以及 `$VAR` 变量引用。
    这些不是凭据，必须排除，否则校验永远失败、失去信号价值。

    判定为「占位/示例」的情形（任一命中即跳过）：
      - 值里含 your- / your_ / _here / xxx / <placeholder> / ${VAR}
      - 值里含 example / placeholder / changeme / redacted / dummy / fake / test- / sample
      - 值本身是 shell 变量引用或含 shell 语法（$ / 空格 / 引号）

    另外：值必须看起来**像**一个密钥字面量——单一 token，无空格、无 shell 元字符。
    否则会误伤文档里的 shell 代码片段，例如：
      read -rsp 'Cloudflare API token: ' token; echo; export CLOUDFLARE_API_TOKEN="
    这一行会因引号跨越而错配出 `= ' token; echo; export ...`，纯属假阳性。
    """
    pat = re.compile(
        r"(token|secret|password|api_?key)\s*[:=]\s*[\"']([^\"'\s]{16,})[\"']",
        re.IGNORECASE,
    )
    hits = []
    for sub in ("skills", "panels", "mcps", "scripts"):
        d = repo / sub
        if not d.is_dir():
            continue
        for f in d.rglob("*"):
            if not f.is_file():
                continue
            if "node_modules" in f.parts or f.suffix not in {
                ".json", ".md", ".py", ".ts", ".tsx", ".sh", ".mjs", ".yml", ".yaml"
            }:
                continue
            try:
                text = f.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue
            for m in pat.finditer(text):
                value = m.group(2)
                if value.startswith("$"):
                    continue
                if PLACEHOLDER.search(value):
                    continue
                hits.append(f"{f.relative_to(repo)} (值以 '{value[:6]}...' 开头)")
                break
    if hits:
        bad(f"疑似明文凭据: {', '.join(hits[:5])}")
    else:
        ok("未发现明文凭据（占位示例已排除）")


def check_plugin(plugin: Path, expected_type: str) -> None:
    name = plugin.name
    print(f"\n--- {plugin} (type={expected_type}) ---")
    if not plugin.is_dir():
        bad(f"{name}: 目录不存在")
        return
    if not KEBAB.match(name):
        bad(f"{name}: 目录名不是 kebab-case")
        return
    ok(f"{name}: 目录名 kebab-case")

    check_manifest(plugin, name, expected_type)

    if expected_type == "skill":
        check_skill(plugin, name)
    elif expected_type == "runtime":
        check_panel(plugin, name)
        if (plugin / "SKILL.md").is_file():
            ok(f"{name}: SKILL.md 存在")
        else:
            warn(f"{name}: 建议补 SKILL.md 说明用法（面板型非必需）")
    else:
        if not (plugin / "README.md").is_file():
            warn(f"{name}: 建议补 README.md")


def main() -> int:
    repo = Path(__file__).resolve().parent.parent

    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    if args:
        target = (repo / args[0]).resolve()
        tdir = target.parent.name
        etype = TYPE_DIRS.get(tdir, "skill")
        print(f"=== 校验单个插件: {target} ===")
        check_plugin(target, etype)
    else:
        print(f"=== 校验 DSHPlugins 仓库: {repo} ===")
        print("\n1. 顶层结构")
        for d, t in TYPE_DIRS.items():
            p = repo / d
            if p.is_dir():
                ok(f"{d}/ 存在 (type={t})")
            else:
                bad(f"{d}/ 缺失")
        for f in ("README.md", "Makefile"):
            if (repo / f).is_file():
                ok(f"{f} 存在")
            else:
                warn(f"{f} 缺失")

        for d, t in TYPE_DIRS.items():
            dirp = repo / d
            if not dirp.is_dir():
                continue
            for plugin in sorted(p for p in dirp.iterdir() if p.is_dir()):
                check_plugin(plugin, t)

        print("\n2. 安装脚本安全性")
        check_install_scripts(repo)

        print("\n3. 凭据粗筛")
        check_credentials(repo)

    print("\n=== 结果 ===")
    print(f"  通过: {PASS}    失败: {FAIL}    警告: {WARN}")
    if FAIL:
        print("\n存在失败项。")
        return 1
    print("\n全部通过。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
