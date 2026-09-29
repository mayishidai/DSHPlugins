# CHANGELOG —— 本 skill 自身的修改记录

skill 也是痕迹，一切修改在此登记（追加式，不删改历史条目）。

格式：

```
## [日期] 变更摘要
- 改了什么文件 / 动机（最好链接来源 WS 或触发事件）/ 提交人
```

---

## 2026-09-29 v1.2.0 接入 CodeBuddy 原生多 agent：能多 agent 执行的都多 agent 执行

- **动机**：用户指令「对技能 game-dev-workflow 增加在 CodeBuddy 中多 agent 的能力，
  能多 agent 执行的都多 agent 执行」。原 multi-agent.md 只有抽象编排原则，未绑定 CodeBuddy
  的原生多 agent 工具族，实际执行容易退化为主控单会话串行包办。
- **multi-agent.md**（核心重构，原 §2–§7 顺移为 §3–§8）：
  - §1 新增第 5 条**多 agent 优先原则**：凡调度图并行点、凡 runbook 标"默认多 agent"的指令
    必须多 agent 执行；仅"工具不可用 / WS 无可并行点 / 用户明确要求 / 任务强制串行"四种情形
    允许退化单 agent，且须 timeline 记录原因。
  - 新增 §2 **CodeBuddy 多 agent 执行机制**：同步子代理（只读调研）vs 异步团队成员（写文件任务）
    的选型口诀「只读用同步，落盘用团队；调研先行，派发在后」；角色映射表（designer / prog-t## /
    artist / qa，团队名=WS-ID、成员名=角色-卡号、mode 与 max_turns 约定）；通信协议表
    （派发/汇报/请示/广播/计划审批/关闭/销团，澄清链集中提问）；收割纪律
    （**spawn 回执 ≠ 完成**、核验必须打开产出文件比对验收标准）；团队生命周期
    （开团→spawn→收割→shutdown→respawn 复用→销团）。
  - §4 派发模板拆为模板 A（团队成员）与模板 B（同步子代理调研）。
  - §6 失败处理新增两行：成员无响应 → shutdown 后 respawn 同名成员；spawn 失败 /
    环境无可写 subagent → 按第 5 条退化并留痕，禁止硬派只读 agent 做写任务。
- **SKILL.md**：核心信念表新增「能并行就并行」；§5 角色表加"CodeBuddy 承载"列并补
  多 agent 默认规则段；§6 路由表"可派发子 agent"列升级为"CodeBuddy 多 agent 执行（默认）"
  （design / art / implement / integrate / qa / bug 六指令默认派发；init / intake / breakdown /
  retro / lesson / status 主控独占，其中 breakdown 与 artist 并行、retro / status 可派同步子代理）；
  §3 禁令与 §9 索引的章节引用同步。
- **operations.md**：design / art / implement / integrate / qa 五个 runbook 的派发说明改为具体
  CodeBuddy 操作（先同步子代理调研再 spawn designer；G1 过即 spawn artist 与拆单并行；
  prog-t## 按 DAG 波次 ×N；单成员串行收口；qa 成员 + 修复 prog 双路）；bug 修复步骤与
  retro 数据核对补多 agent说明；尾部对照表新增"CodeBuddy 承载"列并附退化规则脚注。
- **roles.md**：开头补 CodeBuddy 承载说明（主控=main 主会话、角色=异步团队成员、调研=同步子代理）；
  通用守则新增成员行为两条（先读派发必读清单再动手、汇报必须落文件、不各自向用户发问）；
  主控资深准则新增「多 agent 优先 + spawn 回执 ≠ 完成」。
- **pipeline.md**：阶段速查表"可并行"列升级为"可并行（CodeBuddy 默认多 agent）"并逐行标注承载；
  S1 调研步骤改为派同步子代理（结论注入 designer 派发词）；S3 并行规则改为 spawn prog-t## 并行。
- **章节引用联动**（multi-agent.md 冲突规则 §4→§5）：SKILL.md 硬性禁令、operations.md §6、
  pipeline.md S3，共 3 处全部修正。
- **README.md**：多 agent 说明更新为"默认派发为 CodeBuddy 原生异步团队成员、只读调研走同步子代理"。
- 提交人：主控（触发：用户指令「增加在 CodeBuddy 中多 agent 的能力，能多 agent 执行的都多 agent 执行」）

