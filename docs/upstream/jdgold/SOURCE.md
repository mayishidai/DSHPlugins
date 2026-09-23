# jdgold（京东黄金 Skill · 官方分发包）

本目录存放该技能的上游**来源信息与安全审计结论**，**不是技能本体**。
技能本体已按 DSH 加载约定平铺在 `skills/jdgold/` 下。

## 来源

| 项 | 值 |
|---|---|
| 分发地址 | `https://caifu-h5.s3.cn-north-1.jdcloud-oss.com/gold-skill/jdgold-1.0.0.zip` |
| 升级清单 | `https://caifu-h5.s3.cn-north-1.jdcloud-oss.com/gold-skill/manifest.json`（见 `version.json` 的 `manifest_url`） |
| 分发方 | 京东金融（域名 `*.jd.com` / `jdjygold.com` / `jdcloud-oss.com`） |
| 版本 | `1.0.0`（包内 `version.json` 记录的 `installed_at` 为 2026-07-17） |
| 收录日期 | 2026-09-18 |
| 收录方式 | 解压后平铺复制，**仅新增 frontmatter 两个字段**（见下） |
| 许可证 | **包内未附 LICENSE 文件**。原样收录，不修改；无上游声明可归档，此处如实记录该缺口。 |
| 完整性 | 下载后 `unzip -t` 通过，38 个条目无损坏；无路径穿越（`/` 开头或含 `..`）条目 |

> 与 `docs/upstream/` 下的另一上游（`cloudflare-tunnel-skill`，个人仓库 xiaoyuboi，MIT）
> **无关**，各自独立。
>
> 曾同在本目录下的 `cloudflare-skills/`（Cloudflare 官方 Apache-2.0，14 个技能）已于
> 2026-09-23 随技能本体一并移出仓库 —— 目前 `docs/upstream/` 只有两个上游。

## 这个技能能做什么

京东黄金 ToC 智能助手，覆盖：

- **行情类（免登录）**：京东 24h 金价、上金所、伦敦金、7 家银行积存金、贵金属 K 线与分时、
  资讯快讯、大 V 排行、黄金综合分析
- **账户类（需登录）**：本人积存金持仓与收益、持仓诊断、早报、交易记录、条件单、收益日历
- **模拟交易**：模拟金叶子买卖、账户查询，以及**全自动托管**（定时轮询、按策略低买高卖）

登录走京东 OAuth（`jos.py login-auto` → 用户在浏览器完成授权 → 回传确认 → `exchange` 换 token）。

## 本项目做的改动

### 1. `SKILL.md` frontmatter 新增两个字段

原有 `name` / `description` 一字未动：

```yaml
whenToUse: "当用户需要查询黄金/贵金属行情…（触发场景说明）"
invocation:
  modelInvocable: true
  userInvocable: true
```

**原因**：DSH 的 `dsh-skill-filesystem` 只认这两个字段来判定「何时可用、能否被模型/用户调用」；
官方包是按另一套宿主规范打的，只有 `name` + `description`。
缺这两个字段技能在 DSH 里仍能被扫描到，但**不会进入自动调用路径**。

### 2. `scripts/` 下的 `.py` 统一设为可执行（100755）

包内原始权限是**混合**的：仅 `jdjr_query_gold.py`、`jdjr_query_stock.py` 为 `rwxr-xr-x`，
其余 18 个 `.py` 与 1 个 `.plist` 均为 `rw-r--r--`。

统一设为 `100755` 的理由：
- 本仓库的既定规则（见 `docs/how-to-add-a-plugin.md` 校验清单）是
  **`scripts/` 下的脚本一律带可执行位**，现有 43 个脚本全为 `100755`。
- 上游那 2 个 755 与其余 644 的差别看不出设计意图，应是**打包机的权限残留**；
  所有脚本的调用方式一致（`python3 <script>.py`）。
- 带上可执行位不影响 `python3 x.py` 的调用，也避免在 NAS/Linux 上
  `./x.py` 时 Permission denied。

**内容未动**，仅 mode 变化，是**可枚举的元数据改动**（非内容改写）。

### 3. 新增 `manifest.json`（1 份）

由 `scripts/gen-manifest.py` 从 `SKILL.md` 读取 `description` / `whenToUse` 生成。

---

其余部分：`SKILL.md` 正文（722 行）、`references/`（13 个 md）、`scripts/`（20 个 py + 1 个 plist）
的**内容**全部逐字节未动（`diff -rq` 验证过）。

## 安全审计结论：P2（安全，可收录）

全量 38 个文件、逐行读完 20 个 Python 脚本（含 `jos.py` 49 KB、`query_income_calendar.py`
45 KB、`query_price_jhub.py` 22 KB 三个大文件）。按 11 步流程扫描。

### 逐项扫描结果

