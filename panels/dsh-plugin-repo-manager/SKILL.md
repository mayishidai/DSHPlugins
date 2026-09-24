---
name: dsh-plugin-repo-manager
description: "DSH web 面板插件：在设置页管理自建插件仓库，支持扫描、安装、卸载、版本检测与一键更新（更新前自动留档备份）；并列出「DSH 里装着但仓库中已不存在」的技能，让 DSH 侧也能被清理干净。"
whenToUse: "当需要在 DSH 设置面板中浏览/安装/更新自建插件仓库（DSHPlugins）里的插件时；或需要清理 DSH 里已从仓库移除的技能时。"
invocation:
  modelInvocable: false
  userInvocable: true
---

# dsh-plugin-repo-manager（面板插件）

在 DSH 设置页以面板形式管理自建插件仓库：扫描仓库目录、安装/卸载插件、检测版本更新并一键更新；
并列出「DSH 里装着但仓库中已不存在」的技能，让 DSH 侧也能被清理干净。

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

**profile 目录是自动查找的**（2026-09-21 起）：唯一实现在仓库根的
`scripts/lib/resolve-profile.sh`，安装/卸载共用。曾经写死
`/vol2/@appdata/.../profiles/web`，**只有那一台机器能装**，换一台就报
`ERROR: DSH profile 不存在`（用户原话：「我不止部署一个机器的 DSH」）。

```bash
bash scripts/lib/resolve-profile.sh --list          # 只读：看候选与各自检查结果
PROFILE_DIR=<数据根>/profiles/web bash scripts/install-to-profile.sh   # 显式指定（最准）
DSH_HOME=<数据根>                 bash scripts/install-to-profile.sh   # 只给数据根
DSH_PROFILE=web DSH_HOME=<数据根> bash scripts/install-to-profile.sh   # 多个 profile 时指定
```

优先级：`PROFILE_DIR` > `DSH_PROFILE` > `<DSH_HOME>/profiles/web` >
**已装过本插件的位置**（升级不换地方）> `~/.dsh/profiles/web` > 常见数据根 > 受限搜索。
**唯一命中才采用**；多个命中列出候选并要求显式指定（退出码 3）；
全都没有则打印**全部检查过的候选** + 手动指定方法（退出码 1）。

只写入 DSH 的 **profile 目录**（用户数据区），**不修改 DSH 运行时源码**。

## 排查：面板空白、只有一个「重试」按钮

面板加载失败会显示**具体错误 + 请求 URL + 仓库目录**。先用自检端点一次看清状态：

```bash
curl -s http://127.0.0.1:2298/api/plugin-repo/_health | python3 -m json.tool
```

| 现象 | 含义 | 处理 |
|---|---|---|
| connection refused | DSH 没跑 | 检查进程 |
| DSH 自己的 404 页面 | **插件没注册上** | 重跑 `scripts/install-to-profile.sh` 并重启 |
| `ok:false, code:NOT_FOUND` | 路由命中但子路径不匹配 | 看 `error.message` 里的实际路径 |
| `repoExists:false` | **仓库目录不对** | 改 `cordis.patch.yml` 的 `repoDir` |
| `repoEntryCount:0` | 目录在但无合法插件子目录 | `repoDir` 应指向 `DSHPlugins/skills` |
| `skillsExists:false` | 安装目标目录不存在 | 核对 `skillsDir` 与 DSH 实际扫描目录 |
| `selfTest.ok:false` | 路径防护在当前环境失效 | 看 `pathGuard` 异常，多半是 ESM/CJS 混用 |

> ⚠️ **`skillsDir` 陷阱**：其优先级为 patch 的 `skillsDir` > `DSH_PLUGIN_SKILLS_DIR`
> > `$DSH_HOME/skills`。若 NAS 的 `DSH_HOME` 与 patch 写死的 `~/.dsh/skills` 不一致，
> 面板会把技能装到 DSH 扫不到的地方 —— **装了不生效且不报错**。

## 排查：点「安装 / 卸载」没反应

列表正常显示、但点按钮后**毫无动静**（不刷新、也无报错）。典型根因是
**ESM 里用了 `require`**：本包是 `"type": "module"`，ESM 没有 `require`，
调用即抛 `ReferenceError: require is not defined`；异常被 handler 的 `catch` 兜住，
只回 `HTTP 200 + INTERNAL_ERROR`，前端若「只记控制台」就完全不可见。