---

## 2026-09-29 v1.2.1 并发写同一文件的正确性保障（四道防线）

- **动机**：用户反馈「多 agent 同时修改同一个文件时，需要保证文件的正确性」。
  v1.2.0 只做了**预防**（派发前 touches-files 互斥检查），没有回答"多个 agent 确实要写
  同一文件时怎么保证不出错"——这是多 agent 落地后必然遇到的真实场景。
- **multi-agent.md §5 冲突规则**重写为完整保障体系（§5.1–§5.5）：
  - 开篇明示**前提认识**：CodeBuddy 团队成员是**约定级**并发，无系统级文件锁，
    因此默认"不并发写"，并发写是例外而非常态。
  - §5.1 防线零：派发前互斥检查 + 区分独占文件 / 共享文件（owner 标注）。
  - **§5.2 四道防线**（核心，缺一不可，缺则退回串行）：① 主控划定互不重叠的**可写区段**
    （其余只读）；② **只追加不重排**（禁整文件重写/格式化/换行符统一/跨区移动）；
    ③ **写前重读**磁盘最新内容（禁止基于派发快照改文件）+ 改完复核自己那段 diff；
    ④ **版本控制兜底**：`git diff <文件>` 提交前自检、撞车以先提交者为准、被吞改动用 git 找回
    （禁止凭记忆重写）。
  - §5.3 追加式文件并发三条：**ID 取号主控独占**（T##/BUG-###/D-xx/L-xxx，防两人同时"最大+1"撞号）、
    只许尾部追加、格式与署名一致。
  - §5.4 运行中越界 / 已发生覆盖 / 冲突隐患的处置（发现隐患立即停手报主控，不自行顺手合并）。
  - §5.5 独占文件清单与任务板锁、美术回流。
- **SKILL.md**：硬性禁令第 3 条由"禁止两个并行任务修改同一文件"改为
  "禁止**无保障地**并发修改同一文件"——互斥检查（§5.1）与四道防线（§5.2）并列，
  措辞不再与实际允许的受控并发写相矛盾。
- **roles.md**：通用守则新增两条（写前重读 + 只改授权区段 + 提交前 diff 自检；编号由主控独占）；
  程序角色禁做新增三项（基于派发快照改文件 / 并发写不套防线 / 自行取号）。
- **operations.md**：`breakdown` 步骤 3 要求并行组内共享文件须标注可写区段与 owner；
  `implement` 新增步骤 3「并发写保护」（逐文件执行四道防线），原范围纪律顺延为 4。
- **checklists.md**：G2 新增"共享文件已划分区段并标注 owner"；G3 新增"并发写同文件已按四道防线
  执行、确认无覆盖他人改动"（均为无共享时 N/A）。
- **lessons.md**：新增 **L-009**（并发写同一文件：写前重读 + 分区 + diff 自检），索引表同步。
- **manifest.json**：1.2.0 → 1.2.1。
- 提交人：主控（触发：用户反馈「多 agent 同时修改同一文件需保证正确性」）

---

## 2026-09-29 v1.2.2 路径去硬编码：明确"项目级 / 用户级"共存规则

- **动机**：用户反馈「技能里多次提到根目录是 `C:/Users/abczhou/.codebuddy/skills/game-dev-workflow`，
  但我已经放在当前项目下了，应该用项目下的」。排查结论：
  - 全文检索确认**两份 skill 内均无硬编码绝对路径**（`C:/Users` / `~/` 零命中），
    所以问题不在文件内容，而在**两处同名共存** + 文档里过时的安装路径。
  - 现状：用户级 `~/.codebuddy/skills/game-dev-workflow` = **v1.1.0（旧）**，
    项目级 `<项目根>/.codebuddy/skills/game-dev-workflow` = **v1.2.1（新）**；
    本次会话加载的 base directory 是项目级，改动生效无误。
- **README.md**：安装章节 `~/.workbuddy/skills/`、`.workbuddy/skills` 更正为 CodeBuddy 实际的
  `.codebuddy/skills/`；新增「安装位置与优先级」小节——声明内部不写死绝对路径（`\<skill\>` 占位符），
  说明项目级 / 用户级差异、**两处同名的版本分裂风险**、以及"改了不生效先怀疑加载的是另一份"的排查法。
