#!/usr/bin/env python3
"""镜像对齐守卫的**反向回归**：证明它「不是空转」。

一个永远返回成功的守卫比没有守卫更糟 —— 它会让人以为结构受保护了。
所以每类判据都故意注入一处漂移，确认守卫真的报 FAIL。

## 实现要点

- 用 `importlib` 把守卫当模块加载，**改写它的 `ROOT`/`GAME`/`APP` 指向 temp 镜像**后调用
  `main()`，全程一个解释器进程跑完 17 轮。
  最初写成「每轮 cp 一遍镜像再起一个 python」，Windows 上进程启动占大头，要 64 秒；
  现在 ~2 秒。守卫本身一行不改（它读的还是被注入过的那份镜像）。
- 篡改只改「这一轮要改的那个文件」，改完从真仓库拷回 —— 不删目录
  （本机 `rm -rf` 会走安全删除 trash 重试，17 轮要 3 分 40 秒）。
- 注入点用 `assert 原文 in 文本` 把关：注入点写错要报「注入失败」，而不是伪装成「守卫没抓到」。

## 用法

    python3 scripts/tests/test-skill-parity-negatives.py

退出码: 0 = 每处注入漂移都被抓到；1 = 有漂移没被抓到（守卫空转）
"""
from __future__ import annotations

import contextlib
import importlib.util
import io
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GUARD_REL = "scripts/tests/test-skill-parity.py"
GUARD_SRC = ROOT / GUARD_REL
MIRROR = ROOT / "temp" / "parity-mirror"

APP = "skills/app-dev-workflow"
GAME = "skills/game-dev-workflow"


def read(p: Path) -> str:
    return io.open(p, encoding="utf-8", newline="").read()


def write(p: Path, text: str) -> None:
    io.open(p, "w", encoding="utf-8", newline="").write(text)


def sub(root: Path, rel: str, old: str, new: str, count: int = 1) -> None:
    p = root / rel
    t = read(p)
    assert old in t, f"注入点不存在于 {rel}: {old!r}"
    write(p, t.replace(old, new, count))


def append(root: Path, rel: str, extra: str) -> None:
    write(root / rel, read(root / rel) + extra)


def sub_re(root: Path, rel: str, pat: str, repl: str) -> None:
    p = root / rel
    t = read(p)
    t2 = re.sub(pat, repl, t, count=1, flags=re.M)
    assert t2 != t, f"注入点不存在于 {rel}: /{pat}/"
    write(p, t2)


def load_guard(root: Path):
    spec = importlib.util.spec_from_file_location("_parity_guard", root / GUARD_REL)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    m.ROOT = root
    m.GAME = root / "skills" / "game-dev-workflow"
    m.APP = root / "skills" / "app-dev-workflow"
    return m


def move_short_before_long(r: Path) -> None:
    """把短词 `界面` 挪到长词 `界面设计` 之前 —— 顺序自检必须报错。"""
    sub(r, GUARD_REL, '    ("界面", "页面"),\n', "")
    sub(r, GUARD_REL, "TERM_MAP = [\n", 'TERM_MAP = [\n    ("界面", "页面"),\n')