| 维度 | 结果 |
|---|---|
| 命令执行 | **零 `shell=True`、零 `os.system`、零 `eval`/`exec`**。全部 `subprocess` 调用都是**列表参数形式**，外部输入以独立参数传入，不存在命令拼接注入 |
| 编码混淆 / 隐蔽执行 | 有 `base64`，但**全部是良性的**：`jos.py` 用于 PKCE 的 `base64url(sha256(verifier))`（OAuth 标准做法）；`secure_store.py` 用于给 DPAPI 密文做文本编码。**无 `fromhex` / `pickle` / `marshal` / `exec(decode(...))` 模式** |
| 提权 | 零 `sudo` / `chown` / `setuid` / UAC。4 处 `os.chmod(..., 0o600)` 是**收紧**凭据文件权限，属正面 |
| 敏感路径 | 只碰 `~/.openclaw/service-env/jdgold`（自己的凭据目录）。**不读** `~/.ssh`、`~/.aws`、`.env`、浏览器数据、keyring 之外的系统凭据 |
| 网络目标 | 全部是京东域名：`u3.jr.jd.com`(10) `ms.jr.jd.com`(4) `apijoyspace.jd.com`(4) `m.jdjygold.com`(2) `content.jr.jd.com`(2) `youqian.jd.com` `joyspace.jd.com` `caifu-h5.s3.cn-north-1.jdcloud-oss.com`。**零第三方回传** |
| 遥测 | **零命中**（无 telemetry / analytics / beacon / 日志上传） |
| 依赖安装 | 无自动安装。零第三方依赖，全部标准库 |
| hook / postinstall | **无任何自动执行入口**（无 `setup.py` / `*.sh` / postinstall）。`autotrade.launchd.plist` 是**模板**，含 `__CLAW__` / `__PROJECT_DIR__` / `__PYTHON__` 三个占位符，**脚本不会自行安装它** |
| 文件写入 | 仅 `~/.openclaw/service-env/jdgold`（凭据）+ 技能目录内 `.joycode/`（日志与状态）+ `upgrade.py` 自建自删的临时目录 |

### 三处需要单独说明的设计（均判 P2）

**1. 凭据存储（`secure_store.py`）—— 设计良好，是加分项**

优先写入**系统级加密存储**：macOS Keychain（`security` 命令）或 Windows **DPAPI**
（`CryptProtectData`，用户态加密）。**明文永不落盘**。仅当系统后端不可用时才降级到
`0o600` 权限的本地文件（注释里也如实标注"尽力保护"）。

**2. 自动升级（`upgrade.py`）—— 有能力覆盖技能目录，但不会自动触发**

`apply` 子命令会 `zipfile.extractall(SKILL_DIR)`，**覆盖技能自身目录**。评估：

- ✅ **有 SHA256 校验**：下载后比对 manifest 里的 `pkg["sha256"]`，不匹配即删除并退出码 2
- ✅ **有路径穿越防护**：显式检查 `name.startswith("/") or ".." in name`，命中即拒绝
- ✅ **只覆盖自己**：`SKILL_DIR` 由 `__file__` 推导，作用域限于本技能
- ✅ **不自动升级**：`check` 只做**只读**版本比对（GET manifest + 语义化版本比较），
  发现新版**只提示用户**；`download` 与 `apply` 必须人工显式触发。
  SKILL.md 原文亦写明"（不自动升级）"
- ⚠️ `apply` 的 `tar_path` 参数本身未校验来源 —— 但它由 `download` 产出，
  且人工调用须显式传路径，不构成自动风险

**结论：符合「不会自动执行」的 P2 判据。**

**3. 模拟交易托管（`sim_autotrade.py`）—— 仅模拟盘**

脚本头部明确声明「**仅操作模拟金叶子，不涉及真实资金**」。含「判登录 → 拉行情 →
算买卖点 → 风控校验 → 下单 → 写日志 → 通知」闭环，支持 `--dry-run` 演练模式与
冷却期限制。触发方式为 macOS launchd 定时任务，**需用户按文档手工部署**
（替换占位符 → `cp` 到 `~/Library/LaunchAgents/` → `launchctl load`）。

⚠️ **Windows 不适用**：该托管依赖 macOS launchd 与 `osascript` 通知，
本机（Windows）只能用查询类功能。

### 关于包内置的默认 API Key（已登记豁免）

`scripts/jdjr_config.py:34` 有一个硬编码字面量：

```python
DEFAULT_CLAWX_JR_API_KEY = "clawx_def123456uUbOxn2UGmmcUCCgln6zscT"
```

**这是官方随包分发的公开客户端标识，不是用户私密凭据。** 判定依据：

1. **所有用户拿到的都是同一个值** —— 随 zip 分发给全体用户，非每人一份；
2. **代码里有环境变量覆盖**：`os.getenv("CLAWX_JR_API_KEY", DEFAULT_...)`，
   说明设计上它就是"可被替换的默认值"；
