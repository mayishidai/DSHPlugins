# dsh-plugin-repo-manager

DSH 插件：从**主界面侧边栏**（New Session 按钮下方）打开「插件仓库」，管理自定义插件仓库。

## 功能

- **侧边栏入口**：左侧栏 New Session 按钮正下方的「插件仓库」行，点一下把面板开到**主界面工作区**
- 查看插件仓库中的所有插件
- 显示已安装/未安装状态
- 一键安装 / 一键卸载已安装插件（带确认对话框）
- **列出「DSH 里装着、仓库中已不存在」的技能**（副标题标为「仓库中已不存在」）——
  这类技能以前完全不出现，导致「仓库里删掉了，DSH 里那份却永远卸不掉」（见下方排查第 3 条）
- **版本检测**：对比仓库版本与已装版本，标出「可更新」
- **一键更新**：单个更新或「⬆ 全部更新」批量串行更新
- **更新留档**：更新前自动整目录备份为 `<插件名>.bak-<ISO时间戳>`，并在 `version.json` 记录 `previousVersion` / `updatedAt` / `backupDir`
- 支持多语言（中文/英文）

## 入口与席位

只有一个入口：**侧边栏的 `sidebar.panellist`**（ui-sidebar 为「全局面板入口」保留的席位）。
它在 `SidebarRoot` 的渲染顺序里紧接 New Session 按钮之后：

```
logoRow（品牌） → New Session 按钮 → panelList（本插件的入口行） → workspaces → foot
```

入口行与面板本体是**两个登记项、同一个身份**：

| 登记项 | 席位 | 字段 | 作用 |
|--------|------|------|------|
| 入口行 | `sidebar.panellist`（list / root） | `id` | 侧边栏那一行（图标 + label），位置就在 New Session 下方 |
| 面板本体 | `main`（keyed / root） | `key` | 主界面工作区里实际渲染的面板 |

> **两处的值必须是同一个字符串**（`PANEL_ID = 'plugin-repo'`）。ui-layout 的 `MainPanelId`
> 注释原话是 "Identity shared by a sidebar panel entry and its main-slot occupant"。
> 缺任一侧都是静默失效：**有行无本体**时点击走 shell 的 `ctx.layout.selectPanel(id)`，
> 它发现 `main` 没有注册就 **直接 throw** 并保留原选中态 —— 用户看到的就是「点了没反应」。
> `scripts/test-sidebar.mjs` 钉住这条，`scripts/test-sidebar-negatives.mjs` 证明它不是空转。

> **点击不需要注册方写 `onClick`**：`PanelRow` 自己接 `selectPanel(id)`，注册方只在
> `main` 里 register 本体即可。`main` 是 root 作用域，**不绑会话** —— 全局面板本来就不该绑。

> ⚠️ **不要注册到 `sidebar` 槽**（本插件曾经就是这么写的，所以入口只在设置里找得到）。
> `sidebar` 是 `single` 且已被 ui-sidebar 的 SidebarRoot 占用，ui-layout 的 `SlotMap` 注释原文：
> "registering here **replaces the navigation column outright** rather than adding to it,
> and the seats it declares disappear with it." —— 往那里注册是**替换整根导航栏**。

> **入口行是自绘的内联 SVG**，不依赖宿主的图标集。
> 原因：把图标名（如 `icon: 'package'`）交给宿主去渲染，等于把「宿主认不认这个名字」
> 变成运行时未知数——名字写错**不会报错**，只会静默显示空白，是最难发现的一类失效。
> SVG 用 `currentColor` 描边，因此会自动跟随侧边栏的深浅色主题与选中态。
> 行里的**文字由 ui-sidebar 用 `label` 渲染**，插件只画图标；窄条（收起）态下也不会溢出。

### 入口开关

```yaml
- insert:
    - id: plugin-repo
      name: 'dsh-plugin-repo-manager'
      config:
        showSidebarEntry: true     # false 则**两项都不注册**（行与本体一起消失）
        sidebarTitle: '插件仓库'    # hover 提示 / 无障碍名 / 展开态文字；留空用语言字典默认值
```