排查要点：

1. 打 `/_health` 看 `selfTest.ok` 与 `moduleSystem`；
2. 确认产物里**没有** `require(` 调用 —— 注意先剔注释，
   否则本仓库注释里的反例引用会误报；
3. ⚠️ **别用 `node -e` 验证**：CJS 引导会注入 `require`，
   同样的代码在那个环境跑得通，**测试会骗过你**。
   必须用真实 ESM 模块（`scripts/test-esm-safety.mjs` 即如此）。

> 修 bug 时务必连带确认**路径穿越防护仍有效**：`isInsideDir()` 要比旧实现更严 ——
> 它还要拒绝 `skills` 与 `skills-other` 这类「同前缀不同目录」的情况。

## 排查：点「安装 / 卸载」**没生效**

和上面那条不同：这次**面板是有反应的**（安装后变「已安装」、卸载后变「未安装」），
但 **DSH 那边毫无变化** —— 技能装了用不了、卸了还在。接口全部 `ok:true`，不报错。

根因是 **`skillsDir` 指向了 DSH 不扫描的目录**。历史配置写死成 `~/.dsh/skills`，
在容器里展开是 `/root/.dsh/skills`，而 DSH 扫的是 `$DSH_HOME/skills/`
（NAS 上 = `/vol2/@appdata/deepseek.harness/dsh-data/skills`）。

| 操作 | 实际发生 | 现象 |
|---|---|---|
| 安装 | 复制到 DSH 不扫描的目录 | 面板「已安装」，DSH 找不到 |
| 卸载 | 只删掉那份没人看的副本 | 面板「未安装」，DSH 那份还在 |

排查要点：

1. 打 `/_health`，比 `paths.skillsDir` 与 `skillsDirCandidates` 里各目录的 `skillCount`；
2. 若 `skillsDirWarning` 非空 —— 后端已经确认错位，照它的文案改即可
   （面板也会把同一句话渲染成黄色横幅）；
3. 修法是**删掉 `cordis.patch.yml` 里的 `skillsDir`** 让它自动推导，
   或写成绝对路径；**绝不能写 `~` 开头**。
4. 仓库级守卫 `validate_repo.py` **2.9** 会拦住写死 `~` 路径的回归。

## 描述字段

`/list` 返回的 `description` 依次从 `manifest.json` → `SKILL.md` frontmatter →
`package.json` 取第一个命中的；都取不到返回 `null`（**不编造内容**）。
新增插件时**至少给一处描述**，否则面板该列显示 `—`。

## 布局尺寸（紧凑档）

面板按「提高信息密度」设计。**改尺寸必须同步改两处** ——
`src/client/PluginRepoPanel.tsx`（开发读的那份）与 `generate-client.mjs`
（真正打进 `client.js` 的那份）。漏改一处就是本项目**第 5 次副本漂移**，
而且照样「编译过、测试绿、不报错」。现由 `test-client-parity.mjs` 第 [9] 节
直接比对两份的尺寸数值集合拦下。

关键值：外层 `12px 14px` / 单元格 `6px` / 表头 `5px 6px` / 按钮 `4px 10px` /
表格 `tableLayout: fixed` / 设置面板三项并排。详见 `README.md`。

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
| `skillsDir` | `DSH_PLUGIN_SKILLS_DIR` | `$DSH_HOME/skills` | 技能安装目标目录。**留空让插件推导**；要写死只能用绝对路径（不能 `~` 开头） |
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
npm test             # 全部套件（清单见 package.json 的 test 脚本）
```

> 改过 `src/client/*` 或 `generate-client.mjs` 后必须重跑 `npm run build`；
> `dist/` 与 `client/client.js` 是**要提交入库的产物**。
>
> **只改样式也算改 `src/client/*`** —— 两份实现的尺寸数值必须一致，
> 由 `test-client-parity.mjs` 第 [9] 节守住。

仓库级校验（本机无 `make` 时按序手动跑，失败必须为 0）：

```bash
python3 scripts/validate_repo.py                      # 218 通过 / 0 失败
bash scripts/preflight.sh                             # 91 通过 / 0 失败
python3 scripts/tests/test_cred_parity.py             # 11/11 判定一致
node scripts/tests/test-panel-resolve.mjs             # 6 通过 / 0 失败
bash scripts/tests/test-profile-resolve.sh            # 25 通过 / 0 失败（profile 自动查找）
```

