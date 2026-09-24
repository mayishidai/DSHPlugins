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


def _strip_js_comments(src: str) -> str:
    """剔除 JS/TS 注释，便于「只看真实代码」地做特征检查。

    必须剔除的原因：本项目习惯在注释里引用**旧的错误写法**作为反面教材
    （例如 `require('path')`、`url.pathname === '/list'`），
    不剔除就会把自己的说明文字当成违规命中（已实际踩过这个坑）。
    """
    src = re.sub(r"/\*[\s\S]*?\*/", "", src)
    src = re.sub(r"^\s*//.*$", "", src, flags=re.MULTILINE)
    return src


def _strip_sh_comments(src: str) -> str:
    """剔除 shell 脚本里的**整行注释**，便于「只看真实代码」地做特征检查。

    与 `_strip_js_comments` 同一个理由：本仓库习惯在注释里引用**旧的错误写法**
    当反面教材 —— 例如 `scripts/install-to-profile.sh` 与
    `scripts/lib/resolve-profile.sh` 都写着一行
        #   PROFILE_DIR="${PROFILE_DIR:-/vol2/@appdata/.../profiles/web}"
    来说明「曾经错在哪里」。不剔除，检查会把自己的说明文字判成违规。

    ⚠️ 注释行**置空而不是删除**（保持行号不变）。删行会让 `splitlines()` 的下标
    与真实文件错位，于是检查报出的行号是**剔注释后的行号** —— 拿着它去文件里
    找，找到的是别的行。报错给不出可用位置，等于让人自己再数一遍。
    """
    return "\n".join(
        "" if line.lstrip().startswith("#") else line
        for line in src.splitlines()
    )


def _strip_py_comments(src: str) -> str:
    """剔除 Python 的注释与三引号块，便于「只看真实代码」地做特征检查。

    与 `_strip_sh_comments` 同一理由，且这里**光剔注释还不够**：本仓库的反面教材
    常常写在 **docstring** 里。例如
    `mcps/hindsight/scripts/hindsight_paths.py` 的模块 docstring 就写着
        DEFAULT_CONFIG = Path.home() / ".workbuddy" / "mcp.json"
    来说明「2026-09-23 之前错在哪里」—— 只剔 `#` 注释会把它自己判成违规。

    ⚠️ 三引号块用**等量换行**替换，同样是为了保住行号。
    ⚠️ 这里不处理字符串里恰好出现三引号、以及 raw/前缀字符串等边角情况：判据
    只需**足够好**。宁可漏报也不误报 —— 误报会逼人放宽规则，那等于取消守卫。
    """
    src = re.sub(r'"""[\s\S]*?"""', lambda m: "\n" * m.group(0).count("\n"), src)
    src = re.sub(r"'''[\s\S]*?'''", lambda m: "\n" * m.group(0).count("\n"), src)
    return _strip_sh_comments(src)


def check_panel_esm_safety(repo: Path) -> None:
    """面板插件：ESM 包里**不得**出现 `require(` 调用。

    这是 2026-09-20 线上事故的直接防线。本仓库所有面板插件都声明
    `"type": "module"`，而 **ESM 没有 `require`**。当时
    `dist/index.js` 的 `uninstallPlugin()` 里写了
    `require('path').relative(...)`，于是：

      - 抛 `ReferenceError: require is not defined`；
      - 异常被 handler 的 catch 兜住，只回 `HTTP 200 + INTERNAL_ERROR`；
      - 前端「卸载」按钮**点了没反应**（列表不刷新、也没可见报错）。

    ## 为什么必须在这里再做一次（已有 test-esm-safety.mjs）
    那个测试只覆盖 `dsh-plugin-repo-manager` 一个插件；本仓库是**多插件**仓库，
    新增插件时不会自动继承。而且这条检查是**静态**的，不依赖跑起来，
    对「产物入库但本机无运行时」的场景也能生效。

    ⚠️ 判据要先剔注释再匹配 —— 本仓库注释里会引用 `require('path')` 作反例。
    另外 `client/client.js` 里的 `require('react')` 是**合法**的：
    那段代码跑在浏览器自带的加载器里，不走 Node 的 ESM 解析，故只查 dist/。
    """
    panels_root = repo / "panels"
    if not panels_root.is_dir():
        return

    offenders: list[str] = []
    scanned = 0
    for plugin in sorted(p for p in panels_root.iterdir() if p.is_dir()):
        dist_js = plugin / "dist" / "index.js"
        if not dist_js.is_file():
            continue
        scanned += 1
        code = _strip_js_comments(dist_js.read_text(encoding="utf-8", errors="replace"))
        for m in re.finditer(r"^.*\brequire\s*\(.*$", code, re.MULTILINE):
            line = m.group(0).strip()
            offenders.append(f"{plugin.name}/dist/index.js: {line[:80]}")

    if offenders:
        bad(f"{len(offenders)} 处 ESM 产物里使用了 require()"
            f"（面板插件是 \"type\": \"module\"，ESM 无 require）")
        for o in offenders[:8]:
            print(f"         {o}")
        print("         改法：改用顶部 import 的模块（如 node:path 的 relative）。")
        print("         症状：卸载/安装点了没反应 —— HTTP 200 但 error.code=INTERNAL_ERROR。")
    else:
        ok(f"面板产物的 ESM 兼容性正常（{scanned} 个 dist 无 require 调用）")


