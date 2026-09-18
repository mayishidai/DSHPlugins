# cloudflare-tunnel-skill（上游资产）

本目录存放第三方资产的上游许可证与说明，**不是技能本体**。
技能本体已按 DSH 加载约定平铺在 `skills/cloudflare-tunnel/` 下。

## 来源

| 项 | 值 |
|---|---|
| 上游仓库 | https://github.com/xiaoyuboi/cloudflare-tunnel-skill |
| 作者 | xiaoyuboi（个人仓库，非 Cloudflare 官方） |
| 许可证 | MIT（见同目录 `LICENSE`） |
| 收录 commit | `1f4eebaaf3baa5e1d9fb41f38cf74348f03f0ec9`（2026-06-11） |
| 收录日期 | 2026-09-18 |
| 收录方式 | 复制 `SKILL.md` + `scripts/` + `references/` + `agents/`，仅做下述一处改写 |
| 技能名 | 上游目录名是 `cloudflare-tunnel-skill`，SKILL.md 的 `name` 是 `cloudflare-tunnel`。<br>本仓库取后者（**目录名 = SKILL.md name = manifest name** 是硬约束）。 |

上游 LICENSE 与中英文 README 原样保留在本目录，以满足 MIT 的署名与声明保留要求。

> **注意区分**：这与 `docs/upstream/cloudflare-skills/`（Cloudflare **官方**仓库，Apache-2.0）
> 是**两个不同的上游**。本技能虽是"Cloudflare Tunnel"主题，但代码由个人维护，不要混淆许可证。

## 这个技能能做什么

把本地 HTTP/HTTPS 服务暴露到公网，两种模式：

| 模式 | 公网地址 | 前置条件 | 适用 |
|---|---|---|---|
| Quick | 临时 `https://*.trycloudflare.com` | 只需 `cloudflared` | demo、课堂、临时预览 |
| Named | 固定域名，如 `app.example.com` | Cloudflare 账号 + 域名 DNS 托管在 Cloudflare | webhook、长期映射 |

## 本项目做的唯一改动

**一处**，在 `SKILL.md` 的 `## Paths and State` 章节：

- 上游原文写的是别的宿主的安装路径
  （`python3 ~/.claude/skills/cloudflare-tunnel/scripts/tunnel_helper.py ...`），
  本仓库的两个目标宿主都不用这个位置，**照抄必然路径不存在**。
- 改写为「先设 `SKILL_DIR`、再引用」的目标中立写法，给出 WorkBuddy（Windows Git Bash /
  macOS / Linux）与 DeepSeek Harness 三种取法，并在末尾点明：文中后续所有
  `python3 scripts/tunnel_helper.py ...` 指的是同一个 helper，不在技能目录里跑时要加
  `"$SKILL_DIR/"` 前缀。

`scripts/`、`references/`、`agents/` **全部原样未动**。

另新增 `manifest.json`（1 份），由 `scripts/gen-manifest.py` 从 SKILL.md 的 `description`
**读取**生成，不手抄。原因：仓库面板 `dsh-plugin-repo-manager` 需读 `manifest.json`
才能显示版本、才能走更新机制。

## `agents/openai.yaml` 的处置

上游带一个 `agents/openai.yaml`，是对**另一套宿主**（OpenAI 应用界面）的描述文件，
内容只有 `display_name` / `short_description` / `brand_color` / `default_prompt` 四个字段。
DSH 不使用它，但**原样收录**——理由：

- 它不影响 DSH：技能扫描器只认 `skills/*/SKILL.md`，`skills/cloudflare-tunnel/agents/`
  不会被当成技能根。
- 它不影响仓库结构：本仓库的顶层 `agents/` 是「智能体类型目录」，与技能目录**内部**的
  `agents/` 是两回事，二者不冲突。
- 保留它可以让将来与上游做 `diff` 时噪声最小。

## 安全审计结论：P2（安全，可收录）

收录前按供应链投毒风险做了 11 步审计（危险关键词 / 隐蔽执行 / 敏感路径 / 网络请求 /
文件操作 / 权限提升 / 依赖安装 / 元数据 / 行为一致性）。全量 11 个文件、逐行读完。

**审计要点：**

- 无编码混淆（`base64` / `chr()` / `fromhex` / `pickle` / `marshal` 全部零命中）。
- 无 `shell=True`、无 `os.system`、无 `eval`/`exec`；所有子进程调用都是**列表参数形式**，
  外部输入只以独立参数传入，不存在命令拼接注入。
- 无提权（`sudo` / `chmod` / `chown` / `setuid` / UAC 零命中）。
- 无自动安装依赖。仓库里出现的 `brew install cloudflared` / `winget install` 只在
  `references/troubleshooting.md` 里，是**给人看的排障步骤**，脚本不会执行。
