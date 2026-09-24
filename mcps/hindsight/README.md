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
    ├── hindsight_paths.py         # **落点探测**：配置文件 / 日志在哪（唯一实现，只读）
    ├── resolve_hindsight_url.py   # 从跳板探测当前的隧道直连地址（只读）
    ├── apply_to_config.py         # 把探测结果写入配置（带备份/验证/原子写）
    └── selfheal.sh                # 无人值守封装（供定时自动化 / cron 调用）
```

> **这四个脚本是本仓库对 hindsight 的唯一实现。** 别在别处再写一份 ——
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
# 写入生效落点（**运行时探测**，见下方「安装在哪儿」）
python3 mcps/hindsight/scripts/apply_to_config.py

# 只看落点解析过程（全部候选逐条列出）—— 排查第一步，最省事
python3 mcps/hindsight/scripts/apply_to_config.py --print-config-path

# 先预览
python3 mcps/hindsight/scripts/apply_to_config.py --dry-run

# 写入其他客户端的配置（如 NAS 上的 DSH）
python3 mcps/hindsight/scripts/apply_to_config.py --config /path/to/mcp.json
```

写入脚本的安全保证：**只改 hindsight 一个条目的 `url`** · 先备份 · 写前验证 ·
原子写 · 改坏了可还原。已实测其他条目不被动、`disabled` 等字段保留。

### 无人值守（自动自愈）

```bash
bash mcps/hindsight/scripts/selfheal.sh              # 运行时探测落点后自愈
bash mcps/hindsight/scripts/selfheal.sh --dry-run    # 只看不做
bash mcps/hindsight/scripts/selfheal.sh --where      # 只打印落点解析（排查第一步）
MCP_CONFIG=/path/to/mcp.json bash mcps/hindsight/scripts/selfheal.sh
```

`selfheal.sh` 是**薄封装**：自己不实现探测/写入，也不自己算落点，只负责找 python、
把路径转成原生形式、问 `hindsight_paths.py` 落点在哪、调 `apply_to_config.py`、
写日志、把退出码翻译成可读结论。

日志默认落在**配置文件所在目录**的 `hindsight_selfheal.log`（可用 `SELFHEAL_LOG`
覆盖）。本机因此仍是 `~/.workbuddy/hindsight_selfheal.log`（与原行为一致）；
DSH 上则自然落到数据卷一侧，不再写进容器内的 `/root`。

#### 日志会轮转（否则它会无声长到几十 MB）

| 环境变量 | 默认 | 含义 |
|---|---|---|
| `SELFHEAL_LOG_MAX_BYTES` | `1048576`（1MB） | 超过就在写日志前轮转 |
| `SELFHEAL_LOG_KEEP_LINES` | `2000` | 轮转时旧日志保留最后多少行 |

轮转动作 = 把旧日志的**末尾 N 行**存到 `<日志>.1`，主日志截断，并把这次轮转
**自己写进日志**（`ROTATE ...` 行）。所以日志总量有界（≈ 上限 + 保留行数），
且历史不会整段丢失。

> 为什么加它：2026-09-23 发现该日志已长到 **21MB** —— 每 6 小时 3 行、只增不减，
> 而且**没有任何提示**。属本仓库「死配置 / 静默失效」的同一族：功能在跑、
> 文件在长、没人会发现。

退出码：`0` 成功或无需变更 · `1` 失败（落点解析失败 / 跳板不通 / 握手失败 / 配置异常）

**已配置定时自动化**在本机每 6 小时跑一次（WorkBuddy 侧）。NAS 侧若也要自动自愈，
用 cron 调用同一个 `selfheal.sh` 即可（脚本自定位，不依赖 cwd）：

```cron
0 */6 * * * MCP_CONFIG=/vol2/@appdata/deepseek.harness/dsh-data/<mcp 配置> \
  bash /vol1/1000/AI/DSHPlugin/mcps/hindsight/scripts/selfheal.sh
```

