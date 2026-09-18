---
name: lucky-api
description: "调用自建 Lucky 实例的 HTTP API。跳板地址 https://lucky.abcc.qzz.io 会 302 到直连端口，**端口会随升级变化，不要硬编码**；鉴权用请求头 Lucky-Admin-Token，成败判 ret 不判 HTTP 码；GET 返回 404 不代表接口不存在（按方法+路径路由）。"
whenToUse: "当需要查询/更新 Lucky（STUN 穿透、DDNS、端口转发、反代 Web 服务等）的配置或状态，或在自动化里定时调用 Lucky 接口取数/更新数据时。"
invocation:
  modelInvocable: true
  userInvocable: true
---

# lucky-api（Lucky 实例 API 调用）

把自建 Lucky 的 HTTP API 封装成可复用能力：查状态、查模块配置、读日志、
刷新接口清单。零第三方依赖，只用 Python stdlib。

## 两层地址：跳板稳定，直连会变

| | 地址 | 性质 | 用途 |
|---|---|---|---|
| **跳板** | `https://lucky.abcc.qzz.io` | **稳定，无端口** | **写进配置的就是它** |
| 直连 | `https://lucky.stun.abcc.qzz.io:<PORT>` | **端口会变** | 由跳板 302 得出，实际连接用 |

- 跳板返回 `302`，`Location` 指向当前真实入口。
- 2026-09 实例升级时，端口从 `48020` 变成了 **`1197`**。
  **所以永远不要把直连端口硬编码进配置、文档或脚本。**
- 想手动看当前直连地址：

```bash
curl -sS -D - -o /dev/null https://lucky.abcc.qzz.io/ | grep -i ^location
```

### CRITICAL：不要依赖 HTTP 客户端自动跟随 302

实测（urllib，客户端同样适用）：

| 方法 | 自动跟随 302 的后果 |
|---|---|
| `GET` | ✅ 正常跟随，`Lucky-Admin-Token` 头会保留 |
| **`POST`** | ⚠️ **静默降级成 GET 并丢掉 body**，却依然返回 200 |
| `PUT` / `PATCH` / `DELETE` | ❌ 直接抛 `HTTPError(302)`，请求根本到不了 Lucky |

**POST 那条是最危险的失效**：写入操作全部没生效，但监控一片绿。
因此 `lucky_api.py` 一律 **先显式解析出直连地址**，再用原方法原样发请求
（见 `scripts/lucky_api.py` 文件头【2】）。
`--no-resolve` 只在 `--base-url` 已经是直连地址时才用。

## 鉴权：自定义请求头 `Lucky-Admin-Token`

Lucky **不用** `Authorization`，也**不是** URL 参数。前端源码里的实际写法：

```js
const t = localStorage.getItem("token");
if (t != null) e.headers["Lucky-Admin-Token"] = t;
```

token 两个来源：

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
- **只要 body 是带 `ret` 的 JSON，就说明路由存在且到达了业务层**——
  哪怕 HTTP 是 `400`（实测 `/api/iconlib/icon` 返回 `400 + {"ret":1,"msg":"PathRequired"}`）

任何脚本或自动化**必须检查 `ret`**，否则会把「鉴权失败」当成「调用成功」，静默写入空数据。

## 免 token 也能验证路由是否存在

Lucky 的**鉴权发生在路由之前**，所以两种返回长得不一样：

| 情况 | 返回 |
|---|---|
| 路径存在、需 token | `HTTP 200` + `{"msg":"login invalid","ret":-1}` |
| 路径不存在 | `HTTP 404` + **纯文本** `Are you ok? Request URL [GET][/api/xxx] not found` |

看到那句「Are you ok?」就是**路径写错**，不是权限问题。

## CRITICAL：按「方法 + 路径」路由，GET 404 不代表接口不存在

同一个路径不同方法可能是完全不同的路由。实测：

| 路径 | 真实方法 | GET 探测结果 |
|---|---|---|
| `/api/ddns` | `POST` / `PUT` | 404 |
| `/api/docker/compose/up` | `POST` | 404 |
| `/api/frontend-preferences` | `PUT` | 404 |
| `/api/logout` | `PUT` | 404 |

所以 **GET 报 404 时不要下结论说接口不存在**，先去
`references/endpoints.md` 查这个路径的方法标记。
`OPTIONS` / `HEAD` 都**无法**用来判断路由是否存在（一律 404），别白费劲。

## 限流

实例响应头里有 `Ratelimit-Limit: 20`（约 **20 次/秒**）。
批量调用必须节流（`scrape_endpoints.py --delay` 默认 0.06s），
遇到 `429` 要退避重试。

## 用法

```bash
# 1) 技能目录：按实际安装位置二选一
SKILL_DIR="$DSH_HOME/skills/lucky-api"            # DSH / NAS
# SKILL_DIR="$HOME/.workbuddy/skills/lucky-api"   # WorkBuddy 本机（Windows 用 $USERPROFILE）

# 2) Python 解释器
PY=python3
# Windows 开发机：# PY="C:/Users/abczhou/.workbuddy/binaries/python/versions/3.13.12/python.exe"

S="$SKILL_DIR/scripts/lucky_api.py"

"$PY" "$S" resolve                        # 0. 看跳板当前解析到哪个直连地址
"$PY" "$S" check                          # 1. 验证 token（排障第一步）
"$PY" "$S" get  /api/status               # 2. 查状态
"$PY" "$S" get  /api/modules/list         #    查已启用模块
"$PY" "$S" get  /api/logs --query limit=20
"$PY" "$S" put  /api/baseconfigure --data @payload.json   # 写：先跟用户确认！
```