- 无 hook / postinstall / `*.sh` / 任何自动执行入口。
- **网络目标只有 4 个**：`localhost`、`127.0.0.1`、`trycloudflare.com`、`1.1.1.1`
  （DoH 解析用）。无遥测、无回传、无第三方 CDN。
- 文件写入**全部落在当前工作目录的 `.cloudflare-tunnel/` 下**，以及测试脚本用
  `tempfile.mkdtemp()` 自建自删的临时目录。不碰 `~/.ssh`、`~/.aws`、`~/.env`、
  系统目录或任何用户配置。
- 凭据处理是**正面示范**：`--credentials-file` 只把路径字符串写进生成的 yml 交给
  `cloudflared` 自己读，脚本从不读 token 内容；文档反复强调"不要把 token 打印/提交/入库"。

**一处值得知道的设计**（判定 P2，非 P1）：

`stop` 会读当前目录 `.cloudflare-tunnel/quick.pid` 里的 PID，然后
`taskkill /PID <pid> /T /F`（Windows）或 `os.killpg`（POSIX）。**PID 文件来自工作目录，
可被第三方构造**——理论上在不可信目录里执行 `stop` 可能终止任意进程。

不升到 P1 的理由：该行为**不会自动发生**，必须用户主动在攻击者可控目录里显式执行
`stop`；且停止的是用户自己刚启动的隧道进程，属正常职责。这一点上游也已用文档说明
（状态写在 CWD，须在同一目录执行 `status`/`stop`）。

**综合定级：P2** —— 无 P0（无下载即执行 / 无读取敏感信息后外发 / 无隐蔽破坏性操作），
无 P1（无自动全局安装 / 无 `git+https` 直装 / 元数据无异常）。技能描述与实际行为一致。

## 前置依赖（装了技能不等于能用）

- **`cloudflared` 必须单独安装**，技能不含它。`brew install cloudflared`（macOS）、
  `winget install --id Cloudflare.cloudflared`（Windows），Linux 见官方仓库。
  DSH/NAS 上若跑 Debian 系容器，通常要手动下 `.deb` 或二进制。
- Python 3（helper 只用标准库，无第三方依赖）。
- Named 模式另需 Cloudflare 账号 + 已托管 DNS 的域名。

## 已知限制

- **Windows 是"尽力支持"**。上游 README 明确：helper 在 macOS / Linux 上经完整测试，
  Windows 的进程管理走 `tasklist`/`taskkill`，建议 Windows 用户优先 WSL 或手动命令。
  本仓库的验证环境是 Windows，但**未实跑端到端**（本机没装 `cloudflared`），
  只做了静态审计与语法检查。首次在 Windows 使用请留意这一点。
- **状态存在当前工作目录**，不是技能目录。换言之隧道有"目录粘性"：
  换目录后 `status`/`stop` 看不到之前启动的隧道。文档已警告，但这是个容易踩的点。
- **Quick 模式的 URL 是临时的**，`cloudflared` 退出 / 机器睡眠 / 断网即失效。
- 若把 `.cloudflare-tunnel/` 落在 git 仓库里，务必加进该仓库的 `.gitignore`；
  上游自带 `.gitignore` 已含这一条，但它只对自己的仓库生效。

## 如何更新

```bash
# 1. 拉取上游
git clone --depth 1 https://github.com/xiaoyuboi/cloudflare-tunnel-skill temp/cloudflare-tunnel-skill

# 2. 覆盖技能本体（注意目录名用 cloudflare-tunnel，不是上游的 -skill 后缀）
cp temp/cloudflare-tunnel-skill/SKILL.md skills/cloudflare-tunnel/
cp -R temp/cloudflare-tunnel-skill/{scripts,references,agents} skills/cloudflare-tunnel/

# 3. 重新施加本项目的那一处改写（SKILL.md 的 Paths and State 章节，见上文）
#    —— 上游若已自行改为中立写法，则跳过

# 4. 同步溯源文件与本文件里的 commit 号
cp temp/cloudflare-tunnel-skill/{LICENSE,README.md,README_EN.md} docs/upstream/cloudflare-tunnel-skill/

# 5. 刷新 manifest + 校验
python3 scripts/gen-manifest.py "$(cygpath -w "$(pwd)")" --provenance cloudflare-tunnel-skill
python3 scripts/validate_repo.py && bash scripts/preflight.sh
```

`SKILL_PROVENANCE` 里已有 `cloudflare-tunnel → cloudflare-tunnel-skill` 的映射，
所以 `--provenance cloudflare-tunnel-skill` 可以不跟技能名。
