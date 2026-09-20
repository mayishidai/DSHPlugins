# dsh-plugin-repo-manager

DSH 插件：从**主界面侧边栏**或设置面板管理自定义插件仓库。

## 功能

- **主界面侧边栏图标按钮**：一键打开插件仓库面板（不必再翻设置）
- 查看插件仓库中的所有插件
- 显示已安装/未安装状态
- 一键安装 / 一键卸载已安装插件（带确认对话框）
- **版本检测**：对比仓库版本与已装版本，标出「可更新」
- **一键更新**：单个更新或「⬆ 全部更新」批量串行更新
- **更新留档**：更新前自动整目录备份为 `<插件名>.bak-<ISO时间戳>`，并在 `version.json` 记录 `previousVersion` / `updatedAt` / `backupDir`
- 支持多语言（中文/英文）

## 两个入口

插件同时注册两个位置，两处渲染同一个面板：

| 入口 | 槽位 | 说明 |
|------|------|------|
| **主界面侧边栏** | `sidebar` | 左侧竖条上的箱子图标按钮，点击打开面板。可用 `showSidebarButton: false` 关闭。 |
| 设置面板 tab | `settings.plugins.tab` | 设置 → 插件 → 「我的插件仓库」 |

> **侧边栏按钮是自绘的内联 SVG**，不依赖宿主的图标集。
> 原因：把图标名（如 `icon: 'package'`）交给宿主去渲染，等于把「宿主认不认这个名字」
> 变成运行时未知数——名字写错**不会报错**，只会静默显示空白，是最难发现的一类失效。
> SVG 用 `currentColor` 描边，因此会自动跟随侧边栏的深浅色主题。

### 侧边栏按钮配置

```yaml
- insert:
    - id: plugin-repo
      name: 'dsh-plugin-repo-manager'
      config:
        showSidebarButton: true    # false 则完全不注册该槽位
        sidebarTitle: '插件仓库'    # hover 提示 / 无障碍标签；留空用语言字典默认值
```

`showSidebarButton` 也可用环境变量控制：`DSH_PLUGIN_SHOW_SIDEBAR=false`。

> 布尔解析刻意宽容：`false` / `"false"` / `"0"` / `"no"` / `"off"` 都识别为关闭。
> **不用 `Boolean(raw)`** —— 字符串 `"false"` 在 JS 里是**真值**，那样写会导致
> 「配置里关掉了、实际却还显示」这种最难排查的失效。无法识别的值一律回退到默认
> （显示），避免配置拼错把按钮静默弄丢。

> 关闭时是**整个不注册槽位**，而不是「注册后渲染 `null`」。渲染 `null` 仍会占位，
> 仍可能被宿主画出分隔线或引起布局抖动。

## 版本与更新机制

### 版本号来源

插件版本按以下顺序解析（取第一个命中的）：

| 顺序 | 文件 | 适用类型 |
|------|------|----------|
| 1 | `manifest.json` 的 `version` | skill / agent / mcp / runtime |
| 2 | `package.json` 的 `version` | 面板型（npm 包） |
| 3 | `version.json` 的 `version` | 已安装留档兜底 |

> 已安装版本只从 `skillsDir/<name>/version.json` 读取（安装时写入）。

### 更新判定

`isNewer(latest, current)` 做语义化版本逐段数字比较，规则：

- 版本号任一侧缺失 → 不提示更新（返回 `false`）
- 版本号无法解析（含非数字段，如 `abc`）→ 不提示更新，避免误报
- 支持 `v` 前缀（`v1.2.3`）与预发布后缀（`1.1.0-alpha` 按 `1.1.0` 比较）
- 段的位数不齐时按 0 补齐（`1.0` 等价 `1.0.0`）

基础用例见 `scripts/test-isnewer.mjs`（23 例）：

```bash
node scripts/test-isnewer.mjs
```

### 更新流程（installPlugin）

1. 读取已装 `version.json` 得到 `fromVersion`，判定本次是安装还是更新
2. **更新前整目录备份**到 `<targetDir>.bak-<ISO时间戳>`
3. 清空旧目录（避免已删除文件在更新后残留）
4. 递归复制新内容（用 `statSync` 判断目录，空目录也能正确复制）
5. 写 `version.json`：保留原 `installedAt`，新增/刷新 `version`、`updatedAt`、`previousVersion`、`backupDir`

### `version.json` 示例

```json
{
  "name": "lucky-api",
  "version": "1.1.0",
  "installedAt": "2026-09-17T12:00:00.000Z",
  "updatedAt": "2026-09-18T09:30:00.000Z",
  "previousVersion": "1.0.0",
  "backupDir": "/path/to/skills/lucky-api.bak-2026-09-18T09-30-00-000Z"
}
```

## 安装

本插件**已把编译产物入库**，目标机无需 npm / 编译工具链。

```bash
# 推荐：从仓库根目录安装（只写 DSH profile，不改 DSH 源码）
bash ../../scripts/install-to-profile.sh

# 或指定 profile 路径
PROFILE_DIR=/vol2/@appdata/deepseek.harness/dsh-data/profiles/web \
    bash ../../scripts/install-to-profile.sh
```

安装脚本做三件事：复制 `dist/` + `client/` + `cordis.patch.yml` 到 profile 的
`node_modules/dsh-plugin-repo-manager/`、用 python3 安全更新
profile `package.json`、备份原 `package.json`。

卸载（从备份完整还原）：

```bash
bash ../../scripts/uninstall-from-profile.sh
```