# 每个用例：(描述, 本轮篡改的文件, 篡改动作, 期望首个 FAIL 行里出现的标记)
# `标记` 很关键：只比对退出码是不够的 —— 上一轮没还原干净时，后面每轮都会「因别的原因」
# 返回 1，看着全绿，实际守卫早被绕过（本脚本第一版就栽在这，roles.md 之后 12 条全假阳）。
CASES: list[tuple[str, list[str], object, str]] = [
    (
        "app 侧删掉一个标题 → 标题骨架",
        [f"{APP}/references/templates/design-visual.md"],
        lambda r: sub(r, f"{APP}/references/templates/design-visual.md", "## 3. 页面设计", "## 3. "),
        "design-visual.md 标题骨架漂移",
    ),
    (
        "app 侧标题被改字 → 标题骨架归一化不中",
        [f"{APP}/references/templates/design-visual.md"],
        lambda r: sub(r, f"{APP}/references/templates/design-visual.md", "响应式与适配", "响应式适配"),
        "design-visual.md 标题骨架漂移",
    ),
    (
        "app 侧角色名改字 → 标题骨架",
        [f"{APP}/references/roles.md"],
        lambda r: sub(r, f"{APP}/references/roles.md", "## 开发 Developer", "## 研发 Developer"),
        "roles.md 标题骨架漂移",
    ),
    (
        "app 侧改掉一个指令名 → 指令集与 §锚点",
        [f"{APP}/SKILL.md"],
        lambda r: sub(r, f"{APP}/SKILL.md", "| `lesson` |", "| `lesson-typo` |"),
        "指令集/锚点不一致",
    ),
    (
        "app 侧残留 art-design → 领域词块名单",
        [f"{APP}/references/operations.md"],
        lambda r: sub(r, f"{APP}/references/operations.md", "design-visual", "art-design"),
        "game 专属 词",
    ),
    (
        "app 侧混入游戏词「音效」→ 领域词块名单",
        [f"{APP}/references/pipeline.md"],
        lambda r: append(r, f"{APP}/references/pipeline.md", "\n- 音效位待补\n"),
        "game 专属 词",
    ),
    (
        "game 侧混入应用词「首屏」→ 领域词块名单（反向）",
        [f"{GAME}/references/pipeline.md"],
        lambda r: append(r, f"{GAME}/references/pipeline.md", "\n- 首屏可交互预算待定\n"),
        "app 专属 词",
    ),
    (
        "app 侧 CONFIG 字段退回 engine → CONFIG 字段",
        [f"{APP}/scripts/af.sh"],
        lambda r: sub(r, f"{APP}/scripts/af.sh", "- stack:", "- engine:"),
        "CONFIG 字段",
    ),
    (
        "app 侧子命令改名 → 子命令集",
        [f"{APP}/scripts/af.sh"],
        lambda r: sub(r, f"{APP}/scripts/af.sh", "af.sh init", "af.sh boot"),
        "af.sh 标题骨架漂移",
    ),
    (
        "app manifest version 与 CHANGELOG 脱节 → 元信息",
        [f"{APP}/manifest.json"],
        lambda r: sub(r, f"{APP}/manifest.json", '"version": "1.0.0"', '"version": "9.9.9"'),
        "version",
    ),
    (
        "app SKILL.md 与 manifest description 漂移 → 元信息",
        [f"{APP}/SKILL.md"],
        lambda r: sub_re(r, f"{APP}/SKILL.md", r"^description: .+$", "description: 改坏了"),
        "description 漂移",
    ),
    (
        "漏登记自研技能 → LOCAL_SKILLS 登记",
        ["scripts/gen-manifest.py"],
        lambda r: sub_re(r, "scripts/gen-manifest.py", r"LOCAL_SKILLS = \{.*\}", 'LOCAL_SKILLS = {"hello-plugin", "lucky-api"}'),
        "自研登记不一致",
    ),
    (
        "映射表塞进 game 侧不存在的词 → 映射表自检",
        [GUARD_REL],
        lambda r: sub(r, GUARD_REL, '    ("玩法", "功能"),', '    ("玩法", "功能"),\n    ("查无此词", "x"),'),
        "根本不存在",
    ),
    (
        "短词被排到长词之前 → 映射表顺序自检",
        [GUARD_REL],
        move_short_before_long,
        "顺序错误",
    ),
    (
        "app 侧痕迹目录名被改 → 标题骨架与映射表自检",
        [f"{APP}/references/trace-spec.md"],
        lambda r: sub(r, f"{APP}/references/trace-spec.md", ".appflow", ".app-flow"),
        "trace-spec.md 标题骨架漂移",
    ),
    (
        "app 侧门禁 ID 被改 → 门禁 ID 集合",
        [f"{APP}/references/knowledge/checklists.md"],
        lambda r: sub(r, f"{APP}/references/knowledge/checklists.md", "## G4 ", "## G44 "),
        "checklists.md 标题骨架漂移",
    ),
]

