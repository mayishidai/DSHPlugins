# 架构：本仓库如何与 DeepSeek Harness 对接

## 0. 仓库按类型分层

仓库顶层按**内容类型**分开存放，不混放；每类有各自的格式约定与安装落点：

```
DSHPlugin/
├── skills/   技能型能力（SKILL.md）      → 复制到 $DSH_HOME/skills/
├── agents/   智能体 / 专家角色           → 按目标框架的 agent 机制加载
├── mcps/     MCP 服务配置（不含凭据）    → 合并进 ~/.workbuddy/mcp.json
└── panels/   运行时面板插件（双半包）    → 复制到 profile/node_modules/<包名>/
```

> ⚠️ 面板的落点必须**正好是** `node_modules/<package.json 的 name>`，
> 不能塞进 `@deepseek-ai/` 之类的作用域目录 —— 挂载配置与 `dependencies` 用的都是
> 不带作用域的包名，Node 按那个名字去 `node_modules/` 找包，落点不对就**加载失败**
> （症状：`invalid plugin, expect function or object with an "apply" method, received undefined`，
> 因为模块根本解析不到）。四处名字必须一致，见 `docs/FAQ.md` Q0 与安装脚本头部说明。

> ⚠️ 类型目录是**安装与管理面板扫描的边界**：`dsh-plugin-repo-manager` 的 `repoDir`
> 指向 `skills/`。新增技能要落在 `skills/` 下，否则管理面板看不到。

## 1. 术语：这里的「插件」= DSH 的「Skill / 运行时插件」

DSH（DeepSeek Harness）没有传统意义的「插件商店」，它用一套 **skill 子系统** 管理可复用的指令型能力，用 **extensions 子系统** 管理可添加面板/UI 的运行时插件。本仓库把两者分层管理：

| 类型目录 | 内容 | DSH 对应机制 | 安装位置 |
|---|---|---|---|
| `skills/` | 技能型（有 SKILL.md） | `ctx.skills`（skill 注册表）+ `dsh-skill-filesystem` 提供方 | `$DSH_HOME/skills/<name>/` |
| `agents/` | 智能体 / 专家角色 | 目标框架的 agent / expert 机制 | 视框架而定 |
| `mcps/` | MCP 服务配置 | MCP server（`~/.workbuddy/mcp.json`） | 配置合并 + 手动信任 |
| `panels/` | 运行时型（面板/UI） | extensions（Cordis 双半包，host + client） | 随 extensions 工具加载 |

## 2. DSH 如何发现技能

`dsh-skill-filesystem` 提供方会扫描若干「技能根目录」，每个根目录里的子目录（含 `SKILL.md`）或 `.md` 文件都是一个技能候选项。优先级从高到低：

| 根目录 | source | 说明 |
|---|---|---|
| `<cwd>/.dsh/skills` | project-dsh | 项目级 |
| `<cwd>/.agents/skills` | project-agents | 项目级 |
| 自定义目录（`customSkillDirs`） | custom | 配置指定 |
| `$DSH_HOME/skills` | user-dsh | 用户级（本仓库默认目标）|
| `$DSH_AGENTS_HOME/skills` | user-agents | 用户级共享 |
| `$DSH_BUNDLED_SKILL_DIR` | bundled | 内置 |

一个技能目录形如：

```
skills/jdgold/           ← jdgold 是真实已安装示例
├── SKILL.md             ← 必需，YAML frontmatter: name / description / whenToUse / invocation
├── references/          ← 参考文档
├── scripts/             ← 可执行脚本
└── version.json         ← 版本记录：version / installed_at / manifest_url / previous_version
```

`SKILL.md` 的 frontmatter 至少要含 `name` 和 `description`，且 `name` 必须是 kebab-case（`^[a-z0-9]+(?:-[a-z0-9]+)*$`），否则会被忽略。

## 3. 本仓库的安装流程

### 3.1 技能型（skills/）

安装 = 复制目录：

1. 校验插件名合法（kebab-case）。
2. 校验 `skills/<name>` 存在且有效（有 `SKILL.md`）。
3. 把整个插件目录复制到 `$DSH_HOME/skills/<name>/`。

DSH 的 skill 提供方会自动发现新目录并刷新目录，通常无需重启即可在会话里通过 `skill` 工具调用。

命令：

```bash
make install NAME=lucky-api     # 或 make install-all
```

### 3.2 面板型（panels/）

面板不是「复制进 skills 就能生效」，它有 host / client 两个半包，
需要作为 DSH 扩展动态包加载。安装链路：

```
开发机: npm run build
   ├── tsc -p tsconfig.build.json  →  dist/index.js   （服务端编译产物）
   └── node generate-client.mjs    →  client/client.js（客户端自包含 bundle）
                    ↓ 产物提交进 git
目标机: git pull
   └── bash scripts/install-to-profile.sh
          ├── 复制 dist/ + client/ + cordis.patch.yml → profile/node_modules/@deepseek-ai/<name>/
          ├── python3 更新 profile package.json（dependencies + dsh.profile.bundles）
          └── 备份原 package.json
                    ↓
             重启 DSH → 面板出现在「设置 → 插件」
```

