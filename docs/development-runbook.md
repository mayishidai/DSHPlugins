# 插件开发与迭代手册（Runbook）

> 目的：让「新增/修改/安装/卸载/发布一个插件」成为可复制的流程，快速迭代。
> 适用：本仓库 `/vol1/1000/AI/DSHPlugin`，目标 DSH 数据根 `/vol2/@appdata/deepseek.harness/dsh-data`。
> ⚠️ 下表只是**这一台 NAS** 的实测值，**不是任何脚本的默认值** ——
> 本仓库不止一台 DSH，所有宿主路径都由脚本运行时探测（见第 0.1 节）。

---

## 0. 环境速查

| 项 | 值 |
|---|---|
| 仓库根 | `/vol1/1000/AI/DSHPlugin` |
| DSH 数据根 `$DSH_HOME` | `/vol2/@appdata/deepseek.harness/dsh-data` |
| 技能安装目录 `$SKILLS_DIR` | `$DSH_HOME/skills/`（DSH 自动扫描，装进去即被发现） |
| 面板安装目录 | `$DSH_HOME/profiles/web/node_modules/dsh-plugin-repo-manager/`（**自动查找**） |
| WorkBuddy 用户级技能目录 | `~/.workbuddy/skills/`（由 `make sync-skill` 生成，**不要手改**） |
| 依赖 | bash + python3；Windows 开发机上没有 `make`，可直接调用 `scripts/` 下的命令 |

**命令入口只有两个**：`Makefile` 目标与 `scripts/` 下的真实文件。

| 目的 | 命令 |
|---|---|
| 列出仓库内插件 | `make list` |
| 安装一个技能到 DSH | `make install NAME=<name>` |
| 安装 `skills/` 下全部技能 | `make install-all` |
| 卸载技能 | `make uninstall NAME=<name>` |
| **同步到 WorkBuddy 用户级** | `make sync-skill NAME=<name>`（全部：`ALL=1`；只看差异：`make sync-skill-dry`） |
| 校验仓库（只读） | `python3 scripts/validate_repo.py` 或 `make check` |
| 安装前自检 | `bash scripts/preflight.sh` |
| 刷新 manifest | `python3 scripts/gen-manifest.py "$(cygpath -w "$(pwd)")" [名字...]` |
| 编译面板插件 | `make build` |
| 装 / 卸面板到 DSH profile | `make install-panel` / `make uninstall-panel` |
| 拉取最新并重装面板 | `make update-panel`（= `bash scripts/update-and-install.sh`；加 `--skills` 连技能一起装） |
| **看 profile 解析到哪** | `bash scripts/update-and-install.sh --list-profiles`（只读） |
| 面板测试 / 类型检查 | `make test` / `make typecheck` |

> ⚠️ **不存在的脚本**：`install-plugin.sh`、`uninstall-plugin.sh`、`sync-to-dsh.sh`、
> `list-plugins.sh`、`build-manifest.sh`、`scripts/lib.sh`、`templates/` 都不在本仓库里。
> 旧文档里若还提到它们，属于历史遗留的错误引用，一律以本表为准。
> （注意 `scripts/lib/` **是**存在的，但里面的文件是 `resolve-profile.sh`。）

---

## 0.1 多机部署：宿主路径一律运行时探测

**这条是硬约束，不是建议。** 两次事故同源：

| 时间 | 写死的东西 | 后果 |
|---|---|---|
| 2026-09-21 | 面板 `cordis.patch.yml` 的 `skillsDir: '~/.dsh/skills'` | 容器里展开成 `/root/.dsh/skills`，DSH 扫的是 `$DSH_HOME/skills` → 点安装/卸载「没生效」，**不报错** |
| 2026-09-21 | `scripts/install-to-profile.sh` 的 `PROFILE_DIR="${PROFILE_DIR:-/vol2/.../profiles/web}"` | **只有那一台机器能装**，换一台报 `ERROR: DSH profile 不存在` |

共同点：**把「某台机器观察到的事实」当成了「普适默认值」**。

