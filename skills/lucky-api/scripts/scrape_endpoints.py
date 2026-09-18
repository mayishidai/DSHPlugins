#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Re-scrape the Lucky frontend and regenerate references/endpoints.md.

为什么需要它：只抓主包会漏掉约 84% 的接口——每个功能模块都在自己的懒加载分片里。
本脚本走：index.html -> 主包 -> 全部懒加载分片 -> 抽取 /api/ 路径。

======================================================================
三个已实测确认的事实，决定了本脚本的判定逻辑
======================================================================

【1】方法信息是静态可读的，不必靠猜
    前端是规整的 `url:"/api/xxx",method:"post"` 写法，所以 API 的 HTTP 方法
    能从 JS 直接解析出来（实测与真实请求吻合）。

【2】Lucky 按「方法 + 路径」路由 —— 探测方法选错会误判
    同一个路径，GET 可能 404 而 POST 才是真路由。例如：
      /api/ddns                  -> post / put
      /api/docker/compose/up     -> post
      /api/frontend-preferences  -> put
    所以**只用 GET 探测会把写入类接口大面积误判成「不存在」**。
    而试探性发 POST/PUT 会真的发出写请求 —— 本仓库约定：写接口不得擅自动线上服务。
    结论：GET 之外的方法**只做静态推断，不做实测**。

【3】鉴权发生在路由之前，所以 GET 探测可以「免 token 验存在」
    路径存在 + 需 token -> HTTP 200 + {"msg":"login invalid","ret":-1}
    路径不存在          -> HTTP 404 + 纯文本 "Are you ok? Request URL [...] not found"

【4】噪声的可靠判据：是否被 `url:` 字段引用
    正则扫压缩 JS 时，形似 /api/xxx 的字符串也会从文案/占位符里捞出来。
    实测例子：`/api/upload` 只出现在一段 textarea 的 placeholder 里
    （`placeholder:`/api/upload /webhook``），真实路由不存在。
    因此：**只有出现在 `url:"..."` 字段里的路径才算候选**，其余标为 ❓。

用法:
  python scrape_endpoints.py                 # 抓取 + 静态方法推断 + GET 验存在
  python scrape_endpoints.py --no-verify     # 只抓取，不探测
  python scrape_endpoints.py --out /tmp/x.md
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

# 地址解析与请求逻辑复用 lucky_api.py，避免两处实现漂移
sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    import lucky_api  # noqa: E402
    DEFAULT_BASE = lucky_api.DEFAULT_BASE_URL
except Exception:  # noqa: BLE001
    lucky_api = None
    DEFAULT_BASE = "https://lucky.abcc.qzz.io"

# 默认写回技能自身的 references/endpoints.md（脚本位置相对，跨机器可移植）
DEFAULT_OUT = Path(__file__).resolve().parent.parent / "references" / "endpoints.md"

UA = {"User-Agent": "Mozilla/5.0"}

API_RE = re.compile(r"/api/[A-Za-z0-9_/.-]*")
CHUNK_RE = re.compile(r'"\./?(lucky_[A-Za-z0-9_.-]+\.js)"')
BUNDLE_RE = re.compile(r'src="\./?(static/js/[^"]+\.js)"')
URL_FIELD_RE = re.compile(r'url:"([^"]{1,90})"')
NON_API_RE = re.compile(r"^/[A-Za-z0-9_/.-]+$")

# `url:"/api/x",method:"post"` 以及反序 `method:"post",url:"/api/x"`
# [^{}] 限制不跨对象边界，避免把相邻两个调用串起来。
PAIR_RE = re.compile(r'url:"(/api/[A-Za-z0-9_/.-]*)"[^{}]{0,60}?method:"(\w+)"')
PAIR_RE_REV = re.compile(r'method:"(\w+)"[^{}]{0,60}?url:"(/api/[A-Za-z0-9_/.-]*)"')

