# hindsight — MCP 服务

用户自建的 **Hindsight MCP 服务**（长期记忆存储，memory bank 名为 `zhouqing`）。

> ⚠️ **本目录不存具体地址。** 因为隧道端口会变，硬编码会立刻过期。
> 正确做法是每次**探测**——见下方「两种地址」。

## 两种地址（核心概念，别搞混）

hindsight 藏在隧道后面，因此有**两层地址**。这不是"远端路径 vs 本地路径"的文件路径问题，
而是**同一个服务的两种寻址方式**：

| | ① 跳板地址（稳定） | ② 隧道直连地址（会变） |
|---|---|---|
| URL 形态 | `http://hindsight_api.abcc.qzz.io/mcp/zhouqing` | `https://hindsight_api.stun.abcc.qzz.io:<PORT>/mcp/zhouqing` |
| 性质 | **寻址入口**，永远在线 | 实际后端，**端口会变** |
| 响应 | `302` 重定向 → ② | 正常 MCP 响应 |
| MCP 客户端能直接用吗 | ❌ **不能** | ✅ 能 |
| 用途 | 拿 ② 的最新值 | 填进配置实际连接 |

**为什么客户端不能用 ①**：那个 302 是**跨协议（http→https）+ 跨域名（abcc→stun）+ 跨端口**的
重定向。MCP 客户端不跟随这种重定向，所以直接用 ① 会报「链接失败 / 握手失败」。

**所以规则是**：用 ① **探测**出 ②，把 ② 写进配置。① 是稳定的，② 是易变的。

> 这也解释了为什么 `hindsight-mcp-repair` 技能存在——它就是在 ② 变掉之后重新探测。

## 目录内容

```
mcps/hindsight/
├── README.md                      # 本文件
├── mcp.template.json              # 配置模板（含占位符，不含真地址）
└── scripts/
    ├── resolve_hindsight_url.py   # 从跳板探测当前的隧道直连地址（只读）
    ├── apply_to_config.py         # 把探测结果写入配置（带备份/验证/原子写）
    └── selfheal.sh                # 无人值守封装（供定时自动化 / cron 调用）
```

> **这三个脚本是本仓库对 hindsight 自愈逻辑的唯一实现。** 别在别处再写一份 ——
> 见下方「为什么强调唯一实现」。

## 用法

### 探测当前地址

```bash
# 只打印地址
python3 mcps/hindsight/scripts/resolve_hindsight_url.py

# 探测 + 握手验证（推荐）
python3 mcps/hindsight/scripts/resolve_hindsight_url.py --verify

# JSON 输出（供程序消费）
python3 mcps/hindsight/scripts/resolve_hindsight_url.py --verify --json
```

退出码：`0` 成功 · `1` 探测失败（跳板不通）· `2` 探测到了但握手失败

### 写入配置

```bash
# 写入 WorkBuddy 默认配置 ~/.workbuddy/mcp.json
python3 mcps/hindsight/scripts/apply_to_config.py

# 先预览
python3 mcps/hindsight/scripts/apply_to_config.py --dry-run

# 写入其他客户端的配置（如 NAS 上的 DSH）
python3 mcps/hindsight/scripts/apply_to_config.py --config /path/to/mcp.json
```

写入脚本的安全保证：**只改 hindsight 一个条目的 `url`** · 先备份 · 写前验证 ·
原子写 · 改坏了可还原。已实测其他条目不被动、`disabled` 等字段保留。

### 无人值守（自动自愈）

```bash
bash mcps/hindsight/scripts/selfheal.sh              # 修 ~/.workbuddy/mcp.json
bash mcps/hindsight/scripts/selfheal.sh --dry-run    # 只看不做
MCP_CONFIG=/path/to/mcp.json bash mcps/hindsight/scripts/selfheal.sh
```

`selfheal.sh` 是**薄封装**：自己不实现探测/写入，只负责找 python、把路径转成原生形式、
调 `apply_to_config.py`、写日志、把退出码翻译成可读结论。日志默认在
`~/.workbuddy/hindsight_selfheal.log`（可用 `SELFHEAL_LOG` 覆盖）。

退出码：`0` 成功或无需变更 · `1` 失败（跳板不通 / 握手失败 / 配置异常）

**已配置定时自动化**在本机每 6 小时跑一次（WorkBuddy 侧）。NAS 侧若也要自动自愈，
用 cron 调用同一个 `selfheal.sh` 即可（脚本自定位，不依赖 cwd）：