def check_panel_skills_dir(repo: Path) -> None:
    """面板插件：`cordis.patch.yml` 里的 `skillsDir` **不得**写死成 `~` 开头的路径。

    2026-09-21 事故：`skillsDir: '~/.dsh/skills'` 在 NAS 上展开为
    **容器内部的 /root/.dsh/skills**，而 DSH 只扫描它自己的 `$DSH_HOME/skills/`
    （NAS 上 = `/vol2/@appdata/deepseek.harness/dsh-data/skills`）。
    两者不一致会产生一类**全程不报错**的失效：

      - 「安装」把技能复制到了没人扫描的目录 → 面板显示「已安装」、
        文件也确实写进磁盘、接口全部 `ok:true`，但 DSH 永远看不到该技能；
      - 「卸载」只删掉那份没人看的副本 → DSH 扫描目录里的原件纹丝不动。

    用户感受就是**「点了安装和卸载都没生效」**，而且没有任何报错可查。

    ## 判据
    留空最好：插件会按 `config` > `DSH_PLUGIN_SKILLS_DIR` > `$DSH_HOME/skills`
    > `~/.dsh/skills` 逐级推导，并在错位时于面板弹告警。
    若确实要写死，必须是**绝对路径** —— `~` 家目录在容器里几乎不可能等于
    DSH 数据根，写死它等于必然错位。
    """
    panels_root = repo / "panels"
    if not panels_root.is_dir():
        return

    offenders: list[str] = []
    scanned = 0
    for plugin in sorted(p for p in panels_root.iterdir() if p.is_dir()):
        patch = plugin / "cordis.patch.yml"
        if not patch.is_file():
            continue
        scanned += 1
        for lineno, line in enumerate(patch.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            code = line.split("#", 1)[0]          # 去掉行尾注释再判断
            m = re.match(r"\s*skillsDir\s*:\s*['\"]?([^'\"\s]+)", code)
            if not m:
                continue
            value = m.group(1)
            if value.startswith("~"):
                offenders.append(f"{plugin.name}/cordis.patch.yml:{lineno}  skillsDir: {value}")

    if offenders:
        bad(f"{len(offenders)} 处 skillsDir 写死成 ~ 开头的路径"
            f"（DSH 扫描的是 $DSH_HOME/skills，家目录必错位）")
        for o in offenders:
            print(f"         {o}")
        print("         改法：删掉该行留空（由插件逐级推导并自动告警），")
        print("               或改成绝对路径，如 /vol2/@appdata/deepseek.harness/dsh-data/skills。")
        print("         症状：点安装/卸载「没生效」—— 面板有反应、DSH 侧毫无变化，且不报错。")
    else:
        ok(f"面板插件的 skillsDir 配置正常（{scanned} 个 cordis.patch.yml 未写死 ~ 路径）")


# ---------------------------------------------------------------------------
# 2.10 宿主路径必须运行时探测，不得写死成「唯一默认」
# ---------------------------------------------------------------------------

# 判据：`${VAR:-/绝对路径}` —— 即「只有一个默认值，而那个默认值是某台机器的事实」。
# 变量名里必须含 profile（忽略大小写），避免误伤 DSH_RUNTIME 这类旁支路径。
HARDCODED_HOST_PATH_RE = re.compile(
    r"\$\{[A-Za-z_]*[Pp][Rr][Oo][Ff][Ii][Ll][Ee][A-Za-z_]*:-/"
)

# ---------------------------------------------------------------------------
# 「写死宿主路径」的第 2 类形态：**变量默认值回退到家目录 / 数据卷根**
#
# 第 1 类（上面那条 HARDCODED_HOST_PATH_RE）只认 `${...profile...:-/绝对路径}`，
# 于是 2026-09-23 的另一处失明：
#     mcps/hindsight/scripts/apply_to_config.py
#         DEFAULT_CONFIG = Path.home() / ".workbuddy" / "mcp.json"
#     mcps/hindsight/scripts/selfheal.sh
#         MCP_CONFIG="${MCP_CONFIG:-$HOME/.workbuddy/mcp.json}"
# ① 回退值是 `$HOME` 而不是 `/` → 正则不匹配；② `.py` 根本不在扫描范围。
# 结果同一个病（把「某台机器观察到的事实」当成普适默认值）原地复发，照旧不报错。
#
# ## 为什么判据不做成「扫路径字面量」
#
# 实测扫 `~/.workbuddy` / `~/.dsh` 这类字面量会命中一堆**正当**用法：
#   · 帮助文本（`description="同步到 ~/.workbuddy/skills/"`）
#   · 测试夹具（`$FAKE_HOME/.dsh/profiles/web`）
#   · 工具链路径（`$HOME/.workbuddy/binaries/python/...`）
#   · 仓库自己约定的每用户配置文件（`~/.<name>_config.json`，见 mcps/README.md）
# 噪声会逼人放宽规则 —— 那等于取消守卫。**所以只认「默认值形态」**，
# 且要求**变量名命中宿主数据根语义**（下面这个名单），宁可漏报也不误报。
# 命中这些「名字形态」才算宿主数据根相关的默认值。名单是**故意的**：
#
#   DSH_[A-Z_]*            DSH_HOME / DSH_RUNTIME / DSH_DATA / DSH_PROFILE_SEARCH_ROOT
#   [A-Z_]*PROFILE[A-Z_]*  PROFILE_DIR / DSH_PROFILE_SEARCH_ROOT
#   [A-Z_]*CONFIG[A-Z_]*   MCP_CONFIG / DEFAULT_CONFIG / CONFIG_PATH
#   SKILLS_DIR | HOST[A-Z_]*
#
# 为什么 `CONFIG` 一定要在里面：真正出事的那个常量就叫 `DEFAULT_CONFIG`——
# 名单若只写 `MCP_CONFIG`，就会**漏掉这次事故本身**（实测过，别改窄）。
# 为什么不用 `*DIR*` / `*PATH*` 这类宽泛词：会命中 `CACHE_DIR`、`CONFIG_PATH`
# 之类的每用户缓存/配置文件，噪声会逼人放宽规则。
_HOST_ROOT_VAR_NAMES = (
    r"(?:DSH_[A-Z_]*|[A-Z_]*PROFILE[A-Z_]*|[A-Z_]*CONFIG[A-Z_]*|SKILLS_DIR|HOST[A-Z_]*)"
)
# `${VAR:-<fallback>}` / `${VAR-<fallback>}`，fallback 取到右花括号为止
SH_VAR_DEFAULT_RE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*):?-([^}]*)\}")
# 回退值「看起来像宿主数据根」：家目录，或常见数据卷挂载根
_HOST_ROOT_VALUE_RE = re.compile(
    r"""^(?:["']?\s*)?(?:
          ~ | \$HOME | \$\{HOME\} | /vol\d | /volume\d | /mnt/ | /srv/ | /opt/
        | /root | /home/ | /Users/
    )""",
    re.VERBOSE,
)
# Python 侧：模块级常量被赋成家目录推导，或 `.get("VAR", <家目录推导>)` 当默认值
_PY_HOME_DERIVATION = r"(?:Path\.home\(\)|os\.path\.expanduser\(|Path\(\s*[\"']~)"
PY_MODULE_HOME_DEFAULT_RE = re.compile(
    rf"^([A-Za-z_][A-Za-z0-9_]*)\s*=[^\n]*?{_PY_HOME_DERIVATION}",
    re.MULTILINE,
)
PY_GET_HOME_DEFAULT_RE = re.compile(
    rf"\.get\(\s*[\"']([A-Za-z_][A-Za-z0-9_]*)[\"']\s*,[^\n]*?{_PY_HOME_DERIVATION}"
)

