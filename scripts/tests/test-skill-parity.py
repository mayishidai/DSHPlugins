#!/usr/bin/env python3
"""`game-dev-workflow` 与 `app-dev-workflow` 的**结构对齐守卫**（零依赖，仅标准库）。

## 为什么需要它

这两个技能是「同一骨架、不同领域词汇」的镜像：**22 个文件一一对应**，只有 2 处刻意改名
（`references/templates/art-design.md` ↔ `design-visual.md`、`scripts/gf.sh` ↔ `af.sh`）。

镜像关系一旦靠人手工维护，就**必然漂移**，而且漂移时**不报错**：改了一侧的章节、加了
一侧的门禁、漏改一侧的交叉引用，语法都正常、单测都绿，只有用户真正照它干活时才感觉
「两边长得不一样」。派生过程中已经真实发生 4 次：

  1. `manifest.json` 的 description 被「双替换」写坏（`美术` 先换成 `UI/UX 设计`，再换
     `特效` → 得到 `UI/UX 设计UI/动效/视觉反馈设计`），而 SKILL.md frontmatter 是干净的；
  2. `manifest.json` version 1.1.0 与 CHANGELOG 的 v1.0.0 不一致；
  3. 「音效」（游戏侧指标）残留在接入清单里；
  4. 「帧率」残留在性能验收里 —— 应用侧的支付是首屏可交互 / 包体积 / 接口 P95 / 内存峰值。

以上四条本脚本都能挡住。

## 判据怎么定

- **不比对正文散文**（正文本来就该不同：依据段、示例路径、性能指标都按领域重写了），
  只比对**结构**：文件清单、标题骨架、门禁 ID、阶段 ID、指令集、ID 前缀、CONFIG 字段、
  脚手架清单、脚本子命令、元信息骨架。
- 比对前先把 game 侧文字按 `TERM_MAP` 归一化 —— **这张表就是「允许出现的差异」的声明**。
  任何不在这张表里的差异 → FAIL。表越长，说明两侧偏离越多；新增差异必须显式登记。
- 反向再查一遍：`GAME_ONLY_TERMS` 不得出现在 app 侧、`APP_ONLY_TERMS` 不得出现在 game 侧。
  这是最有价值的一条 —— 它不要求「差异可映射」，只要求「本领域不出现对方的词」。
- `TERM_MAP` 自带两项**空转防护**：① 每个 game 词必须真在 game 侧出现、其映射结果必须真在
  app 侧出现，否则表已过期；② 词条有包含关系时长者必须在前，否则短词会先吃掉长词。

> `CHANGELOG.md` 全程排除：它记录两个技能各自的历史，**本来就该提到对方**。

## 用法

    python3 scripts/tests/test-skill-parity.py

退出码: 0 = 严格对齐；1 = 存在未声明的漂移
"""
from __future__ import annotations

import ast
import io
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GAME = ROOT / "skills" / "game-dev-workflow"
APP = ROOT / "skills" / "app-dev-workflow"

# 记录历史的文件，允许提及对侧，所有内容类判据都跳过它
SKIP_FILES = {"CHANGELOG.md"}

# ---- 声明的差异 ①：文件名映射（game → app） ----
FILE_MAP = {
    "references/templates/art-design.md": "references/templates/design-visual.md",
    "scripts/gf.sh": "scripts/af.sh",
}

# ---- 声明的差异 ②：领域词汇映射（game → app）。**有序**：有包含关系的长词必须在前 ----
TERM_MAP = [
    # 技能自身名称
    ("game-dev-workflow", "app-dev-workflow"),
    ("Game Dev Workflow", "App Dev Workflow"),
    # 路径 / 痕迹目录
    ("03-art-design", "03-design-visual"),
    ("art-design", "design-visual"),
    ("art-assets", "design-assets"),
    (".gameflow", ".appflow"),
    ("gameflow", "appflow"),
    ("gf.sh", "af.sh"),
    # 整段标题：应用侧是重写而非逐词可推，逐条声明
    ("玩法 / 功能设计", "功能设计"),
    ("特效设计", "视觉反馈设计（loading / 空态 / 错误态 / 骨架屏）"),
    ("分辨率与适配", "响应式与适配"),
    ("素材清单", "设计资产清单"),
    ("界面设计", "页面设计"),
    ("表现接入", "联调与体验接入"),
    ("表现与逻辑", "视图与逻辑"),
    # 角色 / 阶段 / 文档名
    ("策划设计", "产品设计"),
    ("美术设计", "UI/UX 设计"),
    ("策划", "产品经理"),
    ("美术", "UI/UX 设计"),
    ("程序", "开发"),
    ("Artist", "Designer"),
    ("Programmer", "Developer"),
    # 领域词汇
    ("游戏", "应用"),
    ("界面", "页面"),
    ("玩法", "功能"),
    ("数值", "参数"),
    ("手感", "交互体验"),
    ("特效", "视觉反馈"),
    ("表现", "体验"),
]