**唯一实现**：`scripts/lib/resolve-profile.sh`（`install-to-profile.sh` 与
`uninstall-from-profile.sh` 各 source 同一份 —— 一个写一个删，必须算出同一路径）。
探测优先级：

```
env PROFILE_DIR              显式指定 → 权威，无效就报错，绝不回退到别处
env DSH_PROFILE              名字或绝对路径，同样算显式
 <DSH_HOME>/profiles/web     DSH Web UI 的标准 profile 名
 已装过本插件的位置           升级路径：装在哪就更哪，不换地方
 <HOME>/.dsh/profiles/web
 内置「已知数据根」清单        只是搜索起点，全部要过存在性检查
 受限搜索 */profiles/*/       最后一招，可用 DSH_NO_PROFILE_SEARCH=1 关掉
```

规则：**唯一命中才采用**；多个命中列出候选并要求显式指定（退出码 3）；
一个都没有则打印**全部检查过的候选** + 手动指定方法（退出码 1）。
`DSH_HOME` 一旦给出可用 profile，就**只在它的子树里挑**。

配套守卫（都有双向注入回归）：
`validate_repo.py` 2.10（不得写死 + 函数定义唯一 + 两个脚本都 source）、
`scripts/tests/test-profile-resolve.sh`（25 例，调**真实 lib**）。

> 判据教训：**要拦的是「实现第二份」，不是「提到这个名字」**。
> 第一版把 `PROFILE_DIR=` 赋值形态当判据，结果解析库自己的帮助文本
> （`PROFILE_DIR=<路径> ...`，那是它的职责）被误判成第二份实现。

---

## 1. 新增一个插件（标准流程）

### 技能型（最常用）

```bash
cd /vol1/1000/AI/DSHPlugin

# 1) 建目录（名称 = 技能名，必须 kebab-case）
mkdir -p skills/<技能名>

# 2) 写 SKILL.md（frontmatter 至少含 name / description）
#    name 必须与目录名完全一致；建议同时写 whenToUse 与 invocation

# 3) 生成 manifest.json —— 从 SKILL.md 的 frontmatter 读取，不手抄
python3 scripts/gen-manifest.py "$(cygpath -w "$(pwd)")" <技能名>

# 4) 校验
python3 scripts/validate_repo.py     # 期望「失败 0」
bash scripts/preflight.sh            # 安装前自检

# 5) 安装到 DSH（在 NAS 上执行）
make install NAME=<技能名>

# 6) 同步到 WorkBuddy 用户级（在开发机上执行）
make sync-skill NAME=<技能名>
```

**可直接照抄的完整样例**：`skills/lucky-api/` —— 它带 `scripts/` 与 `references/`，
是最能代表「有实现代码的技能」长什么样的一个。

### 运行时 / 面板型

```bash
# 约定目录：panels/<面板插件名>/
#   src/       host 半（服务端）
#   client/    浏览器面板半
# 注意 src/client/index.tsx 必须用 .tsx 后缀（它含 JSX）
# manifest.json 的 type 设为 runtime / both

make build              # 编译服务端 tsc + 生成客户端 bundle
make test               # 单元 / 端到端测试
make install-panel      # 先编译，再装到 DSH profile
```

> **编译产物必须入库**：`panels/*/dist/` 与 `panels/*/client/client.js`
> 是给目标机直接复制用的（目标机不装 npm、不编译），**不要加进 `.gitignore`**。

---

## 2. 技能名 / 格式铁律（DSH 校验规则）

- 技能名（目录名 = SKILL.md 的 `name`）必须是 kebab-case：`^[a-z0-9]+(?:-[a-z0-9]+)*$`
  - 只允许小写字母、数字、连字符；禁中文 / 下划线 / 大写 / 空格。
- `SKILL.md` 首行必须是 `---`，frontmatter 至少含 `name` 和 `description`。
- 可选 frontmatter：`whenToUse`、`invocation`（`modelInvocable`/`userInvocable`，默认都 true）、`metadata`。
- 违反规则的目录会被 DSH 静默忽略（不报错但也不加载）。
- **技能目录必须平铺**：只允许 `skills/<name>/` 一层，
  套父目录（如 `skills/vendor/<name>/`）会导致**全部技能扫不到**。

