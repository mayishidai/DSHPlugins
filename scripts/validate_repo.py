#!/usr/bin/env python3
"""
DSHPlugins 仓库校验（零依赖，仅用标准库）。

校验仓库结构完整性与「编译好即可安装」契约：
  - 顶层类型目录存在，名称均为 kebab-case
  - 技能型：SKILL.md frontmatter 齐全，name 与目录名一致
  - 面板型：编译产物齐全（dist/ 服务端 + client/ 客户端），main 指向 JS 而非 TS
  - 安装脚本不得原位改写 DSH 源码
  - 脚本可执行位（git 索引里 .py/.sh 必须为 100755）
  - 凭据粗筛

用法:
    python3 scripts/validate_repo.py            # 校验整个仓库
    python3 scripts/validate_repo.py skills/lucky-api   # 校验单个插件

退出码: 0 = 全部通过（可能有 warn）；1 = 存在 FAIL
"""
from __future__ import annotations

import json
import re
import subprocess
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

    # ---- 名字一致性（加载成败的根因，见下方 check_panel_names） ----
    check_panel_names(plugin, name)

    # ---- manifest 的 entry 必须指向真实产物 ----
    mf_path = plugin / "manifest.json"
    if mf_path.is_file():
        try:
            mf = json.loads(mf_path.read_text(encoding="utf-8"))
        except Exception:
            mf = {}
        entry = mf.get("entry") or {}
        srv = entry.get("server")
        if isinstance(srv, str) and srv:
            if srv.endswith(".ts"):
                bad(f"{name}: manifest entry.server 指向 .ts（{srv}）—— "
                    f"安装时 src/ 不会被复制，运行期必然找不到；应为 dist/index.js")
            elif not (plugin / srv).is_file():
                bad(f"{name}: manifest entry.server 指向不存在的文件（{srv}）")
            else:
                ok(f"{name}: manifest entry.server = {srv}")


def check_panel_names(plugin: Path, name: str) -> None:
    """校验面板的**包名四处一致**（这是加载成败问题，不是风格问题）。

    必须完全一致的四处：
      ① package.json 的 name
      ② cordis.patch.yml 里 loader entry 的 name
      ③ 物理安装目录 node_modules/<name>
      ④ profile dependencies 的 key（= name）

    历史事故（2026-09-18）：③ 曾错放在 `node_modules/@deepseek-ai/`，
    而 ①②④ 都是不带作用域的 `dsh-plugin-repo-manager`。Node 按 `①②` 里的名字
    去 node_modules 找包，找不到 → DSH 加载期报：
      invalid plugin, expect function or object with an "apply" method, received undefined
    此前的「能用」只是 `npm install` 依 ④ 的 key 又补建了一个正确路径的链接，
    node_modules 一被清理就暴露。**声明了依赖却要靠 npm 兜底才生效，本身就是缺陷。**
    """
    pkg_path = plugin / "package.json"
    patch_path = plugin / "cordis.patch.yml"
    if not (pkg_path.is_file() and patch_path.is_file()):
        return

    try:
        pkg_name = json.loads(pkg_path.read_text(encoding="utf-8")).get("name", "")
    except Exception:
        return

    text = patch_path.read_text(encoding="utf-8", errors="replace")
    # 抓 loader entry 的 name（形如 `name: 'xxx'` / `name: "xxx"` / `name: xxx`）
    m = re.search(r"^\s*name:\s*['\"]?([^'\"\s]+)['\"]?\s*$", text, re.MULTILINE)
    if not m:
        warn(f"{name}: cordis.patch.yml 里未找到 loader entry 的 name")
        return
    patch_name = m.group(1)

    if patch_name == pkg_name:
        ok(f"{name}: patch name 与 package.json name 一致（{pkg_name}）")
    else:
        bad(f"{name}: patch name='{patch_name}' ≠ package.json name='{pkg_name}'"
            f" —— 加载器按前者找包，目录必须与之对应")

    # 客户端 bundle 的注册 id 也应与包名一致
    client_js = plugin / "client" / "client.js"
    if client_js.is_file():
        ctext = client_js.read_text(encoding="utf-8", errors="replace")
        m_id = re.search(r'id:\s*["\']([^"\']+)["\']', ctext)
        if m_id and m_id.group(1) != pkg_name:
            warn(f"{name}: client 注册 id='{m_id.group(1)}' ≠ 包名 '{pkg_name}'")


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

# 已知的**公开**客户端标识（非用户私密凭据），精确值豁免。
#
# 收录判据 —— 三者必须同时成立，缺一不可：
#   1. 是**官方随包分发**的字面量，所有用户拿到的都是同一个值（不是每人一份的密钥）；
#   2. 代码里有**环境变量覆盖**机制（说明它本就是可公开的默认值）；
#   3. 在 `docs/upstream/<来源>/SOURCE.md` 里**记录过**它的性质与出处。
#
# 只精确匹配完整值，不做前缀/正则放宽 —— 避免把豁免面扩大成"名字像默认值就放过"。
KNOWN_PUBLIC_KEYS = {
    # jdgold 财富查询网关的默认 API Key：字面量含 def123456，官方客户端标识。
    # 覆盖入口：CLAWX_JR_API_KEY 环境变量（见 skills/jdgold/scripts/jdjr_config.py）。
    # 出处与审计结论见 docs/upstream/jdgold/SOURCE.md。
    "clawx_def123456uUbOxn2UGmmcUCCgln6zscT",
}


