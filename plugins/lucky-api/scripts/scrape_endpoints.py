#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Re-scrape the Lucky frontend and regenerate references/endpoints.md.

Why this exists: scraping only the main JS bundle misses ~84% of the API,
because every feature module lives in its own lazy-loaded chunk.
This walks: index.html -> main bundle -> all lazy chunks -> /api/ paths.

Usage:
  python scrape_endpoints.py
  python scrape_endpoints.py --base-url https://host:port --out path/to/endpoints.md
"""

import argparse
import re
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

DEFAULT_BASE = "https://lucky.stun.abcc.qzz.io:48020"
# 默认写回技能自身的 references/endpoints.md（脚本位置相对，跨机器可移植）
DEFAULT_OUT = Path(__file__).resolve().parent.parent / "references" / "endpoints.md"

UA = {"User-Agent": "Mozilla/5.0"}
API_RE = re.compile(r"/api/[A-Za-z0-9_/.-]*")
CHUNK_RE = re.compile(r'"\./?(lucky_[A-Za-z0-9_.-]+\.js)"')
BUNDLE_RE = re.compile(r'src="\./?(static/js/[^"]+\.js)"')
URL_FIELD_RE = re.compile(r'url:"([^"]{1,90})"')
NON_API_RE = re.compile(r"^/[A-Za-z0-9_/.-]+$")

MOD_LABEL = {
    "(核心)": "核心 / 配置", "docker": "Docker 管理", "rclone": "Rclone 网盘",
    "webservice": "Web 服务（反代）", "webterminal": "Web 终端",
    "ddns": "动态域名 DDNS", "cron": "计划任务", "wol": "网络唤醒 WOL",
    "ssl": "SSL 证书", "ipdb": "IP 地址库", "storagemanagement": "存储管理",
    "ipfliter": "IP 过滤（上游拼写如此）", "iconlib": "图标库",
    "coraza": "Coraza WAF", "thirdPartyAuthManager": "第三方认证",
    "portforward": "端口转发", "frp": "FRP 内网穿透",
    "cloudflared": "Cloudflared 隧道", "webdav": "WebDAV",
    "third": "第三方服务", "oauth": "OAuth 登录", "ftpserver": "FTP 服务",
    "dlnaservice": "DLNA 服务", "stunrule": "STUN 规则", "stun": "STUN 穿透",
    "update": "程序更新", "modules": "模块管理", "lucky": "Lucky 服务",
}

ROUTES = [
    ("/ddns", "ddns/"), ("/portforward", "portforward/"), ("/cron", "cron/"),
    ("/docker", "docker/"), ("/ssl", "ssl/"), ("/stun", "stun/ + stunrule/"),
    ("/wol", "wol/"), ("/webdav", "webdav/"), ("/ftpserver", "ftpserver/"),
    ("/filebrowser", "third/filebrowser/"), ("/rclone", "rclone/"),
    ("/storagemanagement", "storagemanagement/"), ("/cloudflared", "cloudflared/"),
    ("/coraza", "coraza/"), ("/ipfilter", "ipfliter/ ⚠️ 拼写不同"),
    ("/ipdb", "ipdb/"), ("/frp", "frp/"), ("/dlnaservice", "dlnaservice/"),
    ("/thirdPartyAuthManager", "thirdPartyAuthManager/"), ("/webterminal", "webterminal/"),
    ("/web", "webservice/"), ("/status", "status + info + logs"),
    ("/set", "baseconfigure"), ("/login", "login + oauth/"),
]


def fetch(url: str, timeout: int = 90) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def main() -> int:
    ap = argparse.ArgumentParser(description="Re-scrape Lucky frontend for API endpoints")
    ap.add_argument("--base-url", default=DEFAULT_BASE)
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    args = ap.parse_args()

    base = args.base_url.rstrip("/")
    print(f"[1/5] fetching index: {base}/", file=sys.stderr)
    html = fetch(f"{base}/")

    bundles = BUNDLE_RE.findall(html)
    if not bundles:
        print("[error] main JS bundle not found in index.html", file=sys.stderr)
        return 1
    main_js = f"{base}/" + bundles[0].lstrip("./")
    print(f"      main bundle: {bundles[0]}", file=sys.stderr)

    print("[2/5] downloading main bundle", file=sys.stderr)
    sources = [fetch(main_js)]

    print("[3/5] discovering + downloading lazy chunks", file=sys.stderr)
    chunks = sorted(set(CHUNK_RE.findall(sources[0])))
    print(f"      found {len(chunks)} chunks", file=sys.stderr)
    blobs = list(sources)
    for i, name in enumerate(chunks, 1):
        try:
            blobs.append(fetch(f"{base}/static/js/{name}"))
        except Exception as exc:  # noqa: BLE001
            print(f"      [warn] chunk {name} failed: {exc}", file=sys.stderr)
        if i % 20 == 0:
            print(f"      ...{i}/{len(chunks)}", file=sys.stderr)

    print("[4/5] extracting endpoints", file=sys.stderr)
    blob = "\n".join(blobs)
    api_paths = sorted({p for p in API_RE.findall(blob) if p != "/api/"})
    non_api = sorted({
        u for u in URL_FIELD_RE.findall(blob)
        if NON_API_RE.match(u) and not u.startswith("/api/")
    })
    print(f"      {len(api_paths)} /api/ endpoints, {len(non_api)} non-/api/ paths",
          file=sys.stderr)

    groups = defaultdict(list)
    for p in api_paths:
        rest = p[len("/api/"):]
        if "/" in rest:
            mod, sub = rest.split("/", 1)
        else:
            mod, sub = "(核心)", rest
        groups[mod].append("/" + sub)

    out = []
    w = out.append
    w("# Lucky 接口清单（完整版）\n")
    w(f"- **Base URL**：`{base}`")
    w(f"- **接口总数**：`{len(api_paths)}` 个 `/api/` 接口 + {len(non_api)} 个非 `/api/` 公开接口")
    w(f"- **来源**：主包 `{bundles[0]}` **及 {len(chunks)} 个懒加载分片**")
    w("- **由 `scripts/scrape_endpoints.py` 自动生成**，Lucky 升级后重跑即可刷新\n")
    w("> ⚠️ 只抓主包会漏掉约 **84%** 的接口——绝大多数模块接口都在懒加载分片里。")
    w("> 方法未标注的一律先按 GET 试，报 405 再换 POST。\n")

    w("## 页面 → 接口模块对照\n")
    w("| 前端页面 | 接口模块 |\n|---|---|")
    for route, mod in ROUTES:
        w(f"| `{route}` | `/api/{mod}` |")
    w("\n⚠️ `/ipfilter` 页面对应的接口是 `/api/ipfliter/`（上游把 filter 拼成了 fliter）。\n")

    w("## 模块接口数量\n")
    w("| 模块 | 数量 |\n|---|---|")
    for mod in sorted(groups, key=lambda m: (-len(groups[m]), m)):
        w(f"| `/api/{mod}/` | {len(groups[mod])} |")
    w("")

    order = ["(核心)"] + sorted((m for m in groups if m != "(核心)"),
                                key=lambda m: (-len(groups[m]), m))
    for mod in order:
        w(f"## {MOD_LABEL.get(mod, mod)} — `/api/{mod}/`\n")
        for sub in groups[mod]:
            w(f"- `/api/{mod}{sub}`" if mod != "(核心)" else f"- `/api{sub}`")
        w("")

    if non_api:
        w("## 非 `/api/` 前缀的公开接口\n")
        w("不在 `/api/` 下，多半**不需要 token**（未逐一验证）：\n")
        for p in non_api:
            w(f"- `{p}`")
        w("")

    w("## 易错点\n")
    w("- ⚠️ `/api/ipfliter/` —— 上游拼写错误（正确应为 ipfilter），照抄才会 200")
    w("- ⚠️ `/api/update/comfire` —— 上游拼写错误（正确应为 confirm）")
    w("- ⚠️ 带结尾斜杠的路径（如 `/api/ddns/task/`、`/api/docker/containers/`）"
      "通常表示**按 ID 操作**，需再拼 ID，单独请求会 404")
    w("- ⚠️ `*_lite` 后缀是精简列表，字段更少但更快")
    w("- ⚠️ 写入/控制类接口（configure、reboot_program、down、prune、remove、restore）"
      "会影响线上服务，调用前必须与用户确认")
    w("")

    Path(args.out).write_text("\n".join(out), encoding="utf-8")
    print(f"[5/5] wrote {args.out}", file=sys.stderr)
    print(f"OK: {len(api_paths)} endpoints, {len(groups)} modules", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