# 已确认的写死默认值：**只报 WARN，不判 FAIL**。
# ⚠️ 放进这个名单必须写理由 —— 它是「已知并接受」，不是「查不出来」。
#    键是 (仓库相对路径, 变量/常量名)，**不按文件豁免**：按文件豁免会让该文件里
#    将来任何新增的写死默认值一起溜过去。
KNOWN_HARDCODED_HOST_DEFAULTS: dict[tuple[str, str], str] = {
    ("scripts/update-and-install.sh", "DSH_HOME"):
        "2026-09-23 记录：技能落点未接 resolve-profile.sh，换机器需显式传 DSH_HOME",
    ("scripts/start-dsh-with-plugin.sh", "DSH_RUNTIME"):
        "2026-09-23 记录：DSH_RUNTIME 是运行时（代码）根，目前没有解析链，只能显式传参",
    ("skills/lucky-api/scripts/lucky_api.py", "CONFIG_PATH"):
        "仓库明确约定：凭据/每用户配置放 `~/.<name>_config.json` 这类外部文件"
        "（见 mcps/README.md「凭据约定」），此处的 `~/.lucky_api.json` 正是该约定本身",
}

PROFILE_LIB_REL = "scripts/lib/resolve-profile.sh"
# 允许 source 解析库的写法（两种 shell 写法都认）
_SOURCE_RE = re.compile(
    r"^\s*(?:\.|source)\s+[^\n]*resolve-profile\.sh", re.MULTILINE
)
# 「profile 定位」的唯一实现 = 唯一一条函数定义。
# ⚠️ 为什么不用「有没有 PROFILE_DIR= 赋值」当判据：解析库的帮助文本里必然
#    印着 `PROFILE_DIR=<路径> ...` 的用法示例（那是它的职责），按赋值形态匹配
#    会把库自己判成「第二份实现」（实测已踩）。**要拦的是「实现第二份」，
#    不是「提到这个名字」。**
_RESOLVER_DEF_RE = re.compile(
    r"^[ \t]*(?:function[ \t]+)?resolve_dsh_profile_dir[ \t]*\([ \t]*\)",
    re.MULTILINE,
)


