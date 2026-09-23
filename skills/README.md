# skills/ — 技能型插件

放 **技能型** 能力：一个目录 = 一个技能，含 `SKILL.md`，DSH 的
`dsh-skill-filesystem` 提供方扫描发现，安装到 `$DSH_HOME/skills/<name>/`。

## 目录约定

```
skills/<name>/
├── SKILL.md          # 必需。frontmatter: name / description / whenToUse / invocation
├── manifest.json     # 建议保留：version / author / type: skill / keywords
├── scripts/          # 可选。可执行脚本（零第三方依赖，Python stdlib 优先）
└── references/       # 可选。长文档、接口清单等参考材料
```

> 除上述两类外，按需再加子目录即可。**仓库根目录没有 `templates/`**——
> 旧文档里出现过的 `templates/skill-template`、`templates/runtime-template`
> 都是失效引用，新建技能直接 `mkdir -p skills/<name>` 从零写。

## 命名与校验

- 目录名 = `SKILL.md` 的 `name` = `manifest.json` 的 `name`
- kebab-case：`^[a-z0-9]+(?:-[a-z0-9]+)*$`（不能有中文、大写、下划线）
- **必须平铺**：`skills/<name>/` 只允许一层。套了父目录（如 `skills/vendor/<name>/`）
  DSH 就扫不到 —— 扫描器按 `skills/*/SKILL.md` 匹配。
- 自校验：**一条命令跑全套** —— `make verify`（共七步：结构校验 / 安装前自检 /
  凭据一致性回归 / 面板可加载性 / profile 落点探测 / 镜像技能对齐 / 对齐守卫反向回归。
  明细见 [`docs/how-to-add-a-plugin.md`](../docs/how-to-add-a-plugin.md) 的校验清单）。
  本文件**不复述步骤清单** —— 曾复述过一版「四套」，随守卫增加到七步而漂移成错的。

  > 其中一步是**一致性守卫**。凭据粗筛在 Python 与 Bash 里各有一份实现，
  > 曾因 Bash 版缺 `-i`（且关键字不允许前缀）而漏判 jdgold 的 API Key，
  > 导致两套校验给出相反结论。该测试现读两份**生产源码**的正则与标志，
  > 用同一份语料比对判定，任何漂移立即失败。

## 当前收录

