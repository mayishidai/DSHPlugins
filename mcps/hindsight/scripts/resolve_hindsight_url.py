#!/usr/bin/env python3
"""探测 hindsight MCP 的最新隧道地址（零依赖，仅 stdlib）。

## 为什么需要这个脚本

hindsight 的 MCP 服务藏在隧道后面，有两层地址：

  跳板（稳定）  http://hindsight_api.abcc.qzz.io/mcp/zhouqing
                  ↑ 永远用这个做"寻址入口"，但它会返回 302
  直连（会变）  https://hindsight_api.stun.abcc.qzz.io:<port>/mcp/zhouqing
                  ↑ MCP 客户端实际要连的地址，**端口会变**

MCP 客户端不跟随这个 302（跨协议 + 跨域 + 跨端口），所以配置里**必须**写直连地址；
而直连地址的端口可能会变。本脚本负责每次都拿到"当前正确"的那个值。

## 用法

    python3 resolve_hindsight_url.py             # 只打印探测到的地址
    python3 resolve_hindsight_url.py --verify    # 额外做 MCP 握手验证
    python3 resolve_hindsight_url.py --json      # 输出 JSON（供程序消费）

退出码：
    0 = 探测成功（--verify 时表示握手也通过）
    1 = 探测失败（跳板不通或未返回 302）
    2 = 探测成功但握手验证失败（说明地址拿到了但服务端异常）

## 安全说明

本脚本**只读**，不会修改任何配置文件。要写入请用 `apply_to_config.py`。
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

# 跳板地址：稳定的寻址入口，即使后端隧道端口变了它通常仍在线并返回新 302
JUMP_HOST = "http://hindsight_api.abcc.qzz.io"
MCP_PATH = "/mcp/zhouqing"
JUMP_URL = JUMP_HOST + MCP_PATH

TIMEOUT = 15


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """禁止自动跟随 302 —— 我们恰恰要读那个 302 的 Location。"""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


def resolve(timeout: int = TIMEOUT) -> str | None:
    """从跳板取 302 的 Location，即当前最新的隧道直连地址。"""
    opener = urllib.request.build_opener(_NoRedirect)
    req = urllib.request.Request(JUMP_URL, method="GET")
    try:
        with opener.open(req, timeout=timeout) as resp:
            # 若没被重定向却是 200，说明跳板行为变了，返回空由调用方判定
            location = resp.headers.get("Location")
            if location:
                return location.strip()
            return None
    except urllib.error.HTTPError as e:
        # 302 会作为 HTTPError 抛出（因为禁用了自动跟随）
        if e.code in (301, 302, 303, 307, 308):
            location = e.headers.get("Location")
            if location:
                return location.strip()
            return None
        print(f"跳板返回非重定向状态码: {e.code} {e.reason}", file=sys.stderr)
        return None
    except urllib.error.URLError as e:
        print(f"跳板不可达: {e.reason}", file=sys.stderr)
        return None
    except Exception as e:  # noqa: BLE001
        print(f"探测异常: {e}", file=sys.stderr)
        return None


def verify(url: str, timeout: int = 20, allow_tls_mismatch: bool = True) -> bool:
    """对候选地址做一次 MCP initialize 握手，确认它真能用。

    避免把配置写成一个"拿到了但连不上"的坏地址。

    ## 为什么默认放宽 TLS 校验

    实测（2026-09-17）：隧道地址 `https://hindsight_api.stun.abcc.qzz.io:<port>/mcp/zhouqing`
    的证书**主机名不匹配**（证书并非签发给 `stun.abcc.qzz.io`）。这导致：

      - curl（用系统证书库）：HTTP 200，正常
      - Python urllib（用自带 CA 包）：CERTIFICATE_VERIFY_FAILED，Hostname mismatch

    服务端本身是好的，是 Python 的严格校验策略与"隧道 + 跳板证书"这一部署方式不兼容。
    因此这里默认放宽校验——**仅用于验证"服务是否响应"**，不代表我们认可该证书。

    若你要严格校验，传 `allow_tls_mismatch=False`。
    """
    payload = json.dumps(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "resolve-hindsight-url", "version": "1.0"},
            },
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
    )

    ctx = None
    if allow_tls_mismatch and url.lower().startswith("https"):
        import ssl

        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    try:
        if ctx is not None:
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                body = resp.read().decode("utf-8", errors="replace")
                return resp.status == 200 and "serverInfo" in body
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status == 200 and "serverInfo" in body
    except Exception as e:  # noqa: BLE001
        print(f"握手验证失败: {e}", file=sys.stderr)
        return False


def main() -> int:
    ap = argparse.ArgumentParser(description="探测 hindsight MCP 最新隧道地址")
    ap.add_argument("--verify", action="store_true", help="额外做 MCP 握手验证")
    ap.add_argument("--json", action="store_true", dest="as_json", help="输出 JSON")
    ap.add_argument("--timeout", type=int, default=TIMEOUT, help=f"超时秒数（默认 {TIMEOUT}）")
    ap.add_argument(
        "--strict-tls",
        action="store_true",
        help="握手验证时严格校验 TLS 证书（默认放宽，见 verify() 的说明）",
    )
    args = ap.parse_args()

    url = resolve(args.timeout)
    if not url:
        result = {
            "ok": False,
            "url": None,
            "error": "探测失败：跳板不可达或未返回 302",
            "hint": (
                "说明网络/服务端整体故障，或跳板本身部署异常。"
                "检查本地网络、VPN、以及 hindsight 服务端是否在线。"
            ),
        }
        if args.as_json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print(result["error"], file=sys.stderr)
            print(result["hint"], file=sys.stderr)
        return 1

    verified: bool | None = None
    if args.verify:
        verified = verify(url, timeout=args.timeout, allow_tls_mismatch=not args.strict_tls)

    if args.as_json:
        print(
            json.dumps(
                {"ok": True, "url": url, "verified": verified},
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        print(url)
        if args.verify:
            if verified:
                print("握手验证: 通过", file=sys.stderr)
            else:
                print("握手验证: 失败（地址拿到了但连不上，勿写入）", file=sys.stderr)

    if args.verify and verified is False:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