`showSidebarEntry` 也可用环境变量控制：`DSH_PLUGIN_SHOW_SIDEBAR_ENTRY=false`。

> **旧键名 `showSidebarButton` 仍然兼容**（新键优先），旧环境变量 `DSH_PLUGIN_SHOW_SIDEBAR` 同理。
> 入口从「按钮」变成「面板行」后旧名不再准确，但**改名的唯一风险是「照着旧文档改了旧键、
> 毫无反应、也不报错」** —— 所以两个键都认。

> 布尔解析刻意宽容：`false` / `"false"` / `"0"` / `"no"` / `"off"` 都识别为关闭。
> **不用 `Boolean(raw)`** —— 字符串 `"false"` 在 JS 里是**真值**，那样写会导致
> 「配置里关掉了、实际却还显示」这种最难排查的失效。无法识别的值一律回退到默认
> （显示），避免配置拼错把入口静默弄丢。
>
> 这份宽容解析**只在服务端 half 有一处实现**（`resolveShowSidebarEntry`，已导出），
> 客户端只消费归一化后的布尔值 —— 同一判据写两份必然漂移。
> `scripts/test-sidebar.mjs` 直接 `import` 构建产物来断言它，不重写一份。

> 关闭时是**两个登记项都不注册**，而不是「注册后渲染 `null`」。渲染 `null` 仍会占位，
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
  "config": { "pollInterval": 3000, "showSidebarEntry": true, "sidebarTitle": "插件仓库" },
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
| `config.showSidebarEntry:false` | 入口被配置关掉了 | 改 `cordis.patch.yml`（或旧键 `showSidebarButton`）后重启 |
| `config.showSidebarEntry:true` 但侧边栏没有那一行 | 宿主没渲染 `sidebar.panellist` 席位，或插件版本太旧 | 确认已装的是 1.3.0+（1.2.x 注册的是整栏 `sidebar`，**注定不显示**）；看启动日志 |
| 侧边栏行点了没反应 | 行注册了、但 `main` 里没有同 id 的本体 | `selectPanel(id)` 遇到未注册的 main key 会 **throw**；两端 id 必须逐字相同，跑 `npm test` |

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

### 点「安装 / 卸载」**没生效**（2026-09-21 已修）

**症状**：点「安装」，面板确实变成「已安装」；点「卸载」，也确实变回「未安装」
—— 看起来都成功了，**但 DSH 那边毫无变化**：技能装了用不了，卸载了还在。
没有报错、没有告警，一切接口都返回 `ok:true`。

**根因**：`cordis.patch.yml` 把 `skillsDir` 写死成了 `'~/.dsh/skills'`。

在 NAS 上 DSH 跑在容器里，`~` 展开是**容器内部的家目录**（如 `/root/.dsh/skills`），
而 DSH 真正扫描的是它自己的 `$DSH_HOME/skills/`
（NAS 上 = `/vol2/@appdata/deepseek.harness/dsh-data/skills`）。两者不是同一个地方，于是：

| 操作 | 实际发生的事 | 你看到的现象 |
|---|---|---|
| 安装 | 技能被复制到 **DSH 不扫描**的目录 | 面板显示「已安装」，DSH 里找不到 |
| 卸载 | 只删掉那份没人看的副本 | 面板显示「未安装」，DSH 里那份纹丝不动 |

这类失效最恶劣的地方是**全程静默**：文件确实写进磁盘了、接口全部 `ok:true`、
日志一行不报 —— 只有「技能没出现」这一个间接信号。

**修复**（两层）：

1. **配置不再写死**。插件按
   `config.skillsDir` > `DSH_PLUGIN_SKILLS_DIR` > `$DSH_HOME/skills` > `~/.dsh/skills`
   逐级推导；`cordis.patch.yml` 里那行已删除并留下说明。
