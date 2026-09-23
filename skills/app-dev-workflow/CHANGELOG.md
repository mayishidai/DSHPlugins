# CHANGELOG —— 本 skill 自身的修改记录

skill 也是痕迹，一切修改在此登记（追加式，不删改历史条目）。

格式：

```
## [日期] 变更摘要
- 改了什么文件 / 动机（最好链接来源 WS 或触发事件）/ 提交人
```

---

## 2026-09-23 v1.0.0 初始版本（应用领域，对齐 game-dev-workflow v1.1.0）

- 建立 skill 主体：SKILL.md（三条铁律 / 流程总览 / 12 指令路由 / 经验回流规则）
- `references/`：pipeline（S0–S7 与 G0–G7）、operations（12 runbook）、roles、multi-agent、trace-spec
- `references/templates/`：intake、design-doc、task-board、task、design-visual、integration-log、
  qa-report、bug、retrospective、decision 共 10 个模板
- `references/knowledge/`：门禁清单 G0–G7；经验库种子条目 L-001～L-008（标注"种子"，待团队用真实复盘覆盖增长）
- `scripts/af.sh`：init / new / find / index 辅助脚本
- 痕迹目录：**项目根隐藏目录 `.appflow/`**

### 与 game-dev-workflow 的关系：结构严格对齐，只换领域语汇

本 skill 是 `game-dev-workflow` 的**应用领域孪生版**：阶段、门禁、ID 体系、指令集、模板数量、
角色契约、CONFIG 字段结构**完全一致**，差异只允许落在下表声明过的领域映射内。
（守卫：`scripts/tests/test-skill-parity.py` 逐项比对两个技能；不在映射内的结构差异必须报错。）

| 维度 | game-dev-workflow | app-dev-workflow |
|---|---|---|
| 痕迹目录 | `.gameflow/` | `.appflow/` |
| 口头触发语 | 初始化 gameflow | 初始化 appflow |
| init 提交标签 | `[gameflow] init` | `[appflow] init` |
| 设计角色 Designer | 策划 | 产品经理 |
| 实现角色 Developer | 程序 | 开发 |
| 体验角色 Designer | 美术 | UI/UX 设计 |
| 设计产物 | `01-design.md`（策划设计文档） | `01-design.md`（产品 + 技术设计文档） |
| 体验产物 | `03-art-design.md` | `03-design-visual.md` |
| 设计资产目录 | `art-assets/` | `design-assets/` |
| 体验设计模板 | `templates/art-design.md` | `templates/design-visual.md` |
| CONFIG：技术栈 | `engine` | `stack` |
| CONFIG：设计目录 | `art_dirs` | `design_dirs` |
| CONFIG：设计规范 | `art_spec` | `design_spec` |
| 辅助脚本 | `scripts/gf.sh` | `scripts/af.sh` |

### 点号前缀（隐藏目录）的依据 —— 应用侧与技术栈侧不同，已逐条核实

- **pytest**：默认 `norecursedirs` 含 `.*` → 痕迹不会被当成测试收集（pytest 官方配置文档）
- **Python 打包**：包名不能以 `.` 开头，`find_packages()` 不把它当包 → 不会进 wheel / sdist
- **ripgrep / 多数编辑器**：默认隐藏，不参与检索与文件树展示
- ⚠️ **反例**：ESLint v9 flat config **已不再默认忽略**点号文件/目录
  （官方原文 *"In flat config, dotfiles … are no longer ignored by default"*），
  别把"linter 会忽略它"当理由。

### 派生缺陷修正（同日，同版本内，未发布）

派生 + 精修后由 `scripts/tests/test-skill-parity.py` 逐项复核，共揪出 4 处**不报错的漂移**：

| # | 症状 | 根因 | 处理 |
|---|---|---|---|
| 1 | `manifest.json` 的 description 变成 `UI/UX 设计UI/动效/视觉反馈设计` | 双替换：`美术`→`UI/UX 设计` 后，`特效`→`视觉反馈` 又叠加一次，且丢失分隔 | 以 SKILL.md frontmatter 为唯一来源回填 |
| 2 | `manifest.json` version `1.1.0`，而 CHANGELOG 是 `v1.0.0` | 派生时整段沿用 game 版 manifest | 归 `1.0.0`，并把「version == CHANGELOG 最新条目」纳入守卫 |
| 3 | 接入清单里残留「音效位」 | 领域词表未覆盖 | 改「提示音位」 |
| 4 | 性能验收残留「帧率 / 加载时间」 | 应用侧指标与技术栈侧不同 | 改为「首屏可交互 / 包体积 / 接口 P95 / 内存峰值」，与 S1 性能预算口径对齐 |

**这四条共同点：语法正确、校验全绿、只有人照着干活时才发现。** 所以补了两道守卫：
`test-skill-parity.py`（结构对齐，37 项）与 `test-skill-parity-negatives.py`
（注入 16 种漂移验证前者不会空转）；已接入 `make verify` 第 6、7 步。

### 派生方式（为什么不是手抄一遍）

由 `game-dev-workflow` 按**有序替换表**派生后人工精修。替换表已固化进
`scripts/tests/test-skill-parity.py` 的 `TERM_MAP` / `FILE_MAP` —— 它既是守卫的判据，
也是这份「允许差异」的唯一权威声明（临时派生脚本不入库）。踩到的两个坑已记录，供后续再派生时复用：
1. 工作区是 **CRLF**，跨行的替换串用 `\n` 写会**全部静默不命中**（单行的能中）→ 必须用 `\r?\n` 容忍匹配。
2. 先做领域替换再写精修串时，要**照派生后的文本**写，不能照 game 版原文写
   （例：`素材命名` 已被换成 `设计资产命名`）→ 否则断言拦下时会误以为"原文没这行"。

- 提交人：主控（触发：用户指令「参考 game-dev-workflow，严格对齐，新增一个 app-dev-workflow」）
