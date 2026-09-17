# DSH 插件仓库（DSHPlugins）

按**类型**分层存放的 DSH / DeepSeek Harness 插件仓库：技能、智能体、MCP 配置、面板各归其位。

## 📦 内容清单

按**类型**分层存放，互不混放：

| 目录 | 放什么 | 当前收录 |
|---|---|---|
| [`skills/`](skills/) | **技能型**能力（有 `SKILL.md`，DSH 扫描发现） | [lucky-api](skills/lucky-api/)、[hello-plugin](skills/hello-plugin/) |
| [`agents/`](agents/) | **智能体 / 专家包**（角色定义，非能力） | _暂无_ |
| [`mcps/`](mcps/) | **MCP 服务配置**（配置片段 + 启动脚本，不含凭据） | _暂无_ |
| [`panels/`](panels/) | **运行时面板插件**（DSH extensions 双半包，带 UI） | [dsh-plugin-repo-manager](panels/dsh-plugin-repo-manager/) |

### 亮点

- **dsh-plugin-repo-manager**（面板） - DSH 设置面板里的「我的插件仓库」
  - 侧边栏按钮入口 / Skill 列表展示 / 安装卸载（带确认）/ 批量操作 / 轮询刷新（默认 3 秒）
- **lucky-api**（技能） - 调用自建 Lucky 实例的 HTTP API
  - 零依赖（Python stdlib），`check / get / post / put` 统一入口
  - 鉴权走 `Lucky-Admin-Token`，成败判 `ret` 而非 HTTP 状态码
  - 附 273 个接口清单，可一键重抓前端刷新

> 三类内容的格式约定、校验方式、安装落点各见其目录下的 `README.md`。

## 🚀 快速开始

### 1. 安装面板插件

```bash
cd panels/dsh-plugin-repo-manager
bash scripts/install.sh
```

### 2. 重启 DSH

```bash
pkill -f 'dsh.*web' || true
dsh --profile web &
```

### 3. 访问

打开 `http://127.0.0.1:2298/` → 设置 → 插件 → **「我的插件仓库」**

或通过侧边栏按钮直接访问。

### 4. 安装技能型插件

```bash
./scripts/sync-to-dsh.sh          # 批量：已装则更新、未装则安装
make install NAME=lucky-api       # 单个（等价 ./scripts/install-plugin.sh lucky-api）
```

## 📁 仓库结构

```
DSHPlugin/
├── skills/                         # 技能型插件（SKILL.md，DSH 扫描发现）
│   ├── lucky-api/                  #   Lucky 实例 API 调用（零依赖客户端 + 接口清单）
│   ├── hello-plugin/               #   示例技能
│   └── README.md                   #   本目录约定与校验方式
├── agents/                         # 智能体 / 专家包（暂无）
│   └── README.md
├── mcps/                           # MCP 服务配置（暂无）
│   └── README.md
├── panels/                         # 运行时面板插件（DSH extensions 双半包）
│   ├── dsh-plugin-repo-manager/    #   「我的插件仓库」面板
│   └── README.md
├── docs/                           # 文档
│   ├── architecture.md             # 架构说明
│   ├── FAQ.md                      # 常见问题
│   ├── development-runbook.md      # 开发指南
│   └── how-to-add-a-plugin.md      # 插件开发指南
├── scripts/
│   └── install-plugin-repo.sh      # 面板安装脚本
├── temp/                           # 中间态/过期文件（仅供参考）
│   ├── deepseek-harness/           # 官方 DSH 源码（参考）
│   ├── packages/                   # 官方包实现（参考）
│   ├── docs-impl/                  # 实现文档（参考）
│   ├── app/                        # 旧版独立面板（过期）
│   └── templates/                  # 模板文件（参考）
├── README.md
└── Makefile
```

> ⚠️ 目录按类型分开后，管理面板的扫描目录 `repoDir` 必须同步（已改为
> `/vol1/1000/AI/DSHPlugin/skills`），否则面板会扫不到技能、列表变空。
> 见 `panels/dsh-plugin-repo-manager/cordis.patch.yml`。

## 🎯 功能特性

| 功能 | 状态 | 说明 |
|------|------|------|
| 侧边栏按钮 | ✅ | 注册到 sidebar 槽 |
| Skill 列表 | ✅ | 从仓库目录读取 |
| 安装/卸载 | ✅ | 带确认对话框 |
| 批量操作 | ✅ | 勾选多个插件 |
| 轮询刷新 | ✅ | 默认 3 秒，可自定义 |
| 安全守卫 | ✅ | kebab-case + 路径穿越防护 |
| 多语言 | ✅ | 中文/英文 |

## ⚙️ 配置

### cordis.patch.yml

```yaml
- insert:
    - id: plugin-repo
      name: 'dsh-plugin-repo-manager'
      config:
        repoDir: '/vol1/1000/AI/DSHPlugin/skills'
        skillsDir: '~/.dsh/skills'
        pollInterval: 3000
```

### 环境变量

```bash
export DSH_PLUGIN_REPO_DIR=/path/to/skills   # 技能仓库目录（管理面板扫描目标）
export DSH_PLUGIN_POLL_INTERVAL=3000
```

## 📊 对比其他方案

| 方案 | 侧边栏 | Skill 管理 | 实时性 | 安装复杂度 | 体积 |
|------|--------|-----------|--------|-----------|------|
| 官方 DSH 源码 | ✅ | ✅ | ⭐⭐⭐ Typert | 高（编译） | 大 |
| dsh-market | ✅ | ✅ | ⭐⭐ WebSocket | 中（npm） | 中 |
| **本插件** | ✅ | ✅ | ⭐ 轮询 | **低（复制）** | **小（14K）** |

## 🔮 未来改进

1. WebSocket 实时推送
2. 插件搜索功能
3. 版本历史管理
4. GitHub 直接安装
5. 自动更新检测

## 📝 HTTP API

```
GET  /api/plugin-repo/list      # 列出所有插件
POST /api/plugin-repo/install   # 安装插件
POST /api/plugin-repo/uninstall # 卸载插件
```

## 📖 相关文档

- [面板实现详情](panels/dsh-plugin-repo-manager/IMPLEMENTATION.md)
- [面板安装指南](panels/dsh-plugin-repo-manager/INSTALL.md)
- [面板方案总结](panels/dsh-plugin-repo-manager/FINAL.md)
- [技能目录约定](skills/README.md) ｜ [面板目录约定](panels/README.md) ｜ [agents](agents/README.md) ｜ [mcps](mcps/README.md)
- [架构文档](docs/architecture.md)
- [开发指南](docs/development-runbook.md)

## 📄 License

MIT