2. **错位会被主动喊出来**。一旦发现「当前目录一个技能都没有、别处却装着」，
   面板会在列表上方弹**黄色告警横幅**（写明当前目录、真正装着技能的目录、
   以及该怎么改），`/_health` 也会返回全部候选目录与各自的技能数。

**自查一条命令**：

```bash
curl -s http://<DSH>/api/plugin-repo/_health | python3 -m json.tool
# 看 paths.skillsDir / paths.skillsSource / skillsDirWarning / skillsDirCandidates
```

**若确实要写死**，必须是**绝对路径**，绝不能是 `~` 开头的：

```yaml
skillsDir: '/vol2/@appdata/deepseek.harness/dsh-data/skills'
```

> 仓库级守卫：`validate_repo.py` 的 **2.9** 会扫描所有
> `panels/*/cordis.patch.yml`，一旦发现 `skillsDir` 写死成 `~` 开头就 FAIL。
> 插件内守卫：`scripts/test-skills-dir.mjs`（解析优先级 + 兜底判据 + 告警逻辑），
> `scripts/test-api-e2e.mjs` 第 [9] 节（端到端证明告警真的会传到面板）。

### 面板里找不到某个已装技能（2026-09-23 已修）

**症状**：从仓库里删掉一个技能后，DSH 侧那份**还在**（技能照样生效），
但面板列表里**根本看不到它** —— 因此也没有卸载入口。用户原话：
「**面板可以移除，但是并没有真实从 DSH 中移除**」。

**根因**（注意与上一条不同：上一条是"写到哪"，这条是"读哪"）：
`listPlugins` **只遍历 `repoDir`**，`skillsDir` 扫出来的那批名字仅仅被用来
给仓库条目「打已装标记」。于是 `skillsDir − repoDir` 这个**差集被整段丢弃**：

| 操作 | 实际发生的事 | 你看到的现象 |
|---|---|---|
| 从仓库删技能 | `skillsDir/<name>` 没被任何人碰 | 面板列表里它消失了（以为卸掉了） |
| 想卸载它 | 列表里没有这一行 → 没有卸载按钮 | 「面板里没有，只能上机器手动删」 |

**修复**：`listPlugins` 把差集补成列表项（`source: 'installed-only'`、
`repoDirName: null`、副标题显示「仓库中已不存在」）。
**卸载路径本来就不依赖仓库**（只删 `skillsDir/<name>`），所以补上列表即可复用 ——
不需要新增后端接口，也不需要改卸载逻辑。

约定：

- **只动 DSH 侧**：卸载只删 `skillsDir/<name>`，`repoDir` 永远只读。
- **不谎报可更新**：没有仓库版本可比时 `hasUpdate` 恒为 `false`，版本列显示已装版本。
- **不编造描述**：描述从 DSH 侧那份自己读（`manifest.json` → `SKILL.md` → `package.json`）。
- **边界**：非 kebab-case 的目录（如更新残留的 `<名>.bak-<时间戳>`）**不会**被列成
  可卸载技能 —— 否则「卸载」按钮会指向一份备份目录。

> 守卫：`scripts/test-orphans.mjs`（可见性 + 卸载后仓库逐字节未变 + 备份目录排除 +
> 仓库目录不存在时仍能清理 DSH）；`scripts/test-client-parity.mjs` 第 [10] 节
> （前端两份实现都必须真的**区分渲染**这类条目，只在类型里声明不算）。

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

# profile 目录**自动查找**，通常无需任何参数。
# 想看它找到了哪些候选（只读）：bash ../../scripts/lib/resolve-profile.sh --list
# 需要显式指定时才用：
#   PROFILE_DIR=<数据根>/profiles/web bash ../../scripts/install-to-profile.sh
#   DSH_HOME=<数据根>                bash ../../scripts/install-to-profile.sh
```

> ⚠️ 2026-09-21 之前这里写死了 `/vol2/@appdata/.../profiles/web`，**只有那一台机器能装**。
> 现在由 `scripts/lib/resolve-profile.sh` 运行时探测，优先级
> `PROFILE_DIR` > `DSH_PROFILE` > `<DSH_HOME>/profiles/web` > 已装过本插件的位置
> > `~/.dsh/profiles/web` > 常见数据根 > 受限搜索。
> **唯一命中才采用**，多个命中会列出来让你显式指定。

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
npm test             # 全部测试套件（清单见 package.json 的 test 脚本）
npm run typecheck    # 0 error
```

