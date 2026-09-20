---
name: game-dev-workflow
description: 游戏开发全流程团队协作系统（策划设计 → 程序拆单实现 ∥ 美术UI/动效/特效设计 → 表现接入调优 → QA → BUG修复 → 复盘沉淀）。只要涉及游戏项目的新需求/灵感落地、设计文档撰写、任务拆单、UI/动效/特效设计、功能实现、接入联调、性能与手感调优、测试QA、BUG处理跟踪、项目复盘、经验教训查询沉淀，或需要多 agent 并行开发一个游戏功能，就必须使用本 skill。它强制全程留痕（项目根 gameflow/ 痕迹目录，与代码分离但通过 WS-ID 全链路关联），并把开发与 QA 经验回流到本 skill 供全团队复用。
---

# 游戏开发全流程协作系统（Game Dev Workflow）

把"一个需求从提出到落地"的完整过程，变成**可复盘、可追踪、可复用经验**的标准流水线。

适用任何引擎（Unity / Unreal / Cocos / Godot / 自研），任何团队形态（一人多角，或多人 + 多 AI agent 协作）。

---

## 0. 强制阅读协议（不可跳过）

任何 AI 或同事在使用本 skill 前，必须按顺序完成阅读，并视为已同意遵守全部规范：

1. 通读本 SKILL.md 全文，尤其是 §2 铁律与 §3 硬性禁令。
2. 执行任何指令前（见 §6 操作路由表），读 `references/operations.md` 中对应 runbook，
   以及 `references/knowledge/checklists.md` 中对应的门禁清单。
3. 承担策划 / 程序 / 美术 / QA 任一角色前，读 `references/roles.md` 中本角色的章程
   （职责、权限边界、交接契约）。
4. 派发子 agent 或作为子 agent 参与前，读 `references/multi-agent.md`。
5. 创建 / 修改任何痕迹文件前，读 `references/trace-spec.md` 的目录规范、ID 体系与文件格式。
6. 开始任何一个阶段的工作前，先查 `references/knowledge/lessons.md` 中该阶段的既有经验。

**为什么这么严格**：本系统的价值 = 痕迹的完整性 × 规范的一致性。任何一角缺失，复盘就会失真，
经验回流就会断链。未满足阅读协议的产出视为**无效工作**：不允许通过门禁，必须补齐痕迹后重新审核。

---

## 1. 核心信念（为什么流程长这样）

| 信念 | 落地方式 |
|---|---|
| 一切可复盘 | 每个阶段有入口条件、产出物、门禁（G0–G7）；WS 关闭前必须完成复盘 |
| 一切有痕迹 | 所有决定、变更、调参、BUG、经验都落成文件（timeline 追加式），绝不只留在对话里 |
| 痕迹与代码分离但强关联 | 痕迹放项目根 `gameflow/` 独立目录；分支名、提交信息、任务卡通过 WS-ID 全链路串联，一眼可见关联 |
| 经验必须回流 | 复盘与 QA 产出的经验写入本 skill 的 `references/knowledge/`，下一个需求自动少踩坑 |
| 先想清楚再动手 | 无受理记录不设计，无设计文档不拆单，无任务卡不写码，无验收标准不通过 |

---

## 2. 三条铁律

1. **先有卡，后有码**。任何代码 / 资源 / 配置变更必须对应一张任务卡（T##）。
   提交信息格式：`[WS-yyyymmdd-slug][T##] 摘要`。无卡之码 = 不可追溯 = 禁止合入。
2. **痕迹只追加，不改写**。历史内容写错了，追加"更正条目"说明错误与正确内容，不删除不覆盖。
   唯一例外：文档 frontmatter 中的状态字段更新，以及不改变语义的明显笔误修复。
3. **门禁不跳步**。G0–G7 任一门禁未过，不得进入下一阶段（门禁清单见
   `references/knowledge/checklists.md`）。G1（设计评审）与 G5（发布验收）默认需要**人**确认，
   除非项目 `gameflow/CONFIG.md` 显式配置为自动通过。

---

## 3. 硬性禁令

每条禁令背后都是真实的返工代价，违反必须记录到 timeline 并在复盘中说明：

- 禁止把"灵感"直接当设计开工 —— 灵感必须走 S0 受理与 S1 设计，否则验收标准无处谈起。
- 禁止在 QA 阶段顺手接受设计变更 —— QA 期设计冻结；变更走决策记录（D-xx）或新 WS，否则回归范围失控。
- 禁止两个并行任务修改同一文件 —— 派发前必须做 touches-files 互斥检查（multi-agent.md §4）。
- 禁止子 agent 修改 `INDEX.md`、任务板、他人任务卡 —— 全局索引与任务板由主控独占维护。
- 禁止调优不留参数记录（前值 / 后值 / 理由 / 效果）—— 没有记录的调优下次只能重来。
- 禁止把经验只写在对话或群聊里 —— 必须走 `lesson` / `retro` 指令落库。
- 禁止删除已关闭的 WS 痕迹目录 —— 可以归档（移入 `gameflow/archive/`），不可以删除。