```cron
0 */6 * * * MCP_CONFIG=/vol2/@appdata/deepseek.harness/dsh-data/<mcp 配置> \
  bash /vol1/1000/AI/DSHPlugin/mcps/hindsight/scripts/selfheal.sh
```

## 为什么强调唯一实现

这段逻辑**曾经有三份各自独立的实现**，改一处容易漏两处：

| 位置 | 状态 |
|---|---|
| `mcps/hindsight/scripts/`（本目录） | ✅ **唯一实现**，保留 |
| `~/.workbuddy/skills/hindsight-mcp-repair/SKILL.md` 的内联 curl/python 片段 | ❌ 已删除，改为指向本目录 |
| `WorkBuddy/2026-08-04-10-01-11/.workbuddy/hindsight_selfheal.sh` | ❌ 已改为**纯转发桩**，不含逻辑 |

统一于 2026-09-18。**要改逻辑请只改本目录的三个文件。**

## 落地位置（三个客户端各不相同）

| 客户端 | 配置文件 | 说明 |
|---|---|---|
| **WorkBuddy** | `~/.workbuddy/mcp.json` | 用户级。`mcpServers` 下加条目 |
| **DSH** | `$DSH_HOME` 下的 MCP 配置 | 见下方「DSH 侧」 |
| 其他 MCP 客户端 | 各自配置 | 字段结构同理，键名是 `mcpServers` |

> 键名是 **`mcpServers`**，不是 `servers`。写错不会报错，只会静默不生效。

### DSH 侧

本仓库的 DSH 部署事实（见 `docs/development-runbook.md`）：

```
DSH 数据根 $DSH_HOME = /vol2/@appdata/deepseek.harness/dsh-data
DSH 运行时           = /vol2/@appdata/deepseek.harness/dsh-runtime
profile              = $DSH_HOME/profiles/web
```

⚠️ **DSH 的 MCP 配置文件名尚未确认**（本机无 DSH，无法验证）。请先在 NAS 上执行：

```bash
ls -la /vol2/@appdata/deepseek.harness/dsh-data/ | grep -i mcp
# 也看看 profile 目录：
ls -la /vol2/@appdata/deepseek.harness/dsh-data/profiles/web/ | grep -i mcp
```

确认文件名后，用 `--config` 指定即可：

```bash
python3 mcps/hindsight/scripts/apply_to_config.py \
    --config /vol2/@appdata/deepseek.harness/dsh-data/<实际文件>
```

**若该文件尚不存在**（DSH 未配过任何 MCP），先从模板开始：

```bash
cp mcps/hindsight/mcp.template.json <目标路径>
# 把 <TUNNEL_HOST> / <PORT> 换成探测到的值
python3 mcps/hindsight/scripts/resolve_hindsight_url.py
```

### DSH 与 WorkBuddy 的配置**是两份独立的文件**

在 NAS 上给 DSH 配好，**不会**让本机的 WorkBuddy 生效，反之亦然。两边都要各自配一次。
共用的是同一套脚本（探测逻辑与地址无关）。

## 关于 TLS 证书（实测发现，值得知道）

隧道地址的证书**主机名不匹配**：证书并非签发给 `stun.abcc.qzz.io`。实测差异：

| 工具 | 证书库 | 结果 |
|---|---|---|
| `curl` | 系统证书库（宽松） | ✅ HTTP 200 |
| Python `urllib` | 自带 CA 包（严格） | ❌ `CERTIFICATE_VERIFY_FAILED: Hostname mismatch` |

服务端本身正常，是 Python 的严格校验与「隧道 + 跳板证书」这一部署方式不兼容。
因此 `resolve_hindsight_url.py` 的握手验证**默认放宽 TLS 校验**（仅用于判断"服务是否响应"，
不代表认可该证书）。要严格校验加 `--strict-tls`，此时大概率会失败——这是**预期行为**，不是脚本坏了。

MCP 客户端实际能连上，说明它也不做严格主机名校验。

## 凭据

本 MCP **当前配置不需要 token**（`mcp.json` 里只有 `url` 和 `disabled` 两个字段）。
若将来加了鉴权，按 `mcps/README.md` 的约定走环境变量或外部文件，**不要写进本目录**。

## 校验

```bash
python3 scripts/validate_repo.py mcps/hindsight
bash scripts/preflight.sh
```
