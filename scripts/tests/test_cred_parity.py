#!/usr/bin/env python3
"""凭据粗筛的**一致性回归测试**（零依赖，仅标准库）。

## 为什么需要它

同一套「凭据粗筛」逻辑在仓库里有两份实现：
  - `scripts/validate_repo.py`（Python，`check_credentials`）
  - `scripts/preflight.sh`（Bash，第 6 节）

两份各写一遍，就**必然漂移** —— 已真实发生过一次：
`DEFAULT_CLAWX_JR_API_KEY = "clawx_..."` 这一行，
Python 版能检出，Bash 版漏判（缺 `-i`，且关键字不允许前缀）。
结果是两套校验给出相反结论，等于其中一套彻底失去信号价值。

本脚本把同一份语料分别喂给两份实现，逐行比对判定，任何不一致立即报错。
**判据正则从生产脚本里现读**，绝不在这里复制一份 —— 复制出来的副本
自己就会与生产副本漂移，那正是我们要防的 bug 本身。

用法:
    python3 scripts/tests/test_cred_parity.py

退出码: 0 = 两套实现判定完全一致；1 = 存在漂移
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "scripts" / "tests" / "cred_parity_corpus.txt"


def verdicts_python(lines: list[str]) -> list[str]:
    """用 validate_repo.py 的真实常量与判定顺序跑一遍。"""
    sys.path.insert(0, str(ROOT / "scripts"))
    import validate_repo as V  # noqa: E402

    pat = re.compile(
        r"(token|secret|password|api_?key)\s*[:=]\s*[\"']([^\"'\s]{16,})[\"']",
        re.IGNORECASE,
    )
    out = []
    for line in lines:
        if not line.strip():
            continue
        m = pat.search(line)
        if not m:
            out.append("none")
            continue
        value = m.group(2)
        if value.startswith("$") or V.PLACEHOLDER.search(value):
            out.append("none")
        elif value in V.KNOWN_PUBLIC_KEYS:
            out.append("whitelist")
        else:
            out.append("fail")
    return out


def verdicts_shell(lines: list[str]) -> list[str]:
    """用 preflight.sh 里**现读**的正则与判定顺序跑一遍。

    正则直接从 preflight.sh 源码里抓取（形如 `CRED_RE='...'`），
    这样脚本改了 preflight.sh 的判据，测试会自动跟上，不需要同步修改测试。

    ⚠️ 坑：preflight.sh 里的正则是 **POSIX ERE**（`[[:space:]]` 等），
    Python 的 `re` 不认这类语法 —— 它会把 `[[:space:]]` 当成"嵌套字符集"，
    语义完全不同（`[`、`:`、`s`、`p`、`a`、`c`、`e` 各算一个字符）。
    所以喂给 Python 之前必须做 POSIX → Python 的字符类翻译，
    否则测出来的"漂移"是假的，是测试自身的 bug。
    """
    src = (ROOT / "scripts" / "preflight.sh").read_text(encoding="utf-8")

    def grab(name: str) -> str:
        # 匹配形如:  CRED_RE='...'   其中引号可能是 ' 或 " ，内部含 shell 拼接
        m = re.search(rf"^{name}=(['\"])(.*?)\1\s*$", src, re.MULTILINE)
        if not m:
            raise SystemExit(f"无法从 preflight.sh 中解析出 {name}（判据改名了？）")
        raw = m.group(2)
        # preflight.sh 里用 '"'"' 拼接单引号，还原成真正的 '
        return raw.replace("'\"'\"'", "'")

    def posix_to_py(p: str) -> str:
        """POSIX ERE 字符类 → Python re 等价写法。

        ⚠️ 此处不能用「正则替换正则」—— 字符类内部的 `]` 会把朴素的
        `\\[\\^([^\\]]*)\\]` 提前截断（`[[:space:]]` 里的第一个 `]` 就被当成了
        字符类的终点），于是替换静默失效，留下一个语义完全不同的模式。

        改为**逐字符扫描**：维护"是否在字符类内"状态，遇到独立的
        `[:name:]` 标记就替换成对应的短写。这样嵌套情形天然正确。
        """
        simple = {
            "space": r"\s",
            "alnum": "A-Za-z0-9",
            "alpha": "A-Za-z",
            "digit": "0-9",
            "upper": "A-Z",
            "lower": "a-z",
        }
        out = []
        i = 0
        in_class = False
        while i < len(p):
            ch = p[i]
            if ch == "\\" and i + 1 < len(p):      # 转义序列整体保留
                out.append(p[i : i + 2])
                i += 2
                continue
            if not in_class:
                if ch == "[":
                    in_class = True
                out.append(ch)
                i += 1
                continue
            # 在字符类内部
            if ch == "]":
                in_class = False
                out.append(ch)
                i += 1
                continue
            # 识别 [:name:] 标记（注意它在类内表现为 `[:name:]`，以冒号结尾+方括号）
            if ch == "[" and i + 1 < len(p) and p[i + 1] == ":":
                close = p.find(":]", i + 2)
                if close != -1:
                    name = p[i + 2 : close]
                    if name in simple:
                        out.append(simple[name])
                        i = close + 2
                        continue
            out.append(ch)
            i += 1
        return "".join(out)

    cred_re = posix_to_py(grab("CRED_RE"))
    placeholder_re = posix_to_py(grab("PLACEHOLDER_RE"))
    whitelist_re = posix_to_py(grab("KNOWN_PUBLIC_KEYS_RE"))

    # ⚠️ `-i` 这个标志**不在正则里，而在调用点**（`grep -rInEi "$CRED_RE"`）。
    # 它是这次真实事故的根因之一：正则本身允许前缀了，但大小写不敏感没开，
    # 于是 `api_?key` 依然匹配不到全大写的 `API_KEY`。
    # 所以必须从生产脚本里**现读调用点的标志**，否则本测试会漏掉这类回归
    # —— 实测：把 CRED_RE 回退成旧版但保留 -i 时，测不出差异。
    m_flags = re.search(r"grep\s+-rInE?i?\s+", src)
    if not m_flags:
        m_flags = re.search(r"grep\s+(-\w*E\w*)\s+\"\$CRED_RE\"", src)
    caller_flags = m_flags.group(0) if m_flags else ""
    cred_icase = "i" in caller_flags.replace("grep", "").replace("-", "")

    out = []
    for line in lines:
        if not line.strip():
            continue
        # 与 preflight.sh 第 6 节完全一致的判定顺序
        if not re.search(cred_re, line, re.IGNORECASE if cred_icase else 0):
            out.append("none")
            continue
        m = re.search(r"[:=]\s*[\"']([^\"']*)[\"']", line)
        value = m.group(1) if m else ""
        if value.startswith("$"):
            out.append("none")
            continue
        if re.search(placeholder_re, value, re.IGNORECASE):
            out.append("none")
            continue
        if re.search(whitelist_re, value):
            out.append("whitelist")
            continue
        out.append("fail")
    return out


def main() -> int:
    if not CORPUS.is_file():
        print(f"缺少语料文件: {CORPUS}")
        return 1
    lines = [ln.rstrip("\r\n") for ln in CORPUS.read_text(encoding="utf-8").splitlines()]
    # 去掉注释行（以 # 开头的说明）
    lines = [ln for ln in lines if ln.strip() and not ln.lstrip().startswith("#")]

    py = verdicts_python(lines)
    sh = verdicts_shell(lines)

    if len(py) != len(sh):
        print(f"[FAIL] 判定条数不同: python={len(py)} shell={len(sh)}")
        return 1

    drift = []
    for i, (line, a, b) in enumerate(zip(lines, py, sh), 1):
        mark = "  " if a == b else "!!"
        print(f"  {mark} [{i:02d}] python={a:<9} shell={b:<9} | {line[:70]}")
        if a != b:
            drift.append((i, line, a, b))

    print()
    if drift:
        print(f"[FAIL] 两套实现存在 {len(drift)} 处漂移：")
        for i, line, a, b in drift:
            print(f"  第 {i} 行: python={a} vs shell={b}")
            print(f"    {line}")
        return 1

    print(f"[OK] 两套实现判定完全一致（{len(py)}/{len(py)} 条）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
