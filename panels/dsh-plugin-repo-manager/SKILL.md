---
name: dsh-plugin-repo-manager
description: "DSH 面板插件：从主界面侧边栏图标或设置面板浏览/安装/卸载/更新自建插件仓库（DSHPlugins）中的插件，支持版本检测与一键更新。"
whenToUse: "当需要在 DSH 主界面侧边栏或设置面板里管理自建插件仓库、或排查插件安装/更新问题时。"
invocation:
  modelInvocable: false
  userInvocable: true
---

# dsh-plugin-repo-manager（面板插件）

在 DSH 设置页以面板形式管理自建插件仓库：扫描仓库目录、安装/卸载插件、检测版本更新并一键更新。

## 这是面板型插件（不是技能）

| 项 | 值 |
|----|-----|
| 类型 | `runtime`（Cordis 双半包：host + client） |
| 服务端入口 | `dist/index.js`（**编译产物，已入库**） |
| 客户端入口 | `client/client.js`（自包含 bundle，已入库） |
| 挂载 | `cordis.patch.yml` |

它由 DSH 运行时加载，**不通过技能加载器调用**（`modelInvocable: false`）。人的入口是主界面侧边栏图标或设置面板 UI。

**装了就能用**：产物已编译并提交进 git，目标机不需要 npm 或编译工具链。

## 用法

**两个入口，两处渲染同一个面板：**

1. 重启 DSH
2. 打开 `http://127.0.0.1:2298/`
3. 任选其一：
   - **主界面左侧竖条** → 点 📦 箱子图标（**1 次点击**，最直接）
   - 设置 → 插件 → 「我的插件仓库」tab

侧边栏按钮由 `showSidebarButton` 控制（默认开）：
`cordis.patch.yml` 里设 `false`，或环境变量 `DSH_PLUGIN_SHOW_SIDEBAR=false`。
设为 `false` 时**完全不注册该槽位**，不会留空占位。

按钮图标是**自绘内联 SVG**（`currentColor` 描边，自动跟随主题），不依赖宿主图标集——
宿主认不认某个图标名是运行时未知数，写错不报错、只静默空白。

## 安装 / 卸载（不污染 DSH 源码）

> ### ⚠️ 本目录**不能单独安装**
>
> 唯一安装脚本在**仓库根**的 `scripts/` 下，**不在本目录里**。
> 本目录内的 `scripts/install.sh` 只是**转发桩**，脱离仓库会直接报错退出（退出码 1）。
>
> **如果你是被交付「这个目录」的 agent**：请改用**仓库根**，不要就地安装：
>
> | 环境 | 仓库根 |
> |---|---|
> | NAS（DSH 所在） | `/vol1/1000/AI/DSHPlugin` |
> | 本机开发（Windows） | `C:\Users\abczhou\WorkBuddy\DSHPlugins` |
>
> ```bash
> cd /vol1/1000/AI/DSHPlugin
> git pull                            # 取最新（含本插件产物）
> bash scripts/preflight.sh           # 可选，自检
> bash scripts/install-to-profile.sh  # 唯一的安装命令
> ```
>
> **❌ 绝对不要做的事**：把本目录 `cp -r` 到
> `node_modules/@deepseek-ai/` 或 `dsh-runtime/` 里。
> 本包的 `package.json.name`、`cordis.patch.yml` 的 loader `name`、
> profile `dependencies` 的 key **全都不带作用域**，
> 所以它只能落在 `node_modules/dsh-plugin-repo-manager`（父目录必须正好是
> `node_modules`）。装进作用域目录 → Node 按裸包名解析不到 → DSH 启动报
> `invalid plugin, expect function or object with an "apply" method, received undefined`。
> 写进 `dsh-runtime/` 还额外违反「安装不得污染 DSH 源码」。

```bash
# 安装（在【仓库根】执行，不是在本目录）
bash scripts/install-to-profile.sh

# 卸载（从备份完整还原 profile package.json）
bash scripts/uninstall-from-profile.sh
```

只写入 DSH 的 **profile 目录**（用户数据区），**不修改 DSH 运行时源码**。

## 版本与更新

- 版本号解析顺序：`manifest.json` → `package.json` → `version.json`
- 已装版本从 `skillsDir/<name>/version.json` 读取
- `isNewer()` 做语义化版本逐段比较；版本缺失或无法解析时不提示更新
- 更新前自动整目录备份为 `<插件名>.bak-<ISO时间戳>`，并留档 `previousVersion` / `updatedAt` / `backupDir`

详细机制与 `version.json` 字段说明见本目录 `README.md`。

## 配置

| 配置项 | 环境变量 | 默认值 | 说明 |
|---|---|---|---|
| `repoDir` | `DSH_PLUGIN_REPO_DIR` | `/vol1/1000/AI/DSHPlugin/skills` | 仓库目录（按类型分层的根） |
| `skillsDir` | `DSH_PLUGIN_SKILLS_DIR` | `$DSH_HOME/skills` | 技能安装目标目录 |
| `pollInterval` | `DSH_PLUGIN_POLL_INTERVAL` | `3000` | 自动刷新间隔（毫秒） |
| `showSidebarButton` | `DSH_PLUGIN_SHOW_SIDEBAR` | `true` | 是否显示主界面侧边栏按钮 |
| `sidebarTitle` | `DSH_PLUGIN_SIDEBAR_TITLE` | 语言字典默认值 | 侧边栏按钮提示文案 |

优先级：`cordis.patch.yml` 的 `config` > 环境变量 > 默认值。

修改 `cordis.patch.yml`：

```yaml
- insert:
    - id: plugin-repo
      name: 'dsh-plugin-repo-manager'
      config:
        repoDir: '/path/to/your/skills'
        skillsDir: '~/.dsh/skills'
        pollInterval: 3000
        showSidebarButton: true
        sidebarTitle: '插件仓库'
```

> `repoDir` **必须指向按类型分层的仓库根**（含插件子目录的那一层，通常是 `DSHPlugins/skills`），不是仓库根目录本身。
>
> `skillsDir` / `repoDir` 支持 `~`，会被自动展开为家目录（不会写成字面量 `~` 目录）。
>
> `showSidebarButton` 的布尔解析宽容：`false` / `"0"` / `"no"` / `"off"` 都算关闭；
> **不认识的写法一律回退到默认（显示）**，避免配置拼错把按钮静默弄丢。

## 开发速查

```bash
npm install          # 首次
npm run typecheck    # 期望 0 error
npm run build        # 服务端 → dist/，客户端 → client/client.js
npm test             # 23 + 24 + 14 + 35 例
```

> 改过 `src/client/*` 或 `generate-client.mjs` 后必须重跑 `npm run build`；
> `dist/` 与 `client/client.js` 是**要提交入库的产物**。

