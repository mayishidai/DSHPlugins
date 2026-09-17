# mcps/ — MCP 服务配置

放 **MCP（Model Context Protocol）服务定义**：本项目自建或自托管的 MCP server
的配置模板、启动脚本与说明。**不放凭据**。

## 目录约定

```
mcps/<name>/
├── README.md         # 必需。这个 MCP 提供什么能力、依赖什么、怎么启
├── mcp.json          # 建议。可合并进 ~/.workbuddy/mcp.json 的片段（不含 token）
├── server/           # 可选。MCP server 源码（若是本项目自研）
└── scripts/          # 可选。启动 / 健康检查脚本
```

## 凭据约定

- token、API key、密码一律用环境变量或 `~/.<name>_config.json` 之类的**外部**文件承载
- 仓库内只写「变量名 + 格式 + 获取方式」，**不写值**
- 提交前可用校验脚本的凭据粗筛兜底：

  ```bash
  python3 ~/.workbuddy/skills/dsh-plugin-repo-add/scripts/validate_plugin.py mcps/<name> --repo .
  ```

## 落地到本机

MCP 不会自动生效。把配置片段合并进 `~/.workbuddy/mcp.json` 的 `mcpServers` 后，
还需在连接器管理页右上角的「自定义连接器」入口点击 **信任（Trust）** 才会启用。

## 当前收录

_（暂无）_
