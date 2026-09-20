# 痕迹目录规范（gameflow/）

**设计目标**：痕迹与代码**物理分离、逻辑强关联**——放同一仓库（同分支同 PR，天然绑定），
但独立顶层目录（不混入 src/Assets/，检索干净）；再用贯穿一切的唯一 ID（WS-ID）保证
任何 AI / 同事一眼看出"这段代码 ↔ 这张卡 ↔ 这个 BUG"的关联。

## 1. 位置与目录结构

痕迹根目录固定为**游戏项目根**的 `gameflow/`（若项目 CONFIG.md 声明了其他路径，以 CONFIG 为准）。

```
gameflow/
├── CONFIG.md              # 项目级配置（人可读 Markdown，见 §2）
├── INDEX.md               # 全部 WS 注册表（仅主控可写）
├── LESSONS.md             # 项目级经验库（仅主控/lesson 指令可写）
├── .templates/            # init 时复制的文档模板（项目自包含）
├── archive/               # 可选：年度/大版本归档（移动不删除）
└── WS-20260913-daily-shop/
    ├── 00-intake.md
    ├── 01-design.md
    ├── 02-task-board.md
    ├── 03-art-design.md
    ├── 04-integration-log.md
    ├── 05-qa/
    │   ├── QA-R01.md
    │   └── BUG-001-crash-on-open.md
    ├── 06-retrospective.md
    ├── decisions/
    │   └── D-01-price-round.md
    ├── tasks/
    │   └── T01-config-table.md
    ├── art-assets/        # 美术产出物（图/storyboard），文档内只放链接
    └── timeline.md
```

`.gitignore` **不得**忽略 `gameflow/`（痕迹必须随仓库版本化）。体积大的二进制产出
（视频、PSD 源文件）放项目美术资源库或外链，WS 目录内只留链接与说明。

## 2. CONFIG.md 字段

| 字段 | 说明 | 示例 |
|---|---|---|
| engine | 引擎与版本 | Unity 2022.3 LTS |
| code_dirs | 代码目录（提交前缀检查、检索范围） | `Assets/Scripts, Packages/com.xx.core` |
| art_dirs | 美术目录 | `Assets/Art/UI` |
| branch_strategy | 分支策略 | `feat/WS-yyyymmdd-slug → develop（PR）` |
| gates_manual | 需要人工确认的门禁 | `G1, G5` |
| art_spec | 美术规范（命名/导出）链接或简述 | 见 wiki/ArtSpec |
| lesson_float_to_skill | 通用经验是否允许 AI 直接写 skill 库 | `需人工确认`（推荐）|

## 3. ID 体系（唯一性由主控保证）

| ID | 格式 | 作用域 | 示例 |
|---|---|---|---|
| 工作流 | `WS-yyyymmdd-slug` | 全项目唯一 | `WS-20260913-daily-shop` |
| 任务卡 | `T##`（文件 `T##-slug.md`） | WS 内唯一，全局引用写 `WS-.../T03` | `T03` |
| BUG | `BUG-###`（文件 `BUG-###-slug.md`） | WS 内唯一 | `BUG-002` |
| 测试报告 | `QA-R##` | WS 内唯一 | `QA-R01` |
| 决策 | `D-##`（文件 `D-##-slug.md`） | WS 内唯一 | `D-01` |
| 验收标准 | `DS-n`（设计文档内编号） | WS 内唯一 | `DS-3` |
| 经验条目 | `L-###` | **skill 内全局唯一**，永不复用 | `L-009` |

规则：ID 一经分配**不可变、不复用**（取消的卡的编号也占用）；编号递增分配；
`T##` 两位起（容纳 99 张卡，不够用三位）。

## 4. 与代码的关联约定（一眼识别的关键）