| 技能 | 说明 |
|---|---|
| [game-dev-workflow](game-dev-workflow/) | 游戏开发全流程团队协作系统：策划设计 → 程序拆单实现 ∥ 美术 UI/动效/特效设计 → 表现接入调优 → QA → BUG 修复 → 复盘沉淀。强制全程留痕（项目根 `.gameflow/`），`gf.sh` 入口 |
| [app-dev-workflow](app-dev-workflow/) | 应用开发全流程团队协作系统，上面那个的**领域孪生版**（阶段/门禁/ID 体系/指令集/模板数/CONFIG 字段结构一致，只换领域语汇；痕迹目录 `.appflow/`，`af.sh` 入口） |
| [jdgold](jdgold/) | 京东黄金 ToC 智能助手：行情（京东 24h / 上金所 / 伦敦金 / 7 家银行积存金）、本人持仓与收益、交易记录与条件单、黄金综合分析、K 线、资讯、大 V 排行、**模拟交易**（含全自动托管盯盘）。含强制静默版本检查与自升级机制（只读比对，不自动升级）。**登录态功能需走京东授权流程**。来自京东金融官方分发包，无附许可证，溯源见 [`docs/upstream/jdgold/`](../docs/upstream/jdgold/) |
| [lucky-api](lucky-api/) | 调用自建 Lucky 实例的 HTTP API（零依赖客户端 + 370 接口清单 + 前端重抓脚本）。跳板地址会 302 到直连端口，**端口随升级变化，勿硬编码** |
| [hello-plugin](hello-plugin/) | 示例技能：演示本仓库技能插件的标准结构 |
| [cloudflare-tunnel](cloudflare-tunnel/) | 把本地 HTTP/HTTPS 服务暴露到公网：Quick 模式给临时 `*.trycloudflare.com` 预览链接，Named 模式给固定域名。含可执行 helper（`quick`/`verify`/`stop`/`status`/`named-config`）。**前置：需单独安装 `cloudflared`**。来自 [xiaoyuboi/cloudflare-tunnel-skill](https://github.com/xiaoyuboi/cloudflare-tunnel-skill)，MIT |

上游来源共 **2 个**，都有独立的 [`docs/upstream/`](../docs/upstream/) 溯源目录：

| 上游 | 许可证 | 覆盖技能 |
|---|---|---|
| `cloudflare-tunnel-skill`（个人仓库 xiaoyuboi） | MIT | `cloudflare-tunnel` |
| `jdgold`（京东金融官方 zip 分发包） | 无附许可证 | `jdgold` |

上表 6 个技能里，**4 个是自研**（`game-dev-workflow` / `app-dev-workflow` / `lucky-api` /
`hello-plugin`，manifest 手写、无 `source` 字段，登记在 `gen-manifest.py` 的 `LOCAL_SKILLS`），
**2 个来自上述上游**（`jdgold` / `cloudflare-tunnel`）。

> ⚠️ **`cloudflare-tunnel` 与 Cloudflare 官方无关** —— 它只是主题叫 "Cloudflare Tunnel"，
> 代码由个人维护（MIT）。**不要把它和 `cloudflare/skills` 混为一谈**：后者是官方
> Apache-2.0 仓库，其 14 个技能（`cloudflare` 路由层 + Workers / Durable Objects /
> Agents SDK / Wrangler 等，共 2.2M）已于 2026-09-23 整体移出本仓库。
> 保留 `cloudflare-tunnel` 的原因是它是**独立的第三方上游**，不是官方技能的子集。
>
> ⚠️ 同时删掉的还有 `gen-manifest.py` 里的 `DEFAULT_PROVENANCE` 兜底 ——
> 它曾默认把**未登记**的技能归到 Cloudflare，于是"漏登记"不报错、只静默套上
> Apache-2.0 与 Cloudflare 的 author/source。现在未登记会直接 FAIL（退出码 2），
> `--list` 也会把未登记技能单独列出来。详见
> [`docs/how-to-add-a-plugin.md`](../docs/how-to-add-a-plugin.md)。

## 安装到 DSH

**技能型不需要安装脚本。** DSH 的 `dsh-skill-filesystem` 直接扫描 `skills/` 目录，
`git pull` 之后新技能即被发现。落点由 DSH 决定（默认 `$DSH_HOME/skills/`）。

> NAS 侧仓库路径：`/vol1/1000/AI/DSHPlugin`，技能落点 `$DSH_HOME/skills/`。
> `dsh-plugin-repo-manager` 管理面板的扫描目录配置为
> `/vol1/1000/AI/DSHPlugin/skills`（见 `panels/dsh-plugin-repo-manager/cordis.patch.yml`）。
>
> 需要跑安装脚本的是**面板型**插件，见 [`panels/README.md`](../panels/README.md)
> 与 `make install-panel`。

## 收录外部技能

从上游引入时，五步：

```bash
# 0. 安全审计（第三方代码必做）
#    按 skills安全审计 的 11 步过一遍：危险关键词 / 隐蔽执行 / 敏感路径 / 网络请求 /
#    文件操作 / 权限提升 / 依赖安装 / 元数据 / 行为一致性 → 定级 P0/P1/P2。
#    P0 必须停止并报告用户；P1 需用户确认；P2 可直接收录（结论写进 SOURCE.md）。

# 1. 复制（平铺；目录名取 SKILL.md 的 name，不一定是上游目录名）
mkdir -p skills/<name>
cp -r <上游>/{SKILL.md,scripts,references} skills/<name>/

# 2. 登记上游（新来源时必做，否则会套用错许可证）
#    在 scripts/gen-manifest.py 里补两处：
#      PROVENANCE["<上游标识>"]      = {author, source, license, version}
#      SKILL_PROVENANCE["<name>"]    = "<上游标识>"

# 3. 从 SKILL.md 生成 manifest.json（不要手抄 description）
python3 scripts/gen-manifest.py "$(cygpath -w "$(pwd)")" <name> --provenance <上游标识>
# Linux / NAS 上直接：python3 scripts/gen-manifest.py . <name> --provenance <上游标识>
# 查已登记来源：python3 scripts/gen-manifest.py . --list

# 4. 保留上游 LICENSE 与溯源信息
#    放到 docs/upstream/<来源>/{LICENSE,README.md,SOURCE.md}
#    上游文档里若写了别的宿主的安装路径（~/.claude/、~/.codex/ 等），
#    必须改写成目标中立写法，并把这个改动记进 SOURCE.md。

# 5. 校验
python3 scripts/validate_repo.py && bash scripts/preflight.sh
python3 scripts/tests/test_cred_parity.py   # 若动过凭据判据
```

**若上游是 zip 分发包**（而非 git 仓库，如 `jdgold`），第 1 步改为先下载解压：

```bash
curl -fsSL -o temp/<name>.zip <URL>
unzip -t temp/<name>.zip                        # 先验完整性
unzip -q temp/<name>.zip -d temp/<name>-extract # 再解压
# 确认无路径穿越条目（拒绝以 / 开头或含 ../），无符号链接，无隐藏文件
# 然后照常平铺复制到 skills/<name>/；version.json 之类的分发包元数据一并保留
```

分发包还会带三个 git 仓库没有的问题，需单独处理：
- **包内置默认凭据**：若字面量是官方随包分发的公开标识（所有用户同一个值）、
  且代码里有环境变量覆盖机制，则走**精确值豁免**——
  在 `validate_repo.py` 的 `KNOWN_PUBLIC_KEYS` 与 `preflight.sh` 的
  `KNOWN_PUBLIC_KEYS_RE` **两处同步加**，并在 SOURCE.md 里写明出处与判据。
  三条判据缺一不可（官方随包 + 有覆盖入口 + 已记录），**不要放宽成前缀匹配**。
- **自升级/自动执行入口**：确认它是"只读比对"还是"自动拉取替换"。
  前者可原样保留，后者必须报告用户再决定。
- **可执行位会丢**：zip 里 `scripts/` 的权限常是**混合**的（实测 jdgold：
  20 个 `.py` 只有 2 个是 755，其余 644 —— 打包机残留，非设计意图）。
  本仓库规则是 `scripts/` 一律 755，所以要显式补：
  `git add --chmod=+x skills/<name>/scripts/*.py`，
  并在 `SOURCE.md` 里把这处改动枚举出来（**只改 mode、内容未动**）。
  `validate_repo.py` 的 `check_exec_bits` 会拦，别等校验失败才发现。

参考实现（两个不同上游，许可证与改动程度都不同）：
- [`docs/upstream/cloudflare-tunnel-skill/SOURCE.md`](../docs/upstream/cloudflare-tunnel-skill/SOURCE.md) —— MIT，含一处路径改写 + 完整审计结论
- [`docs/upstream/jdgold/SOURCE.md`](../docs/upstream/jdgold/SOURCE.md) —— zip 分发包，无附许可证，含凭据豁免说明