---

## 4. 流程总览

```
 需求（灵感 / 口头 / PRD）
   │
   ▼
 S0 受理 ──G0──▶ S1 策划设计 ──G1──┬─▶ S2A 任务拆单 ──G2───┐
                                  │                        ├─▶ S3 任务实现（按 DAG 可 N 路并行）
                                  └─▶ S2B 美术设计 ──G2'──┘      │ 逐卡过 G3
                                                                ▼
                          S7 复盘沉淀 ◀── S6 落地合入 ◀──G5── S5 QA ◀──G4── S4 表现接入与调优
                               │
                               G7
                               ▼
                            WS 关闭
```

- **S2A 与 S2B 并行**：两者都只依赖 S1 的设计文档，互不阻塞。
- **S3 内部并行**：任务按依赖图（DAG）分组，无依赖且文件不冲突的任务可同时派发。
- **S4 串行收口**：接入调优需要逻辑任务与美术产出齐备，由单一执行者收口。
- **S5 中的 BUG 修复**：走 `bug` 指令，修复本身是一张修复卡（挂在原任务或新建），形成闭环。
- **S5 中发现设计缺陷**：不直接改实现，走决策记录或新 WS（见 operations.md 的 `bug` runbook）。

**工作流（WS）状态机**：`intake → design → breakdown → dev → integration → qa → ship → retro → closed`
（任意状态可转 `paused` / `cancelled`，必须在 timeline 记录原因）。

**任务（T）状态机**：`backlog → ready → doing → review → done`
（任意状态可转 `blocked`；backlog 可转 `cancelled`）。

各阶段的详细入口条件、执行步骤、产出物与门禁，见 `references/pipeline.md`。

---

## 5. 角色与多 agent 一览

| 角色 | 职责一句话 | 典型执行者 |
|---|---|---|
| 主控 Orchestrator | 唯一的全局视角：受理立项、维护索引与任务板、派发任务、把门禁、组织复盘 | 主 AI / 技术负责人 |
| 策划 Designer | 把灵感变成完整设计文档：玩法、数值、边界、验收标准 | 策划 / AI 策划 agent |
| 程序 Programmer | 拆单、实现任务卡、接入表现与调优 | 程序 / AI 程序 agent（可多路并行） |
| 美术 Artist | UI 设计、动效与特效设计、素材清单与规范 | 美术 / AI 美术 agent（与 S2A 并行） |
| QA Tester | 从设计文档推导用例、执行测试、登记与验证 BUG | QA / AI QA agent |

角色章程（职责、权限边界、交接契约、资深准则）见 `references/roles.md`；
并行 / 串行编排、子 agent 提示词模板、冲突与失败处理见 `references/multi-agent.md`。

---

## 6. 操作指令路由表

用户可以自然语言触发（"来个新需求""拆单""开始做 T03""跑一轮 QA""BUG-002 好了""复盘"），
也可以显式调用 `/game-dev-workflow <指令> [参数]`。执行前必读对应 runbook。

| 指令 | 干什么 | 典型触发语 | 详细 runbook | 可派发子 agent |
|---|---|---|---|---|
| `init` | 在游戏项目中初始化 gameflow/ 痕迹目录 | "接入流程 / 初始化" | operations.md §1 | 否（主控） |
| `intake` | 新需求受理立项，创建 WS | "新需求 / 立项 / 来了个灵感" | operations.md §2 | 否（主控） |
| `design` | 策划：灵感 → 详细设计文档 | "出设计 / 写设计文档" | operations.md §3 | 可（策划 agent） |
| `breakdown` | 程序：设计文档 → 任务拆单（含增量补卡） | "拆单 / 新增任务" | operations.md §4 | 否（主控） |
| `art` | 美术：UI / 动效 / 特效设计 | "UI 设计 / 出美术稿" | operations.md §5 | 可（美术 agent） |
| `implement` | 按任务卡实现（单卡或多卡并行） | "做 T03 / 开始开发" | operations.md §6 | 可（程序 agent ×N） |
| `integrate` | 接入美术表现 + 调优并全程记录 | "接入 / 联调 / 调优" | operations.md §7 | 可（单程序 agent） |
| `qa` | 测试计划、执行、报告 | "测一下 / 跑 QA" | operations.md §8 | 可（QA agent） |
| `bug` | BUG 登记 → 定位 → 修复 → 验证 → 关闭 | "有个 bug / 修 BUG-002" | operations.md §9 | 可（修复卡） |
| `retro` | 复盘：数据、三问、经验提取入库 | "复盘 / 总结一下" | operations.md §10 | 否（主控） |
| `lesson` | 单独沉淀一条经验（不必等复盘） | "记条经验 / 这个坑记下来" | operations.md §11 | 否（主控） |
| `status` | 查询进度 / 按任意 ID 检索痕迹 | "进度如何 / 查 WS-xxx" | operations.md §12 | 否（主控） |