# ---- 声明的差异 ③：CONFIG.md 字段名（game → app） ----
CONFIG_FIELD_MAP = {
    "engine": "stack",
    "art_dirs": "design_dirs",
    "art_spec": "design_spec",
}

# ---- 反向块名单：本领域专属词不得出现在对侧（`程序` 单独用带否定的正则，见 _scan_words） ----
GAME_ONLY_TERMS = [
    "游戏", "策划", "美术", "引擎", "玩法", "数值", "手感", "特效", "音效",
    "玩家", "关卡", "装备", "背包", "怪物", "副本", "贴图", "粒子", "帧率",
    "DrawCall", "drawcall", "Unity", "unity", "Godot", "godot", "Assets/",
    "art-design", "art-assets", ".gameflow", "gf.sh", "daily-shop", ".meta", "表现",
]
APP_ONLY_TERMS = [
    ".appflow", "appflow", "af.sh", "design-visual", "design-assets",
    "norecursedirs", "首屏", "提示音", "P95", "order-filter",
]

PASS = 0
FAIL = 0


def ok(msg: str) -> None:
    global PASS
    PASS += 1
    print(f"  [OK]   {msg}")


def bad(msg: str) -> None:
    global FAIL
    FAIL += 1
    print(f"  [FAIL] {msg}")


# --------------------------------------------------------------------------- 工具


def read(path: Path) -> str:
    """读文本并统一成 LF —— 只比结构，换行不该影响判定。"""
    return io.open(path, encoding="utf-8", newline="").read().replace("\r\n", "\n")


def to_app(text: str) -> str:
    for g, a in TERM_MAP:
        text = text.replace(g, a)
    return text


def map_file(rel: str) -> str:
    return FILE_MAP.get(rel, rel)


def strip_fence(text: str) -> str:
    """去掉围栏代码块：示例里的路径/ID 不属于文档骨架。"""
    return re.sub(r"^```.*?^```[ \t]*$", "", text, flags=re.S | re.M)


def headings(text: str) -> list[tuple[int, str]]:
    return [
        (len(m.group(1)), m.group(2).strip())
        for m in re.finditer(r"^(#{1,6})[ \t]+(.*?)[ \t]*$", strip_fence(text), re.M)
    ]


def files_of(root: Path) -> list[str]:
    return sorted(
        f.relative_to(root).as_posix()
        for f in root.rglob("*")
        if f.is_file() and f.name not in SKIP_FILES
    )


def bodies() -> list[tuple[str, str, str]]:
    """返回 [(app 相对路径, game 文本, app 文本)]，两侧按声明映射配对。"""
    out = []
    for rel in files_of(GAME):
        arel = map_file(rel)
        ap = APP / arel
        if not ap.is_file():
            continue
        out.append((arel, read(GAME / rel), read(ap)))
    return out


def norm_ws(text: str) -> str:
    """抹平 CJK 与拉丁/数字交界处的空格。

    中英混排加不加空格是排版偏好，不该算结构漂移：game 侧 `与美术设计` 归一化成
    `与UI/UX 设计`，而 app 侧写的是 `与 UI/UX 设计` —— 这类差异会被永久误报。
    两侧同等归一化后再比，所以不会掩盖真实差异（只是比「带不带空格」更宽松）。
    """
    text = re.sub(r"(?<=[\u4e00-\u9fff])\s+(?=[A-Za-z0-9])", "", text)
    return re.sub(r"(?<=[A-Za-z0-9])\s+(?=[\u4e00-\u9fff])", "", text)


def _pattern(word: str) -> re.Pattern:
    """块名单/映射词的匹配方式。

    - `程序`：中文里 `小程序` 不是游戏词，必须排除（否则 app 侧技术栈枚举会误报）。
    - 拉丁词：加词边界且**大小写敏感** —— 否则 `Assets/` 会命中 `design-assets/`
      （`-` 不是字母，边界判定放行），而 `unity` 会命中 `community`。
    - 其余（中文词）：直接子串。
    """
    if word == "程序":
        return re.compile(r"(?<!小)程序")
    if re.match(r"^[A-Za-z]", word):
        return re.compile(r"(?<![A-Za-z0-9])" + re.escape(word) + r"(?![A-Za-z0-9])")
    return re.compile(re.escape(word))