退出码：`0` 成功 / `1` 请求或接口报错 / `2` token 未配置或无效。
自动化里可以直接用退出码判定要不要告警。
（`resolve` 只读、不需要 token，永远返回 `0`/`1`。）

## 首次接入流程

1. 确认 `~/.lucky_api.json` 里有 token（没有就让用户补，**不要代填、不要索要明文**）
2. 跑 `resolve` → 确认跳板能解析出直连地址
3. 跑 `check` → 必须看到 `[OK] token 有效`
4. 跑 `get /api/modules/list` → 看这个实例实际启用了哪些模块
5. 再对着 `references/endpoints.md` 挑需要的接口

## 已知接口（本实例 3.0.2）

完整清单见 `references/endpoints.md`：**370 个** `/api/` 接口，覆盖 **39 个模块**
（docker 80 / webservice 33 / rclone 25 / ipfliter 18 / ddns 15 / status 10 /
security-groups 9 / smb 6 / local-path-browser 5 …），
另有 4 个非 `/api/` 前缀的公开接口（`/version`、`/LoginPageConfig`、
`/frontendcontroll`、`/officialwebsiteaddresslist`）。

清单里每条都带**方法标记**与**实测标记**，含义见清单开头的「标记含义」表：
🔒 需 token · ✅ 免鉴权成功 · 🟡 免鉴权直达业务层 · ⚙️ 非 GET（静态解析，未写探测）
· 🆔 按 ID 操作 · ❌ 待复核。

⚠️ **补接口时别只抓主包**：绝大多数模块接口在**懒加载分片**里。
本实例主包 + **92 个懒加载分片**（3.0.2 版本）才覆盖全量；
只抓主包会漏掉大部分接口。另外前端有**反引号模板字符串**
（`` url:`/api/docker/containers/${e}` ``）与**调用点传参**
（`Lt("/api/configure", {}, {...})`）两种写法，只匹配 `url:"..."` 会漏。

Lucky 升级后接口可能变动，直接重跑抓取脚本刷新清单（无需手写）：

```bash
"$PY" "$SKILL_DIR/scripts/scrape_endpoints.py"
# 只抓取不探测：加 --no-verify
# 写到别处比对：加 --out /tmp/endpoints.new.md
```

脚本会走 `index.html` → 主包 → 全部懒加载分片 → 抽取 `/api/` 路径并静态解析
HTTP 方法，然后**只用 GET 探测**存在性（只读、不产生副作用），全程只用 stdlib。

## 易错点

- ⚠️ 别用 HTTP 状态码判成败（见上文 CRITICAL）
- ⚠️ 别硬编码直连端口（会变）；配置里存**跳板地址**
- ⚠️ GET 404 ≠ 接口不存在（按方法+路径路由）
- ⚠️ `~/.lucky_api.json` **文件存在但 `token` 是空字符串**时，同样报
  `[error] token not configured` 并退出码 2——别以为「文件在就没问题」，
  排障时先确认 token 字段非空（用脚本读 key 长度，不要把值打出来）
- ⚠️ 路径写错时 Lucky 返回**纯文本**而非 JSON，
  脚本会识别为「响应不是 JSON」。看到 `Are you ok?` 就是路径错了
- ⚠️ 写入类接口（baseconfigure / reboot_program / compose up·down / prune / kill 等）
  会直接影响线上服务，调用前先跟用户确认，不要自作主张
- ⚠️ 这个地址走 STUN 穿透，可能偶尔不通；脚本失败会自动重试一次
- ⚠️ `/api/ipfliter/`、`/api/update/comfire` 是上游拼写错误，照抄才 200
- ⚠️ `POST /api/login` 的请求体：实测传 JSON 会返回业务报错文案（如账号或密码错误），
  字段名仍建议用真实凭据前再确认一次

## 本仓库接入说明

- **类型**：`skill`（`manifest.json` 的 `type` 为 `skill`）
- **来源**：WorkBuddy 用户级技能 `~/.workbuddy/skills/lucky-api/`（同一份实现，两处同步）
- **同步命令**：`python3 scripts/sync-skill-to-workbuddy.py lucky-api`
  以本仓库 `skills/lucky-api/` 为**唯一实现来源**，生成用户级 SKILL.md 与
  scripts/references 副本（`--dry-run` 可先看差异，`--all` 同步全部技能）
- **安装到 DSH**：技能型**无需安装脚本**。DSH 由 `dsh-skill-filesystem` 提供方
  直接扫描 `$DSH_HOME/skills/`，在 NAS 上 `git pull` 即生效
- **依赖**：零第三方依赖，Python 3.8+ stdlib（`urllib` / `json` / `ssl`）
- **凭据**：`~/.lucky_api.json`，格式 `{"base_url": "...", "token": "..."}`；不进仓库
- **易变地址约定**：仓库与文档里只写**跳板地址**，直连端口一律运行时解析