**指令的组合即流程**：一次完整交付 = `intake → design → (breakdown ∥ art) → implement → integrate → qa → (bug 循环) → retro`，
但每个指令都可以独立单独执行（比如只修一个 BUG、只补拆一张卡）。
执行任一指令前，先用 `status` 确认目标 WS 存在且处于合理状态（跨状态操作需在 timeline 说明理由）。

---

## 7. 痕迹目录契约（简版）

痕迹统一放在**游戏项目根目录**的 `gameflow/` 下——与代码目录（如 `src/`、`Assets/`）完全分离，
但同仓库、同分支、同 PR，天然关联；再加上 WS-ID 贯穿分支名、提交信息、任务卡，检索一眼见关联。

```
gameflow/
├── CONFIG.md            # 项目级配置：引擎、分支策略、门禁自动化、美术管线
├── INDEX.md             # 全部工作流注册表（唯一总索引，主控独占维护）
├── LESSONS.md           # 项目级经验库（通用经验上浮到 skill 的 knowledge）
├── .templates/          # init 时从 skill 复制的文档模板（项目自包含）
└── WS-20260913-<slug>/  # 每个需求一个工作流目录
    ├── 00-intake.md         # S0 受理记录（原始需求原话保留）
    ├── 01-design.md         # S1 设计文档
    ├── 02-task-board.md     # S2A 任务板（汇总 + DAG）
    ├── 03-art-design.md     # S2B 美术设计
    ├── 04-integration-log.md# S4 接入与调优记录
    ├── 05-qa/               # S5 测试报告与 BUG 卡
    ├── 06-retrospective.md  # S7 复盘
    ├── decisions/           # 决策记录 D-xx（含 QA 期变更冻结的例外审批）
    ├── tasks/               # 任务卡 T##（每卡一文件）
    └── timeline.md          # 追加式事件流水（本 WS 的完整历史）
```

ID 体系、文件格式、timeline 条目格式、git 关联约定、检索配方，见 `references/trace-spec.md`。

---

## 8. 经验沉淀规则（本 skill 的成长机制）

经验库有两级，回流方向只允许"项目 → skill"上浮，不允许反向复制：

1. **skill 级**（`references/knowledge/lessons.md`，L-xxx 全局唯一编号）：跨项目通用经验。
   写入方式：`lesson` 指令直接追加，或 `retro` 指令批量提取。改本 skill 的文件须同时在
   skill 的 `CHANGELOG.md` 登记。
2. **项目级**（项目 `gameflow/LESSONS.md`）：只对本项目有效的经验（引擎坑、特定模块的历史包袱）。

判定规则：经验去掉项目名仍然成立 → skill 级；否则项目级。拿不准 → 先项目级，复盘时主控复核上浮。

**强制回流点**（不满足则对应门禁不通过）：

- 复盘（G7）必须产出 ≥1 条入库经验，或书面说明"为何本 WS 无值得沉淀的经验"。
- 每个 BUG 关闭时，根因分类为"流程性"的必须产出经验条目或检查项修订。
- 估时偏差 >50% 的任务，复盘中必须分析原因并沉淀。

---

## 9. 参考文件索引

| 文件 | 内容 | 何时读 |
|---|---|---|
| `references/pipeline.md` | S0–S7 每阶段的目标、入口、步骤、产出、门禁、常见坑 | 进入任何新阶段前 |
| `references/operations.md` | 12 个指令的完整 runbook（前置检查 / 步骤 / 产出 / 门禁 / 错误处理） | 执行任何指令前 |
| `references/roles.md` | 5 个角色的章程与交接契约 | 承担角色前 |
| `references/multi-agent.md` | 并行/串行编排、子 agent 提示词模板、冲突与失败处理 | 派发或作为子 agent 前 |
| `references/trace-spec.md` | 痕迹目录规范、ID 体系、文件格式、检索配方 | 写任何痕迹文件前 |
| `references/templates/` | 10 个文档模板（intake / 设计 / 任务板 / 任务卡 / 美术 / 接入 / QA / BUG / 复盘 / 决策） | 创建对应文档时 |
| `references/knowledge/checklists.md` | G0–G7 门禁清单 | 过每个门禁前 |
| `references/knowledge/lessons.md` | 经验库（L-xxx，只追加） | 每个阶段开工前 & 沉淀经验时 |
| `scripts/gf.sh` | 辅助脚本：init / new / find / index | 痕迹脚手架与检索（脚本不可用时按 trace-spec 手工创建） |
| `CHANGELOG.md` | 本 skill 自身的修改记录（skill 也要留痕） | 修改 skill 内容时 |
