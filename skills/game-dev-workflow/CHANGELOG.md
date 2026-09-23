# CHANGELOG —— 本 skill 自身的修改记录

skill 也是痕迹，一切修改在此登记（追加式，不删改历史条目）。

格式：

```
## [日期] 变更摘要
- 改了什么文件 / 动机（最好链接来源 WS 或触发事件）/ 提交人
```

---

## 2026-09-23 配套：新增应用领域孪生版 `app-dev-workflow`，并固定「两侧结构对齐」约束

*本条不改本 skill 的任何文件内容，故不升版本。*

- **背景**：用户指令「这个 skill 不止是游戏，应用也应该支持上」→ 选型为**镜像技能**而非
  「一个技能内写两份领域附录」。判据是**触发**：技能的 `description` 决定它会不会被唤起，
  单一技能只能有一套触发词，应用场景根本唤不起来；附录式兼容则必然与正文漂移。
- **产物**：`skills/app-dev-workflow/`，22 个文件与本 skill 一一对应，只有 2 处刻意改名
  （`templates/art-design.md` ↔ `design-visual.md`、`scripts/gf.sh` ↔ `af.sh`）。
- ⚠️ **对改本 skill 的人是硬约束**：两侧由 `scripts/tests/test-skill-parity.py` 逐项比对
  （文件清单 / 标题骨架 / 门禁 ID / 阶段 ID / 指令集与 §锚点 / CONFIG 字段 / 脚手架清单 /
  子命令集 / 元信息骨架），并已接入 `make verify` 第 6 步。
  **改了本 skill 的章节、门禁、指令或 CONFIG 字段 → 必须同步改 `app-dev-workflow`，
  否则 `make verify` 直接失败。** 若差异确实该存在，就把它登记进守卫的
  `FILE_MAP` / `TERM_MAP` / 块名单 —— 不许放宽判据换绿。
- 第 7 步 `test-skill-parity-negatives.py` 会注入 16 种漂移，证明第 6 步不是空转。
- 顺带修本 skill `README.md` 的安装段：`~/.zcode/skills/` 是**过期路径**，
  改为 WorkBuddy 用户级 `~/.workbuddy/skills/` 与 DSH 侧 `$DSH_HOME/skills/` 两种真实落点。
- 提交人：主控（触发：用户指令「参考 game-dev-workflow，严格对齐，新增一个 app-dev-workflow」）

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
