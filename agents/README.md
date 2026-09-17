# agents/ — 智能体 / 专家包

放 **Agent 定义与专家包**：可被 DSH / WorkBuddy 作为独立角色加载的智能体，
与 `plugins/` 时代的技能型插件区分开（技能是「能力」，agent 是「角色」）。

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
- 校验：`python3 ~/.workbuddy/skills/dsh-plugin-repo-add/scripts/validate_plugin.py agents/<name> --repo .`

## 当前收录

_（暂无）_

## 新增方式

参照 `docs/how-to-add-a-plugin.md`，把 `type` 设为 `agent`，
其余流程（校验、README 登记、提交）与技能型一致。