# 反引号模板字符串：url:`/api/docker/containers/${e}`  ← 实测漏抓的主因
# 取 ${ 之前的前缀作为路径（带 ID 的形态统一收敛成 "…/" 前缀）。
TPL_PAIR_RE = re.compile(r'url:`(/api/[^`$]*)(?:\$\{)?[^`]*`[^{}]{0,60}?method:"(\w+)"')
TPL_BARE_RE = re.compile(r'url:`(/api/[^`$]*)')

# axios 简写：t.get("/api/x") / t.post(`/api/x`)
SHORT_RE = re.compile(r'\.(get|post|put|patch|delete)\(\s*["`](/api/[^"`$]*)["`]')

# 以 url: 字段（引号或反引号）引用过的路径 —— 高置信度候选
URL_API_RE = re.compile(r'url:[`"](/api/[^`"$]*)')

# 调用点首个实参是 /api/ 字面量，例如：
#   zo("/api/temp-access-tickets", {}, {...})     <- 这些没有 url:/method: 字段
#   Lt("/api/configure", {}, {module:...})
# 注意 `placeholder:`/api/upload /webhook`` 这类“键 + 反引号”不会命中（要求是 `(`）。
CALLSITE_RE = re.compile(r'\w+\(\s*["`](/api/[^"`$]*)["`]')

# 已实测 404 的拼接噪声，直接剔除
NOISE_RES = [
    re.compile(r"/api/\.(/|$)"),          # 拼接出来的 /api/.
    re.compile(r"^/api/\d+(/\d+)*$"),     # 纯数字段，如 /api/1427/56167
]

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
    "status": "主机 / 状态面板", "security-groups": "安全组 / 授权",
    "smb": "SMB 共享", "local-path-browser": "本地路径浏览",
    "account-recovery": "账号找回", "logscenter": "日志中心",
    "2fa": "两步验证", "natdetect": "NAT 侦测", "password": "密码",
    "login": "登录", "get-lines": "行读取（按 ID）",
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
    ("/set", "baseconfigure"), ("/security", "security-groups/"),
    ("/login", "login + oauth/ + 2fa/ + password/"),
]

MARK = {"ok": "✅", "auth": "🔒", "business": "🟡", "missing": "❌", "other": "⚠️"}
TAG_ORDER = ["🔒", "✅", "🟡", "⚙️", "🆔", "❌", "⚠️"]
METHOD_ORDER = ["get", "post", "put", "patch", "delete"]


