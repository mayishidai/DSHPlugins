# mcps/ — MCP 服务配置

放 **MCP（Model Context Protocol）服务定义**：本项目自建或自托管的 MCP server
的配置模板、启动脚本与说明。**不放凭据**。

## 目录约定

```
mcps/<name>/
├── README.md         # 必需。这个 MCP 提供什么能力、依赖什么、怎么启
├── mcp.json          # 建议。可合并进 mcp.json 的片段（不含 token）
├── server/           # 可选。MCP server 源码（若是本项目自研）
└── scripts/          # 可选。启动 / 健康检查脚本
```

## 凭据约定

- token、API key、密码一律用环境变量或 `~/.<name>_config.json` 之类的**外部**文件承载
- 仓库内只写「变量名 + 格式 + 获取方式」，**不写值**
- 提交前可用仓库自带的凭据粗筛兜底：

  ```bash
  python3 scripts/validate_repo.py       # 含凭据粗筛
  bash scripts/preflight.sh              # 同上
  ```

## 在 DSH 上如何落地

MCP 的配置**不进 DSH 目录**，它由 MCP 客户端读取。DSH 与 WorkBuddy 各有一份配置：

| 客户端 | 配置文件 | 说明 |
|--------|----------|------|
| WorkBuddy | `~/.workbuddy/mcp.json` | `mcpServers` 下加条目 |
| DSH | `$DSH_HOME` 下的 MCP 配置 | 见下方「DSH 侧位置」 |

合并片段示例（**注意 `mcp.json` 的键名，不是 `servers`**）：

```json
{
  "mcpServers": {
    "<name>": {
      "command": "node",
      "args": ["/path/to/mcps/<name>/server/index.js"],
      "env": {
        "<TOKEN_ENV>": "${<TOKEN_ENV>}"
      }
    }
  }
}
```

### DSH 侧位置

已知事实（来自 `docs/development-runbook.md`）：

```
$DSH_HOME = /vol2/@appdata/deepseek.harness/dsh-data
运行时     = /vol2/@appdata/deepseek.harness/dsh-runtime
profile    = $DSH_HOME/profiles/web
```

⚠️ **DSH 的 MCP 配置具体文件名尚未确认**（本机无 DSH）。首次接入时先在 NAS 上确认：

```bash
ls -la /vol2/@appdata/deepseek.harness/dsh-data/ | grep -i mcp
ls -la /vol2/@appdata/deepseek.harness/dsh-data/profiles/web/ | grep -i mcp
```

> **DSH 与 WorkBuddy 的配置是两份独立文件。** 给一边配好不会让另一边生效，
> 两边需各自配一次。可复用的是脚本（探测逻辑与客户端无关）。

### 落地步骤

1. 把 `mcp.json` 片段合并进目标客户端的配置文件（**先读原文件，不要整体覆盖**）
2. 凭据写进环境变量或外部配置文件，**不要写进仓库**
3. 重启客户端
4. 在连接器管理页的「自定义连接器」入口对新增的 server 点击 **信任（Trust）**

> ⚠️ **MCP 不会自动生效**，第 4 步的信任是必须的——不加信任时配置存在但不会被调用。

## 当前收录

| MCP | 说明 | 落地方式 |
|---|---|---|
| [hindsight](hindsight/) | 自建 Hindsight 长期记忆服务（隧道后，端口会变） | 模板 + 探测脚本（**不硬编码地址**） |

### 两条经验（来自 hindsight 的接入）

**① 地址易变的 MCP 不要硬编码。**

以 hindsight 为例，它藏在隧道后面：跳板地址 `http://hindsight_api.abcc.qzz.io/mcp/zhouqing`
稳定但返回 **302**（跨协议+跨域名+跨端口），MCP 客户端**不跟随**，所以配置里必须写直连地址
`https://hindsight_api.stun.abcc.qzz.io:<PORT>/...` —— 而那个端口**会变**。

因此仓库里只存**模板（占位符）+ 探测脚本**，不存具体地址。校验脚本会拦截硬编码：
含 `stun.<域名>:<端口>` 且无占位符 → **FAIL**。

**② 有些 MCP 是「两层地址」，要分清。**

| | 稳定层（跳板/寻址入口） | 易变层（直连地址） |
|---|---|---|
| 用途 | 用来**探测**最新直连地址 | 填进配置**实际连接** |
| 是否写进配置 | ❌ 不写（客户端不跟随 302） | ✅ 写 |

## 校验

```bash
python3 scripts/validate_repo.py mcps/<name>   # 含 mcp 专属检查
bash scripts/preflight.sh
```

MCP 型专属校验项：

- 配置文件是合法 JSON
- 含 **`mcpServers`** 键（写成 `servers` 会静默失效，故必须检查）
- **未硬编码易变隧道地址**（占位符 `<X>` 允许）
