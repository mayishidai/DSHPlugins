# 架构：本仓库如何与 DeepSeek Harness 对接

## 1. 术语：这里的「插件」= DSH 的「Skill / 运行时插件」

DSH（DeepSeek Harness）没有传统意义的「插件商店」，它用一套 **skill 子系统** 管理可复用的指令型能力，用 **extensions 子系统** 管理可添加面板/UI 的运行时插件。本仓库把两者统一管理：

| 你的插件类型 | DSH 对应机制 | 安装位置 |
|---|---|---|
| 技能型（有 SKILL.md） | `ctx.skills`（skill 注册表）+ `dsh-skill-filesystem` 提供方 | `$DSH_HOME/skills/<name>/` |
| 运行时型（面板/UI） | extensions（Cordis 双半包，host + client） | 随 extensions 工具加载 |

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

`scripts/install-plugin.sh <name>` 做的事：

1. 校验插件名合法（kebab-case）。
2. 校验 `plugins/<name>` 存在且有效（有 `SKILL.md`，或 `src/`/`client/`，或 `manifest.json`）。
3. 把整个插件目录复制到 `$DSH_HOME/skills/<name>/`。
4. 写入 `version.json`（对齐 jdgold 格式）。
5. 可选：执行插件 `manifest.json` 里 `scripts.install` 定义的自定义安装脚本。

DSH 的 skill 提供方会自动发现新目录并刷新目录，通常无需重启即可在会话里通过 `skill` 工具调用。

## 4. 版本与升级

- 仓库里每个插件的 `manifest.json` 声明 `version`。
- `install-plugin.sh --force` 会覆盖旧版本，并把旧 `version.json` 存为 `previous_version`。
- `sync-to-dsh.sh` 批量同步：已装则更新、未装则安装。

## 5. 清单（manifest.json）的两种用途

1. **整仓清单** `registry/manifest.json`：由 `build-manifest.sh` 扫描 `plugins/` 生成，描述所有可用插件，可托管到静态服务器供远程商店/更新使用（字段对齐 DSH 的 `SkillSummary`）。
2. **单插件清单** `plugins/<name>/manifest.json`：该插件的元数据（版本、作者、type、自定义安装脚本）。可选的。

## 6. 运行时（面板）插件的加载

带面板功能的插件不在 `skills/` 里被「调用」，而是作为 DSH 的扩展动态包加载：

- **host 半**（`src/`）：服务端逻辑，用 DSH extensions 的 `cordis_define`/`cordis_run` 定义并运行。
- **client 半**（`client/`）：浏览器 UI，编译进 `@deepseek-ai/dsh-client-*` 面，注册全局面板 slot 后出现在 Web GUI。

本仓库只负责**统一存放与同步**这些插件的源码/产物；真正的加载由 DSH extensions 机制在会话内完成。详见 DSH 源码 `packages/extensions/` 及 `docs/subsystems/extensions.zh.md`。