def _scan_hardcoded_host_defaults(repo: Path) -> tuple[list[str], list[str]]:
    """扫描「把宿主数据根写死成唯一默认值」的全部形态。

    返回 `(未知违规, 已知豁免)`，每项都是可直接打印的 `路径:行号  [名字] 内容`。

    三种形态（前两种是已经咬过人的，第三种是同类扩展）：
      ① `${...profile...:-/绝对路径}`   —— shell
      ② `${VAR:-$HOME/...}` / `${VAR:-~...}`（VAR 名命中宿主语义）—— shell
      ③ `NAME = Path.home() / ...` / `.get("VAR", <家目录推导>)` —— Python
    """
    unknown: list[str] = []
    known: list[str] = []

    def record(rel: str, lineno: int, name: str, snippet: str) -> None:
        entry = f"{rel}:{lineno}  [{name}] {snippet.strip()[:88]}"
        reason = KNOWN_HARDCODED_HOST_DEFAULTS.get((rel, name))
        if reason:
            known.append(f"{entry}\n            ↳ 已知豁免：{reason}")
        else:
            unknown.append(entry)

    for f in sorted(list(repo.rglob("*.sh")) + list(repo.rglob("*.py"))):
        rel = f.relative_to(repo).as_posix()
        if rel.startswith((".git/", ".workbuddy/", "temp/", "node_modules/")):
            continue
        try:
            raw = f.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        code = _strip_sh_comments(raw) if f.suffix == ".sh" else _strip_py_comments(raw)
        lines = code.splitlines()

        def snippet_at(pos: int) -> tuple[int, str]:
            ln = code[:pos].count("\n") + 1
            return ln, (lines[ln - 1] if ln <= len(lines) else "")

        # ① profile 变量回退到绝对路径（2026-09-21 事故）
        #    记下它命中的区间：同一处默认值会被 ② 再匹配一次（`${PROFILE_DIR:-/vol2/...}`
        #    同时满足「名字含 PROFILE」和「回退值是数据卷根」），否则同一行报两遍，
        #    看报告的人会以为有两处问题。
        claimed: list[tuple[int, int]] = []
        for m in HARDCODED_HOST_PATH_RE.finditer(code):
            claimed.append(m.span())
            ln, s = snippet_at(m.start())
            record(rel, ln, "PROFILE_DIR", s)

        # ② shell 变量默认值回退到家目录 / 数据卷根（2026-09-23 事故）
        for m in SH_VAR_DEFAULT_RE.finditer(code):
            if any(a <= m.start() < b for a, b in claimed):
                continue
            name, fallback = m.group(1), m.group(2)
            if not re.fullmatch(_HOST_ROOT_VAR_NAMES, name):
                continue
            if " " in fallback:
                # 空格分隔的多个候选 = 搜索集，不是「唯一默认值」，不算写死落点
                continue
            if not _HOST_ROOT_VALUE_RE.match(fallback):
                continue
            ln, s = snippet_at(m.start())
            record(rel, ln, name, s)

        # ③ Python：模块级常量 / .get 默认值被赋成家目录推导。
        #    ⚠️ 同样要过名字名单 —— 否则 CACHE_DIR / USER_SKILLS 之类
        #    （每用户缓存、WorkBuddy 自己的用户目录）会一起被误报。
        for m in PY_MODULE_HOME_DEFAULT_RE.finditer(code):
            if not re.fullmatch(_HOST_ROOT_VAR_NAMES, m.group(1)):
                continue
            ln, s = snippet_at(m.start())
            record(rel, ln, m.group(1), s)
        for m in PY_GET_HOME_DEFAULT_RE.finditer(code):
            if not re.fullmatch(_HOST_ROOT_VAR_NAMES, m.group(1)):
                continue
            ln, s = snippet_at(m.start())
            record(rel, ln, m.group(1), s)

    return unknown, known


