# DSH 插件仓库（DSHPlugins）

按**类型**分层存放的 DSH / DeepSeek Harness 插件仓库：技能、智能体、MCP 配置、面板各归其位。

## 📦 内容清单

按**类型**分层存放，互不混放：

| 目录 | 放什么 | 当前收录 |
|---|---|---|
| [`skills/`](skills/) | **技能型**能力（有 `SKILL.md`，DSH 扫描发现） | [game-dev-workflow](skills/game-dev-workflow/)、[lucky-api](skills/lucky-api/)、[hello-plugin](skills/hello-plugin/)、[cloudflare-tunnel](skills/cloudflare-tunnel/)、[jdgold](skills/jdgold/)、[Cloudflare 官方技能 14 个](docs/upstream/cloudflare-skills/) |
| [`agents/`](agents/) | **智能体 / 专家包**（角色定义，非能力） | _暂无_ |
| [`mcps/`](mcps/) | **MCP 服务配置**（配置片段 + 启动脚本，不含凭据） | [hindsight](mcps/hindsight/) |
| [`panels/`](panels/) | **运行时面板插件**（DSH extensions 双半包，带 UI） | [dsh-plugin-repo-manager](panels/dsh-plugin-repo-manager/) |

### 亮点

- **game-dev-workflow**（技能） - 游戏开发全流程团队协作系统
  - 策划设计 → 程序拆单实现 ∥ 美术 UI/动效/特效设计 → 表现接入调优 → QA → BUG 修复 → 复盘沉淀
  - 强制全程留痕（项目根 `gameflow/` 痕迹目录，与代码分离，WS-ID 全链路关联），适配多 agent 并行开发
  - 含角色章程 / 操作 runbook / 模板 / 经验回流（`references/`）与 `gf.sh` 入口
- **dsh-plugin-repo-manager**（面板） - 主界面侧边栏图标按钮 + 设置面板 tab 里的「我的插件仓库」
  - 侧边栏按钮入口 / Skill 列表展示 / 安装卸载（带确认）/ 批量操作 / 轮询刷新（默认 3 秒）
- **lucky-api**（技能） - 调用自建 Lucky 实例的 HTTP API
  - 零依赖（Python stdlib），`check / get / post / put` 统一入口
  - 鉴权走 `Lucky-Admin-Token`，成败判 `ret` 而非 HTTP 状态码
  - 附 370 个接口清单，可一键重抓前端刷新