# 所有会被篡改的文件：每轮开始**全部还原**（只还原本轮目标是不够的，
# 上一轮的残留会让后续每轮都「因别的原因」失败，从而掩盖守卫失效）
MUTABLE = sorted({rel for _, targets, _, _ in CASES for rel in targets})


def build_mirror() -> None:
    if MIRROR.exists():
        shutil.rmtree(MIRROR)
    (MIRROR / "skills").mkdir(parents=True)
    for name in ("game-dev-workflow", "app-dev-workflow"):
        shutil.copytree(ROOT / "skills" / name, MIRROR / "skills" / name, dirs_exist_ok=True)
    (MIRROR / "scripts" / "tests").mkdir(parents=True)
    shutil.copy2(ROOT / "scripts" / "gen-manifest.py", MIRROR / "scripts" / "gen-manifest.py")
    shutil.copy2(GUARD_SRC, MIRROR / GUARD_REL)
    # 其余技能目录只需 manifest.json 的存在性（LOCAL_SKILLS 判据要扫全部技能）
    for d in sorted((ROOT / "skills").iterdir()):
        if d.name in ("game-dev-workflow", "app-dev-workflow") or not (d / "manifest.json").is_file():
            continue
        (MIRROR / "skills" / d.name).mkdir(parents=True, exist_ok=True)
        shutil.copy2(d / "manifest.json", MIRROR / "skills" / d.name / "manifest.json")


def run_guard() -> tuple[int, str]:
    m = load_guard(MIRROR)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = m.main()
    return rc, buf.getvalue()


def main() -> int:
    if not GUARD_SRC.is_file():
        print(f"找不到守卫: {GUARD_SRC}")
        return 1
    print(f"== 镜像对齐守卫反向回归: {GUARD_REL} ==")
    build_mirror()
    print("-- 基线 --")
    rc, _ = run_guard()
    if rc != 0:
        print(f"  [FAIL] 镜像未注入漂移却不是全绿（rc={rc}）—— 镜像构建有问题，先修这里")
        return 1
    print("  [ok]   镜像未注入漂移时全绿（证明镜像本身可用）")

    print("-- 注入漂移: 每条都必须被抓到，且首条 FAIL 必须指向该注入点 --")
    npass = 0
    nfail = 0
    for desc, targets, mutate, marker in CASES:
        for rel in MUTABLE:  # 全部还原，杜绝上一轮残留把本轮结论搞假
            (MIRROR / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / rel, MIRROR / rel)
        try:
            mutate(MIRROR)
        except AssertionError as e:
            nfail += 1
            print(f"  [FAIL] {desc} —— 注入失败（回归脚本自身问题，不是守卫问题）: {e}")
            continue
        rc, out = run_guard()
        first = next((ln.strip() for ln in out.splitlines() if ln.strip().startswith("[FAIL]")), "")
        if rc != 1:
            nfail += 1
            print(f"  [FAIL] {desc} —— 期望 rc=1，实得 rc={rc}（守卫没抓到）")
        elif marker not in first:
            nfail += 1
            print(f"  [FAIL] {desc} —— 守卫报错了，但不是因该注入点（期望含「{marker}」），首条: {first[:90]}")
        else:
            npass += 1
            print(f"  [ok]   {desc}  ← {first[max(0, first.find(marker) - 30):][:80]}")

    shutil.rmtree(MIRROR, ignore_errors=True)
    print()
    if nfail:
        print(f"✗ 有 {nfail} 项未达预期 —— 守卫可能存在空转，必须修守卫（PASS={npass}）")
        return 1
    print(f"✓ 反向回归通过: {npass + 1} 项（基线 1 + 注入 {npass} 条），守卫无空转")
    return 0


if __name__ == "__main__":
    sys.exit(main())