def check_host_path_not_hardcoded(repo: Path) -> None:
    """宿主路径**不得**写死成唯一默认值 —— 必须运行时探测。

    这是 2026-09-21 事故的直接防线，而事后看，**同一类问题已经出现过三次**：

      第 1 次 —— 面板 `cordis.patch.yml` 写死 `skillsDir: '~/.dsh/skills'`
                （容器里展开成 `/root/.dsh/skills`，DSH 扫的是 `$DSH_HOME/skills`）。
      第 2 次 —— `scripts/install-to-profile.sh` 写死
                PROFILE_DIR="${PROFILE_DIR:-/vol2/@appdata/deepseek.harness/dsh-data/profiles/web}"
                于是**只有那一台机器**能装。用户换一台部署就跑出：
                    ERROR: DSH profile 不存在: /vol2/@appdata/...
                用户原话：「**我不止部署一个机器的 DSH**」。
      第 3 次 —— `mcps/hindsight/scripts/` 写死（2026-09-23 修）
                    apply_to_config.py   DEFAULT_CONFIG = Path.home() / ".workbuddy" / "mcp.json"
                    selfheal.sh          MCP_CONFIG="${MCP_CONFIG:-$HOME/.workbuddy/mcp.json}"
                两份都指向容器内的 `/root/...`，在 NAS 上必然报「配置文件不存在」，
                而报错里看不出正确位置其实在别处。
                唯一实现现为 `mcps/hindsight/scripts/hindsight_paths.py`。

    三次共同点：**把「某台机器观察到的事实」当成了「普适默认值」**。
    失效形态也一致：不报错、或者报错信息只说「不存在」，不说「我找过哪些地方」。

    ## 判据

    只认「**默认值形态**」，且变量/常量名须命中宿主数据根语义（见
    `_HOST_ROOT_VAR_NAMES` 与 `_scan_hardcoded_host_defaults`）。三条：
      (a) `.sh` **与 `.py`** 都不得出现上述三种形态的写死默认值。
          注释与 docstring 里引用旧写法**不算**（`_strip_*_comments` 已剔除）。
      (b) 唯一实现 `scripts/lib/resolve-profile.sh` 必须存在，且
          `resolve_dsh_profile_dir` **只能在这个文件里定义一次**。
      (c) 安装 / 卸载两个脚本必须都 **source** 它（不能有一边偷偷自己算）。

    ⚠️ 为什么不扫「路径字面量」（`~/.workbuddy` 之类）：实测会命中帮助文本、
    测试夹具、工具链路径、以及仓库自己约定的 `~/.<name>_config.json`。噪声会逼人
    放宽规则 = 取消守卫（详见 `_HOST_ROOT_VAR_NAMES` 上方的注释）。

    ⚠️ 为什么必须有这条：`check_install_targets`(2.5) 只查「落点目录名 == 包名」，
    `check_install_uninstall_parity`(2.7) 只查「两个脚本彼此一致」——
    **两者都查不出「这个默认值本身是错的/只对一台机器成立」**。
    同「只检查唯一实现内部自洽照不出第二份实现」，这里也是必须另做结构性扫描的一类。
    """
    unknown, known = _scan_hardcoded_host_defaults(repo)

    if unknown:
        bad(f"{len(unknown)} 处把宿主路径写死成唯一默认值（换一台机器就装不上）")
        for o in unknown:
            print(f"         {o}")
        print("         改法：删掉该默认值，改为「运行时探测 + 唯一命中才采用」。")
        print("               DSH profile 走 scripts/lib/resolve-profile.sh；")
        print("               MCP 配置走 mcps/hindsight/scripts/hindsight_paths.py；")
        print("               其它落点请照同样形状写一个解析器，别再就地写一份。")
        print("         症状：换个部署就报「XX 不存在」，而正确目录其实就在别处。")
    else:
        ok("没有把宿主路径写死成唯一默认值（均为运行时探测或显式传参）")

    if known:
        warn(f"{len(known)} 处已知的写死默认值（历史遗留，已登记原因，换机器需显式传参）")
        for o in known:
            print(f"         {o}")
    else:
        ok("已知豁免名单为空（说明历史遗留项都已修掉）")

    lib = repo / PROFILE_LIB_REL
    if not lib.is_file():
        bad(f"缺少 profile 解析库 {PROFILE_LIB_REL}（宿主路径探测的唯一实现）")
        return
    ok(f"{PROFILE_LIB_REL} 存在（宿主路径探测的唯一实现）")

    # (b2) 函数定义唯一性 —— 「实现只放一处」的正面判据
    definers: list[str] = []
    for sh in sorted(repo.rglob("*.sh")):
        rel = sh.relative_to(repo).as_posix()
        if rel.startswith(".git/") or rel.startswith(".workbuddy/"):
            continue
        try:
            raw = sh.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if _RESOLVER_DEF_RE.search(_strip_sh_comments(raw)):
            definers.append(rel)

    if definers == [PROFILE_LIB_REL]:
        ok("resolve_dsh_profile_dir 只在解析库中定义（无第二份实现）")
    elif not definers:
        bad("没有任何脚本定义 resolve_dsh_profile_dir（解析库可能被改名/清空）")
    else:
        bad(f"resolve_dsh_profile_dir 在 {len(definers)} 个文件里各有定义"
            f"（同一套逻辑写两份必然漂移）")
        for d in definers:
            print(f"         {d}")
        print(f"         应只保留 {PROFILE_LIB_REL}，其余改为 source 后调用。")

    # ⚠️ 必须**在函数里**取 CANONICAL_INSTALLER：它定义在本文件更下方，
    #    写成模块级常量会在 import 期就 NameError。
    lib_sourcers = (CANONICAL_INSTALLER, "scripts/uninstall-from-profile.sh")

    missing: list[str] = []
    for rel in lib_sourcers:
        f = repo / rel
        if not f.is_file():
            missing.append(f"{rel}  (文件不存在)")
            continue
        if not _SOURCE_RE.search(f.read_text(encoding="utf-8", errors="replace")):
            missing.append(f"{rel}  (未 source {PROFILE_LIB_REL})")
    if missing:
        bad(f"{len(missing)} 个脚本没有使用共享的 profile 解析库")
        for m in missing:
            print(f"         {m}")
        print("         两个脚本各算一遍落点必然漂移 —— 装到 A、卸载删 B。")
    else:
        ok(f"install / uninstall 均 source {PROFILE_LIB_REL}（落点判据只有一处实现）")


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
    # 先置空，保证后面「版本号两处一致」那一节无论走哪个分支都有值可比 ——
    # 缺文件时应当报 bad，不能因为 NameError 之类悄悄跳过。
    pkg: dict = {}
    if pkg_path.is_file():
        try:
            pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
        except Exception as e:
            bad(f"{name}: package.json 无法解析 ({e})")
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
    mf: dict = {}
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

    # ---- 版本号两处必须一致（2026-09-24 补） ----
    # 面板自身版本号在 package.json 与 manifest.json 各写一份，两边都是事实来源：
    # `package.json` 给 npm/宿主读，`manifest.json` 给面板自己的更新检测读
    # （`isNewer(仓库版本, 已装 version.json 的版本)`）。不一致时**不报错**，
    # 只表现为「更新提示时有时无」这类说不清的现象。
    # 三处防线此前都不存在：这条守卫、以及 `README.md` 里那句人工复述
    # 「与 package.json 保持一致」—— 它曾把版本写成 1.1.0，此后连升两级无人发现。
    # → 所以文档不再复述版本号（同「文档里别复述校验步数」），改由这里直接比两份文件。
    pkg_ver = pkg.get("version")
    mf_ver = mf.get("version")
    if pkg_ver and mf_ver:
        if pkg_ver == mf_ver:
            ok(f"{name}: package.json 与 manifest.json 版本一致（{pkg_ver}）")
        else:
            bad(f"{name}: 版本不一致 —— package.json={pkg_ver} / manifest.json={mf_ver}"
                f"（两边必须同步：宿主/npm 读前者，面板更新检测读后者）")
    else:
        # 缺任一方时**不能静默通过** —— 那正是「空对空等于一致」的空转形态
        bad(f"{name}: 版本号缺失 —— package.json={pkg_ver!r} / manifest.json={mf_ver!r}")


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

    # 安装类文档不得把「带作用域路径」写成安装目标。
    # 2026-09-18 实测：插件 README 与 INSTALL.md 都曾写
    # `node_modules/@deepseek-ai/<包名>/` 作为安装目的地，正是错的落点 ——
    # 文档会把人直接带到那个状态，所以和脚本一样要守。
    # 只扫这两份「会指导操作」的文档；历史记录（FINAL.md / IMPLEMENTATION.md）
    # 与脚本内的 legacy 清理注释豁免（它们提到该路径是**为了说明它错**）。
    wrong_target = f"node_modules/@deepseek-ai/{pkg_name}"
    doc_dir = repo / "panels" / pkg_name
    dirty: list[str] = []
    for doc in ("INSTALL.md", "README.md"):
        p = doc_dir / doc
        if not p.is_file():
            continue
        if wrong_target in p.read_text(encoding="utf-8", errors="replace"):
            dirty.append(f"panels/{pkg_name}/{doc}")
    if dirty:
        bad(f"{len(dirty)} 份安装文档把带作用域路径写成了安装目标")
        for rel in dirty:
            print(f"         {rel}  ← 含 {wrong_target}")
        print(f"         应写成 node_modules/{pkg_name}/（不带作用域）")
    else:
        ok("安装文档的落点写法正确（不带作用域）")


