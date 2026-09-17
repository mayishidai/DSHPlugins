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
    └── apply_to_config.py         # 把探测结果写入配置（带备份/验证/原子写）
```

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