def scan(text: str, word: str) -> list[int]:
    """返回 word 出现的行号列表。"""
    return [text[: m.start()].count("\n") + 1 for m in _pattern(word).finditer(text)]


# --------------------------------------------------------------------------- 检查


def check_term_map_self_test() -> None:
    print("== 1. 映射表自身自检（防守卫空转）==")
    game_all = "\n".join(read(GAME / r) for r in files_of(GAME))
    app_all = "\n".join(read(APP / r) for r in files_of(APP))

    missing = [g for g, _ in TERM_MAP if g not in game_all]
    if missing:
        bad(f"TERM_MAP 里这些 game 词在 game 侧根本不存在（表已过期）: {missing}")
    else:
        ok(f"TERM_MAP 的 {len(TERM_MAP)} 个 game 词都在 game 侧真实出现")

    unused = [a for _, a in TERM_MAP if a not in app_all]
    if unused:
        bad(f"这些映射结果在 app 侧不存在（app 侧用词变了）: {unused}")
    else:
        ok("TERM_MAP 的映射结果都在 app 侧真实出现")

    bad_order = []
    terms = [g for g, _ in TERM_MAP]
    for i, g1 in enumerate(terms):
        for g2 in terms:
            if g1 != g2 and g2 in g1 and i > terms.index(g2):
                bad_order.append(f"{g2}(在后) 是 {g1}(在前) 的子串")
    if bad_order:
        bad(f"TERM_MAP 顺序错误 —— 短词必须排在长词之后: {bad_order}")
    else:
        ok("TERM_MAP 顺序正确（有包含关系的长词都在前）")


def check_files() -> None:
    print("== 2. 文件清单（按声明映射配对）==")
    g, a = files_of(GAME), files_of(APP)
    mapped = sorted(map_file(x) for x in g)
    only_g = sorted(set(mapped) - set(a))
    only_a = sorted(set(a) - set(mapped))
    if only_g or only_a:
        bad(f"文件清单不一致 —— 仅 game 侧: {only_g}；仅 app 侧: {only_a}")
    else:
        ok(f"两侧各 {len(g)} 个文件，映射后一一对应")
    for rel, arel in FILE_MAP.items():
        if rel in g and arel in a:
            ok(f"声明改名存在: {rel} ↔ {arel}")
        else:
            bad(f"声明改名落空: {rel} ↔ {arel}")


def check_headings() -> None:
    print("== 3. 标题骨架（应用 TERM_MAP 归一化后须逐字相同）==")
    for arel, gtxt, atxt in bodies():
        gh = [(lv, norm_ws(to_app(t))) for lv, t in headings(gtxt)]
        ah = [(lv, norm_ws(t)) for lv, t in headings(atxt)]
        if gh == ah:
            continue
        diff = []
        for i in range(max(len(gh), len(ah))):
            x = gh[i] if i < len(gh) else None
            y = ah[i] if i < len(ah) else None
            if x != y:
                diff.append(f"#{i}: game→app 归一化 {x!r} ≠ app {y!r}")
        bad(f"{arel} 标题骨架漂移（{len(gh)} vs {len(ah)} 个）: " + "；".join(diff[:4]))
    if FAIL == 0:
        ok(f"{len(bodies())} 个文件的标题骨架全部对齐")


def check_ids() -> None:
    print("== 4. 门禁 / 阶段 / ID 体系 ==")
    ga = "\n".join(g for _, g, _ in bodies())
    aa = "\n".join(a for _, _, a in bodies())
    for label, pat in (
        ("门禁 ID", r"G\d+'?"),
        ("阶段 ID", r"\bS\d\b"),
        ("ID 前缀", r"\b([A-Z][A-Z0-9]{1,3})-\d"),
    ):
        gs = {m.group(1) if m.groups() else m.group(0) for m in re.finditer(pat, ga)}
        as_ = {m.group(1) if m.groups() else m.group(0) for m in re.finditer(pat, aa)}
        if gs == as_:
            ok(f"{label} 集合一致: {sorted(gs)}")
        else:
            bad(f"{label} 不一致 —— 仅 game: {sorted(gs - as_)}；仅 app: {sorted(as_ - gs)}")


def parse_route_table(text: str) -> dict[str, str]:
    """从 SKILL.md §6 路由表取「指令 → runbook 锚点」。"""
    out = {}
    for m in re.finditer(r"^\|\s*`([a-z]+)`\s*\|.*?\|\s*operations\.md\s*(§\d+)\s*\|", text, re.M):
        out[m.group(1)] = m.group(2)
    return out


