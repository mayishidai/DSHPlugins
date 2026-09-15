#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Lucky API client - zero dependency (stdlib only).

Auth: custom header `Lucky-Admin-Token: <token>`.

CRITICAL: Lucky returns HTTP 200 even when auth fails; the body is
    {"msg":"login invalid","ret":-1}
so success MUST be judged by `ret == 0`, never by HTTP status code.

Usage:
  python lucky_api.py check
  python lucky_api.py get  /api/status
  python lucky_api.py get  /api/modules/list
  python lucky_api.py post /api/login --data '{"username":"u","password":"p"}'
  python lucky_api.py put  /api/baseconfigure --data @payload.json

Token is read from (highest priority first):
  1. --token
  2. env LUCKY_TOKEN
  3. ~/.lucky_api.json  {"base_url": "...", "token": "..."}
"""

import argparse
import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DEFAULT_BASE_URL = "https://lucky.stun.abcc.qzz.io:48020"
CONFIG_PATH = Path.home() / ".lucky_api.json"
AUTH_HEADER = "Lucky-Admin-Token"


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
    """Default: normal verification (this instance has a valid cert)."""
    if not insecure:
        return None
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def request(base_url, token, method, path, query=None, payload=None,
            timeout=20, insecure=False):
    url = base_url.rstrip("/") + "/" + path.lstrip("/")
    if query:
        url = f"{url}?{urllib.parse.urlencode(query, doseq=True)}"

    headers = {"Accept": "application/json"}
    body = None
    if token:
        headers[AUTH_HEADER] = token
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=body, headers=headers, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=timeout,
                                    context=build_ssl_context(insecure)) as resp:
            status = resp.getcode()
            raw = resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        status = exc.code
        raw = exc.read().decode("utf-8", "replace")
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "http_status": None, "error": str(exc), "body": None, "raw": ""}

    try:
        parsed = json.loads(raw)
    except Exception:  # noqa: BLE001
        parsed = {"__raw__": raw}
    return {"ok": True, "http_status": status, "body": parsed, "raw": raw}


def interpret(http_status, body):
    """Return (is_success, kind, message).

    kind in {ok, auth, api_error, non_json, http_error, unknown}
    """
    # A non-JSON body means we hit a 404 page / reverse-proxy error page,
    # NOT a successful API call. Never treat that as success.
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
    p.add_argument("method", choices=["get", "post", "put", "patch", "delete", "check"])
    p.add_argument("path", nargs="?", default="/api/status")
    p.add_argument("--base-url", default=None)
    p.add_argument("--token", default=None,
                   help="discouraged; prefer config file / LUCKY_TOKEN env")
    p.add_argument("--query", action="append", default=[], metavar="K=V")
    p.add_argument("--data", default=None, help="JSON string, or @file.json")
    p.add_argument("--timeout", type=int, default=20)
    p.add_argument("--insecure", action="store_true", help="skip TLS verify (not needed here)")
    p.add_argument("--raw", action="store_true", help="print raw text instead of pretty JSON")
    args = p.parse_args()

    cfg = load_config(args.base_url, args.token)
    if args.method == "check":
        args.path = "/api/status"

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

    # "check" is a meta-command, not an HTTP verb: map it to GET.
    http_method = "get" if args.method == "check" else args.method
    result = request(
        cfg["base_url"], cfg["token"], http_method, args.path,
        query=query or None, payload=payload,
        timeout=args.timeout, insecure=args.insecure,
    )

    if not result["ok"]:
        print(f"[error] request failed: {result['error']}", file=sys.stderr)
        return 1

    body = result["body"]
    print(result["raw"] if args.raw else json.dumps(body, ensure_ascii=False, indent=2))

    ok, kind, msg = interpret(result["http_status"], body)
    labels = {
        "auth": "token 无效或已过期",
        "non_json": "响应不是 JSON（可能是 404 或反代错误页）",
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