### manifest.json（单插件清单，可选）支持字段

```json
{
  "name": "my-skill",
  "version": "0.1.0",
  "description": "一句话说明",
  "author": "你",
  "type": "skill",                 // "skill" | "runtime" | "both"
  "whenToUse": "...",
  "invocation": { "modelInvocable": true, "userInvocable": true },
  "keywords": [],
  "scripts": { "install": "...", "uninstall": "...", "build": "..." }
}
```

---

## 3. 迭代 / 升级一个已装技能

```bash
# 1) 改 skills/<name>/ 里的内容
# 2) 升 manifest.json 的 version（面板型再跑一次 make build 提交产物）
# 3) 重新安装（幂等，覆盖式）
make install NAME=<name>
# 4) 同步到 WorkBuddy 用户级
make sync-skill NAME=<name>
```

**技能型不需要安装脚本**：DSH 由 `dsh-skill-filesystem` 提供方直接扫描
`$SKILLS_DIR`，在 NAS 上 `git pull` 即生效。
只有**面板型**才需要 `make install-panel`（编译 + 装到 profile）。

---

## 4. 卸载

```bash
make uninstall NAME=<name>        # 技能：删 $DSH_HOME/skills/<name>
make uninstall-panel              # 面板：从 DSH profile 卸载并还原 package.json
```

---

## 5. 发布 / 分发（可选）

```bash
python3 scripts/gen-manifest.py "$(cygpath -w "$(pwd)")"   # 刷新各技能的 manifest
# 整仓清单 registry/manifest.json 由面板插件（dsh-plugin-repo-manager）扫描生成，
# 字段对齐 DSH 的 SkillSummary；可托管到静态服务器供远程商店 / 更新使用。
```

---

## 6. 高级：让 DSH 直接扫描本仓库（免复制）

在 DSH 的 skill-filesystem 配置里，把仓库的 `skills/` 加入 `customSkillDirs`，
即可让 `skills/` 下的技能被实时发现，省去安装复制。
`make install` 则保留给「分发 / 打包 / 版本记录」场景。

---

## 7. 常见坑

| 症状 | 原因 | 解决 |
|---|---|---|
| `make: command not found` | 开发机（Windows）没装 make | 直接跑 `python3 scripts/xxx.py` / `bash scripts/xxx.sh`，或到 NAS 上执行 |
| `bash: ./scripts/sync-to-dsh.sh: No such file` | 旧文档里的历史遗留引用 | 用 `make install-all` / `make sync-skill`，见 §0 命令表 |
| `mkdir: Permission denied` | 写 DSH 数据目录超出沙箱 | 以更宽权限运行（安装到系统路径） |
| 技能没出现在目录 | 目录名/SKILL.md 的 name 非 kebab-case | 改名对齐 |
| 技能目录被套了父目录 | 扫描器按 `skills/*/SKILL.md` 匹配 | 平铺到 `skills/<name>/` |
| 面板插件 GUI 没面板 | 面板走 extensions 机制，非复制生效 | 用 cordis_define/run 定义并运行 |
| Git Bash 下 python 报 `FileNotFoundError` | `python3` 是原生 Windows 程序，不认 `/c/...`、`/tmp/...` | 路径先过 `cygpath -w` |

---

## 8. 一页速查（常用命令）

```bash
make list                                    # 看仓库内插件
make check                                   # 校验（期望失败 0）
bash scripts/preflight.sh                    # 安装前自检
make install NAME=<name>                     # 装技能到 DSH
make install-all                             # 装全部技能
make install-panel                           # 编译并装面板到 DSH profile
make uninstall NAME=<name>                   # 卸技能
make sync-skill NAME=<name>                  # 同步到 WorkBuddy 用户级
make sync-skill ALL=1                        # 同步全部技能
make sync-skill-dry NAME=<name>              # 只看同步差异
python3 scripts/gen-manifest.py "$(cygpath -w "$(pwd)")"   # 刷新 manifest
make help                                    # 帮助
```
