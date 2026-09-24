#!/usr/bin/env python3
"""宿主路径守卫（`validate_repo.py` 的 2.10）的**反向回归**：证明它「不是空转」。

## 为什么必须补这个

`check_host_path_not_hardcoded` 是 2026-09-21 事故的防线，但它**一直只有「当前恰好
通过」这一条保障** —— 没有任何测试证明「注入一处写死默认值，它真的会 FAIL」。
而它偏偏还失明过一次（2026-09-23）：判据只认
`${...profile...:-/绝对路径}`，于是

    MCP_CONFIG="${MCP_CONFIG:-$HOME/.workbuddy/mcp.json}"      ← 回退值是 $HOME，不是 /
    DEFAULT_CONFIG = Path.home() / ".workbuddy" / "mcp.json"   ← .py 根本不在扫描范围

**一个失明过的守卫，更需要证明它现在看得见。**

## 样例数据放在 `host-path-guard-cases.json`

坏写法本身**不能**写在本文件里：本文件是 `.py`，守卫会扫它、并抓到这些字符串
字面量。唯一的绕开办法是给 `scripts/tests/` 开豁免 —— 那等于新增一块盲区。
把样例降级成「数据」既保住守卫的全量覆盖，也让样例矩阵变成声明式的。
同类先例：`scripts/tests/cred_parity_corpus.txt`。

## 实现要点

- `importlib` 加载 `validate_repo.py`，在 **temp 夹具仓库**上直接调
  `check_host_path_not_hardcoded()`，全程一个解释器进程跑完。
- 夹具里**必须**放齐 `scripts/lib/resolve-profile.sh` 与两个 source 它的脚本：
  否则 (b)/(c) 两段会各自 `bad()` 一次，FAIL 计数被污染 —— 注入的那轮就会
  「因为别的原因」通过，测出假绿。
- **每轮开始前重置夹具**到已知状态，且断言 `FAIL` 恰好等于本轮预期、报错行
  **命中本轮注入点**。只断言「FAIL > 0」不够：上一轮残留会让后续每轮绿（栽过，
  16 条里 12 条假绿）。
- 每轮重置守卫模块的 `PASS/FAIL/WARN` 计数器。
- **入口用 `exec(compile(源码文本))` 而不是 `importlib`**：后者会读
  `scripts/__pycache__/*.pyc`，实测本文件就撞过一次假绿（判据已改窄，测试仍全绿）。
  测试一旦对着旧代码跑，它证明的就不是磁盘上那份守卫。
- 末尾有一轮**自校验**：在内存里把判据改窄回失明状态，确认注入**抓不到** ——
  以此排除「FAIL=1 其实是因为夹具另有毛病」这种巧合成功。

## 用法

    python3 scripts/tests/test-host-path-guard.py

退出码: 0 = 全部符合预期；1 = 有不符合（守卫空转或判据漂移）
"""
from __future__ import annotations

import contextlib
import io
import json
import shutil
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GUARD_SRC = ROOT / "scripts" / "validate_repo.py"
CASES = ROOT / "scripts" / "tests" / "host-path-guard-cases.json"
FIXTURE = ROOT / "temp" / "host-path-fixture"

# 只在「跳过目录」那一轮用到的额外文件
EXTRA_FILES = (".git/hook.sh", "temp/draft.py", "node_modules/pkg/index.py")

PASS = 0
FAIL = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  [OK]   {name}")
    else:
        FAIL += 1
        print(f"  [FAIL] {name}")
        if detail:
            for line in detail.splitlines():
                print(f"         {line}")


