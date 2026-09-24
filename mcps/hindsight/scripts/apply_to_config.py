#!/usr/bin/env python3
"""把探测到的 hindsight 隧道地址写入指定 MCP 配置文件（零依赖，仅 stdlib）。

## 设计原则

1. **只改 hindsight 一个条目**，绝不碰 `mcpServers` 里的其他服务。
2. **先备份再写**，改坏了能还原。
3. **写前必须验证**（默认开启），避免把坏地址写进配置。
4. **原子写**（写临时文件再替换），避免写到一半损坏配置。
5. 用 JSON 库读写，不做文本替换（后者依赖"某行恰好存在"，很脆）。
6. **落点必须运行时探测** —— 本脚本历史上写死过
   `DEFAULT_CONFIG = Path.home() / ".workbuddy" / "mcp.json"`，在 NAS/DSH 上
   指向容器内的 `/root/...`，只会报「配置文件不存在」。现在改为问
   `hindsight_paths.py`（唯一实现），本脚本不再自己算一份。

## 用法

    # 写入生效落点（运行时探测，通常是 ~/.workbuddy/mcp.json）
    python3 apply_to_config.py

    # 只看落点解析过程（候选逐条列出，最省事的排查入口）
    python3 apply_to_config.py --print-config-path

    # 写入指定文件（例如 NAS 上 DSH 的配置）
    python3 apply_to_config.py --config /path/to/mcp.json

    # 只预览不写入
    python3 apply_to_config.py --dry-run

    # 跳过验证（不推荐）
    python3 apply_to_config.py --no-verify

退出码：
    0 = 成功（或 dry-run 正常）
    1 = 探测失败
    2 = 验证失败，已中止（未写入）
    3 = 配置文件问题（落点无法确定/不存在/无法解析/无 mcpServers/无 hindsight 条目）
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESOLVER = HERE / "resolve_hindsight_url.py"

# 落点解析的唯一实现在同目录的 hindsight_paths.py —— 不在本文件里再写一份。
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
import hindsight_paths  # noqa: E402  （必须在 sys.path 调整之后导入）

SERVER_NAME = hindsight_paths.SERVER_NAME


def resolve_url(verify: bool) -> tuple[str | None, bool]:
    """调用探测脚本，返回 (url, verified)。"""
    cmd = [sys.executable, str(RESOLVER), "--json"]
    if verify:
        cmd.append("--verify")
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    except subprocess.TimeoutExpired:
        print("探测脚本超时", file=sys.stderr)
        return None, False
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        print(f"探测脚本输出无法解析：{proc.stdout!r}", file=sys.stderr)
        print(proc.stderr, file=sys.stderr)
        return None, False
    if not data.get("ok"):
        print(data.get("error", "探测失败"), file=sys.stderr)
        if data.get("hint"):
            print(data["hint"], file=sys.stderr)
        return None, False
    return data.get("url"), bool(data.get("verified"))


def main() -> int:
    ap = argparse.ArgumentParser(description="写入 hindsight MCP 地址到配置文件")
    ap.add_argument(
        "--config", default=None,
        help="目标 MCP 配置文件（或目录，会在其中自动定位）。"
             "不传则运行时探测：$MCP_CONFIG > $DSH_MCP_CONFIG > "
             "$DSH_HOME 子树 > $WORKBUDDY_HOME > ~/.workbuddy",
    )
    ap.add_argument("--dry-run", action="store_true", help="只预览，不写入")
    ap.add_argument("--no-verify", action="store_true", help="跳过握手验证（不推荐）")
    ap.add_argument("--url", help="直接指定 URL，跳过探测（用于手工修正）")
    ap.add_argument(
        "--print-config-path", action="store_true",
        help="只打印落点解析结果（全部候选逐条列出），不探测也不写入",
    )
    args = ap.parse_args()

    # 落点解析：唯一实现，不在本文件里再算一份
    resolved = hindsight_paths.resolve_config_path(args.config)

    if args.print_config_path:
        print(hindsight_paths.explain(resolved, hindsight_paths.resolve_log_path(resolved["path"])))
        return 0 if resolved["path"] is not None else 3

    cfg_path = resolved["path"]
    print(f"目标落点: {cfg_path or '（无）'}")
    print(f"  来自:   {resolved['source']}")
    for w in resolved["warnings"]:
        print(f"⚠️ {w}", file=sys.stderr)

    if cfg_path is None:
        print(
            "\n无法确定 MCP 配置文件落点，已中止。\n"
            "用 --print-config-path 查看全部候选与各自状态；"
            "或用 --config 显式指定目标文件。",
            file=sys.stderr,
        )
        return 3

    verified = False
    if args.url:
        new_url = args.url
        print(f"使用手工指定的 URL：{new_url}")
    else:
        new_url, verified = resolve_url(verify=not args.no_verify)
        if not new_url:
            return 1
        if not args.no_verify and not verified:
            print(
                "\n已中止：探测到的地址未通过握手验证，拒绝写入。\n"
                "如需强制写入，加 --no-verify（不建议）。",
                file=sys.stderr,
            )
            return 2

    if not cfg_path.is_file():
        print(f"\n配置文件不存在：{cfg_path}", file=sys.stderr)
        print(
            "提示：用 --print-config-path 可看到**全部候选**与各自状态"
            "（哪份存在、哪份含 hindsight 条目）——\n"
            "      通常能直接看出正确位置其实在别处；也可用 --config 显式指定。",
            file=sys.stderr,
        )
        return 3

    try:
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"配置文件无法解析：{cfg_path} ({e})", file=sys.stderr)
        return 3

    if not isinstance(cfg, dict) or "mcpServers" not in cfg:
        print(
            f"配置里没有 mcpServers 键：{cfg_path}\n"
            "本脚本只更新既有条目，不会凭空创建顶层结构。",
            file=sys.stderr,
        )
        return 3

    servers = cfg["mcpServers"]
    if SERVER_NAME not in servers:
        print(
            f"mcpServers 里没有 '{SERVER_NAME}' 条目：{cfg_path}\n"
            "请先按 mcps/hindsight/mcp.template.json 手工添加该条目，再跑本脚本。",
            file=sys.stderr,
        )
        return 3

    old_url = servers[SERVER_NAME].get("url")
    if old_url == new_url:
        print(f"地址未变，无需写入。\n  url: {new_url}")
        return 0

    print("即将更新：")
    print(f"  配置文件: {cfg_path}")
    print(f"  旧地址:   {old_url}")
    print(f"  新地址:   {new_url}")
    if verified:
        print("  握手验证: 通过")

    if args.dry_run:
        print("\n[dry-run] 未写入任何内容。")
        return 0

    # 备份
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = cfg_path.with_suffix(cfg_path.suffix + f".bak-{stamp}")
    shutil.copy2(cfg_path, backup)
    print(f"\n已备份: {backup}")

    # 只改这一个字段
    servers[SERVER_NAME]["url"] = new_url

    # 原子写
    tmp_fd, tmp_name = tempfile.mkstemp(
        dir=str(cfg_path.parent), prefix=".mcp-", suffix=".tmp"
    )
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp_name, cfg_path)
    except Exception:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)
        raise

    print("写入完成。")
    print(
        "\n提醒：MCP 配置不会热加载。请在该客户端的连接器管理页对 "
        f"'{SERVER_NAME}' 执行「断开 → 重连」，或直接重启客户端。"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