- **cloudflare-tunnel**（技能） - 把本地服务暴露到公网，来自 [xiaoyuboi/cloudflare-tunnel-skill](https://github.com/xiaoyuboi/cloudflare-tunnel-skill)，MIT
  - Quick 模式给出临时 `https://*.trycloudflare.com` 预览链接；Named 模式给出固定域名
  - 含可执行 helper：`quick / verify / stop / status / named-config`，另有端到端测试脚本
  - **前置依赖：需单独安装 `cloudflared`**（技能不含它）；溯源与审计结论见 [`docs/upstream/cloudflare-tunnel-skill/`](docs/upstream/cloudflare-tunnel-skill/)
- **jdgold**（技能） - 京东黄金 ToC 智能助手，来自京东金融官方分发包
  - 行情（京东 24h 金价 / 上金所 / 伦敦金 / 7 家银行积存金）、本人持仓与收益、黄金持仓诊断
  - 交易记录与条件单、黄金综合分析、贵金属 K 线、资讯快讯、大 V 排行
  - **模拟交易**：模拟金叶子买卖 + 全自动托管盯盘（**仅模拟盘，不涉及真实资金**，含 `--dry-run`）
  - 含强制静默版本检查与自升级机制 —— **只读比对，不自动升级**；登录态功能走京东授权流程
  - 无附许可证；包内置的官方公开 API Key 走**精确值豁免**（三条判据 + 双处同步），见 [`docs/upstream/jdgold/`](docs/upstream/jdgold/)
- **Cloudflare 官方技能**（技能 × 14） - 来自 [cloudflare/skills](https://github.com/cloudflare/skills)，Apache-2.0
  - 路由层 `cloudflare`（含 52 个产品参考包）+ Workers / Durable Objects / Agents SDK / Wrangler 等
  - **原样引入，未做任何改写**，便于随上游更新；许可证与上游 README 存于 [`docs/upstream/cloudflare-skills/`](docs/upstream/cloudflare-skills/)
  - ⚠️ 与上面的 `cloudflare-tunnel` **不是同一上游**（一个官方 Apache-2.0，一个个人 MIT），仅主题相关
- **hindsight**（MCP） - 自建 Hindsight 长期记忆服务
  - 藏在隧道后，**端口会变** → 仓库只存**模板 + 探测脚本**，不硬编码地址
  - `resolve_hindsight_url.py` 从稳定跳板探测当前直连地址（可握手验证）
  - `apply_to_config.py` 安全写入配置（只改一个字段 / 先备份 / 写前验证 / 原子写）
  - `selfheal.sh` 无人值守封装，供定时自动化与 cron 调用
  - **这套脚本是自愈逻辑的唯一实现**，技能与旧脚本位置均转发至此

> 各类内容的格式约定、校验方式、安装落点各见其目录下的 `README.md`。

## 🚀 快速开始

> 设计原则：**产物已编译入库，目标机不需要 npm 或编译工具链**。
> 你只需 `git pull` 然后按下面两种方式安装。

### 安装前自检（推荐）

```bash
bash scripts/preflight.sh                   # 检查产物是否齐备、脚本是否会污染 DSH
python3 scripts/validate_repo.py            # 结构 + 契约 + 名字一致性校验（零依赖）
python3 scripts/tests/test_cred_parity.py   # 凭据粗筛：两套实现判定必须一致
node scripts/tests/test-panel-resolve.mjs   # 面板可加载性（按包名真实解析）
```

四者都会在缺失编译产物、或 `main` 指向 `.ts` 时报 FAIL。
一条命令跑全套：`make verify`。

> 第 3 条是**一致性守卫**。凭据粗筛在 Python 与 Bash 里各写了一份实现，
> 曾因 Bash 版缺 `-i`、且关键字不允许前缀，漏判 jdgold 的 API Key ——
> 同一份代码，两套校验给出相反结论。该测试现读两份**生产源码**的
> 正则与调用标志，用同一份语料比对判定，任何漂移立即失败。
>
> 第 4 条防的是另一类事故：面板装了却加载不起来，报
> `invalid plugin, expect function or object with an "apply" method, received undefined`。
> 该测试在临时目录里搭出完整的 profile 布局，**用加载器实际使用的名字真实 import 一次**，
> 把「包名与落点不符导致解析失败」和「入口缺少 default 导出」这两个症状相同、
> 根因不同的缺陷分别检出。详见 [`docs/FAQ.md`](docs/FAQ.md) 的 Q4b。

### 1. 安装技能型插件（skills/）

```bash
make install NAME=lucky-api        # 单个
make install-all                   # 全部
```

等价于把 `skills/<name>/` 复制到 `$DSH_HOME/skills/<name>/`，DSH 的 skill 提供方会自动发现，**无需重启**。

### 2. 安装面板插件（panels/）

```bash
make install-panel                 # 会先编译，再装到 DSH profile
```

或直接：

```bash
bash scripts/install-to-profile.sh
```

**日常更新用这条**（`git pull` + 重装，两步都不能少）：

```bash
bash scripts/update-and-install.sh          # 等价于 make update-panel
bash scripts/update-and-install.sh --skills # 顺便重装 skills/ 下全部技能
```

> ⚠️ 只 `git pull` 是**不够的**：DSH 读的是 profile 里**复制过去的独立副本**（非软链接），
> 拉取只更新「源」，已装那份纹丝不动 → 现象是「改了没效果」。
> 反过来只重装不拉取，装的还是旧的。
> 该脚本内部用相对路径定位自身，且**只转发**到 `install-to-profile.sh`（不重写落点逻辑）。

**多机部署：profile 目录是自动查找的，不需要改脚本。**
曾经它写死成 `/vol2/@appdata/deepseek.harness/dsh-data/profiles/web`，
于是只有那一台机器能装，换一台就报 `ERROR: DSH profile 不存在`。
现在由 `scripts/lib/resolve-profile.sh` 运行时探测：

```bash
bash scripts/update-and-install.sh --list-profiles   # 先看它找到了哪些候选
bash scripts/install-to-profile.sh                   # 通常直接就能用
```

按优先级找：`PROFILE_DIR` → `DSH_PROFILE` → `DSH_HOME/profiles/web` →
已装过本插件的那个 profile（升级不换地方）→ `~/.dsh/profiles/web` → 常见数据根 → 受限搜索。
**唯一命中才采用**；多个命中会列出来让你显式指定，不猜。

**这个脚本只写入 DSH 的 profile 目录**（用户数据区
`<DSH 数据根>/profiles/<名字>`，NAS 上是 `dsh-data/profiles/web`），做三件事：

1. 复制**编译产物**（`dist/` + `client/` + `cordis.patch.yml`）到 profile 的
   `node_modules/dsh-plugin-repo-manager/`（**必须与包名一致**，否则 DSH 解析不到该包，
   启动时报 `invalid plugin, expect function or object with an "apply" method, received undefined`）
2. 用 python3 的 JSON 库安全更新 profile `package.json`
   （`dependencies` + `dsh.profile.bundles`）
3. 备份原 `package.json`

它**不会**修改 DSH 运行时源码，也不依赖任何「某行恰好存在」的文本替换。

### 3. 重启 DSH

```bash
pkill -f 'dsh.*web' || true
dsh --profile web &
```

### 4. 访问

打开 `http://127.0.0.1:2298/`，两种进法任选：

- **主界面左侧竖条** → 点 📦 箱子图标
- 设置 → 插件 → **「我的插件仓库」**

### 卸载

```bash
make uninstall NAME=lucky-api      # 技能
make uninstall-panel               # 面板（从备份完整还原 package.json）
```

## 📁 仓库结构

```
DSHPlugins/
├── skills/                         # 技能型插件（SKILL.md，DSH 扫描发现）
│   ├── lucky-api/                  #   Lucky 实例 API 调用（零依赖客户端 + 接口清单）
│   ├── hello-plugin/               #   示例技能
│   ├── cloudflare-tunnel/          #   本地服务暴露到公网（Quick / Named Tunnel，需 cloudflared）
│   ├── jdgold/                     #   京东黄金助手（行情/持仓/条件单/模拟交易；含自升级）
│   ├── cloudflare/                 #  ┐
│   ├── wrangler/                   #  │
│   ├── workers-best-practices/     #  │  Cloudflare 官方技能（14 个）
│   ├── durable-objects/            #  │  来自 cloudflare/skills，Apache-2.0
│   ├── agents-sdk/                 #  │  原样引入，未改写
│   ├── sandbox-next/ ...           #  ┘
│   └── README.md
├── agents/                         # 智能体 / 专家包（暂无）
│   └── README.md
├── mcps/                           # MCP 服务配置（不含凭据）
│   ├── hindsight/                  #   自建 Hindsight 记忆服务（隧道后，端口会变）
│   │   ├── mcp.template.json       #     配置模板（占位符，不存真地址）
│   │   └── scripts/                #     唯一实现：探测 + 安全写入 + 无人值守
│   └── README.md
├── panels/                         # 运行时面板插件（DSH extensions 双半包）
│   ├── dsh-plugin-repo-manager/
│   │   ├── dist/index.js           #  ★ 服务端编译产物（已入库）
│   │   ├── client/client.js        #  ★ 客户端编译产物（已入库）
│   │   ├── src/                    #    TS 源码（安装时不复制）
│   │   ├── cordis.patch.yml        #    Cordis 挂载配置
│   │   ├── manifest.json           #    元数据（版本号来源）
│   │   └── package.json            #    main 指向 dist/index.js
│   └── README.md
├── docs/                           # 文档
│   ├── architecture.md             #   架构说明
│   ├── FAQ.md                      #   常见问题
│   ├── development-runbook.md      #   开发指南
│   ├── how-to-add-a-plugin.md      #   新增插件指南
│   └── upstream/                   #   第三方资产溯源（每个上游一个目录）
│       ├── cloudflare-skills/      #     Apache-2.0：Cloudflare 官方技能 ×14
│       ├── cloudflare-tunnel-skill/#     MIT：cloudflare-tunnel（个人的仓库）
│       └── jdgold/                 #     无附许可证：京东金融官方 zip 分发包
├── scripts/
│   ├── preflight.sh                #   安装前自检（只读）
│   ├── validate_repo.py            #   结构/契约校验（零依赖）
│   ├── gen-manifest.py             #   从 SKILL.md 生成 manifest（含上游溯源登记表）
│   ├── sync-skill-to-workbuddy.py  #   仓库 skills/ → ~/.workbuddy/skills/（幂等）
│   ├── install-to-profile.sh       #   安装面板 → DSH profile（唯一实现）
│   ├── update-and-install.sh       #   拉取 + 重装（转发到上一条，不重写落点）
│   ├── uninstall-from-profile.sh   #   从 profile 卸载
│   ├── start-dsh-with-plugin.sh    #   以 --patch 方式临时加载（不改源码）
│   ├── install-plugin-repo.sh      #   已废弃，执行即退出并提示新方式
│   └── tests/
│       ├── test_cred_parity.py     #   凭据粗筛一致性守卫（两套实现判定必须一致）
│       ├── cred_parity_corpus.txt  #     该测试的语料
│       ├── test-panel-resolve.mjs  #   面板可加载性（按包名真实解析 + 导出形态）
│       └── panel-resolve-probe.mjs #     其探针（在模拟 profile 里执行 import）
├── README.md
└── Makefile
```

> ⚠️ 目录按类型分开后，管理面板的扫描目录 `repoDir` 必须同步（已改为
> `/vol1/1000/AI/DSHPlugin/skills`），否则面板会扫不到技能、列表变空。
> 见 `panels/dsh-plugin-repo-manager/cordis.patch.yml`。

## 📦 编译产物为什么要入库

`dist/index.js` 与 `client/client.js` **是提交进 git 的**，不要加进 `.gitignore`。

原因：本仓库定位是「**装了就能用**」。目标机（NAS）上可能没有 Node 工具链，
也可能不方便跑 `npm install`。把产物入库后：

- 安装 = 纯文件复制，秒级完成
- 不受目标机 Node/npm 版本影响
- `git pull` 即得到可直接运行的最新版

改完源码后请在**开发机**执行 `npm run build`，并把产物一起提交。
`scripts/preflight.sh` 会在产物缺失或过期时报 FAIL 提醒。


## 🎯 功能特性

| 功能 | 状态 | 说明 |
|------|------|------|
| 侧边栏按钮 | ✅ | 注册到 sidebar 槽 |
| Skill 列表 | ✅ | 从仓库目录读取 |
| 安装/卸载 | ✅ | 带确认对话框 |
| 版本检测 | ✅ | 仓库版本 vs 已装版本，标出「可更新」 |
| 一键更新 | ✅ | 单个更新 / 「⬆ 全部更新」批量串行 |
| 更新留档 | ✅ | 更新前整目录备份 + 记录 `previousVersion`/`backupDir` |
| 批量操作 | ✅ | 勾选多个插件 |
| 轮询刷新 | ✅ | 默认 3 秒，可自定义 |
| 安全守卫 | ✅ | kebab-case + 路径穿越防护 |
| 多语言 | ✅ | 中文/英文 |

## 🔄 版本与更新机制

**版本号解析顺序**（取第一个命中）：

| 顺序 | 文件 | 适用类型 |
|------|------|----------|
| 1 | `manifest.json` 的 `version` | skill / agent / mcp / runtime |
| 2 | `package.json` 的 `version` | 面板型（npm 包） |
| 3 | `version.json` 的 `version` | 已安装留档兜底 |

**更新判定**：`isNewer(latest, current)` 逐段数字比较语义化版本。

- 版本号缺失或无法解析（含非数字段）→ **不提示更新**，避免误报
- 支持 `v` 前缀与预发布后缀（`1.1.0-alpha` 按 `1.1.0` 比较）
- 段位数不齐按 0 补齐（`1.0` 等价 `1.0.0`）
- 用例见 `panels/dsh-plugin-repo-manager/scripts/test-isnewer.mjs`（23 例，全通过）

**更新流程**：读旧版本 → 判定安装/更新 → **整目录备份** `<name>.bak-<ISO时间戳>` → 清空旧目录（防残留）→ 递归复制（`statSync` 判目录，空目录也能复制）→ 写 `version.json`（保留 `installedAt`，刷新 `version`/`updatedAt`/`previousVersion`/`backupDir`）。

> 面板插件自身的版本号写在 `panels/dsh-plugin-repo-manager/manifest.json`（当前 `1.1.0`），与 `package.json` 保持一致。


## ⚙️ 配置

### cordis.patch.yml

```yaml
- insert:
    - id: plugin-repo
      name: 'dsh-plugin-repo-manager'
      config:
        repoDir: '/vol1/1000/AI/DSHPlugin/skills'
        skillsDir: '~/.dsh/skills'
        pollInterval: 3000
```

### 环境变量

```bash
export DSH_PLUGIN_REPO_DIR=/path/to/skills   # 技能仓库目录（管理面板扫描目标）
export DSH_PLUGIN_POLL_INTERVAL=3000
```

## 📊 对比其他方案

| 方案 | 侧边栏 | Skill 管理 | 实时性 | 安装复杂度 | 体积 |
|------|--------|-----------|--------|-----------|------|
| 官方 DSH 源码 | ✅ | ✅ | ⭐⭐⭐ Typert | 高（编译） | 大 |
| dsh-market | ✅ | ✅ | ⭐⭐ WebSocket | 中（npm） | 中 |
| **本插件** | ✅ | ✅ | ⭐ 轮询 | **低（复制）** | **小（14K）** |

## 🔮 未来改进

1. WebSocket 实时推送
2. 插件搜索功能
3. 版本回滚（基于已留档的 `.bak-<时间戳>` 备份）
4. GitHub 直接安装
5. 批量卸载

## 📝 HTTP API

```
GET  /api/plugin-repo/list      # 列出所有插件（含 hasUpdate 标识）
POST /api/plugin-repo/install   # 安装插件（已装则走更新：备份 + 留档）
POST /api/plugin-repo/uninstall # 卸载插件
```

> `/install` 对已安装插件自动转为**更新**语义，返回体含 `updated: true` 与 `backupDir`。

## 📖 相关文档

- [面板实现详情](panels/dsh-plugin-repo-manager/IMPLEMENTATION.md)
- [面板安装指南](panels/dsh-plugin-repo-manager/INSTALL.md)
- [面板方案总结](panels/dsh-plugin-repo-manager/FINAL.md)
- [技能目录约定](skills/README.md) ｜ [面板目录约定](panels/README.md) ｜ [agents](agents/README.md) ｜ [mcps](mcps/README.md)
- [架构文档](docs/architecture.md)
- [开发指南](docs/development-runbook.md)

## 📄 License

MIT