### 3.3 两条硬性约束

**约束一：产物必须编译好并入库。**

`package.json` 的 `main` 必须指向 `dist/index.js`（**不能指向 `.ts`**），
且 `files` 必须包含 `dist`。原因：目标机不保证有 Node 工具链，
DSH 也不保证会帮你转译 TypeScript。`scripts/preflight.sh` 与
`scripts/validate_repo.py` 都会在违反时报 FAIL。

**约束二：安装不得修改 DSH 源码。**

安装只写 **profile 目录**（`dsh-data/profiles/<profile>/`，属于用户数据区）。
早期版本的脚本曾用 `sed -i` 改写 `dsh-runtime/node_modules/@deepseek-ai/dsh-api-remotes`
里的文件——那是污染 DSH 安装的做法，已移除。现在所有 `package.json` 改动
一律走 python3 的 JSON 库，保证结构合法且可完整还原。

`scripts/install-plugin-repo.sh` 因此已废弃，执行即退出并提示新方式。

两种不改源码的加载方式：

| 方式 | 命令 | 特点 |
|------|------|------|
| profile 注册 | `scripts/install-to-profile.sh` | 持久，随 DSH 启动自动加载 |
| patch 叠加 | `scripts/start-dsh-with-plugin.sh` | 临时，用 `--patch` 运行时叠加 |


## 4. 版本与升级

### 4.1 版本号来源

插件版本由 `getPluginVersion()` 按序解析，取第一个命中：

| 顺序 | 文件 | 说明 |
|------|------|------|
| 1 | `<插件>/manifest.json` 的 `version` | skill / agent / mcp / runtime 通用 |
| 2 | `<插件>/package.json` 的 `version` | 面板型（npm 包）没有 manifest 时的兜底 |
| 3 | `<插件>/version.json` 的 `version` | 已安装留档 |

**已安装版本**只从 `skillsDir/<name>/version.json` 读取——该文件在安装/更新时写入。

### 4.2 更新判定

```ts
isNewer(latest: string | null, current: string | null): boolean
```

逐段数字比较语义化版本，规则：

- 任一侧缺失 → `false`（不确定就不提示更新）
- 任一侧含非数字段（如 `abc`）→ `false`（**防止误报「可更新」导致反复覆盖**）
- 支持 `v` 前缀（`v1.2.3`）；预发布后缀按主版本比较（`1.1.0-alpha` → `1.1.0`）
- 段位数不齐按 0 补齐（`1.0` 等价 `1.0.0`）

`listPlugins()` 为每个仓库插件返回 `hasUpdate = installed && isNewer(repoVersion, installedVersion)`。

### 4.3 更新流程（`installPlugin`）

1. 读旧 `version.json` 得 `fromVersion`，判定本次是**安装**还是**更新**
2. 更新前把整个已装目录备份为 `<targetDir>.bak-<ISO时间戳>`
3. 清空旧目录（避免上游已删除的文件在更新后残留）
4. 递归复制新内容，用 `statSync` 判断是否为目录（**空目录也能正确复制**）
5. 写 `version.json`：保留原 `installedAt`，刷新 `version`、新增/更新 `updatedAt`、`previousVersion`、`backupDir`

### 4.4 `version.json` 字段

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

### 4.5 批量同步

技能型：`make install-all` 把 `skills/` 下全部技能同步到 `$DSH_HOME/skills/`
（幂等，先删后复制）。仓库里删掉的技能不会自动清掉，需 `make uninstall NAME=<name>`。

WorkBuddy 用户级副本：`make sync-skill ALL=1`（以本仓库为唯一实现来源）。

> 校验 `isNewer` 逻辑改动后，务必跑 `panels/dsh-plugin-repo-manager/scripts/test-isnewer.mjs`（23 例边界用例）。


## 5. 清单（manifest.json）的两种用途

1. **整仓清单** `registry/manifest.json`：由面板插件（`dsh-plugin-repo-manager`）扫描 `skills/` 生成，描述所有可用插件，可托管到静态服务器供远程商店/更新使用（字段对齐 DSH 的 `SkillSummary`）。单个技能的 manifest 用 `scripts/gen-manifest.py` 刷新。
2. **单插件清单** `<分类目录>/<name>/manifest.json`：该插件的元数据（版本、作者、type、自定义安装脚本）。可选的。

## 6. 运行时（面板）插件的加载

带面板功能的插件不在 `skills/` 里被「调用」，而是作为 DSH 的扩展动态包加载：

- **host 半**（`src/`）：服务端逻辑，用 DSH extensions 的 `cordis_define`/`cordis_run` 定义并运行。
- **client 半**（`client/`）：浏览器 UI，编译进 `@deepseek-ai/dsh-client-*` 面，注册全局面板 slot 后出现在 Web GUI。

本仓库只负责**统一存放与同步**这些插件的源码/产物；真正的加载由 DSH extensions 机制在会话内完成。详见 DSH 源码 `packages/extensions/` 及 `docs/subsystems/extensions.zh.md`。