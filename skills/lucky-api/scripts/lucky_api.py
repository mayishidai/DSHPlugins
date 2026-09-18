#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Lucky API client - zero dependency (stdlib only).

Auth: custom header `Lucky-Admin-Token: <token>`.

======================================================================
两个必须知道的实例事实（改代码前先读完）
======================================================================

【1】两层地址：跳板稳定，直连会变
    - 跳板（稳定，写进配置的就是它）：https://lucky.abcc.qzz.io
      -> 返回 302，Location 指向当前真实入口
    - 直连（易变）：https://lucky.stun.abcc.qzz.io:<PORT>
      -> PORT 会随 Lucky 重启/升级变化（2026-09 升级时从 48020 变成 1197）
    - 所以：**永远不要把直连端口硬编码进配置或文档**。

【2】绝对不能依赖 urllib 自动跟随 302（实测结论）
    urllib 的 HTTPRedirectHandler 对非 GET 方法是破坏性的：
      - GET              -> 正常跟随，Lucky-Admin-Token 头会保留
      - POST             -> **静默降级成 GET 并丢掉 body**，却依然返回 200
                            这是最危险的失效：写入操作全部没生效，但监控全绿
      - PUT/PATCH/DELETE -> 直接抛 HTTPError(302)，请求根本到不了 Lucky
    因此本客户端一律 **先显式解析出直连地址**，再用原方法原样发请求。
    `--no-resolve` 只在 base_url 已经是直连地址时才用。

CRITICAL：判断成败要看 `ret`，不是 HTTP 状态码。
    Lucky 鉴权失败时返回 HTTP 200，body 为 {"msg":"login invalid","ret":-1}。

用法:
  python lucky_api.py check
  python lucky_api.py resolve
  python lucky_api.py get  /api/status
  python lucky_api.py get  /api/modules/list
  python lucky_api.py post /api/login --data '{"username":"u","password":"p"}'
  python lucky_api.py put  /api/baseconfigure --data @payload.json

Token 读取优先级:
  1. --token
  2. env LUCKY_TOKEN
  3. ~/.lucky_api.json  {"base_url": "...", "token": "..."}
Base URL 读取优先级:
  --base-url > env LUCKY_BASE_URL > ~/.lucky_api.json > DEFAULT_BASE_URL