> 若该 DSH 机器上 `DSH_HOME` 已导出到环境（cron 里通常不会），就可以省掉
> `MCP_CONFIG=` —— 脚本会自己在 `$DSH_HOME` 子树里找配置文件。见下节。

## 为什么强调唯一实现

这套逻辑**曾经有过三份各自独立的实现**，改一处容易漏两处：

| 位置 | 状态 |
|---|---|
| `mcps/hindsight/scripts/`（本目录） | ✅ **唯一实现**，保留 |
| `~/.workbuddy/skills/hindsight-mcp-repair/SKILL.md` 的内联 curl/python 片段 | ❌ 已删除，改为指向本目录 |
| `WorkBuddy/2026-08-04-10-01-11/.workbuddy/hindsight_selfheal.sh` | ❌ 已改为**纯转发桩**，不含逻辑 |

统一于 2026-09-18。

**「落点怎么算」也踩过同一棵树**：`apply_to_config.py` 与 `selfheal.sh` 各写死
一份默认值，两边指向同一个（在容器里是错的）位置。现在收成
`scripts/hindsight_paths.py` 一处，两个调用方都来问它。

⇒ **要改逻辑请只改本目录的四个文件。** 往这个目录加第 5 个文件之前，先想清楚
它是否又造了第二份判据 —— 本仓库对「同一判据只放一处」配了守卫
（`validate_repo.py` 的 2.10 会拦「宿主路径写死成默认值」，含 `.py`）。

## 安装在哪儿（落点**运行时探测**，不写死）

> ⚠️ 2026-09-23 修：这里曾经两边各写死一份默认值 ——
> `apply_to_config.py` 的 `DEFAULT_CONFIG = Path.home()/".workbuddy"/"mcp.json"`、
> `selfheal.sh` 的 `MCP_CONFIG="${MCP_CONFIG:-$HOME/.workbuddy/mcp.json}"`。
> 容器里 `$HOME` 是 `/root`，而真实数据卷挂在别处 → 每次都报「配置文件不存在」，
> **而报错里看不出正确的文件其实在别处**。唯一实现现为 `scripts/hindsight_paths.py`。

探测顺序（`hindsight_paths.py`，前三个是显式来源，用户意志优先）：

| # | 候选 | 说明 |
|---|---|---|
| 1 | `--config` | 命令行显式指定（或给**目录**，会在其中自动定位） |
| 2 | `$MCP_CONFIG` | 环境变量 |
| 3 | `$DSH_MCP_CONFIG` | 环境变量 |
| 4 | `$DSH_HOME` 子树 | **按内容特征**找含 `mcpServers` 键的 json |
| 5 | `$WORKBUDDY_HOME/mcp.json` | 环境变量 |
| 6 | `~/.workbuddy/mcp.json` | 仅作为**候选**出现，不是默认值 |

三条关键约定：

- **`$DSH_HOME` 一旦设置即权威**：只在它的子树里挑，**不跨到 `~`**。
  否则会正好踩到本问题自己留下的残留 —— 容器里 `~/.workbuddy/mcp.json`
  往往正是被写死默认值造出来的那份，恰好在**错误的位置**存在。
  未设置就如实说「跳过」，**不猜宿主数据根**。
- **第 4 步不猜文件名。** DSH 的 MCP 配置叫什么是**没被确认过**的事实，
  按内容特征找比按名字猜更稳，而且**可自证**（报告扫了多少个 `.json`、命中几个）。
  所以不再需要人工 `ls | grep`。
- **日志跟着配置走**：`$SELFHEAL_LOG` > `<配置目录>/hindsight_selfheal.log`。

### 排查第一步：`--explain`

```bash
python3 mcps/hindsight/scripts/hindsight_paths.py --explain
# 或等价的：apply_to_config.py --print-config-path / selfheal.sh --where
```

它把**全部候选 + 各自检查结果**都列出来，把「像不像真正的落点」变成可读的事实：