def check_instructions() -> None:
    print("== 5. 操作指令集与 runbook 锚点 ==")
    gs = parse_route_table(read(GAME / "SKILL.md"))
    as_ = parse_route_table(read(APP / "SKILL.md"))
    if len(gs) != 12:
        bad(f"game 侧路由表解析到 {len(gs)} 个指令（预期 12）: {sorted(gs)}")
    else:
        ok(f"game 侧 12 个指令: {sorted(gs)}")
    if gs == as_:
        ok("两侧「指令 → runbook 锚点」映射完全一致")
    else:
        bad(f"指令集/锚点不一致 —— 仅 game: {sorted(set(gs) - set(as_))}；仅 app: {sorted(set(as_) - set(gs))}")
    for who, root, table in (("game", GAME, gs), ("app", APP, as_)):
        ops = read(root / "references" / "operations.md")
        anchors = set(re.findall(r"^##\s*(§\d+)\s", ops, re.M))
        want = set(table.values())
        if anchors != want:
            bad(f"{who} 侧 operations.md 的 §锚点 与路由表不符 —— 仅在 md: {sorted(anchors - want)}；仅在路由表: {sorted(want - anchors)}")
        else:
            ok(f"{who} 侧 operations.md 含全部 {len(want)} 个 §锚点且无多余")


def check_config_fields() -> None:
    print("== 6. CONFIG.md 字段 ==")
    out = {}
    for who, root, script in (
        ("game", GAME, "scripts/gf.sh"),
        ("app", APP, "scripts/af.sh"),
    ):
        txt = read(root / script)
        fields = re.findall(r"^- ([a-z_]+):", txt, re.M)
        out[who] = fields
        if len(fields) != 7:
            bad(f"{who} 侧 CONFIG 字段应为 7 个，实得 {len(fields)}: {fields}")
        else:
            ok(f"{who} 侧 CONFIG 7 个字段: {fields}")
    mapped = [CONFIG_FIELD_MAP.get(f, f) for f in out.get("game", [])]
    if mapped and mapped == out.get("app"):
        ok("两侧 CONFIG 字段名按声明映射后一致")
    else:
        bad(f"CONFIG 字段名不一致 —— game 映射后 {mapped} ≠ app {out.get('app')}")


def check_scripts() -> None:
    print("== 7. 脚手架脚本 ==")
    gtxt = read(GAME / "scripts" / "gf.sh")
    atxt = read(APP / "scripts" / "af.sh")
    gm = re.search(r"for t in ([a-z0-9\- ]+); do", gtxt)
    am = re.search(r"for t in ([a-z0-9\- ]+); do", atxt)
    gset = gm.group(1).split() if gm else []
    aset = am.group(1).split() if am else []
    mapped = [map_file(f"references/templates/{x}.md").split("/")[-1][:-3] for x in gset]
    if mapped == aset:
        ok(f"脚手架模板清单一致（{len(aset)} 个）: {aset}")
    else:
        bad(f"脚手架模板清单不一致 —— game 映射后 {mapped} ≠ app {aset}")
    gsub = sorted(re.findall(r"^\s{2}([a-z]+)\)$", gtxt, re.M))
    asub = sorted(re.findall(r"^\s{2}([a-z]+)\)$", atxt, re.M))
    if gsub and gsub == asub:
        ok(f"子命令集一致: {asub}")
    else:
        bad(f"子命令集不一致 —— game {gsub} ≠ app {asub}")


def check_blocklist() -> None:
    print("== 8. 领域词块名单（本领域的词不得出现在对侧）==")
    for who, root, terms, label in (
        ("app", APP, GAME_ONLY_TERMS, "game 专属"),
        ("game", GAME, APP_ONLY_TERMS, "app 专属"),
    ):
        hits = []
        for rel in files_of(root):
            txt = read(root / rel)
            for w in terms:
                for ln in scan(txt, w):
                    hits.append(f"{rel}:{ln} [{w}]")
        if hits:
            bad(f"{who} 侧出现 {label} 词 {len(hits)} 处: " + "；".join(hits[:6]))
        else:
            ok(f"{who} 侧无 {label} 词（{len(terms)} 个词全清）")