CANONICAL_INSTALLER = "scripts/install-to-profile.sh"

# 允许携带落点定义的**成对**文件：安装脚本 + 它的卸载对手。
# 卸载必须算出与安装完全相同的落点（否则删不掉/删错），所以无法合并成一个。
# 代价是「同一事实存在两处」→ 必须配一致性守卫（见 check_install_uninstall_parity）。
ALLOWED_TARGET_OWNERS = {
    CANONICAL_INSTALLER,
    "scripts/uninstall-from-profile.sh",
}

# 判据：出现这个变量赋值即视为「自己实现了一遍 profile 落点」。
# ⚠️ 只查 `PROFILE_NODE_MODULES`，**特意不查 `PROFILE_DIR`**：
#    解析库的帮助文本里会印 `PROFILE_DIR=<路径> ...` 这样的示例行（告诉用户怎么用），
#    按「赋值形态」匹配会把它误判成第二份实现 —— 实测踩过。
#    「profile 定位只有一处实现」改由 2.10 用**函数定义唯一性**判据守住，
#    那才是真正该拦的东西（拦「实现第二份」，而不是拦「提到这个名字」）。
TARGET_VAR_RE = re.compile(r"^\s*PROFILE_NODE_MODULES\s*=", re.MULTILINE)


def check_install_impl_uniqueness(repo: Path) -> None:
    """「安装到 profile」的落点逻辑**只允许一处实现**（卸载对手除外）。

    判据：除 `ALLOWED_TARGET_OWNERS` 里的文件外，任何 `.sh` 都不得给
    `PROFILE_NODE_MODULES` 赋值。
    （「到哪个 profile」那一半由 2.10 用**函数定义唯一性**守住 —— 见那里为何
    不能按「出现 PROFILE_DIR=」来判。）

    为什么需要这条：
      这里曾有两份实现 —— 仓库根的 `scripts/install-to-profile.sh` 和
      **插件内**的 `panels/dsh-plugin-repo-manager/scripts/install.sh`。
      两者必然漂移：插件内那份写的是 `node_modules/@deepseek-ai/<包名>`，
      而包名不带作用域 → Node 解析不到 → DSH 报
        invalid plugin, expect function or object with an "apply" method,
        received undefined
      更糟的是 `INSTALL.md` 把它当「安装步骤 1」推荐，等于持续再造这个错误状态。

      注意：`check_install_targets` 只检查**那一个文件内部**的落点是否自洽，
      **查不出「同一逻辑存在第二份」** —— 所以必须另加本条结构性检查。
      （这正是「实现只放一处」原则需要工具兜住的地方：靠人眼必然漏。）
    """
    offenders: list[str] = []
    scanned = 0
    for sh in sorted(repo.rglob("*.sh")):
        rel = sh.relative_to(repo).as_posix()
        if rel.startswith(".git/") or rel.startswith(".workbuddy/"):
            continue
        if rel in ALLOWED_TARGET_OWNERS:
            continue
        scanned += 1
        try:
            text = sh.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if TARGET_VAR_RE.search(text):
            offenders.append(rel)

    if offenders:
        bad(f"{len(offenders)} 个脚本重复实现了 profile 落点"
            f"（只允许 {CANONICAL_INSTALLER} 及其卸载对手）")
        for rel in offenders[:8]:
            print(f"         {rel}  ← 含 PROFILE_NODE_MODULES= 赋值")
        print("         改法：改为**转发桩**（exec 到唯一实现），不要在第二处重写落点逻辑。")
    else:
        ok(f"profile 落点逻辑只有一处实现（另扫描 {scanned} 个 .sh）")