```
配置文件候选（按优先级逐条如实报告）：
  [1] --config         跳过：未设置
                       ← 命令行显式指定
  ...
  [4] $DSH_HOME 子树#1  ✓ 存在 · ✓ 含 mcpServers（2 个） · ✓ 含 hindsight 条目
                       ← 扫描 1 个 .json，命中 1 个
                       /vol2/@appdata/deepseek.harness/dsh-data/profiles/web/mcp.json
  [6] ~/.workbuddy     ✓ 存在 · ✓ 含 mcpServers（1 个） · ✓ 含 hindsight 条目

生效落点: /vol2/.../profiles/web/mcp.json
  来自: $DSH_HOME 子树#1（扫描 1 个 .json，命中 1 个）
```

它还会**主动喊「可能错位」**：生效落点里没有 `hindsight` 条目，但别的候选里有
—— 这几乎总是落点选错了，而不是服务出问题。只报「文件不存在」而不说「我找过
哪些地方」，正是上面那个坑。

落点解析不出来时（没有任何候选可用）返回**退出码 3**，而不是静默给一个假默认值。

### 三个客户端的落点各不相同

| 客户端 | 配置文件 | 说明 |
|---|---|---|
| **WorkBuddy** | `~/.workbuddy/mcp.json` | 用户级。`mcpServers` 下加条目 |
| **DSH** | `$DSH_HOME` 下的 MCP 配置 | 由脚本自动发现，见上表第 4 项 |
| 其他 MCP 客户端 | 各自配置 | 字段结构同理，键名是 `mcpServers` |

> 键名是 **`mcpServers`**，不是 `servers`。写错不会报错，只会静默不生效。

### DSH 侧

本仓库的 DSH 部署事实（见 `docs/development-runbook.md`）：

```
DSH 数据根 $DSH_HOME = /vol2/@appdata/deepseek.harness/dsh-data
DSH 运行时           = /vol2/@appdata/deepseek.harness/dsh-runtime
profile              = $DSH_HOME/profiles/web
```

在该机器上导出 `DSH_HOME` 即可让脚本自己找到配置：

```bash
DSH_HOME=/vol2/@appdata/deepseek.harness/dsh-data \
  python3 mcps/hindsight/scripts/apply_to_config.py --dry-run
```

先看它选中了哪份（不确定就永远先跑这一步）：

```bash
DSH_HOME=... python3 mcps/hindsight/scripts/hindsight_paths.py --explain
```

若 `$DSH_HOME` 里**还没有**任何 MCP 配置（DSH 未配过 MCP），脚本会给出一条
「建议新建」的路径并明确告知 —— 这时从模板开始：

```bash
cp mcps/hindsight/mcp.template.json <目标路径>
# 把 <TUNNEL_HOST> / <PORT> 换成探测到的值
python3 mcps/hindsight/scripts/resolve_hindsight_url.py
```

`$DSH_HOME` 不方便传（如 cron）时，用 `MCP_CONFIG=<实际文件>` 显式指定即可。

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
python3 scripts/validate_repo.py mcps/hindsight   # MCP 专属检查（含「不硬编码易变地址」）
python3 scripts/validate_repo.py                 # 仓库级：含 2.10「宿主路径不得写死」
bash scripts/preflight.sh
```

自测落点解析器（不需要网络）：

```bash
python3 mcps/hindsight/scripts/hindsight_paths.py --explain
# 模拟一台 DSH：造个假数据根，检查它能否按内容特征找到配置、且日志跟着走
```

`validate_repo.py` 的 **2.10「宿主路径必须运行时探测」**就是为本节这类问题设的：
它会扫全仓库 `.sh` **与 `.py`**，拦「变量默认值回退到 `~` / `$HOME` / 数据卷根」
（变量名须命中宿主语义，避免误伤每用户配置文件）。反向回归在
`scripts/tests/test-host-path-guard.py`（`make verify` 第 8 步）——
它会在内存里把判据改窄回失明状态，确认注入**抓不到**，以此证明守卫非空转。