def load_base_url(cli_base):
    """--base-url > env LUCKY_BASE_URL > ~/.lucky_api.json > DEFAULT_BASE。"""
    if cli_base:
        return cli_base
    env = os.environ.get("LUCKY_BASE_URL")
    if env:
        return env
    cfg_path = Path.home() / ".lucky_api.json"
    if cfg_path.exists():
        try:
            data = json.loads(cfg_path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and data.get("base_url"):
                return data["base_url"]
        except Exception as exc:  # noqa: BLE001
            print(f"[warn] 配置解析失败 {cfg_path}: {exc}", file=sys.stderr)
    return DEFAULT_BASE


def load_token():
    tok = os.environ.get("LUCKY_TOKEN")
    if tok:
        return tok
    cfg_path = Path.home() / ".lucky_api.json"
    if cfg_path.exists():
        try:
            data = json.loads(cfg_path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data.get("token") or ""
        except Exception:  # noqa: BLE001
            pass
    return ""


def fetch(url: str, timeout: int = 90) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def fetch_json(url: str, timeout: int = 20):
    """取 JSON；失败返回 None（/version 这类公开接口不需要 token）。"""
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8", "replace"))
    except Exception:  # noqa: BLE001
        return None


def classify(status, body_text):
    """把一次 GET 探测归类。判据见文件头【3】。

    关键：**只要 body 是带 ret 的 JSON，就说明路由存在且到达了业务层**，
    哪怕 HTTP 不是 200（实测 /api/iconlib/icon 返回 400 + {"ret":1,"msg":"PathRequired"}）。
    """
    try:
        data = json.loads(body_text)
    except Exception:  # noqa: BLE001
        data = None
    if isinstance(data, dict) and "ret" in data:
        ret = data.get("ret")
        if ret == 0:
            return "ok"
        if ret == -1 and "login invalid" in str(data.get("msg", "")):
            return "auth"
        # 没带 token 却拿到了业务错误码 -> 该路径不要求鉴权
        return "business"
    if status == 404 and "not found" in body_text:
        return "missing"
    return "other"


def probe_get(direct, token, path, timeout=15, delay=0.0, retries=2):
    """**只发 GET**（只读）。写方法一律不实测，见文件头【2】。"""
    url = direct.rstrip("/") + path
    headers = {"Accept": "application/json"}
    if token:
        headers["Lucky-Admin-Token"] = token
    for attempt in range(retries + 1):
        if delay:
            time.sleep(delay)
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                code = resp.getcode()
                return classify(code, resp.read().decode("utf-8", "replace"))
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", "replace")
            if exc.code == 429 and attempt < retries:
                time.sleep(1.5)
                continue
            return classify(exc.code, body)
        except Exception:  # noqa: BLE001
            if attempt < retries:
                time.sleep(1.0)
                continue
            return "other"
    return "other"


def extract(blobs):
    """一遍扫完所有分片，抽出：方法表、静态证据集、宽松候选集。

    静态证据集 = `url:` 字段引用 ∪ 调用点首参引用。有证据的路径在 GET 探测 404 时
    才不会被打成噪声（它们可能是非 GET 路由，或按 ID 操作的路径）。
    """
    text = "\n".join(blobs)
    methods = defaultdict(set)
    for m in PAIR_RE.finditer(text):
        methods[m.group(1)].add(m.group(2).lower())
    for m in PAIR_RE_REV.finditer(text):
        methods[m.group(2)].add(m.group(1).lower())
    for m in TPL_PAIR_RE.finditer(text):
        methods[m.group(1)].add(m.group(2).lower())
    for m in SHORT_RE.finditer(text):
        methods[m.group(2)].add(m.group(1).lower())

    url_field = (set(URL_API_RE.findall(text))
                 | set(TPL_BARE_RE.findall(text))
                 | set(CALLSITE_RE.findall(text)))
    loose = {p for p in API_RE.findall(text) if p != "/api/"}
    return url_field, methods, loose


def main() -> int:
    ap = argparse.ArgumentParser(description="Re-scrape Lucky frontend for API endpoints")
    ap.add_argument("--base-url", default=None,
                    help="默认取 ~/.lucky_api.json；不传则用内置跳板地址")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--no-resolve", action="store_true",
                    help="base_url 已是直连地址时跳过 302 解析")
    ap.add_argument("--no-verify", action="store_true",
                    help="不做 GET 存在性探测（纯离线抓取）")
    ap.add_argument("--delay", type=float, default=0.06,
                    help="GET 探测间隔秒数（实例限流约 20 次/秒）")
    ap.add_argument("--insecure", action="store_true", help="跳过 TLS 校验")
    args = ap.parse_args()

    base = load_base_url(args.base_url).rstrip("/")
    token = load_token()

    direct = base
    note = "未解析（--no-resolve）"
    if not args.no_resolve and lucky_api is not None:
        try:
            direct, note = lucky_api.resolve_direct(base, insecure=args.insecure,
                                                    quiet=True)
        except Exception as exc:  # noqa: BLE001
            print(f"[error] 跳板解析失败: {exc}", file=sys.stderr)
            return 1
    print(f"[0/5] base={base}\n      direct={direct}  ({note})", file=sys.stderr)

    ver = fetch_json(f"{direct}/version")
    print(f"      /version -> {ver}", file=sys.stderr)

    print(f"[1/5] fetching index: {direct}/", file=sys.stderr)
    html = fetch(f"{direct}/")
    bundles = BUNDLE_RE.findall(html)
    if not bundles:
        print("[error] main JS bundle not found in index.html", file=sys.stderr)
        return 1
    main_js = f"{direct}/" + bundles[0].lstrip("./")
    print(f"      main bundle: {bundles[0]}", file=sys.stderr)

    print("[2/5] downloading main bundle", file=sys.stderr)
    sources = [fetch(main_js)]

    print("[3/5] discovering + downloading lazy chunks", file=sys.stderr)
    chunks = sorted(set(CHUNK_RE.findall(sources[0])))
    print(f"      found {len(chunks)} chunks", file=sys.stderr)
    blobs = list(sources)
    for i, name in enumerate(chunks, 1):
        try:
            blobs.append(fetch(f"{direct}/static/js/{name}"))
        except Exception as exc:  # noqa: BLE001
            print(f"      [warn] chunk {name} failed: {exc}", file=sys.stderr)
        if i % 20 == 0:
            print(f"      ...{i}/{len(chunks)}", file=sys.stderr)

    print("[4/5] extracting endpoints + inferring methods", file=sys.stderr)
    url_field, methods, loose = extract(blobs)

    noise = sorted(p for p in loose if any(r.search(p) for r in NOISE_RES))
    candidates = sorted(p for p in loose if p not in noise)
    # 静态证据（只决定「404 时怎么解释」，最终以 GET 实测为准）
    evidenced = {p for p in candidates if p in url_field or p in methods}
    print(f"      {len(candidates)} 条候选（剔除 {len(noise)} 条拼接噪声），"
          f"其中 {len(evidenced)} 条有静态引用证据", file=sys.stderr)
    print(f"      {len(methods)} 条路径解析出 HTTP 方法", file=sys.stderr)

    # ---- GET 存在性探测（只读，不写） ----
    verdicts = {}
    if not args.no_verify:
        print(f"[5/5] GET 探测（只读，不写）token={'有' if token else '无'}",
              file=sys.stderr)
        for i, p in enumerate(candidates, 1):
            verdicts[p] = probe_get(direct, token, p, delay=args.delay)
            if i % 60 == 0:
                print(f"      ...{i}/{len(candidates)}", file=sys.stderr)
        tally = defaultdict(int)
        for v in verdicts.values():
            tally[v] += 1
        print(f"      ok={tally['ok']} auth={tally['auth']} "
              f"missing={tally['missing']} other={tally['other']}", file=sys.stderr)
    else:
        print("[5/5] 跳过探测（--no-verify）", file=sys.stderr)

    # ---- 判定：实测优先，静态证据兜底 ----
    def classify_path(p):
        """返回 (标记, 是否计入主清单)。"""
        ms = methods.get(p, set())
        v = verdicts.get(p)
        if v == "ok":
            return "✅", True
        if v == "auth":
            return "🔒", True
        if v == "business":
            return "🟡", True          # 未带 token 即到达业务层，路由确认存在
        if v == "missing":
            if p.endswith("/"):
                return "🆔", True            # 按 ID 操作：不带 ID 探测 404 属预期
            if ms and "get" not in ms:
                return "⚙️", True            # 非 GET 路由：GET 探测 404 属预期
            if p in url_field or ms:
                return "❌", True            # 有静态引用却 404 → 真矛盾
            return "❓", False               # 无任何静态引用 → 正则噪声
        if v is None:                        # 未探测
            if ms and "get" not in ms:
                return "⚙️", True
            if p in url_field or ms:
                return "", True
            return "❓", False
        return "⚠️", True

    tags = {p: classify_path(p) for p in candidates}
    api_paths = sorted(p for p in candidates if tags[p][1])
    excluded = sorted(p for p in candidates if not tags[p][1])

    groups = defaultdict(list)
    for p in api_paths:
        rest = p[len("/api/"):]
        mod, sub = (rest.split("/", 1) if "/" in rest else ("(核心)", rest))
        groups[mod].append("/" + sub)

    def render(p):
        tag, _ = tags[p]
        ms = methods.get(p, set())
        ordered = [m.upper() for m in METHOD_ORDER if m in ms]
        ordered += sorted(m.upper() for m in ms if m not in METHOD_ORDER)
        tail = " " + "·".join(ordered) if ordered else ""
        return f"- `{p}` {tag}{tail}".rstrip()

    # ---- 统计 ----
    ms_count = defaultdict(int)
    for p in api_paths:
        if not methods.get(p):
            ms_count["(未解析出方法)"] += 1
            continue
        ms_count["·".join(m.upper() for m in METHOD_ORDER
                          if m in methods[p])] += 1
    tag_count = defaultdict(int)
    for p in api_paths:
        tag_count[tags[p][0]] += 1
    contradiction = [p for p in api_paths if tags[p][0] == "❌"]
    non_api = sorted({u for u in URL_FIELD_RE.findall("\n".join(blobs))
                      if NON_API_RE.match(u) and not u.startswith("/api/")})

    out = []
    w = out.append
    w("# Lucky 接口清单（完整版）\n")
    w(f"- **跳板地址（配置里用的）**：`{base}`")
    w(f"- **本次解析出的直连地址**：`{direct}`")
    if ver:
        w(f"- **实例版本**：`{ver.get('version', '?')}`，"
          f"构建于 `{ver.get('buildTime', '?')}`")
    else:
        w("- **实例版本**：未取到（`/version` 无响应）")
    w(f"- **接口总数**：`{len(api_paths)}` 个 `/api/` 接口"
      f" + {len(non_api)} 个非 `/api/` 公开接口")
    if tag_count:
        w("- **判定分布**：" + " · ".join(
            f"{k} {tag_count[k]}" for k in TAG_ORDER if tag_count.get(k)))
    w(f"- **来源**：主包 `{bundles[0]}` **及 {len(chunks)} 个懒加载分片**")
    w(f"- **生成时间**：{time.strftime('%Y-%m-%d')}")
    w("- **由 `scripts/scrape_endpoints.py` 自动生成**，Lucky 升级后重跑即可刷新\n")
    w("> ⚠️ 只抓主包会漏掉约 **84%** 的接口——绝大多数模块接口都在懒加载分片里。\n")

    w("## 标记含义\n")
    w("| 标记 | 含义 | 数量 |")
    w("|---|---|---|")
    w(f"| 🔒 | GET 实测返回 `login invalid` —— **路由确实存在**，需有效 token | {tag_count['🔒']} |")
    w(f"| ✅ | GET 实测返回 `ret == 0`（免鉴权的公开接口） | {tag_count['✅']} |")
    w(f"| 🟡 | 未带 token 却**直达业务层**（返回业务错误码），路由确认存在 | {tag_count['🟡']} |")
    w(f"| ⚙️ | 只有非 GET 方法（方法由前端 JS 静态解析），**未做写探测** | {tag_count['⚙️']} |")
    w(f"| 🆔 | 以 `/` 结尾的「按 ID 操作」路径，不带 ID 探测必然 404，属预期 | {tag_count['🆔']} |")
    if tag_count["❌"]:
        w(f"| ❌ | 有静态引用、但 GET 实测 404 且未解析出方法 —— "
          f"**多半是非 GET 路由**，要用就按 POST/PUT 手工确认 | {tag_count['❌']} |")
    if tag_count["⚠️"]:
        w(f"| ⚠️ | 响应非预期（超时/非 JSON） | {tag_count['⚠️']} |")
    w("")
    if verdicts:
        w("**本次 GET 探测统计**："
          f"🔒 {tally['auth']} · ✅ {tally['ok']} · 404 {tally['missing']} · ⚠️ {tally['other']}\n")
        w("> Lucky 的鉴权发生在路由之前，所以**不带 token 也能验证路由是否存在**：")
        w('> 存在的路径返回 `200 + {"msg":"login invalid","ret":-1}`，')
        w("> 不存在的路径返回 `404 + 纯文本 Are you ok? ... not found`。")
        w("> 只要拿到**带 `ret` 的 JSON**，就说明路由存在（HTTP 码可能是 400）。\n")
        w("> **为什么写入类接口不做实测**：Lucky 按「方法 + 路径」路由，`/api/ddns` 是 "
          "POST/PUT、`/api/docker/compose/up` 是 POST，用 GET 探测必然 404。")
        w("> 而试探性发 POST/PUT 会真的发出写请求，本仓库约定写接口不得擅自动线上服务，")
        w("> 因此这些接口的方法**只做静态解析**（抽样实测与静态结果完全吻合）。\n")
        if contradiction:
            w(f"> ⚠️ 有 {len(contradiction)} 条既有静态引用又实测 404，已标 ❌：")
            w("> " + "、".join(f"`{p}`" for p in contradiction[:8]) + "\n")

    w("## HTTP 方法分布（静态解析自前端 JS）\n")
    w("| 方法组合 | 数量 |\n|---|---|")
    for k in sorted(ms_count, key=lambda x: (-ms_count[x], x)):
        w(f"| `{k}` | {ms_count[k]} |")
    w("")

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
            full = f"/api/{mod}{sub}" if mod != "(核心)" else f"/api{sub}"
            w(render(full))
        w("")

    if non_api:
        w("## 非 `/api/` 前缀的公开接口\n")
        w("不在 `/api/` 下，不需要 token：\n")
        for p in non_api:
            w(f"- `{p}`")
        w("")

    if excluded or noise:
        w("## 未确认的候选（不计入清单）\n")
        w("以下字符串形似接口路径，但在前端 JS 里找不到任何 `url:` / 调用点引用，"
          "GET 实测也是 404，故不计入清单：\n")
        for p in sorted(set(excluded) | set(noise)):
            w(f"- `{p}`")
        w("")
        w("> 判定依据（实测佐证）：`/api/user` 只出现在中英文 i18n 帮助文案里"
          "（`例：前端路径 /app 下访问 /app/api/user，匹配 location /api/`），"
          "`/api/upload` 只出现在一段 textarea 的 `placeholder` 里。")
        w("> ⚠️ 但别把这里当成绝对的「不存在」：前端还有"
          " `const Ce=\"/api/logscenter\"` 之后用 `` `${Ce}/config` `` 拼路径的写法，"
          "这类路径字面上不会出现在任何调用点。要用就手工验证一次。\n")

    w("## 易错点\n")
    w("- ⚠️ 跳板地址会 302 到直连端口，**直连端口会随升级/重启变化**；")
    w("  不要硬编码端口，见 SKILL.md「两层地址」一节")
    w("- ⚠️ **按「方法 + 路径」路由**：同一个路径 GET 404 不代表接口不存在，")
    w("  先查本清单里的方法标记再换方法")
    w("- ⚠️ `/api/ipfliter/` —— 上游拼写错误（正确应为 ipfilter），照抄才会 200")
    w("- ⚠️ `/api/update/comfire` —— 上游拼写错误（正确应为 confirm）")
    w("- ⚠️ 带结尾斜杠的路径（如 `/api/ddns/task/`、`/api/docker/containers/`）"
      "表示**按 ID 操作**，需再拼 ID，单独请求会 404")
    w("- ⚠️ `*_lite` 后缀是精简列表，字段更少但更快")
    w("- ⚠️ 写入/控制类接口（configure、reboot_program、down、prune、remove、restore、kill）"
      "会影响线上服务，调用前必须与用户确认")
    w("- ⚠️ 实例限流约 **20 次/秒**（响应头 `Ratelimit-Limit: 20`），批量调用要节流")
    w("")

    Path(args.out).write_text("\n".join(out), encoding="utf-8")
    print(f"[done] wrote {args.out}", file=sys.stderr)
    print(f"OK: {len(api_paths)} endpoints, {len(groups)} modules, "
          f"{len(excluded) + len(noise)} excluded, {len(methods)} with methods, "
          + " ".join(f"{k}{v}" for k, v in sorted(tag_count.items())),
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
