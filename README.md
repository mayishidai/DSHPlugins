# DSH 插件仓库管理插件

轻量级、可插拔的 DSH 插件仓库管理插件。

## 📦 核心插件

- **[dsh-plugin-repo-manager](plugins/dsh-plugin-repo-manager/)** - 插件仓库管理面板
  - 侧边栏按钮入口
  - Skill 列表展示
  - 安装/卸载管理
  - 自定义轮询刷新（默认 3 秒）
  - 批量操作支持
- **[lucky-api](plugins/lucky-api/)** - 技能型插件：调用自建 Lucky 实例的 HTTP API
  - 零依赖（Python stdlib），`check / get / post / put` 统一入口
  - 鉴权走 `Lucky-Admin-Token`，成败判 `ret` 而非 HTTP 状态码
  - 附 273 个接口清单，可一键重抓前端刷新

## 🚀 快速开始

### 1. 安装插件

```bash
cd plugins/dsh-plugin-repo-manager
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

## 📁 仓库结构

```
DSHPlugin/
├── plugins/
│   ├── dsh-plugin-repo-manager/    # 主插件（可插拔）
│   ├── lucky-api/                  # 技能型插件：Lucky 实例 API 调用
│   └── hello-plugin/               # 示例插件
├── docs/                           # 文档
│   ├── architecture.md             # 架构说明
│   ├── FAQ.md                      # 常见问题
│   ├── development-runbook.md      # 开发指南
│   └── how-to-add-a-plugin.md      # 插件开发指南
├── scripts/
│   └── install-plugin-repo.sh      # 安装脚本
├── temp/                           # 中间态/过期文件（仅供参考）
│   ├── deepseek-harness/           # 官方 DSH 源码（参考）
│   ├── packages/                   # 官方包实现（参考）
│   ├── docs-impl/                  # 实现文档（参考）
│   ├── app/                        # 旧版独立面板（过期）
│   └── templates/                  # 模板文件（参考）
├── README.md
└── Makefile
```

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
        repoDir: '/vol1/1000/AI/DSHPlugin/plugins'
        skillsDir: '~/.dsh/skills'
        pollInterval: 3000
```

### 环境变量

```bash
export DSH_PLUGIN_REPO_DIR=/path/to/plugins
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

- [插件实现详情](plugins/dsh-plugin-repo-manager/IMPLEMENTATION.md)
- [安装指南](plugins/dsh-plugin-repo-manager/INSTALL.md)
- [最终方案总结](plugins/dsh-plugin-repo-manager/FINAL.md)
- [架构文档](docs/architecture.md)
- [开发指南](docs/development-runbook.md)

## 📄 License

MIT
