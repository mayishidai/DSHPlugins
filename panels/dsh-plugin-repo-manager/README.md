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

## 排查：面板空白、只有一个「重试」按钮

面板加载失败时会显示**具体错误 + 请求 URL + 仓库目录**（不再只给一个按钮）。
先在 NAS 上用 `curl` 打自检端点，一次看清全部状态：

```bash
curl -s http://127.0.0.1:2298/api/plugin-repo/_health | python3 -m json.tool
```

返回示例（正常）：

```json
{
  "ok": true,
  "plugin": "dsh-plugin-repo-manager",
  "route": {
    "rawPathname": "/api/plugin-repo/_health",
    "normalizedSub": "/_health",
    "note": "两者不同即说明宿主保留/剥掉了前缀，本插件两种都兼容"
  },
  "paths": {
    "repoDir": "/vol1/1000/AI/DSHPlugin/skills",
    "repoExists": true,
    "repoEntryCount": 17,
    "skillsDir": "/root/.dsh/skills",
    "skillsExists": true
  },
  "config": { "pollInterval": 3000, "showSidebarButton": true, "sidebarTitle": "插件仓库" },
  "selfTest": { "ok": true, "pathGuard": "ok", "moduleSystem": "esm" }
}
```

`selfTest` 是 2026-09-20 新增的运行时自检：直接验证「路径防护」在当前模块系统下可用。
`moduleSystem` 应为 `esm`（本包是 `"type": "module"`）；`selfTest.ok` 为 `false` 时，
`pathGuard` 会给出具体异常 —— 用于定位「点安装/卸载没反应」那类故障。

对照表：

| 现象 | 含义 | 处理 |
|---|---|---|
| `curl` 连不上 / connection refused | DSH 没在 2298 上跑 | 检查 DSH 进程 |
| `404 找不到页面`（DSH 自己的 404） | **插件没注册上** | 重跑 `bash scripts/install-to-profile.sh` 并重启 |
| `{"ok":false,"error":{"code":"NOT_FOUND"...}}` | 路由命中了插件但子路径不匹配 | 看 `error.message` 里的实际路径；本插件两种前缀约定都兼容，若仍出现请反馈 |
| `ok:true` 但 `repoExists:false` | **仓库目录不对** | 改 `cordis.patch.yml` 的 `repoDir` |
| `ok:true` 且 `repoEntryCount:0` | 目录在但**没有合法插件子目录** | 确认 `repoDir` 指向 `DSHPlugins/skills`（含插件子目录那层），不是仓库根 |
| `ok:true` 且 `skillsExists:false` | 安装目标目录不存在 | 确认 `skillsDir` 与 DSH 实际扫描目录一致（见下方「skillsDir 陷阱」） |
| `selfTest.ok:false` | **路径防护在当前环境失效** | 看 `pathGuard` 的异常；多半是 ESM/CJS 混用（见下方「ESM 陷阱」） |

### 点「安装 / 卸载」没反应（2026-09-20 已修）

**症状**：点按钮后列表不刷新，也没有可见报错，像按钮坏了。

**当时的根因**：`uninstallPlugin` / `installPlugin` 里写的是

```js
const rel = require('path').relative(skillsDir, targetDir)   // ← ESM 里没有 require
```

本包声明 `"type": "module"`，**ESM 没有 `require`** → 抛
`ReferenceError: require is not defined`。异常被 handler 的 `catch` 兜住，
只回 `HTTP 200 + { ok:false, error:{ code:'INTERNAL_ERROR' } }`，
而前端当时「只把失败记在控制台」—— 于是用户看到的就是**点了没反应**。

两处都改了：后端改用已导入的 `path.relative`（并抽成 `isInsideDir()`），
前端把失败原因**显示到界面上**（含插件名与后端 `error.message`）。

> ⚠️ 这类 bug 有个恶劣性质：**用 CJS 方式跑测试会骗过你**。
> `node -e` 会注入 `require`，所以同样的代码在那个环境下跑得通、测试全绿。
> 必须用**真实 ESM 模块**验证 —— `scripts/test-esm-safety.mjs` 就是这么做的，
> 且额外静态断言「产物里不得出现 `require(`」。

### `skillsDir` 陷阱

