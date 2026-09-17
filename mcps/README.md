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
| DSH | 见 DSH 的 MCP 配置位置 | 字段结构同理 |

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

### 落地步骤

1. 把 `mcp.json` 片段合并进目标客户端的配置文件（**先读原文件，不要整体覆盖**）
2. 凭据写进环境变量或外部配置文件，**不要写进仓库**
3. 重启客户端
4. 在连接器管理页的「自定义连接器」入口对新增的 server 点击 **信任（Trust）**

> ⚠️ **MCP 不会自动生效**，第 4 步的信任是必须的——不加信任时配置存在但不会被调用。

## 当前收录

_（暂无）_

## 校验

```bash
python3 scripts/validate_repo.py mcps/<name>
```