def check_install_targets(repo: Path) -> None:
    """安装脚本的**落点目录名**必须等于包名（加载成败的第三个环节）。

    判据：`scripts/install-to-profile.sh` 里
      PROFILE_NODE_MODULES + PKG_NAME 拼出的目录，其最后一段必须 == PKG_NAME。
    换句话说，包只能落在 `node_modules/<包名>`，不能落在别处
    （例如 `node_modules/@deepseek-ai/<包名>` 而包名却不带作用域）。

    这条检查是对 2026-09-18 事故的直接防线 —— 当时正是落点与包名不符，
    导致 Node 解析不到包、DSH 报 "invalid plugin ... received undefined"。
    """
    sh = repo / "scripts" / "install-to-profile.sh"
    if not sh.is_file():
        warn("install-to-profile.sh 不存在（跳过落点一致性检查）")
        return

    text = sh.read_text(encoding="utf-8", errors="replace")

    def grab(var: str) -> str | None:
        m = re.search(rf"^{var}=(.+)$", text, re.MULTILINE)
        return m.group(1).strip().strip('"').strip("'") if m else None

    pkg_name = grab("PKG_NAME")
    node_modules = grab("PROFILE_NODE_MODULES")
    target = grab("TARGET_DIR")
    if not (pkg_name and node_modules and target):
        warn("无法从 install-to-profile.sh 解析 PKG_NAME/TARGET_DIR（跳过）")
        return

    # 实际拼装的路径（变量可能写成 $PROFILE_NODE_MODULES/$PKG_NAME）
    expanded = target.replace("$PROFILE_NODE_MODULES", node_modules)
    expanded = expanded.replace("${PROFILE_NODE_MODULES}", node_modules)
    expanded = expanded.replace("$PKG_NAME", pkg_name).replace("${PKG_NAME}", pkg_name)
    parts = [p for p in expanded.rstrip("/").split("/") if p]

    # ⚠️ 判据不能只看「末段 == 包名」—— 错误的 @deepseek-ai/ 落点末段同样是包名，
    #    那样检查会误报通过（实测过）。正确判据是**父目录必须正好是 node_modules**，
    #    即路径形如 .../node_modules/<包名>。
    if len(parts) >= 2 and parts[-1] == pkg_name and parts[-2] == "node_modules":
        ok(f"install-to-profile.sh: 落点为 node_modules/{pkg_name}")
    elif parts and parts[-1] != pkg_name:
        bad(f"install-to-profile.sh: 落点末段 '{parts[-1]}' ≠ 包名 '{pkg_name}'"
            f" —— Node 按包名解析，装到别处会加载失败")
    else:
        parent = parts[-2] if len(parts) >= 2 else "(无)"
        bad(f"install-to-profile.sh: 落点父目录为 '{parent}'，应为 'node_modules'"
            f" —— 包必须落在 node_modules/<包名>，否则解析不到")

    # 依赖声明的 key 必须与包名一致（否则 npm 又会在别处建链接，掩盖问题）
    if re.search(r"deps\[pkg_name\]\s*=", text):
        dep_expr = re.search(r"deps\[pkg_name\]\s*=\s*(.+)$", text, re.MULTILINE)
        expr = dep_expr.group(1) if dep_expr else ""
        # 期望形如 "file:./node_modules/" + pkg_name  —— 不得出现作用域段
        if re.search(r"@[A-Za-z0-9_.-]+/", expr):
            bad(f"install-to-profile.sh: dependencies 值仍含作用域路径 → {expr.strip()}")
        else:
            ok("install-to-profile.sh: dependencies 走 node_modules/<包名>")


# 需要可执行位的**源码脚本**后缀。
# 刻意不含 `.js` —— 那是构建产物（`dist/index.js`、`client/client.js`），
# 由打包器生成、从不直接执行，保持 644 才对。
# `.mjs` 要算进来：`scripts/tests/*.mjs` 是可直接运行的测试脚本。
EXEC_SUFFIXES = (".py", ".sh", ".mjs")