"""

import argparse
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# 跳板地址：稳定，不含端口。直连端口由它 302 出来，不要写死。
DEFAULT_BASE_URL = "https://lucky.abcc.qzz.io"
CONFIG_PATH = Path.home() / ".lucky_api.json"
AUTH_HEADER = "Lucky-Admin-Token"

# 进程内缓存解析结果，避免每个请求都多跑一次跳板往返
_RESOLVE_CACHE = {}


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """让 302 原样暴露出来，而不是被 urllib 悄悄跟随（跟随会毁掉非 GET 请求）。"""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D102
        return None


def load_config(cli_base=None, cli_token=None):
    cfg = {"base_url": DEFAULT_BASE_URL, "token": ""}
    if CONFIG_PATH.exists():
        try:
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                cfg["base_url"] = data.get("base_url") or cfg["base_url"]
                cfg["token"] = data.get("token") or cfg["token"]
        except Exception as exc:  # noqa: BLE001
            print(f"[warn] config parse failed {CONFIG_PATH}: {exc}", file=sys.stderr)
    cfg["base_url"] = cli_base or os.environ.get("LUCKY_BASE_URL") or cfg["base_url"]
    cfg["token"] = cli_token or os.environ.get("LUCKY_TOKEN") or cfg["token"]
    return cfg


def build_ssl_context(insecure: bool):
    """默认正常校验（跳板与直连两个主机名的证书都有效）。"""
    if not insecure:
        return None
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def resolve_direct(base_url, timeout=15, insecure=False, quiet=False):
    """把跳板地址解析成当前直连地址。

    返回 (direct_url, note)。base_url 已经是直连地址（未返回 302）时原样返回。
    """
    key = (base_url, insecure)
    if key in _RESOLVE_CACHE:
        return _RESOLVE_CACHE[key]

    # 注意：OpenerDirector.open() 不接受 context=，TLS 上下文必须挂在
    # HTTPSHandler 上，否则报 "unexpected keyword argument 'context'"。
    handlers = [_NoRedirect()]
    if insecure:
        handlers.append(urllib.request.HTTPSHandler(context=build_ssl_context(True)))
    opener = urllib.request.build_opener(*handlers)
    probe = base_url.rstrip("/") + "/"
    note = "no-redirect"
    direct = base_url.rstrip("/")
    req = urllib.request.Request(probe, method="GET",
                                 headers={"Accept": "application/json"})
    try:
        with opener.open(req, timeout=timeout):
            # 没被重定向，说明 base_url 本身就是直连入口
            pass
    except urllib.error.HTTPError as exc:
        if exc.code in (301, 302, 303, 307, 308):
            loc = exc.headers.get("Location")
            if loc:
                direct = urllib.parse.urljoin(probe, loc).rstrip("/")
                note = f"302 -> {loc}"
        else:
            raise
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"跳板解析失败 {probe}: {exc}") from exc

    if not quiet and note != "no-redirect":
        print(f"[resolve] {base_url} {note}", file=sys.stderr)
    _RESOLVE_CACHE[key] = (direct, note)
    return direct, note


def request(base_url, token, method, path, query=None, payload=None,
            timeout=20, insecure=False, resolve=True, retries=1):
    """发一个请求。默认先解析跳板再直连（见文件头【2】）。"""
    direct = base_url
    if resolve:
        try:
            direct, _ = resolve_direct(base_url, timeout=timeout, insecure=insecure)
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "http_status": None, "error": str(exc),
                    "body": None, "raw": "", "url": base_url}

    url = direct.rstrip("/") + "/" + path.lstrip("/")
    if query:
        url = f"{url}?{urllib.parse.urlencode(query, doseq=True)}"

    headers = {"Accept": "application/json"}
    if token:
        headers[AUTH_HEADER] = token
    body = None
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"

    last_exc = None
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, data=body, headers=headers,
                                     method=method.upper())
        try:
            with urllib.request.urlopen(req, timeout=timeout,
                                        context=build_ssl_context(insecure)) as resp:
                status = resp.getcode()
                raw = resp.read().decode("utf-8", "replace")
                rl = resp.headers.get("Ratelimit-Remaining")
            return {"ok": True, "http_status": status, "body": _parse(raw),
                    "raw": raw, "url": url, "rate_remaining": rl}
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", "replace")
            if exc.code == 429 and attempt < retries:
                time.sleep(1.0)
                last_exc = exc
                continue
            return {"ok": True, "http_status": exc.code, "body": _parse(raw),
                    "raw": raw, "url": url}
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if attempt < retries:
                time.sleep(1.0)  # STUN 穿透偶发不通，先重试一次
                continue
            return {"ok": False, "http_status": None, "error": str(exc),
                    "body": None, "raw": "", "url": url}
    return {"ok": False, "http_status": None, "error": str(last_exc),
            "body": None, "raw": "", "url": url}


def _parse(raw):
    try:
        return json.loads(raw)
    except Exception:  # noqa: BLE001
        return {"__raw__": raw}


def interpret(http_status, body):
    """返回 (is_success, kind, message)。

    kind ∈ {ok, auth, api_error, non_json, http_error, unknown}
    """
    # 非 JSON 说明打到了 404 页/网关错误页，绝不能当成功。
    # 注意：Lucky 对不存在的路径返回**纯文本** "Are you ok? Request URL [...] not found"，
    # JSON 与纯文本正好把「鉴权失败」和「路径不存在」区分开。
    if not isinstance(body, dict) or "__raw__" in body:
        snippet = ""
        if isinstance(body, dict):
            snippet = str(body.get("__raw__", ""))[:120].replace("\n", " ")
        return False, "non_json", f"HTTP {http_status} 非 JSON 响应: {snippet}"
    if http_status and http_status >= 400:
        return False, "http_error", f"HTTP {http_status}"
    ret = body.get("ret")
    msg = body.get("msg", "")
    if ret is None:
        return True, "unknown", msg
    if ret == 0:
        return True, "ok", msg
    if ret == -1 and "login invalid" in str(msg):
        return False, "auth", msg
    return False, "api_error", msg


def main():
    p = argparse.ArgumentParser(description="Lucky API client (stdlib only)")
    p.add_argument("method",
                   choices=["get", "post", "put", "patch", "delete",
                            "check", "resolve"])
    p.add_argument("path", nargs="?", default="/api/status")
    p.add_argument("--base-url", default=None)
    p.add_argument("--token", default=None,
                   help="discouraged; prefer config file / LUCKY_TOKEN env")
    p.add_argument("--query", action="append", default=[], metavar="K=V")
    p.add_argument("--data", default=None, help="JSON string, or @file.json")
    p.add_argument("--timeout", type=int, default=20)
    p.add_argument("--insecure", action="store_true", help="skip TLS verify (not needed here)")
    p.add_argument("--no-resolve", action="store_true",
                   help="base_url 已是直连地址时跳过跳板解析")
    p.add_argument("--raw", action="store_true", help="print raw text instead of pretty JSON")
    args = p.parse_args()

    cfg = load_config(args.base_url, args.token)
    if args.method == "check":
        args.path = "/api/status"

    # resolve 是纯诊断命令：只打印当前直连地址，不需要 token
    if args.method == "resolve":
        try:
            direct, note = resolve_direct(cfg["base_url"], timeout=args.timeout,
                                          insecure=args.insecure, quiet=True)
        except RuntimeError as exc:
            print(f"[error] {exc}", file=sys.stderr)
            return 1
        print(f"jump  : {cfg['base_url']}")
        print(f"direct: {direct}")
        print(f"detail: {note}")
        return 0

    if not cfg["token"]:
        print(
            "[error] token not configured. Write "
            '{"base_url":"...","token":"..."} to ~/.lucky_api.json '
            "or set env LUCKY_TOKEN.",
            file=sys.stderr,
        )
        return 2

    query = []
    for item in args.query:
        if "=" in item:
            k, v = item.split("=", 1)
            query.append((k, v))

    payload = None
    if args.data:
        if args.data.startswith("@"):
            payload = json.loads(Path(args.data[1:]).read_text(encoding="utf-8"))
        else:
            payload = json.loads(args.data)

    # "check" 是元命令，不是 HTTP 动词：映射为 GET
    http_method = "get" if args.method == "check" else args.method
    result = request(
        cfg["base_url"], cfg["token"], http_method, args.path,
        query=query or None, payload=payload,
        timeout=args.timeout, insecure=args.insecure,
        resolve=not args.no_resolve,
    )

    if not result["ok"]:
        print(f"[error] request failed: {result['error']}", file=sys.stderr)
        print(f"[hint] 目标: {result['url']}", file=sys.stderr)
        print("[hint] 若报跳板解析失败，用 `curl -D - -o /dev/null "
              "https://lucky.abcc.qzz.io/` 看 Location；"
              "也可直接 --base-url 指定直连地址并加 --no-resolve。", file=sys.stderr)
        return 1

    body = result["body"]
    print(result["raw"] if args.raw else json.dumps(body, ensure_ascii=False, indent=2))

    ok, kind, msg = interpret(result["http_status"], body)
    labels = {
        "auth": "token 无效或已过期",
        "non_json": "响应不是 JSON（路径不存在或打到网关错误页）",
        "http_error": "HTTP 错误",
        "api_error": "接口报错",
    }
    if args.method == "check":
        if ok:
            print(f"\n[OK] token 有效 (HTTP {result['http_status']})", file=sys.stderr)
            return 0
        print(f"\n[FAIL] {labels.get(kind, '接口报错')}: {msg}", file=sys.stderr)
        return 2 if kind == "auth" else 1

    if not ok:
        ret_val = body.get("ret") if isinstance(body, dict) else "?"
        print(f"\n[warn] {labels.get(kind, '接口报错')}: ret={ret_val} msg={msg}",
              file=sys.stderr)
        return 2 if kind == "auth" else 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
