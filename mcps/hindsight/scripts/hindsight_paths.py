#!/usr/bin/env python3
"""hindsight 的**落点探测**（MCP 配置文件 + 自愈日志）—— 本仓库唯一实现。

## 为什么单独抽一个文件

`apply_to_config.py` 和 `selfheal.sh` 都先要知道「配置文件在哪」。历史上两边各自
写死了一份默认值：

    apply_to_config.py   DEFAULT_CONFIG = Path.home() / ".workbuddy" / "mcp.json"
    selfheal.sh          MCP_CONFIG="${MCP_CONFIG:-$HOME/.workbuddy/mcp.json}"
                         LOG="${SELFHEAL_LOG:-$HOME/.workbuddy/hindsight_selfheal.log}"

两份都违反本仓库铁律：**宿主路径必须运行时探测，绝不写死宿主数据根，尤其别写 `~`
开头**（容器里 `os.homedir()` 是 `/root`，几乎不可能等于挂载进来的数据卷）。

在 NAS / DSH 上这两份默认值都指向一个不存在的文件，表现是：

    apply_to_config.py → 退出码 3「配置文件不存在」
    selfheal.sh        → 退出码 1「配置文件不存在」

而用户从报错里**看不出「正确的文件其实在别处」** —— 与 2026-09-21 那次
`profile` 路径写死同一个病：**把「某台机器观察到的事实」当成了「普适默认值」**。

所以把「落点怎么算」收成唯一实现，两个调用方都来问它，谁都不许再自己算一份。

## 探测顺序（配置文件）

    1. --config                命令行显式指定
    2. $MCP_CONFIG             环境变量
    3. $DSH_MCP_CONFIG         环境变量
    4. $DSH_HOME 子树          按**内容特征**找（含 `mcpServers` 键的 json）
    5. $WORKBUDDY_HOME/mcp.json
    6. ~/.workbuddy/mcp.json   仅作为**候选**出现，不是默认值

⚠️ 第 4 步**不猜文件名** —— 本仓库从未确认过 DSH 的 MCP 配置叫什么名字，按内容
特征找比按名字猜更稳，且**可自证**（报告扫了多少文件、命中几个）。`$DSH_HOME`
一旦设置即权威：只在它的子树里挑，**不跨到 `~`**；没设就如实说「跳过」，不猜。

## 日志落点

    $SELFHEAL_LOG > <配置文件所在目录>/hindsight_selfheal.log

本机解析到 `~/.workbuddy/mcp.json` 时日志仍是 `~/.workbuddy/hindsight_selfheal.log`
（与原行为一致）；DSH 上则自然落到 `$DSH_HOME` 一侧，不再写进容器内的 `/root`。

## 自证

`--explain` 打印**全部候选 + 各自检查结果**，把「像不像真正的落点」变成可读的事实。
只打印结论而不打印「我找过哪些地方、各自是什么状态」的报错，正是上面那个坑。

## 用法

    python3 hindsight_paths.py --show-config   # 只打印生效的配置文件路径
    python3 hindsight_paths.py --show-log      # 只打印日志路径
    python3 hindsight_paths.py --explain       # 人读的完整探测报告
    python3 hindsight_paths.py --json          # 结构化输出
    python3 hindsight_paths.py --config <路径>  # 显式指定（调试用，同 apply_to_config.py）

退出码：0 = 找到可用落点 · 3 = 没有任何可用候选（不会静默返回一个假的默认值）
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import unicodedata
from pathlib import Path

SERVER_NAME = "hindsight"
CONFIG_FILENAME = "mcp.json"
LOG_FILENAME = "hindsight_selfheal.log"

# 在 $DSH_HOME 子树里搜索时的边界：数据卷上不能做无界遍历
_SEARCH_MAX_DEPTH = 4
_SEARCH_MAX_FILES = 4000
_SEARCH_MAX_BYTES = 1 << 20  # 1MB，超过不当 MCP 配置
_SEARCH_SKIP_DIRS = frozenset({
    ".git", "node_modules", "dsh-runtime", "__pycache__", ".venv", "venv",
    "dist", "build", ".cache", "cache",
})

# 「探测结果」字段集：候选行与命中行共用同一套，便于打印与 JSON 化
_PROBE_KEYS = (
    "exists", "parsed", "has_mcpServers", "server_count", "has_server", "error",
)

# 显式来源：给了就照办（哪怕文件不存在，也不改选别处）—— 用户的意志优先于启发式
_AUTHORITATIVE_TAGS = ("--config", "$MCP_CONFIG", "$DSH_MCP_CONFIG")

# 目录里优先按惯例名找，找不到再按内容特征
_LIKELY_NAMES = (CONFIG_FILENAME, ".mcp.json", "mcpServers.json", "mcp-config.json")


def expand_path(raw: str) -> Path:
    """展开 `~` 与 `$VAR` / `%VAR%` —— 配置里三种都可能出现。"""
    return Path(os.path.expandvars(os.path.expanduser(raw)))


def probe_config_file(path: Path) -> dict:
    """如实检查一个候选：存在？合法 JSON？有 mcpServers？有 hindsight 条目？"""
    r = dict.fromkeys(_PROBE_KEYS)
    r.update(exists=False, parsed=False, has_mcpServers=False,
             server_count=0, has_server=False, error=None)
    if not path.is_file():
        return r
    r["exists"] = True
    try:
        data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    except OSError as e:
        r["error"] = f"无法读取: {e}"
        return r
    except json.JSONDecodeError as e:
        r["error"] = f"非合法 JSON: {e}"
        return r
    r["parsed"] = True
    servers = data.get("mcpServers") if isinstance(data, dict) else None
    if isinstance(servers, dict):
        r["has_mcpServers"] = True
        r["server_count"] = len(servers)
        r["has_server"] = SERVER_NAME in servers
    return r


def _probe_subset(d: dict) -> dict:
    return {k: d[k] for k in _PROBE_KEYS}


def search_tree(root: Path) -> tuple[list[dict], int, bool]:
    """在 root 子树里按**内容特征**找 MCP 配置。

    返回 `(命中列表, 已扫描 .json 数, 是否因达上限被截断)`。
    命中按「是否含 hindsight 条目」优先排序 —— 同名配置有多份时先看最相关的那份。
    """
    hits: list[dict] = []
    scanned = 0
    if not root.is_dir():
        return hits, scanned, False

    for dirpath, dirnames, filenames in os.walk(root):
        here = Path(dirpath)
        try:
            depth = len(here.relative_to(root).parts)
        except ValueError:
            continue
        if depth >= _SEARCH_MAX_DEPTH:
            dirnames[:] = []
            continue
        dirnames[:] = sorted(d for d in dirnames if d not in _SEARCH_SKIP_DIRS)

        for fn in sorted(filenames):
            if not fn.endswith(".json"):
                continue
            scanned += 1
            if scanned > _SEARCH_MAX_FILES:
                return hits, scanned, True
            f = here / fn
            try:
                if f.stat().st_size > _SEARCH_MAX_BYTES:
                    continue
                text = f.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            # 子串预筛，避免对每个 json 都做一次解析
            if '"mcpServers"' not in text:
                continue
            probe = probe_config_file(f)
            if probe["has_mcpServers"]:
                hits.append({"path": f, **_probe_subset(probe)})

    hits.sort(key=lambda h: (not h["has_server"], str(h["path"])))
    return hits, scanned, False


def locate_in_dir(directory: Path) -> Path | None:
    """给一个目录，找里面的 MCP 配置文件：先惯例名，再内容特征。"""
    if not directory.is_dir():
        return None
    for name in _LIKELY_NAMES:
        p = directory / name
        if p.is_file() and probe_config_file(p)["has_mcpServers"]:
            return p
    hits, _, _ = search_tree(directory)
    return hits[0]["path"] if hits else None


def config_candidates(explicit: str | None = None, env: dict | None = None) -> list[dict]:
    """按优先级列出**全部**候选，并如实报告各自状态（不判断谁生效）。"""
    e = os.environ if env is None else env
    cands: list[dict] = []

    def add(tag: str, source: str, raw: str | None) -> None:
        if not raw:
            cands.append({"tag": tag, "source": source, "path": None,
                          "skip": "未设置", **_probe_subset(dict.fromkeys(_PROBE_KEYS, False))})
            return
        p = expand_path(raw)
        if p.is_dir():
            found = locate_in_dir(p)
            if found is None:
                cands.append({"tag": tag, "source": source + "（给的是目录，里面没找到配置）",
                              "path": p, "skip": None,
                              **_probe_subset(dict.fromkeys(_PROBE_KEYS, False))})
                return
            p = found
        cands.append({"tag": tag, "source": source, "path": p, "skip": None,
                      **_probe_subset(probe_config_file(p))})

    # 1~3：显式来源
    add("--config", "命令行显式指定", explicit)
    add("$MCP_CONFIG", "环境变量", e.get("MCP_CONFIG"))
    add("$DSH_MCP_CONFIG", "环境变量", e.get("DSH_MCP_CONFIG"))

    # 4：DSH —— $DSH_HOME 存在即权威，只在它的子树里挑
    dsh_home = e.get("DSH_HOME")
    if not dsh_home:
        cands.append({"tag": "$DSH_HOME 子树",
                      "source": "$DSH_HOME 未设置 → 跳过（不猜宿主数据根）",
                      "path": None, "skip": "未设置",
                      **_probe_subset(dict.fromkeys(_PROBE_KEYS, False))})
    else:
        root = expand_path(dsh_home)
        if not root.is_dir():
            # $DSH_HOME 已设置 ⇒ 权威来源，即使目录暂时不存在也**不偏离到 ~**。
            # （仓库既有判据：权威来源一旦存在即权威，空着也不偏离 —— 否则
            #  「智能纠偏」反而把配置写到另一个错地方。这里只如实记下异常。）
            cands.append({"tag": "$DSH_HOME 子树",
                          "source": f"$DSH_HOME={dsh_home} 当前不是目录（权威来源，仍以此为准）",
                          "path": root / CONFIG_FILENAME, "skip": None,
                          "proposed": True,
                          **_probe_subset(dict.fromkeys(_PROBE_KEYS, False))})
        else:
            hits, scanned, truncated = search_tree(root)
            detail = f"扫描 {scanned} 个 .json，命中 {len(hits)} 个"
            if truncated:
                detail += f"（超过 {_SEARCH_MAX_FILES} 个上限已截断）"
            if hits:
                for i, h in enumerate(hits):
                    cands.append({"tag": f"$DSH_HOME 子树#{i + 1}", "source": detail,
                                  "path": h["path"], "skip": None, **_probe_subset(h)})
            else:
                # 找到了空 —— 记下「建议位置」，但标 @proposed，选它时会明确喊出来
                cands.append({"tag": "$DSH_HOME 子树", "source": detail + "（未找到现成配置）",
                              "path": root / CONFIG_FILENAME, "skip": None,
                              "proposed": True,
                              **_probe_subset(dict.fromkeys(_PROBE_KEYS, False))})

    # 5：WorkBuddy（环境变量）
    wb_home = e.get("WORKBUDDY_HOME")
    if wb_home:
        add("$WORKBUDDY_HOME", "环境变量", str(expand_path(wb_home) / CONFIG_FILENAME))
    else:
        cands.append({"tag": "$WORKBUDDY_HOME", "source": "未设置 → 跳过",
                      "path": None, "skip": "未设置",
                      **_probe_subset(dict.fromkeys(_PROBE_KEYS, False))})

    # 6：WorkBuddy 用户级默认位置（**只是候选**，不是默认值）
    add("~/.workbuddy", "WorkBuddy 用户级位置", str(Path("~") / ".workbuddy" / CONFIG_FILENAME))
    return cands


def resolve_config_path(explicit: str | None = None, env: dict | None = None) -> dict:
    """选出生效落点。

    返回 `{"path", "source", "candidates", "warnings", "has_server"}`。
    选不出来时 `path=None` —— 绝不静默返回一个假的默认值。
    """
    cands = config_candidates(explicit, env)
    warnings: list[str] = []

    chosen: dict | None = None

    # ① 显式来源优先，且**不因文件不存在而改选别处**（用户的意志 > 启发式）
    for c in cands:
        if c["tag"] in _AUTHORITATIVE_TAGS and c["path"] is not None:
            chosen, src = c, f"{c['tag']}（{c['source']}）"
            if not c["exists"]:
                warnings.append(f"{c['tag']} 指定的配置文件不存在：{c['path']}")
            elif c["error"]:
                warnings.append(f"{c['path']} 不可用：{c['error']}")
            break

    # ② 第一个**真实存在**的候选。
    # ⚠️ `$DSH_HOME` 已设置 ⇒ 权威来源，候选池**只留 DSH 侧**，不跨到 ~。
    #    否则会踩到本 bug 自己留下的残留：容器里 `~/.workbuddy/mcp.json`
    #    往往正是被写死默认值造出来的那份，恰好在**错误的位置**存在。
    dsh_authoritative = any(
        c["tag"].startswith("$DSH_HOME 子树") and c["skip"] is None for c in cands)
    pool = ([c for c in cands if c["tag"].startswith("$DSH_HOME 子树")]
            if dsh_authoritative else cands)

    if chosen is None:
        for c in pool:
            if c["path"] is not None and c["exists"]:
                chosen, src = c, f"{c['tag']}（{c['source']}）"
                if c["error"]:
                    warnings.append(f"{c['path']} 存在但解析失败：{c['error']}")
                break

    # ③ 全都不存在：给「最可能的落点」，但**必须喊出来**，不能装作是默认值
    if chosen is None:
        dsh = next((c for c in pool if c["tag"].startswith("$DSH_HOME 子树")), None)
        wb = next((c for c in pool if c["tag"] == "~/.workbuddy"), None)
        if dsh is not None and dsh.get("proposed"):
            chosen = dsh
            src = "$DSH_HOME 子树（$DSH_HOME 已设置＝权威来源，但子树内没有现成配置 → 建议新建）"
        elif wb is not None and wb["path"] is not None:
            chosen = wb
            src = "~/.workbuddy（所有候选都不存在，退回 WorkBuddy 用户级位置）"
        if chosen is not None:
            warnings.append(
                f"没有找到现成的 MCP 配置文件，当前建议落点为：{chosen['path']}\n"
                f"        （依据：{src}）—— 请用 --explain 核对全部候选。"
            )

    if chosen is None:
        return {"path": None, "source": "无任何可用候选", "candidates": cands,
                "warnings": warnings, "has_server": False}

    path = chosen["path"]

    # 错位主动喊：生效落点没有 hindsight 条目，但**别的候选有**
    others = [c for c in cands
              if c["path"] is not None and c["has_server"] and c["path"] != path]
    if others and not chosen.get("has_server"):
        lines = "\n".join(f"          · {c['path']}" for c in others[:5])
        warnings.append(
            "生效落点里没有 hindsight 条目，但下面这些候选有 —— 很可能落点错位：\n" + lines
        )

    return {"path": path, "source": src, "candidates": cands,
            "warnings": warnings, "has_server": bool(chosen.get("has_server"))}


def resolve_log_path(config_path: Path | None, env: dict | None = None) -> dict:
    """日志落点：`$SELFHEAL_LOG` > `<配置文件所在目录>/hindsight_selfheal.log`。"""
    e = os.environ if env is None else env
    if e.get("SELFHEAL_LOG"):
        return {"path": expand_path(e["SELFHEAL_LOG"]), "source": "$SELFHEAL_LOG"}
    if config_path is None:
        return {"path": None, "source": "无配置落点，无法推导日志位置"}
    return {"path": config_path.parent / LOG_FILENAME,
            "source": "<配置文件所在目录>/" + LOG_FILENAME}


# --------------------------- 输出 ---------------------------

def _fmt_probe(c: dict) -> str:
    if c.get("skip"):
        return f"跳过：{c['skip']}"
    if not c["exists"]:
        return "✗ 不存在"
    if c["error"]:
        return f"✗ {c['error']}"
    bits = ["✓ 存在"]
    bits.append(f"✓ 含 mcpServers（{c['server_count']} 个）"
                if c["has_mcpServers"] else "✗ 无 mcpServers")
    if c["has_server"]:
        bits.append(f"✓ 含 {SERVER_NAME} 条目")
    return " · ".join(bits)


def _display_width(s: str) -> int:
    """按终端列宽算长度：CJK 字符占 2 列。

    报告里的候选名混了中英（`$DSH_HOME 子树` / `~/.workbuddy`），用 len() 对齐
    会让 `←` 说明列参差不齐 —— 报告是给人看的，对齐本身就是可读性的一部分。
    """
    return sum(2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1 for ch in s)


def explain(res: dict, log_res: dict) -> str:
    out: list[str] = ["hindsight 落点探测（只读，不改任何文件）", "",
                      "配置文件候选（按优先级逐条如实报告）："]
    tags = [f"[{i}] {c['tag']}" for i, c in enumerate(res["candidates"], 1)]
    width = max((_display_width(t) for t in tags), default=0)
    for i, c in enumerate(res["candidates"], 1):
        tag = tags[i - 1]
        pad = " " * (width - _display_width(tag))
        out.append(f"  {tag}{pad}  {_fmt_probe(c)}")
        lead = " " * (width + 2)
        if c["source"]:
            out.append(f"  {lead}  ← {c['source']}")
        if c["path"] is not None and (c["exists"] or c.get("proposed")):
            out.append(f"  {lead}  {c['path']}")
    out += ["", f"生效落点: {res['path'] or '（无）'}", f"  来自: {res['source']}",
            f"日志落点: {log_res['path'] or '（无）'}", f"  来自: {log_res['source']}"]
    if res["warnings"]:
        out += ["", "⚠️ 注意："]
        out += [f"  - {w}" for w in res["warnings"]]
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser(
        description="探测 hindsight 的 MCP 配置文件与自愈日志落点（唯一实现）")
    ap.add_argument("--config", dest="explicit", default=None,
                    help="显式指定 MCP 配置文件（或目录，会在其中自动定位）")
    ap.add_argument("--show-log", "--log", action="store_true", dest="show_log",
                    help="打印日志落点")
    ap.add_argument("--show-config", "--print-config", action="store_true",
                    dest="show_config", help="打印生效的配置文件路径（默认行为）")
    ap.add_argument("--explain", action="store_true", help="打印全部候选与各自状态")
    ap.add_argument("--json", action="store_true", dest="as_json", help="输出 JSON")
    args = ap.parse_args()

    res = resolve_config_path(args.explicit)
    log_res = resolve_log_path(res["path"])

    if args.as_json:
        print(json.dumps({
            "config": {"path": str(res["path"]) if res["path"] else None,
                       "source": res["source"], "has_hindsight": res["has_server"],
                       "warnings": res["warnings"],
                       "candidates": [
                           {"tag": c["tag"], "path": str(c["path"]) if c["path"] else None,
                            "source": c["source"], "skip": c.get("skip"),
                            "exists": c["exists"], "has_mcpServers": c["has_mcpServers"],
                            "has_hindsight": c["has_server"], "error": c["error"]}
                           for c in res["candidates"]]},
            "log": {"path": str(log_res["path"]) if log_res["path"] else None,
                    "source": log_res["source"]},
        }, ensure_ascii=False, indent=2))
        return 0 if res["path"] is not None else 3

    if args.explain:
        # 报告里已经印了 warnings，不再往 stderr 重复一遍
        print(explain(res, log_res))
        return 0 if res["path"] is not None else 3

    if args.show_log:
        if log_res["path"] is None:
            print("无法推导日志落点", file=sys.stderr)
            return 3
        print(log_res["path"])
    else:
        # 默认（含 --show-config）：只往 stdout 打一行路径，诊断走 stderr ——
        # 便于 bash 用 $(...) 直接消费。
        if res["path"] is None:
            print("没有找到任何可用的 MCP 配置落点。用 --explain 看全部候选。",
                  file=sys.stderr)
            return 3
        print(res["path"])

    for w in res["warnings"]:
        print(f"⚠️ {w}", file=sys.stderr)
    return 0 if res["path"] is not None else 3


if __name__ == "__main__":
    raise SystemExit(main())