# 从某个脚本里抓出落点三元组（用于比对安装/卸载是否一致）
#
# ⚠️ `PROFILE_DIR` 的取值形态在 2026-09-21 变了：以前是写死的默认值
#    `"${PROFILE_DIR:-/vol2/.../profiles/web}"`，现在是
#    `"$(resolve_dsh_profile_dir "$PKG_NAME")" || exit $?`。
#    判据随之放宽为「整行」，因为**真正的一致性已由「两边 source 同一个解析库」
#    保证**（见 2.10），这里只需拦住「有一边偷偷换成了别的调用/别的路径」。
_LOC_RE = {
    "PROFILE_DIR": re.compile(r'^PROFILE_DIR=(.+)$', re.MULTILINE),
    "NODE_MODULES": re.compile(r'^PROFILE_NODE_MODULES=(.+)$', re.MULTILINE),
    "PKG_NAME": re.compile(r'^PKG_NAME=(.+)$', re.MULTILINE),
    "TARGET_DIR": re.compile(r'^TARGET_DIR=(.+)$', re.MULTILINE),
}


def _extract_targets(path: Path) -> dict[str, str] | None:
    """抽出落点定义四元组；缺任何一个返回 None。"""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    out: dict[str, str] = {}
    for key, rx in _LOC_RE.items():
        m = rx.search(text)
        if not m:
            return None
        out[key] = m.group(1).strip().strip('"').strip("'")
    return out


