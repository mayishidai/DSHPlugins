# agents/ — 智能体 / 专家包

放 **Agent 定义与专家包**：可被 DSH / WorkBuddy 作为独立角色加载的智能体，
与 `skills/` 的技能（「能力」）区分开（agent 是「角色」）。

## 目录约定

```
agents/<name>/
├── AGENT.md          # 角色定义（若目标框架用 SKILL.md 承载也可保留 SKILL.md）
├── manifest.json     # type: agent；声明 systemPrompt 入口、可用工具、模型偏好
├── prompts/          # 提示词与角色设定
├── scripts/          # 可选。该 agent 专属脚本
└── references/       # 可选。方法论、SOP、领域知识
```

## 命名与校验

- 与 skills 同样的 kebab-case 规则，目录名 = manifest 的 `name`
- 校验：

  ```bash
  python3 scripts/validate_repo.py agents/<name>       # 仓库自带，零依赖
  ```

## 在 DSH 上如何落地

**⚠️ 当前状态：DSH 没有独立的 agent 加载器。**

这是本节最需要说清楚的一点。DSH 的加载机制目前只有两套：

| 机制 | 扫描位置 | 能否承载 agent |
|------|----------|----------------|
| `dsh-skill-filesystem` | `$DSH_HOME/skills/` | 技能可以；「角色」需要靠 `SKILL.md` 的 frontmatter 与正文表达 |
| DSH extensions（Cordis） | profile → `node_modules` + `bundles` 注册 | 可以，但需要写 host/client 两半，成本高 |

因此把这个目录下的内容送上 DSH，有两条现实路径：

### 路径 A：作为技能承载（推荐，成本低）

如果你的「agent」本质是**一套角色化的工作流 + 提示词 + 脚本**，
直接放进 `skills/` 即可——用 `SKILL.md` 的 frontmatter 表达角色：

```yaml
---
name: rimworld-designer
description: "关卡/数值设计助手：按给定约束产出可玩性方案。"
whenToUse: "当需要设计关卡、调数值、评估玩法循环时。"
invocation:
  modelInvocable: true
  userInvocable: true
---
```

正文写角色设定、方法论、SOP，`scripts/` 放它专属的脚本。
DSH 会自动发现，无需重启。

### 路径 B：作为 DSH 扩展（需要 UI 或多半包时）

如果这个 agent 需要**独立的界面、常驻服务、或自己的 HTTP 端点**，
就必须走 extensions 机制，参照 `panels/dsh-plugin-repo-manager/` 的形态：
编译产物 + `cordis.patch.yml` + 装到 profile 并注册 bundle。

### 本目录的定位

本目录更像是**暂存区 / 分类归档**：先把「角色」这类资产独立存放，
便于将来 DSH 若引入 agent 加载器时批量迁移。
**在 DSH 引入该机制之前，需要实际生效的 agent 请放在 `skills/`。**

## 当前收录

_（暂无）_

## 新增方式

参照 `docs/how-to-add-a-plugin.md`，把 `type` 设为 `agent`，
其余流程（校验、README 登记、提交）与技能型一致。
