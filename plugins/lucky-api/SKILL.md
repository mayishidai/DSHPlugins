---
name: lucky-api
description: "调用自建 Lucky 实例（lucky.stun.abcc.qzz.io:48020）的 HTTP API。查状态、查模块配置、读日志、刷新接口清单；鉴权用自定义请求头 Lucky-Admin-Token，成败必须判 ret 而非 HTTP 状态码。"
whenToUse: "当需要查询/更新 Lucky（STUN 穿透、DDNS、端口转发、反代 Web 服务等）的配置或状态，或在自动化里定时调用 Lucky 接口取数/更新数据时。"
invocation:
  modelInvocable: true
  userInvocable: true
---

# lucky-api（Lucky 实例 API 调用）

Skills 仓库插件：把自建 Lucky 的 HTTP API 封装成可复用能力。安装后落在
`$DSH_HOME/skills/lucky-api/`，由 `dsh-skill-filesystem` 提供方自动发现。

## 实例信息

- **Base URL**：`https://lucky.stun.abcc.qzz.io:48020`
- 前端是 Lucky（Vue SPA，title = `Lucky`），通过 STUN 穿透暴露
- **TLS 证书有效**，正常校验即可，不要默认跳过（`--insecure` 只在报错时才加）

## 鉴权：自定义请求头 `Lucky-Admin-Token`

Lucky **不用** `Authorization`，也**不是** URL 参数。前端源码里的实际写法：

```js
const t = localStorage.getItem("token");
if (t != null) e.headers["Lucky-Admin-Token"] = t;
```

所以每个请求都要带 `Lucky-Admin-Token: <token>`。token 两个来源：

1. 后台设置里自定义的静态 token（推荐，长期有效）
2. `POST /api/login` 换取的会话 token（会过期，需定期重取）

**安全约束（必须遵守）**

- token 只存在 `~/.lucky_api.json` 或环境变量 `LUCKY_TOKEN`
- 不要写进 SKILL.md、不要贴进对话、不要让脚本打印出来
- 不要为了省事把 token 拼进命令行（会进进程列表和历史）

## CRITICAL：判断成败要看 `ret`，不是 HTTP 状态码

Lucky **鉴权失败时也返回 HTTP 200**，body 是：

```json
{"msg":"login invalid","ret":-1}
```

判断规则：

- 成功：`ret == 0`
- token 无效/过期：`ret == -1` 且 `msg == "login invalid"`
- 其它非 0：接口业务报错

任何脚本或自动化**必须检查 `ret`**，否则会把「鉴权失败」当成「调用成功」，静默写入空数据。

## 用法

```bash
# Linux / NAS（DSH 运行环境，推荐）
PY=python3
# Windows 开发机（如需在本机调试）
# PY="C:/Users/abczhou/.workbuddy/binaries/python/versions/3.13.12/python.exe"

S="$DSH_HOME/skills/lucky-api/scripts/lucky_api.py"

"$PY" "$S" check                          # 1. 先验证 token（排障第一步）
"$PY" "$S" get  /api/status               # 2. 查状态
"$PY" "$S" get  /api/modules/list         #    查已启用模块
"$PY" "$S" get  /api/logs --query limit=20
"$PY" "$S" post /api/xxx --data '{"k":"v"}'   # 4. 提交数据
"$PY" "$S" put  /api/baseconfigure --data @payload.json
```

退出码：`0` 成功 / `1` 请求或接口报错 / `2` token 未配置或无效。
自动化里可以直接用退出码判定要不要告警。

## 首次接入流程

1. 确认 `~/.lucky_api.json` 里有 token（没有就让用户补，**不要代填、不要索要明文**）
2. 跑 `check` → 必须看到 `[OK] token 有效`
3. 跑 `get /api/modules/list` → 看这个实例实际启用了哪些模块
4. 再对着 `references/endpoints.md` 挑需要的接口

## 已知接口

完整清单见 `references/endpoints.md`：**273 个** `/api/` 接口，覆盖 28 个模块
（ddns / portforward / cron / docker / ssl / stun / wol / webdav / rclone / webservice …）。
另有 5 个非 `/api/` 前缀的公开接口（`/version`、`/LoginPageConfig` 等）。

⚠️ **补接口时别只抓主包**：绝大多数模块接口在**懒加载分片**里，主包只有 44 个。
要重新抓取必须下载全部 `static/js/lucky_*.js`（本实例 66 个分片）再一起 grep，
只抓主包会漏掉约 **84%** 的接口。

Lucky 升级后接口可能变动，直接重跑抓取脚本刷新清单（无需手写）：

```bash
python3 "$DSH_HOME/skills/lucky-api/scripts/scrape_endpoints.py"
```

默认覆盖写技能自身的 `references/endpoints.md`（脚本位置相对，跨机器可移植）；
想先看差异就加 `--out /tmp/endpoints.new.md`。
脚本会走 `index.html` → 主包 → 全部懒加载分片 → 抽取 `/api/` 路径，全程只用 stdlib。

## 易错点

- ⚠️ 别用 HTTP 状态码判成败（见上文 CRITICAL）
- ⚠️ `~/.lucky_api.json` **文件存在但 `token` 是空字符串**时，同样报
  `[error] token not configured` 并退出码 2——别以为「文件在就没问题」，
  排障时先确认 token 字段非空（用脚本读 key 长度，不要把值打出来）
- ⚠️ 路径写错时 Lucky 返回**纯文本**而非 JSON，文案是
  `Are you ok? Request URL [GET][/api/xxx] not found`，
  脚本会识别为「响应不是 JSON」。看到这句就是路径写错了，不是权限问题
- ⚠️ 写入类接口（baseconfigure / reboot_program 等）会直接影响线上服务，
  调用前先跟用户确认，不要自作主张
- ⚠️ 这个地址走 STUN 穿透，可能偶尔不通；请求失败时先重试一次再报错
- ⚠️ `/api/ipfliter/`、`/api/update/comfire` 是上游拼写错误，照抄才 200
- `POST /api/login` 的请求体格式未在前端验证过，如要用请先实测确认字段名

## 本仓库接入说明

- **来源**：WorkBuddy 用户级技能 `~/.workbuddy/skills/lucky-api/`（同一份内容，两处同步）
- **安装到 DSH**：`make install NAME=lucky-api`（或 `./scripts/sync-to-dsh.sh` 批量同步），
  落到 `$DSH_HOME/skills/lucky-api/`
- **依赖**：零第三方依赖，Python 3.8+ stdlib（`urllib` / `json` / `ssl`）
- **凭据**：`~/.lucky_api.json`，格式 `{"base_url": "...", "token": "..."}`；不进仓库