def check_install_uninstall_parity(repo: Path) -> None:
    """安装与卸载脚本的落点定义必须**逐字一致**。

    这两个文件天然要各自算一遍落点（一个写、一个删），是不可避免的「两处」。
    按本仓库约定（**两处都有的项必须配一致性守卫**），这里直接比对四元组：
    `PROFILE_DIR` 默认值 / `PROFILE_NODE_MODULES` / `PKG_NAME` / `TARGET_DIR`。

    漂移的后果很隐蔽：装到 A、卸载时去删 B —— 删不干净，或（更糟）
    在错误的目录上执行 `rm -rf`。这条检查是那类事故的直接防线。
    """
    inst = repo / CANONICAL_INSTALLER
    unin = repo / "scripts" / "uninstall-from-profile.sh"
    if not (inst.is_file() and unin.is_file()):
        warn("install / uninstall 脚本不全（跳过落点一致性比对）")
        return

    a = _extract_targets(inst)
    b = _extract_targets(unin)
    if a is None or b is None:
        warn("无法从 install / uninstall 解析落点四元组（跳过比对）")
        return

    drift = {k: (a[k], b[k]) for k in a if a.get(k) != b.get(k)}
    if drift:
        bad(f"install 与 uninstall 的落点定义漂移（{len(drift)} 项）")
        for k, (x, y) in drift.items():
            print(f"         {k}:")
            print(f"           install   = {x}")
            print(f"           uninstall = {y}")
    else:
        ok("install / uninstall 落点定义一致"
           f"（PKG_NAME={a['PKG_NAME']}，落点父目录=node_modules）")


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

        print("\n2.6 安装逻辑「只放一处」")
        check_install_impl_uniqueness(repo)

        print("\n2.7 安装 / 卸载落点一致性")
        check_install_uninstall_parity(repo)

        print("\n2.8 面板产物的 ESM 兼容性")
        check_panel_esm_safety(repo)

        print("\n2.9 面板 skillsDir 落点（不得写死 ~ 路径）")
        check_panel_skills_dir(repo)

        print("\n2.10 宿主路径必须运行时探测（不得写死成唯一默认值）")
        check_host_path_not_hardcoded(repo)

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