> `scripts/install.sh` 已改为**转发桩**，本身不实现安装逻辑，只是 `exec` 到仓库根的
> `scripts/install-to-profile.sh`。原因：它曾是同一逻辑的第二份实现，落点写成了
> 带作用域的路径，导致 Node 解析不到包、DSH 报 `received undefined`。
> 保留该路径只为不打断既有引用。

### 从源码构建（开发机）

改完源码后需要重新编译并提交产物：

```bash
npm install          # 首次
npm run build        # 服务端 tsc + 客户端 bundle
npm test             # 三项测试
npm run typecheck    # 0 error
```

## 使用方法

1. 重启 DSH
2. 打开 `http://127.0.0.1:2298/`
3. 两种进法任选：
   - **主界面左侧竖条** → 点 📦 箱子图标
   - **设置** → **插件** → 「我的插件仓库」tab

## 配置

默认仓库目录：`/vol1/1000/AI/DSHPlugin/skills`

如需修改，编辑 `cordis.patch.yml`：

```yaml
- insert:
    - id: plugin-repo
      name: 'dsh-plugin-repo-manager'
      config:
        repoDir: '/path/to/your/plugins'
        showSidebarButton: true
```

| 配置项 | 环境变量 | 默认值 | 说明 |
|---|---|---|---|
| `repoDir` | `DSH_PLUGIN_REPO_DIR` | `/vol1/1000/AI/DSHPlugin/skills` | 仓库目录（按类型分层的根，通常是 `DSHPlugins/skills`） |
| `skillsDir` | `DSH_PLUGIN_SKILLS_DIR` | `$DSH_HOME/skills` | 技能安装目标目录 |
| `pollInterval` | `DSH_PLUGIN_POLL_INTERVAL` | `3000` | 自动刷新间隔（毫秒） |
| `showSidebarButton` | `DSH_PLUGIN_SHOW_SIDEBAR` | `true` | 是否显示主界面侧边栏按钮 |
| `sidebarTitle` | `DSH_PLUGIN_SIDEBAR_TITLE` | 语言字典默认值 | 侧边栏按钮提示文案 |

优先级：`cordis.patch.yml` 的 `config` > 环境变量 > 默认值。

## 架构

```
dsh-plugin-repo-manager/
├── src/                    # TypeScript 源码（安装时不复制到目标机）
│   ├── index.ts            # Host 入口（扫描/安装/卸载/更新/版本比较/配置解析）
│   ├── types/
│   │   └── host.d.ts       # DSH 宿主包类型声明桩（仅类型检查用）
│   └── client/
│       ├── index.tsx       # Client 注册（侧边栏按钮 + 设置 tab，含 JSX 故为 .tsx）
│       ├── locales.ts      # 国际化字典
│       └── PluginRepoPanel.tsx  # React 面板组件
├── dist/                   # ★ 服务端编译产物（入库，安装时使用）
│   ├── index.js
│   └── index.d.ts
├── client/
│   └── client.js           # ★ 客户端 bundle（入库，由 generate-client.mjs 生成）
├── cordis.patch.yml        # Cordis 挂载配置（含侧边栏开关）
├── manifest.json           # 插件元数据（版本号来源之一）
├── package.json            # main → dist/index.js
├── tsconfig.json           # 类型检查配置（noEmit）
├── tsconfig.build.json     # 编译配置（输出到 dist/）
├── generate-client.mjs     # 客户端 bundle 生成脚本
└── scripts/
    ├── install.sh          # 转发桩（唯一实现在仓库根 scripts/）
    ├── test-isnewer.mjs    # 版本比较单元测试（23 例）
    ├── test-install-update.mjs  # 安装/更新流程端到端测试（24 例）
    ├── test-paths.mjs      # 路径解析测试（14 例）
    └── test-sidebar.mjs    # 侧边栏配置与注册测试（35 例）
```

## 与官方实现的区别

| 方面 | 官方实现 | 本插件 |
|------|----------|--------|
| 位置 | DSH 源码树内 | 独立包，装在 profile |
| 修改宿主 | 需要改 DSH 源码 | **不改 DSH 任何文件** |
| 编译 | 随 DSH 一起编译 | 本仓库自行编译，产物入库 |
| 安装 | 内置 | 可插拔（复制 + 注册） |
| 更新 | 随 DSH 版本 | 独立更新，带备份留档 |

## 持久化

若 DSH 或容器重启后 profile 的 `node_modules` 可能被清空，可让安装脚本随启动自动执行：

```bash
cat >> /etc/profile.d/dsh-plugin-repo.sh << 'EOF'
if [ -d "/vol1/1000/AI/DSHPlugin/panels/dsh-plugin-repo-manager" ]; then
    bash /vol1/1000/AI/DSHPlugin/scripts/install-to-profile.sh >/dev/null 2>&1 || true
fi
EOF
```

该脚本幂等，重复执行不会产生重复注册项。

## 开发

```bash
# 安装类型依赖（首次）
npm install

# 类型检查（应输出 0 error）
npm run typecheck

# 编译（服务端 → dist/，客户端 → client/client.js）
npm run build

# 测试（版本比较 23 例 + 安装更新 24 例 + 路径 14 例 + 侧边栏 35 例）
npm test
```

> **注意 1**：`generate-client.mjs` 内嵌了一份 client 源码副本。改完 `src/client/*` 后必须同步改 `generate-client.mjs`，再重跑生成脚本，否则改动会被覆盖回旧值。
>
> **注意 2**：`dist/` 与 `client/client.js` 是**要提交进 git 的编译产物**——目标机靠它们直接运行。改完源码务必 `npm run build` 并一起提交。