- **SKILL.md**：§9 参考文件索引前加"路径约定"块——所有 reference 路径相对实际加载目录，
  以当前会话 base directory 为准。
- **manifest.json**：1.2.1 → 1.2.2。
- 提交人：主控（触发：用户反馈路径指向用户级而非项目级）

---

## 2026-09-29 v1.2.3 明确"同一项目内项目级优先"的加载优先级

- **动机**：用户在选择同步方案时补充要求「将项目级复制到用户级，保持一致，
  同时**当前项目内以项目级优先**」。v1.2.2 只说明了"两处同名的风险"，未定优先级。
- **README.md**：「安装位置与优先级」新增**优先级约定**——同一项目内两份并存时以项目级为准
  （随仓库走、代表本项目版本），用户级仅作其他项目兜底，两处必须保持版本一致。
- **SKILL.md**：§9 路径约定块补充同一优先级规则（项目级 > 用户级），
  并保留"实际生效者以当前会话 base directory 为准"的排查提示。
- **manifest.json**：1.2.2 → 1.2.3。
- 提交人：主控（触发：用户补充「当前项目内以项目级优先」）

---

## 2026-09-29 v1.3.0 多 agent 执行改为平台自适应（解除 CodeBuddy 绑定）

- **动机**：用户反馈「这个 skill 不止 `.codebuddy`，还有 workbuddy、deepseekharness、hermes、
  openclaw 都会使用，应该基于平台自动抉择」。v1.2.x 把 CodeBuddy 的 `task` / `send_message` /
  team 机制直接写进 §2，换平台就会失效或误导执行者。
- **multi-agent.md §2 重构为「平台自适应」**（核心）：
  - §2.1 第一原则：**契约跨平台一致（都走文件），实现按平台能力抉择**，不写死平台。
  - §2.2 **平台探测三档**：A 团队模式（具名 / 长期存活 / 可互通信）、B 子代理模式
    （一次性派发、仅文件交接）、C 单 agent（无派发能力）。
    **判据是实际可用工具，不是平台名**；结果记 timeline；与档案冲突时以实测为准。
  - §2.3 **档位 → 执行映射表**：角色任务 / 只读调研 / 交接通道 / 派发词自包含度 / 收割 /
    追问 / 并行度上限；并点明 B 档与 A 档的关键差异——**B 档无消息通道，一切只能落文件，
    派发词必须一次写到底**（无法中途追问）。
  - §2.4 **平台能力档案**（提示，非判据）：CodeBuddy = A；WorkBuddy / deepseekharness /
    hermes / openclaw / DSH = 待探测，按 §2.2 实测，跑通后回补档案并登记。
  - §2.5 CodeBuddy 下沉为 **A 档参考实现**（原 2.1–2.5 顺移为 2.5.1–2.5.5），
    注明"其他 A 档平台照搬协议与纪律，只换工具名"。
  - 标题、§1 总则第 5 条、§3 调度图（注明按 A 档标注及 B/C 档读法）、§6 失败表、
    §7 方案审批、§8 一人多角 全部改为平台无关表述。
- **引用修正**：原"收割纪律 §2.4" → **§2.5.4**（operations.md §6、pipeline.md S3、
  roles.md 主控准则，共 3 处）；multi-agent.md 内部 §2.3–2.4 → §2.5.3–2.5.4。
- **SKILL.md**：信念"能并行就并行"改为平台自适应；§5 角色表列"CodeBuddy 承载" →
  "执行承载（按平台档位）"，默认规则段改为先探测档位（C 档顺序执行不算违规）；
  §6 路由表列名与值同步（"团队成员"→"执行者"、"同步子代理"→"调研子任务"）。
- **roles.md**：开头承载说明与通用守则改为平台无关（A 档成员 / B 档子代理 / C 档主控扮演）。
- **operations.md**：文件头新增"关于『派发』的平台差异"——A/B/C 档如何解读
  "spawn 团队成员 / mode=xxx"，角色名跨平台不变。
- **README.md**：安装章节新增多平台说明（各平台技能目录；skill 内容无需改动，能力自动探测）。
- **manifest.json**：1.2.3 → 1.3.0。
- 提交人：主控（触发：用户反馈「多平台使用，应基于平台自动抉择」）

---

## 2026-09-23 v1.1.0 痕迹目录改为隐藏目录 `.gameflow/`