3. 字面量自带 `def123456` 前缀，命名上即是 default 语义；
4. 用途是向京东财富查询网关标识客户端来源，配合可公开的 `x-claw` 上报头。

**处置**：为避免误报淹没校验信号，已在 `scripts/validate_repo.py` 的
`KNOWN_PUBLIC_KEYS` 中**按精确值**登记豁免。该常量的收录判据（三条须同时成立）写在其定义处，
且已做**双向回归测试**（11/11 通过）：

- 真凭据（`sk-live-…` / AWS 形态 / `password`）**仍被抓**
- 相似但不同的值（仅末位不同 / 少一位 / 多一位前缀）**仍被抓** —— 证明是精确匹配而非前缀放宽
- 既有占位规则（`your_` / `${VAR}` / `test-` / `example`）**未被削弱**

**收录判据：P2** —— 无 P0、无 P1。技能描述与实际行为一致；无自动执行入口；
无隐蔽通信；无越权文件访问。

## 前置依赖与环境要求

- **Python 3**（全部脚本零第三方依赖，仅标准库）
- **需联网** 访问京东接口
- **需京东账号** 才能使用账户类功能（行情类免登录）
- 登录需**本机浏览器**完成 OAuth 授权
- **模拟交易托管仅支持 macOS**（launchd + osascript）
- 凭据落点：`~/.openclaw/service-env/jdgold`（Windows 走 DPAPI 密文，macOS 走 Keychain）
- 会话内每次加载会执行一次**只读**版本检查（访问京东 OSS），网络不通时静默跳过

## 已知限制

- **无上游 LICENSE 文件**。本包是官方分发的闭源技能包，无开源许可证声明。
  收录它意味着仓库里会多一份权利状态不明确的内容 —— **如需对外分发本仓库，
  建议先把 `skills/jdgold/` 排除**，或联系分发方确认授权。
- **`--claw` 参数**：所有查询脚本要求传 `--claw <客户端类型>`（如 `codex` / `openclaw`），
  随请求以 `x-claw` 头上报。不同宿主的取值不同，需按实际环境填。
- **版本检查是强制的**：SKILL.md 的执行契约要求"新会话首次加载必须先跑
  `upgrade.py check`"。这是该技能自带的硬约束，会带来一次额外的外网请求。
- **`references/` 里的 `黄金持仓诊断.md` 是中文文件名**（其余为英文 kebab-case）。
  不影响 DSH 扫描（扫描器只认 `SKILL.md`），已原样保留。
- 本仓库的验证环境是 **Windows**，且**未实跑**端到端流程（登录需京东账号 + 浏览器授权）。
  仅做了静态审计与语法检查。

## 如何更新

本技能**自带升级机制**，优先用它（而不是手工覆盖）：

```bash
cd skills/jdgold
python3 scripts/upgrade.py check      # 只读检查（退出码 4 = 已是最新）
python3 scripts/upgrade.py download   # 下到临时目录并做 SHA256 校验
python3 scripts/upgrade.py apply <下载得到的 zip 路径>   # 解压覆盖 + 更新 version.json
```

手工收录新版本的流程：

```bash
# 1. 下载新版 zip（把 1.0.0 换成新版本号）
curl -sS -L -o temp/jdgold-<新版本>.zip \
  "https://caifu-h5.s3.cn-north-1.jdcloud-oss.com/gold-skill/jdgold-<新版本>.zip"

# 2. 校验完整性 + 确认无路径穿越
unzip -t temp/jdgold-<新版本>.zip
unzip -l temp/jdgold-<新版本>.zip | grep -E "^ *[0-9]+ .*(\s/|\.\.)" && echo "⚠️ 有可疑路径" || echo "路径安全"

# 3. 重新审计（新版可能引入新脚本 —— 审计结论不能沿用！）

# 4. 解压覆盖
unzip -q -o temp/jdgold-<新版本>.zip -d skills/jdgold/

# 5. 重新施加本项目的那两处改动
#    5a. SKILL.md frontmatter 补 whenToUse / invocation
#    5b. scripts/ 下的 .py 统一设为可执行（zip 里的权限是混合的，不可依赖）
chmod +x skills/jdgold/scripts/*.py
git add --chmod=+x skills/jdgold/scripts/*.py

# 6. 刷新 manifest + 校验
python3 scripts/gen-manifest.py "$(cygpath -w "$(pwd)")" jdgold --provenance jdgold
python3 scripts/validate_repo.py && bash scripts/preflight.sh
```

> ⚠️ **升级后必须重新审计**：`upgrade.py` 的机制是"信任远端 manifest 的 SHA256"，
> 而 manifest 本身也在同一台 OSS 上。若分发包被换掉，SHA256 也会一起被换。
> 本仓库已有的审计结论**只对 `1.0.0` 这个版本成立**，不能自动继承到新版本。