| 载体 | 约定 | 示例 |
|---|---|---|
| 分支名 | `feat/WS-yyyymmdd-slug` | `feat/WS-20260913-daily-shop` |
| 提交信息 | `[WS-...][T##] 摘要`；BUG 修复 `[WS-...][T##][BUG-###] 摘要` | `[WS-20260913-daily-shop][T03] 商店数据接口` |
| 任务卡"变更文件" | 每卡列 commit hash + 变更文件相对路径清单 | `a1b2c3d : Assets/Scripts/Shop/ShopService.cs` |
| 代码注释 | 不强制（避免污染）；关键公共接口可加一行 `// WS-...` | `// WS-20260913-daily-shop` |
| PR 描述 | 必含 WS 目录路径 + 一句结果摘要 | `gameflow/WS-20260913-daily-shop/` |

INDEX.md 的每行也登记 branch 与主要代码目录，形成"索引 → 痕迹 → 代码"三条互查路径。

## 5. 文档格式约定

- 每个 Markdown 痕迹文件头部用 frontmatter 记元信息（模板已内置）：
  `id / ws / status / owner / created / updated`。**status 是唯一允许原地更新的字段**
  （另加不改变语义的笔误修复），正文一律追加不删改。
- 更正历史内容的方式：保留原文，紧跟 `> **[更正 2026-09-14]** 正确为 ...，原因 ...`。
- 时间一律 `yyyy-mm-dd hh:mm`（24 小时制），时区跟随项目 CONFIG 默认本地时区。

## 6. timeline.md 条目格式（追加式流水账）

```markdown
# timeline —— WS-20260913-daily-shop

## 2026-09-13 10:22 | 主控
- [WS] 创建工作流（intake 完成，type=feature scale=M）｜产出: 00-intake.md

## 2026-09-13 15:40 | 程序-agent-2
- [T03] 状态: ready→doing
- [T03] 状态: doing→review｜commit: a1b2c3d｜自测: 3/3 通过（证据见任务卡）
```

条目规则：按时间顺序**只追加**；每条 = `时间 | 角色` 标题 + 若干 `- [对象ID] 事件｜证据链接`；
对象 ID 必须是 §3 中的合法 ID。文件的"最后修改"以最后一页最底行为准。

## 7. INDEX.md 格式

```markdown
# 工作流总索引（仅主控维护）

| WS | 名称 | 类型 | 状态 | 分支 | 主要代码目录 | 创建 | 最近更新 |
|---|---|---|---|---|---|---|---|
| WS-20260913-daily-shop | 每日商店 | feature | dev | feat/WS-20260913-daily-shop | Assets/Scripts/Shop | 2026-09-13 | 2026-09-15 |
```

`status` 取 pipeline.md 的 WS 状态机值。归档移动目录后此表保留行并加 `(archived)` 标记——
**INDEX 永远是全量账本**。

## 8. 检索配方（AI 快速查关联的标准动作）

```bash
# 项目根执行；也可用 bash <skill>/scripts/gf.sh find <关键词>

# 1) 某个工作流的全部痕迹（文档 + 代码 + 提交）
grep -rn "WS-20260913-daily-shop" gameflow/ Assets/Scripts/
git log --oneline --grep="WS-20260913-daily-shop" --all

# 2) 一张任务卡的来龙去脉
grep -rn "T03" gameflow/WS-20260913-daily-shop/
git log --oneline --grep="\[T03\]" --all

# 3) 一个 BUG 的修复位置
git log --oneline --grep="BUG-002" --all

# 4) 全项目当前未完成的工作
grep -L "status: closed" gameflow/WS-*/06-retrospective.md   # 或直接读 INDEX
```

AI 回答"为什么这么改"类问题时，必须先跑检索拿证据再回答（operations.md §12）。

## 9. 保留与归档

- **永不删除**：包括 cancelled 的 WS、closed 的 BUG、被更正的历史条目。
- 归档：大版本结束后可将 closed 超过 N 个月（CONFIG 可定）的 WS 移入 `gameflow/archive/<年份>/`，
  INDEX 行加 `(archived)`，路径更新。
- 痕迹文件被意外删除：以 git 历史恢复；恢复动作本身记入该 WS timeline。
