# game-dev-workflow —— 给同事看的说明（AI 请读 SKILL.md）

把"一个游戏需求从提出到落地"沉淀为可复用的标准流水线：
**策划设计 → 程序拆单 ∥ 美术设计 → 并行实现 → 接入调优 → QA → BUG 闭环 → 复盘沉淀经验**。
全程留痕、全程可复盘，经验回流进本 skill，越用越顺。

## 为什么是 Skill 而不是 Agent

- **经验需要被团队直接编辑**：Skill 是纯 Markdown，策划 / 程序 / 美术都能直接改规范、补经验条目，走 git 版本管理；Agent 是封闭的运行时配置，不适合承载需要持续生长的团队知识。
- **每一步需要可单独触发**：新立项、补拆一张卡、修一个 BUG、单独 QA，Skill 的指令路由天然支持按需调用；Agent 只能整体运行。
- **多 agent 协作不受影响**：Skill 内置"多 agent 编排规范"（roles.md + multi-agent.md），主控 AI 按规范把策划 / 程序 / 美术 / QA 派发为并行子 agent——**skill 定义团队，agent 是它的运行时实例**。

## 安装（让 AI 工具发现它）

```bash
# 方式一：装到用户级（所有项目可用）—— WorkBuddy 用 ~/.workbuddy/skills/，DSH 用 $DSH_HOME/skills/
mkdir -p ~/.workbuddy/skills && cp -r <仓库>/skills/game-dev-workflow ~/.workbuddy/skills/

# 方式二：装到某个游戏项目（仅该项目可用，推荐团队仓库统一放置）
cd <你的游戏项目> && mkdir -p .workbuddy/skills && cp -r <仓库>/skills/game-dev-workflow .workbuddy/skills/
```

## 在游戏项目里启用流程

对 AI 说"初始化 gameflow"或执行 `/game-dev-workflow init`，会在项目根创建 **`.gameflow/` 痕迹目录**。
点号前缀 = 隐藏目录：Unity 导入时忽略它且**不生成 `.meta`**，Godot **不会把它打进导出包**，
所以痕迹放在游戏项目根不会污染构建，也不需要在引擎里做任何 exclude 配置。

⚠️ 若项目 `.gitignore` 里有 `.*` / `**/.*`（很多引擎项目模板自带），它会连 `.gameflow/` 一起吞掉，
需按 `references/trace-spec.md` §1.2 补两行放行，否则痕迹进不了版本控制
（这个失效是**可见的**：`git add` 会直接报 ignored；`gf.sh init` 也会预先提示补丁行）。

## 快速上手（指令 = 流程步骤，可任意单独调用）

| 你说 | AI 做 |
|---|---|
| "来个新需求：想加个每日商店" | `intake` 立项，创建 WS 工作流 |
| "出设计文档" | `design` 策划完整设计 |
| "拆单" / "再补个任务" | `breakdown` 生成任务卡（含依赖与并行组） |
| "出 UI 和动效设计" | `art` 美术设计（与拆单并行） |
| "开始做 T03" | `implement` 按卡实现，提交带 `[WS][T03]` |
| "接入美术表现，调一下手感" | `integrate` 接入并逐条记录调参 |
| "跑一轮 QA" | `qa` 从设计文档推导用例并执行 |
| "有个 bug：进商店闪退" | `bug` 登记定位修复验证闭环 |
| "复盘吧" | `retro` 数据复盘 + 经验入库 |

## 同学如何贡献经验

1. 项目内的坑：直接让 AI 执行 `lesson`，或编辑项目的 `.gameflow/LESSONS.md`。
2. 跨项目通用经验：提交到本 skill 的 `references/knowledge/lessons.md`（追加 L-xxx 条目），
   并在 `CHANGELOG.md` 登记一笔。**只追加，不改写历史条目。**
3. 规范本身的修订：改对应 references 文件 + CHANGELOG 登记 + 说明动机（最好链接来源 WS）。

## 目录一览

```
game-dev-workflow/
├── SKILL.md                     # AI 入口：铁律、流程总览、指令路由（必读）
├── README.md                    # 本文：给同事的说明
├── CHANGELOG.md                 # skill 自身修改记录
├── references/
│   ├── pipeline.md              # S0–S7 全流程与门禁
│   ├── operations.md            # 12 个指令的 runbook
│   ├── roles.md                 # 角色章程与交接契约
│   ├── multi-agent.md           # 多 agent 并行/串行编排
│   ├── trace-spec.md            # 痕迹目录与 ID 体系规范
│   ├── templates/               # 10 个文档模板
│   └── knowledge/
│       ├── checklists.md        # G0–G7 门禁清单
│       └── lessons.md           # 经验库（持续追加）
└── scripts/gf.sh                # init/new/find/index 辅助脚本
```