def write(p: Path, text: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    io.open(p, "w", encoding="utf-8", newline="\n").write(text)


def build_fixture(root: Path) -> None:
    """最小但**完整**的夹具仓库：让 (a)(b)(c) 三段各有其位，互不串味。"""
    if root.exists():
        shutil.rmtree(root, ignore_errors=True)
    write(
        root / "scripts" / "lib" / "resolve-profile.sh",
        "#!/usr/bin/env bash\n"
        "# profile 解析的唯一实现（夹具）\n"
        "resolve_dsh_profile_dir() {\n"
        "    printf '%s\\n' \"${PROFILE_DIR:-}\"\n"
        "}\n",
    )
    for rel in ("scripts/install-to-profile.sh", "scripts/uninstall-from-profile.sh"):
        write(
            root / rel,
            "#!/usr/bin/env bash\n"
            ". \"$(dirname \"${BASH_SOURCE[0]}\")/lib/resolve-profile.sh\"\n"
            "resolve_dsh_profile_dir\n",
        )


def reset(root: Path, payloads: dict) -> None:
    """把夹具恢复到已知的干净状态 —— 每轮都从同一个起点出发。"""
    write(root / "scripts" / "sample.sh", payloads["shell_clean"])
    write(root / "scripts" / "sample.py", payloads["py_clean"])
    for rel in EXTRA_FILES:
        p = root / rel
        if p.exists():
            p.unlink()


def load_guard():
    """加载守卫模块 —— **直接 exec 源码文本**，不经 importlib 的字节码缓存。

    ⚠️ 为什么不用 `importlib.util.spec_from_file_location`（本仓库别处这么用）：
    它走 `SourceLoader.get_code`，会读 `scripts/__pycache__/*.pyc`。实测本文件
    就撞过一次假绿 —— 把判据改窄到 2026-09-23 之前的失明状态后，测试仍然全绿
    （磁盘上留着 Sep 18 的陈旧 `.pyc`）。而**测试一旦会对着旧代码跑，它证明的
    就不是磁盘上那份守卫**，整份回归的意义就没了。

    这里只保证一件事：跑的就是 `GUARD_SRC` 当前的内容。
    """
    src = io.open(GUARD_SRC, encoding="utf-8").read()
    mod = types.ModuleType("_validate_guard")
    mod.__file__ = str(GUARD_SRC)
    exec(compile(src, str(GUARD_SRC), "exec"), mod.__dict__)
    return mod


def run(guard, root: Path) -> tuple[int, str]:
    """跑一轮守卫，返回 (FAIL 计数, 全部 stdout)。"""
    guard.PASS = guard.FAIL = guard.WARN = 0
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        guard.check_host_path_not_hardcoded(root)
    return guard.FAIL, buf.getvalue()


def main() -> int:
    guard = load_guard()
    cases = json.loads(io.open(CASES, encoding="utf-8").read())
    P = cases["payloads"]
    build_fixture(FIXTURE)
    reset(FIXTURE, P)
    print(f"夹具: {FIXTURE.relative_to(ROOT).as_posix()}")

    # ---------- 基线 ----------
    print("\n[基线] 无注入")
    reset(FIXTURE, P)
    n, out = run(guard, FIXTURE)
    check("干净夹具 0 失败", n == 0, out)
    check("干净夹具报出「均为运行时探测」", "均为运行时探测" in out, out)
    check("夹具里没有登记项时，报「已知豁免名单为空」",
          "已知豁免名单为空" in out, out)

    # ---------- 注入类：必须被抓到 ----------
    for case in cases["must_catch"]:
        print(f"\n[注入] {case['name']}")
        reset(FIXTURE, P)
        rel = case["file"]
        write(FIXTURE / rel, P[case["payload"]])
        n, out = run(guard, FIXTURE)
        hit = f"{rel}:" in out
        check(f"抓到（FAIL=1，且报错行命中 {rel}）", n == 1 and hit,
              out if not (n == 1 and hit) else "")

    # ---------- 自校验：判据被改窄时，注入必须抓不到 ----------
    # 「抓到了」有两种可能：真抓到了，或夹具里另有毛病凑巧让 FAIL=1。
    # 把判据**在内存里**改窄回 2026-09-23 之前的失明状态（回退值只认 `/` 开头、
    # 变量名名单匹配不到任何东西 ≈ `.py` 那一路失效），此时除形态①外都必须放行。
    # 全程不动磁盘 —— 比「临时改源码再还原」可信得多，也不会留下残留。
    print("\n[自校验] 判据改窄回失明状态 → 注入必须抓不到（证明上面的「抓到」不是巧合）")
    import re as _re

    guard._HOST_ROOT_VALUE_RE = _re.compile(
        r"^(?:/vol\d|/volume\d|/mnt/|/srv/|/opt/)")
    guard._HOST_ROOT_VAR_NAMES = r"(?!)"  # 匹配任何东西都失败
    for case in cases["must_catch"]:
        reset(FIXTURE, P)
        write(FIXTURE / case["file"], P[case["payload"]])
        n, _out = run(guard, FIXTURE)
        is_form1 = case["payload"] == "shell_profile_abs"
        # 形态①走的是另一条正则（HARDCODED_HOST_PATH_RE），改窄后它仍应被抓到 ——
        # 这同时证明「改窄」是**选择性**生效的，不是把守卫整个打瘫了。
        want = 1 if is_form1 else 0
        check(f"{case['name']}：改窄后 FAIL={want}", n == want, f"实际 FAIL={n}")
    guard = load_guard()  # 恢复完整判据

    # ---------- 去重：同一处默认值不许报两遍 ----------
    # `${PROFILE_DIR:-/vol2/...}` 同时满足形态①（名字含 PROFILE + 绝对路径）与
    # 形态②（名字命中 + 数据卷根）。两处各报一次，看报告的人会以为有两个问题。
    print("\n[去重] 同一处默认值只报一次（形态①与②会同时命中）")
    reset(FIXTURE, P)
    write(FIXTURE / "scripts" / "sample.sh",
          "#!/usr/bin/env bash\n" + P["shell_profile_abs_line"])
    n, out = run(guard, FIXTURE)
    times = out.count("sample.sh:2  [PROFILE_DIR]")
    check("同一条默认值只报一次", n == 1 and times == 1,
          f"FAIL={n}，该行出现 {times} 次\n{out}")

    # ---------- 放行类：不许误报 ----------
    for case in cases["must_pass"]:
        print(f"\n[放行] {case['name']}")
        reset(FIXTURE, P)
        write(FIXTURE / case["file"], P[case["payload"]])
        n, out = run(guard, FIXTURE)
        check("不产生 FAIL", n == 0, out)

    # ---------- 已知豁免：只 WARN ----------
    print("\n[豁免] 名单内登记项只 WARN，不 FAIL")
    reset(FIXTURE, P)
    write(FIXTURE / "scripts" / "update-and-install.sh", P["shell_known_exempt"])
    n, out = run(guard, FIXTURE)
    check("豁免名单里的项不产生 FAIL", n == 0, out)
    check("豁免名单里的项被报为 WARN 并带原因",
          "[warn]" in out and "已知豁免" in out, out)

    print("\n[豁免] 按「文件 + 变量名」精确匹配，不是整文件豁免")
    reset(FIXTURE, P)
    write(FIXTURE / "scripts" / "update-and-install.sh",
          P["shell_known_exempt_plus_new"])
    n, out = run(guard, FIXTURE)
    check("同一文件里换个变量名仍被抓（FAIL=1）", n == 1, out)
    check("报错行指向新增的那个变量", "MCP_CONFIG" in out, out)

    # ---------- 跳过目录 ----------
    print("\n[跳过] .git / temp / node_modules 下的违规不算")
    reset(FIXTURE, P)
    write(FIXTURE / "scripts" / "sample.sh", P["shell_mcp_home"])   # 唯一真实违规
    write(FIXTURE / ".git" / "hook.sh", P["shell_git_violation"])
    write(FIXTURE / "temp" / "draft.py", P["py_violation"])
    write(FIXTURE / "node_modules" / "pkg" / "index.py", P["py_violation"])
    n, out = run(guard, FIXTURE)
    check("只有 sample.sh 被报（FAIL=1）", n == 1, out)
    check("三个跳过目录都没出现在报错里",
          ".git/" not in out and "temp/draft" not in out and "node_modules" not in out,
          out)

    # ---------- 行号可定位 ----------
    print("\n[位置] 报出的行号要指向真实文件里那一行")
    # 前面垫 40 行注释：剔注释若「删行」而不是「置空」，行号会提前 40
    reset(FIXTURE, P)
    padding = "".join(f"# 填充注释 {i}\n" for i in range(40))
    write(FIXTURE / "scripts" / "sample.sh",
          "#!/usr/bin/env bash\n" + padding + P["shell_mcp_home_line"])
    n, out = run(guard, FIXTURE)
    want = 42  # shebang(1) + 40 行填充(2..41) + 违规行(42)
    check(f"行号指向真实第 {want} 行（剔注释保行号）",
          f"sample.sh:{want}" in out, out)

    print(f"\n=== 结果 ===\n  通过: {PASS}    失败: {FAIL}")
    if FAIL:
        print("\n存在失败项：守卫可能空转，或判据已被改动。")
        return 1
    print("\n全部符合预期。")
    shutil.rmtree(FIXTURE, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