- **动机**：点号前缀让引擎**默认无视**这个目录，痕迹放游戏项目根不再需要给引擎加任何 exclude 配置。
  - Unity：导入时忽略以 `.` 开头的文件/文件夹，且**不生成 `.meta`**（Unity Manual · Special folders and file names）
  - Godot：官方明确「Files and folders whose name begin with a period **will never be included in
    the exported project**」，目的是防止 `.git` 之类混进 PCK（Godot Docs · Exporting projects / Troubleshooting）
- **影响**：`gameflow/` → `.gameflow/`，全仓 8 个文件 56 处引用（`SKILL.md`、`README.md`、`scripts/gf.sh`、
  `references/{trace-spec,operations,roles,pipeline,knowledge/lessons}.md`）。
  **有意保留的裸 "gameflow"**（是 UX 文案，不是目录名）：口头触发语「初始化 gameflow」、
  commit 标签 `[gameflow] init`、"gameflow 项目配置"标题、gf.sh 脚本用途注释。
- **改名的真正成本在配套（新增风险点）**：
  - `trace-spec.md` §1 拆为 1.1（点号前缀的原理 + 引擎依据表 + git/grep 行为）与 1.2（`.gitignore` 放行配方）。
    项目模板自带的 `.*` / `**/.*` 会**连 `.gameflow/` 一起吞掉**，必须补 **两行**：
    `!.gameflow/` + `!.gameflow/**`（实测：只写第一行时 `.templates/` 那 10 个文件**全丢**，只剩 3 个根文件能入库）。
    附 6 档实测对照表；并说明该失效是**可见的**（`git add` 会直接报 ignored，不是静默丢文件）。
  - `scripts/gf.sh` 新增两个函数：`resolve_root()`（路径归一化为绝对路径，**任意 cwd 都能调用**）与
    `gitignore_check()`（判据交给 `git check-ignore`，**不手写 `.gitignore` 解析**）；`init` 末尾预检，
    发现危险规则时**直接把补丁行打印出来**，不必等 `git add` 才撞错。
  - `trace-spec.md` §8 补 ripgrep 提示：GNU grep 递归**会**进点号目录（实测），但 **rg 默认跳过隐藏目录**
    → 要 `--hidden`；项目 `.gitignore` 有 `.*` 时（见 §1.2）还要再加 `--no-ignore`。
  - `operations.md` §1 把「确认 `.gitignore` 放行」从一句话升为显式步骤 3，并写明判定方法。
  - 顺带修 `gf.sh` 的 `usage()`：原先 `grep '^#' "$0"` 会把 CONFIG.md heredoc 里的
    `# gameflow 项目配置` 一并打进帮助输出；改为只取第 2 行起连续的 `#` 注释块。
- **从 v1.0.0 迁移**：已用旧名初始化过的项目，`git mv gameflow .gameflow` 即可（内容无需改，
  痕迹内部一律使用相对路径或 WS-ID，不含该目录名）；随后按 §1.2 确认 `.gitignore` 放行。
- **验证**：`bash -n` 通过；临时 git 项目实测 `init`/`new`/`index`/`find` 四子命令（含故意从 `/` 调用）；
  两种 `.gitignore` 场景下守卫分别触发/不触发；`git add .gameflow` 在未打补丁时报错退出，
  打上两行补丁后 **13 个文件全部入库**，仅打第一行时只入库 3 个。
- 提交人：主控（触发：用户指令「init 初始化目录，从 gameflow 变为 .gameflow」）

---

## 2026-09-13 v1.0.0 初始版本

- 建立 skill 主体：SKILL.md（铁律 / 流程总览 / 12 指令路由 / 经验回流规则）
- references/：pipeline（S0–S7 与 G0–G7）、operations（12 runbook）、roles、multi-agent、trace-spec
- templates/：intake、design-doc、task-board、task、art-design、integration-log、qa-report、bug、retrospective、decision 共 10 个模板
- knowledge/：门禁清单 G0–G7；经验库种子条目 L-001～L-008（标注"种子"，待团队用真实复盘覆盖增长）
- scripts/gf.sh：init / new / find / index 辅助脚本
- 来源：由资深游戏开发者的个人工作流（策划→程序拆单实现∥美术→接入调优→QA）沉淀而成