def check_exec_bits(repo: Path) -> None:
    """校验 git 索引里所有源码脚本（.py/.sh/.mjs）都是 100755（可执行）。

    为什么必须查：本仓库 `core.filemode=false`（Windows 开发机），
    **文件系统上的可执行位不可靠**，只有 git 索引里的 mode 才是权威。
    新增脚本若忘了 `git add --chmod=+x`，会静默以 644 入库 ——
    在 NAS/Linux 上直接 `./script.py` 就会 Permission denied。

    实测踩坑（2026-09-18）：一次性新增 25 个脚本（jdgold + cloudflare-tunnel
    + 两个仓库脚本）全部是 644，**两套校验器都没报**。故补此检查。
    同日又发现 `generate-client.mjs` 长期是 644，而 `panels/scripts/*.mjs`
    是 755 —— 同为 `.mjs` 规则不统一，故把 `.mjs` 一并纳入。

    只查索引，不查工作区 —— 工作区的 chmod 在 Windows 上不生效。
    **副作用**：尚未 `git add` 的新文件不在索引里，因此不会被本检查覆盖。
    收录新脚本时先 `git add`（或 `git add --chmod=+x`）再跑校验。
    """
    try:
        out = subprocess.run(
            ["git", "ls-files", "-s"],
            cwd=repo, capture_output=True, text=True, check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        warn(f"无法读取 git 索引（跳过可执行位检查）: {type(e).__name__}")
        return

    bad_files = []
    checked = 0
    for line in out.splitlines():
        parts = line.split("\t", 1)
        if len(parts) != 2:
            continue
        meta, path = parts
        fields = meta.split()
        if len(fields) < 2:
            continue
        mode = fields[0]
        if not path.endswith(EXEC_SUFFIXES):
            continue
        checked += 1
        if mode != "100755":
            bad_files.append((mode, path))

    if bad_files:
        bad(f"{len(bad_files)} 个脚本缺少可执行位（应为 100755）")
        for mode, path in bad_files[:8]:
            print(f"         {mode}  {path}")
        if len(bad_files) > 8:
            print(f"         … 另有 {len(bad_files) - 8} 个")
        print("         修法: git add --chmod=+x <文件>")
    else:
        ok(f"{checked} 个脚本可执行位正确（100755）")


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
      - 值精确等于 KNOWN_PUBLIC_KEYS 里的**官方公开标识**（见该常量的收录判据）

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
    whitelisted = []
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
                if value in KNOWN_PUBLIC_KEYS:
                    whitelisted.append(str(f.relative_to(repo)))
                    continue
                hits.append(f"{f.relative_to(repo)} (值以 '{value[:6]}...' 开头)")
                break
    if hits:
        bad(f"疑似明文凭据: {', '.join(hits[:5])}")
    else:
        ok("未发现明文凭据（占位示例已排除）")
    if whitelisted:
        ok(f"命中已知公开标识豁免（{len(whitelisted)} 处）: {', '.join(sorted(set(whitelisted)))}")


def check_mcp(plugin: Path, name: str) -> None:
    """MCP 型专属校验。

    重点检查两件事：
      1. 配置文件（`mcp.json` / `*.template.json`）是合法 JSON 且含 `mcpServers` 键
         ——  键名写成 `servers` 不会报错，只会静默不生效，所以必须校验。
      2. **仓库内不得硬编码易变的隧道地址**。以 hindsight 为例，其隧道端口会变
         （有 `hindsight-mcp-repair` 技能专门自愈），硬编码会立刻过期。
         允许占位符（`<PORT>` / `<TUNNEL_HOST>` 等），禁止真实端口。
    """
    if not (plugin / "README.md").is_file():
        warn(f"{name}: 建议补 README.md（说明能力、依赖、落地路径）")
    else:
        ok(f"{name}: README.md 存在")

    # 只看 MCP 配置片段：mcp.json / *.template.json。
    # 明确排除 manifest.json —— 那是本仓库的元数据，不该含 mcpServers。
    configs = sorted(
        f
        for f in plugin.glob("*.json")
        if f.name != "manifest.json"
    )
    if not configs:
        warn(f"{name}: 未见 mcp.json / *.template.json 配置片段")
        return

    # 易变地址特征：stun 子域后跟具体端口。占位符除外。
    volatile = re.compile(r"stun\.[a-z0-9.-]+:\d{2,5}", re.IGNORECASE)
    placeholder = re.compile(r"<[A-Za-z_]+>")

    for cfg in configs:
        try:
            data = json.loads(cfg.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            bad(f"{name}: {cfg.name} 不是合法 JSON ({e})")
            continue
        ok(f"{name}: {cfg.name} 是合法 JSON")

        if not isinstance(data, dict) or "mcpServers" not in data:
            bad(f"{name}: {cfg.name} 缺 mcpServers 键（写成 servers 会静默失效）")
            continue
        ok(f"{name}: {cfg.name} 含 mcpServers 键")

        servers = data["mcpServers"]
        if not isinstance(servers, dict) or not servers:
            bad(f"{name}: {cfg.name} 的 mcpServers 为空")
            continue

        text = cfg.read_text(encoding="utf-8")
        if volatile.search(text):
            # 只有在没有占位符时才判定为硬编码
            if not placeholder.search(text):
                bad(
                    f"{name}: {cfg.name} 疑似硬编码易变隧道地址"
                    f"（含 stun 域名+端口，且无占位符）"
                )
            else:
                warn(f"{name}: {cfg.name} 含 stun 地址，请确认是占位符而非真实端口")
        else:
            ok(f"{name}: {cfg.name} 未硬编码易变隧道地址")


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
    elif expected_type == "mcp":
        check_mcp(plugin, name)
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

        print("\n2.5 面板安装落点与包名一致性")
        check_install_targets(repo)

        print("\n3. 脚本可执行位")
        check_exec_bits(repo)

        print("\n4. 凭据粗筛")
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