## 使用方法

1. 重启 DSH
2. 打开 `http://127.0.0.1:2298/`
3. 两种进法任选：
   - **主界面左侧栏** → New Session 按钮正下方的 📦 「插件仓库」行

## 配置

默认仓库目录：`/vol1/1000/AI/DSHPlugin/skills`

如需修改，编辑 `cordis.patch.yml`：

```yaml
- insert:
    - id: plugin-repo
      name: 'dsh-plugin-repo-manager'
      config:
        repoDir: '/path/to/your/plugins'
        showSidebarEntry: true
```

> **不要给 `skillsDir` 写 `~` 开头的路径**（详见上方排查章节）。
> 留空最好：插件会逐级推导，并在推导结果与真实位置不符时于面板弹告警。

| 配置项 | 环境变量 | 默认值 | 说明 |
|---|---|---|---|
| `repoDir` | `DSH_PLUGIN_REPO_DIR` | `/vol1/1000/AI/DSHPlugin/skills` | 仓库目录（按类型分层的根，通常是 `DSHPlugins/skills`） |
| `skillsDir` | `DSH_PLUGIN_SKILLS_DIR` | `$DSH_HOME/skills`（无 `DSH_HOME` 时 `~/.dsh/skills`） | 技能安装目标目录。**留空让插件推导**；要写死就用绝对路径 |
| `pollInterval` | `DSH_PLUGIN_POLL_INTERVAL` | `3000` | 自动刷新间隔（毫秒） |
| `showSidebarEntry` | `DSH_PLUGIN_SHOW_SIDEBAR_ENTRY` | `true` | 是否显示侧边栏入口行（连带面板本体）。旧键 `showSidebarButton` / 旧 env `DSH_PLUGIN_SHOW_SIDEBAR` 仍兼容，新键优先 |
| `sidebarTitle` | `DSH_PLUGIN_SIDEBAR_TITLE` | 语言字典默认值 | 入口行的提示文案（hover / 无障碍名 / 展开态文字） |

优先级：`cordis.patch.yml` 的 `config` > 环境变量 > 默认值。

## 架构

```
dsh-plugin-repo-manager/
├── src/                    # TypeScript 源码（安装时不复制到目标机）
│   ├── index.ts            # Host 入口（扫描/安装/卸载/更新/版本比较/配置解析）
│   ├── types/
│   │   └── host.d.ts       # DSH 宿主包类型声明桩（仅类型检查用）
│   └── client/
│       ├── index.tsx       # Client 注册（sidebar.panellist 入口行 + main 面板本体，含 JSX 故为 .tsx）
│       ├── locales.ts      # 国际化字典
│       └── PluginRepoPanel.tsx  # React 面板组件
├── dist/                   # ★ 服务端编译产物（入库，安装时使用）
│   ├── index.js
│   └── index.d.ts
├── client/
│   └── client.js           # ★ 客户端 bundle（入库，由 generate-client.mjs 生成）
├── cordis.patch.yml        # Cordis 挂载配置（含入口开关 showSidebarEntry）
├── manifest.json           # 插件元数据（版本号来源之一）
├── package.json            # main → dist/index.js
├── tsconfig.json           # 类型检查配置（noEmit）
├── tsconfig.build.json     # 编译配置（输出到 dist/）
├── generate-client.mjs     # 客户端 bundle 生成脚本
└── scripts/
    ├── install.sh                       # 转发桩（唯一实现在仓库根 scripts/）
    ├── test-isnewer.mjs                 # 版本比较单元测试
    ├── test-install-update.mjs          # 安装/更新流程端到端测试
    ├── test-paths.mjs                   # 路径解析测试
    ├── test-sidebar.mjs                 # 入口：席位/成对/开关（布尔解析直接跑 dist 产物）
    ├── test-sidebar-negatives.mjs       # 上者的反向回归（注入 10 种真实错误，证其非空转）
    ├── test-client-parity.mjs           # 源码 / bundle 副本一致性（含布局尺寸、locale 字典）
    ├── test-client-parity-negatives.mjs # 上者的反向回归（注入漂移，证其非空转）
    ├── test-route-prefix.mjs            # 路由前缀归一化
    ├── test-api-e2e.mjs                 # HTTP API 端到端，真起 server
    ├── test-esm-safety.mjs              # ESM 里禁用 require + 描述字段
    ├── test-skills-dir.mjs              # skillsDir 解析 + 错位告警
    └── test-orphans.mjs                 # 孤立已装技能（DSH 里有、仓库里已没有）
```