def check_metadata() -> None:
    print("== 9. 元信息骨架 ==")
    descs, versions = {}, {}
    for who, root in (("game", GAME), ("app", APP)):
        m = json.loads(read(root / "manifest.json"))
        versions[who] = (m.get("version"), re.findall(r"^##\s+\d{4}-\d{2}-\d{2}\s+v([\d.]+)", read(root / "CHANGELOG.md"), re.M))
        fm = re.match(r"---\n(.*?)\n---", read(root / "SKILL.md"), re.S).group(1)
        sk = re.search(r"^description:\s*(.+?)\s*$", fm, re.M).group(1)
        if m.get("description") == sk:
            ok(f"{who} 侧 manifest.description 与 SKILL.md frontmatter 一致（{len(sk)} 字）")
        else:
            bad(f"{who} 侧 description 漂移: manifest {m.get('description','')[:34]}… ≠ SKILL.md {sk[:34]}…")
        if m.get("name") == root.name:
            ok(f"{who} 侧 manifest.name 与目录名一致")
        else:
            bad(f"{who} 侧 manifest.name {m.get('name')} ≠ 目录名 {root.name}")
        inv = m.get("invocation", {})
        if inv.get("modelInvocable") and inv.get("userInvocable"):
            ok(f"{who} 侧 invocation 双 true")
        else:
            bad(f"{who} 侧 invocation 不是双 true: {inv}")
        if not m.get("whenToUse"):
            bad(f"{who} 侧 manifest 缺 whenToUse")
        descs[who] = sk
        mv, chv = versions[who]
        if chv and mv == chv[0]:
            ok(f"{who} 侧 version 与 CHANGELOG 最新条目一致（{mv}）")
        else:
            bad(f"{who} 侧 version {mv} ≠ CHANGELOG 最新 {chv[:1] or '未解析到'}")

    ga, aa = descs["game"], descs["app"]
    for label, pat in (("→ 段数", r"→"), ("∥ 段数", r"∥")):
        n1, n2 = len(re.findall(pat, ga)), len(re.findall(pat, aa))
        if n1 == n2:
            ok(f"description 的{label}一致（{n1}）")
        else:
            bad(f"description 的{label}不一致: game {n1} vs app {n2}")
    for clause in ("只要涉及", "就必须使用本 skill", "它强制全程留痕", "回流到本 skill"):
        if (clause in ga) == (clause in aa):
            ok(f"description 子句骨架一致: 「{clause}」{'有' if clause in ga else '无'}")
        else:
            bad(f"description 子句骨架漂移: 「{clause}」game {'有' if clause in ga else '无'} / app {'有' if clause in aa else '无'}")

    gm = json.loads(read(GAME / "manifest.json"))
    am = json.loads(read(APP / "manifest.json"))
    if set(gm) - {"keywords"} == set(am):
        ok("两侧 manifest 键集合一致（忽略关键词类的可选项）")
    else:
        bad(f"manifest 键集合不一致 —— 仅 game: {sorted(set(gm) - set(am))}；仅 app: {sorted(set(am) - set(gm))}")


def check_local_skills() -> None:
    print("== 10. 自研技能登记（LOCAL_SKILLS ↔ manifest 无 source）==")
    src = read(ROOT / "scripts" / "gen-manifest.py")
    m = re.search(r"^LOCAL_SKILLS\s*=\s*(\{.*?\})", src, re.M)
    if not m:
        bad("从 gen-manifest.py 里找不到 LOCAL_SKILLS 定义")
        return
    listed = ast.literal_eval(m.group(1))
    on_disk = set()
    for d in sorted((ROOT / "skills").iterdir()):
        mf = d / "manifest.json"
        if not mf.is_file():
            continue
        if not json.loads(read(mf)).get("source"):
            on_disk.add(d.name)
    if listed == on_disk:
        ok(f"LOCAL_SKILLS 与「manifest 无 source」的 {len(on_disk)} 个技能完全一致: {sorted(on_disk)}")
    else:
        bad(
            "自研登记不一致 —— "
            f"漏登记（无 source 但不在 LOCAL_SKILLS，gen-manifest.py 会把它当第三方）：{sorted(on_disk - listed)}；"
            f"多登记（在 LOCAL_SKILLS 但 manifest 有 source）: {sorted(listed - on_disk)}"
        )


def main() -> int:
    for p in (GAME, APP):
        if not (p / "SKILL.md").is_file():
            print(f"[FAIL] 技能目录不存在: {p}")
            return 1
    print(f"镜像对齐检查: {GAME.name} ↔ {APP.name}\n")
    check_term_map_self_test()
    check_files()
    check_headings()
    check_ids()
    check_instructions()
    check_config_fields()
    check_scripts()
    check_blocklist()
    check_metadata()
    check_local_skills()
    print()
    if FAIL:
        print(f"✗ 结构漂移: FAIL={FAIL}（PASS={PASS}）—— 要么改内容对齐，要么把差异登记进本脚本的映射表")
        return 1
    print(f"✓ 两技能结构严格对齐（PASS={PASS}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