`skillsDir` 优先级：`cordis.patch.yml` 的 `skillsDir` > `DSH_PLUGIN_SKILLS_DIR` > `$DSH_HOME/skills`。

若 NAS 的 `DSH_HOME` 与 patch 里写死的 `~/.dsh/skills` **不一致**，
面板会把技能装到 DSH 扫不到的地方 —— **装了不生效，且不报错**。
用 `_health` 的 `skillsDir` 与 DSH 实际扫描目录比对即可确认。

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
npm test             # 七套测试，共 166 例
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
    ├── install.sh              # 转发桩（唯一实现在仓库根 scripts/）
    ├── test-isnewer.mjs        # 版本比较单元测试（23 例）
    ├── test-install-update.mjs # 安装/更新流程端到端测试（24 例）
    ├── test-paths.mjs          # 路径解析测试（14 例）
    ├── test-sidebar.mjs        # 侧边栏配置与注册测试（35 例）
    ├── test-client-parity.mjs  # 源码 / bundle 副本一致性（31 例，含布局尺寸同款检查）
    ├── test-route-prefix.mjs   # 路由前缀归一化（25 例）
    ├── test-api-e2e.mjs        # HTTP API 端到端，真起 server（27 例）
    └── test-esm-safety.mjs     # ESM 里禁用 require + 描述字段（22 例）
```

### HTTP API

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/plugin-repo/_health` | GET | **自检**：路由解析、目录存在性、条目数、生效配置、运行时自检 |
| `/api/plugin-repo/list` | GET | 列出所有插件（含 `description` 与 `hasUpdate`） |
| `/api/plugin-repo/install` | POST | 安装 / 更新（body: `{"name":"..."}`） |
| `/api/plugin-repo/uninstall` | POST | 卸载（body: `{"name":"..."}`） |

> **描述从哪来**：`list` 返回的 `description` 按
> `manifest.json` → `SKILL.md` 的 frontmatter → `package.json` 顺序取第一个命中的，
> 都取不到则返回 `null`（**不编造内容**）。前端长描述截断为两行，悬停看全文。

> **路由前缀兼容**：`webServer.register({kind:'prefix', path:'/api/plugin-repo'})` 之后，
> handler 收到的 `req.url` 是「剥掉前缀的 `/list`」还是「保留全路径的
> `/api/plugin-repo/list`」，取决于宿主实现约定。本插件通过 `normalizeSubPath()`
> **两种都兼容** —— 只按其中一种写的话，另一种下所有请求都会落进 404 分支，
> 前端表现为「列表空 + 一个重试按钮」，看起来像后端没起来。

### 布局尺寸（紧凑档）

面板按「提高信息密度」设计，数值统一如下。**改尺寸必须同步改两处**
（`src/client/PluginRepoPanel.tsx` 与 `generate-client.mjs`），
否则由 `test-client-parity.mjs` 第 [9] 节拦下。

| 位置 | 值 | 说明 |
|---|---|---|
| 面板外层 | `padding: 12px 14px` | 原 20px |
| 表格单元格 | `padding: 6px` | 原 `12px 8px` |
| 表头 | `padding: 5px 6px` | 原 8px |
| 按钮 | `padding: 4px 10px` | 原 `6px 12px`；不再压，否则可点性下降 |
| 工具栏 | `marginBottom: 10px` / `gap: 6px` | 时间戳移到右侧组，避免被挤成两行 |
| 设置面板 | 三项**并排一行** | 原纵向 grid，占大半屏高 |
| 表格 | `tableLayout: fixed` + 列宽百分比 | 描述列靠 table-layout 分宽度，不用 `maxWidth` |
| 描述列 | 仍 `WebkitLineClamp: 2` | 刻意不压到 1 行，否则多数描述读不出信息 |

实测：5 行插件时面板总高 **595px → 459px（-22.9%）**，每屏多放一行。

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

# 测试（23+24+14+35+18+25+27 = 166 例）
npm test
```

> **注意 1**：`generate-client.mjs` 内嵌了一份 client 源码副本。改完 `src/client/*` 后必须同步改 `generate-client.mjs`，再重跑生成脚本，否则改动会被覆盖回旧值。
>
> **注意 2**：`dist/` 与 `client/client.js` 是**要提交进 git 的编译产物**——目标机靠它们直接运行。改完源码务必 `npm run build` 并一起提交。