> **这里刻意不写每套的例数、也不写套数** —— 会漂：本行曾长期写着「九套，共 233 例」，
> 实际早已是 11 套 286 例（且当时还漏列 `test-orphans.mjs`）；现在又多了
> `test-sidebar-negatives.mjs`，若把「12 套」写进来就又开始漂了。
> 套件清单看 `package.json` 的 `test` 脚本，例数看 `npm test` 的逐套输出。

### HTTP API

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/plugin-repo/_health` | GET | **自检**：路由解析、目录存在性、条目数、生效配置、运行时自检、**skillsDir 候选清单** |
| `/api/plugin-repo/list` | GET | 列出所有插件（含 `description`、`hasUpdate`，以及 **`skillsDirWarning`**） |
| `/api/plugin-repo/install` | POST | 安装 / 更新（body: `{"name":"..."}`） |
| `/api/plugin-repo/uninstall` | POST | 卸载（body: `{"name":"..."}`） |

> **`/list` 额外带回三个诊断字段**：`skillsDir`（当前生效值）、
> `skillsDirSource`（该值来自哪里，如 `config.skillsDir` / `env:DSH_HOME`）、
> `skillsDirWarning`（错位时的中文告警文案，无问题时为 `null`）。
> 面板把它渲染成列表上方的黄色横幅 —— 这是「装/卸没生效」唯一的可见信号。

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

# 测试（套件清单见 package.json 的 test 脚本；此处不复述例数，会漂）
npm test
```

> **注意 1**：`generate-client.mjs` 内嵌了一份 client 源码副本。改完 `src/client/*` 后必须同步改 `generate-client.mjs`，再重跑生成脚本，否则改动会被覆盖回旧值（判据见 `test-client-parity.mjs`）。
>
> **注意 2**：`dist/` 与 `client/client.js` 是**要提交进 git 的编译产物**——目标机靠它们直接运行。改完源码务必 `npm run build` 并一起提交。
>
> **注意 3**：仓库级校验里还有一条 **`scripts/tests/test-profile-resolve.sh`（25 例）**，
> 管的是「装到哪个 profile」——profile 目录必须运行时探测，不得写死（见上文「安装」）。
> 它测的是仓库根的解析库，不属于本插件的 `npm test`，由 `make verify` 第 5 步跑。
>
> **注意 4**：新增测试文件后记得补进 `package.json` 的 `test` 脚本 ——
> 漏了**不会报错**，只是那套测试永远不跑（看着全绿）。同时新 `.mjs` 必须
> `git add --chmod=+x`：`validate_repo.py` 的可执行位判据查的是 **git 索引**。
>
> **注意 5**：测试里**动态 import 产物必须用 `pathToFileURL(...).href`**。
> Windows 上 `await import('C:/.../dist/index.js')` 会抛
> `ERR_UNSUPPORTED_ESM_URL_SCHEME: Received protocol 'c:'`（默认 ESM loader 只认
> `file` / `data` / `node` 三种 scheme），而 Linux/NAS 上照样能跑 —— 属于
> 「本机绿、目标机炸」或反过来的那一类。相对 specifier（`import('../dist/index.js')`）没这个问题。
