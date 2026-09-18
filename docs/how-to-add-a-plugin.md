# 如何新增一个插件（step-by-step）

先选**类型目录**——本仓库按类型分层，不要混放：

| 你要加的东西 | 放这里 |
|---|---|
| 指令型能力（有 `SKILL.md`） | `skills/<name>/` |
| 智能体 / 专家角色 | `agents/<name>/` |
| MCP 服务配置（不含凭据） | `mcps/<name>/` |
| 带 UI 的运行时扩展 | `panels/<name>/` |

## A. 技能型插件（最常用，推荐）

技能型**不需要模板**，手写一个 `SKILL.md` 即可（`manifest.json` 可选，建议补上以便面板显示版本）。

```bash
cd /vol1/1000/AI/DSHPlugin

# 1. 建目录（名字必须 kebab-case，且与 SKILL.md 的 name 一致）
mkdir -p skills/<你的技能名>

# 2. 写 skills/<你的技能名>/SKILL.md
#    首行 --- ，frontmatter 至少含 name 和 description。

# 3. 写 skills/<你的技能名>/manifest.json（可选，从 SKILL.md 读取，勿手抄）
#    —— 可复制 skills/hello-plugin/manifest.json 改字段。

# 4. （可选）scripts/ 放可执行脚本，references/ 放参考文档。

# 5. 校验（只读，不会改动仓库）
bash scripts/preflight.sh
python3 scripts/validate_repo.py

# 6. 提交
git add skills/<你的技能名> && git commit -m "新增技能 <你的技能名>"
```

技能名规则：只能 `小写字母 + 数字 + 连字符`，如 `my-gold-quoter`。不能有中文、下划线、大写。

> 安装：技能型**不需要 install 脚本**。DSH 的 `dsh-skill-filesystem` 直接扫描
> `skills/` 目录，`git pull` 之后新技能即被发现。只有**面板型**才需要跑安装脚本
> （见下方 B 节与 `Makefile` 的 `install-panel`）。

### 收录外部技能时

若从上游仓库整目录引入（如 `cloudflare/skills`），**必须平铺在 `skills/` 下**，
不能套一层父目录 —— 套了就扫描不到。同时：

1. **先做安全审计**（第三方代码必做，包括个人仓库）。按 `skills安全审计` 的 11 步过一遍：
   危险关键词 / 隐蔽执行 / 敏感路径 / 网络请求 / 文件操作 / 权限提升 / 依赖安装 /
   元数据 / 行为一致性，定级 P0 / P1 / P2。
   - **P0** → 停止，报告用户，不得收录
   - **P1** → 报告用户，需明确确认后才收录
   - **P2** → 直接收录，审计结论写进 `SOURCE.md`
2. 目录名取 `SKILL.md` 的 `name`，**不一定是上游目录名**（例：上游目录叫
   `cloudflare-tunnel-skill`，但 `name` 是 `cloudflare-tunnel`，本仓库取后者）。
3. 保留上游 LICENSE，放到 `docs/upstream/<来源>/`（连同上游 README）。
4. **登记上游**——在 `scripts/gen-manifest.py` 里补两处，否则会套用错许可证：

   ```python
   PROVENANCE["<上游标识>"] = {"author": ..., "source": ..., "license": ..., "version": ...}
   SKILL_PROVENANCE["<技能名>"] = "<上游标识>"
   ```

   然后 `python3 scripts/gen-manifest.py <仓库根> <技能名> --provenance <上游标识>`。
   查已登记来源：`python3 scripts/gen-manifest.py <仓库根> --list`。
5. 上游文档里若写了**别的宿主的安装路径**（`~/.claude/skills/`、`~/.codex/skills/` 等），
   必须改写成目标中立写法（`SKILL_DIR` 二选一），否则照抄必然路径不存在。
   **把这个改动逐条记进 `SOURCE.md`**，将来对比上游才知道哪些是本地改动。
6. 在 `docs/upstream/<来源>/SOURCE.md` 记录来源、commit、版本、收录日期、改动清单、
   审计结论、前置依赖与已知限制。

**若上游是 zip 分发包**（不是 git 仓库，如 `jdgold`），前置步骤改为：

```bash
curl -fsSL -o temp/<name>.zip <URL>
unzip -t temp/<name>.zip                         # 先验完整性，再解压
unzip -q temp/<name>.zip -d temp/<name>-extract
# 逐个确认：无路径穿越条目（不以 / 开头、不含 ../）、无符号链接、无隐藏文件
```

分发包会带来两个 git 仓库没有的问题，需单独处理：

- **包内置默认凭据**：先判断它是不是**官方随包分发的公开标识**（所有用户拿到的是同一个值）。
  若同时满足三条——①官方随包分发 ②代码里有环境变量覆盖机制 ③已在 SOURCE.md 记录——
  则走**精确值豁免**：在 `scripts/validate_repo.py` 的 `KNOWN_PUBLIC_KEYS` 与
  `scripts/preflight.sh` 的 `KNOWN_PUBLIC_KEYS_RE` **两处同步加**。
  **只精确匹配完整值，不要放宽成前缀或正则**，否则豁免面会扩大到"名字像默认值就放过"。
  紧接着跑 `scripts/tests/test_cred_parity.py` 确认两套实现判定仍然一致。
- **自升级 / 自动执行入口**：确认它是"只读比对"还是"自动拉取并替换自己"。
  前者可原样保留并写进 SOURCE.md；后者**必须先报告用户**再决定是否收录。

参考实现（三个不同上游，许可证与改动程度都不同）：
- `docs/upstream/cloudflare-skills/SOURCE.md` —— Apache-2.0，整目录原样引入
- `docs/upstream/cloudflare-tunnel-skill/SOURCE.md` —— MIT，一处路径改写 + 完整审计结论
- `docs/upstream/jdgold/SOURCE.md` —— zip 分发包，无附许可证，含凭据豁免说明

---

## B. 运行时 / 面板型插件

```bash
cd /vol1/1000/AI/DSHPlugin

# 1. 建目录
mkdir -p panels/<你的面板插件名>

# 2. 在 src/（host 半）与 src/client/（浏览器面板半）写 TS 代码。
#    客户端 bundle 由 generate-client.mjs 生成，不走 tsc。

# 3. 配 tsconfig.build.json（只编译 src/index.ts → dist/）。

# 4. 编译产物必须入库（目标机无 Node 工具链）：
cd panels/<你的面板插件名>
npm install            # 仅本机需要，node_modules 不入库
npm run build          # 产出 dist/index.js + client/client.js

# 5. 写 cordis.patch.yml（Cordis 挂载配置）与 manifest.json。
#    注意：cordis.patch.yml 里若写 ~ 路径，运行时会显式展开 homedir()
#    （见 src/index.ts 的 expandHome），但优先写绝对路径。

# 6. 校验 + 安装
cd /vol1/1000/AI/DSHPlugin
bash scripts/preflight.sh          # 会检查编译产物是否齐备
make install-panel                  # 装到 DSH profile（不碰 DSH 源码）
```

> 双半包规范见 DSH 源码 `packages/extensions/` 与 `docs/subsystems/extensions.zh.md`。
> 安装脚本会**排除** `src/`、`scripts/`、`node_modules/`、`tsconfig*`，只复制产物。

---

## C. 混合型（技能 + 面板）

一个目录同时有 `SKILL.md`（描述用法）和 `src/`/`client/`（面板）。`manifest.json` 的 `type` 设为 `both`，放在 `panels/` 下。

装到 profile 时，安装脚本按 `packages/*` 白名单复制产物；`SKILL.md` 会自动带上，技能与面板各自按机制生效。

---

## 校验清单（提交 / 安装前自检）

- [ ] 放在**正确的类型目录**下（skills / agents / mcps / panels），没有混放
- [ ] 目录名 = SKILL.md 的 `name`，且为 kebab-case（**外部技能必须平铺，不能套父目录**）
- [ ] SKILL.md 首行为 `---`，frontmatter 含 `name` 和 `description`
- [ ] 清单一致：manifest.json 的 `name` 与目录名一致（有 manifest 时）
- [ ] scripts 里的脚本有可执行权限（`git add --chmod=+x`）
      —— 已在 `validate_repo.py` 的 `check_exec_bits` 里**自动校验**（查 git 索引，
      因为本仓库 `core.filemode=false`，Windows 工作区的权限位不可靠）。
      ⚠️ 从 zip 解压或从 Windows 复制**会丢可执行位**，必须显式补：
      `git add --chmod=+x <文件>`
- [ ] 面板型：`dist/index.js` 与 `client/client.js` **已入库**，`main` 指向 `dist/index.js`
- [ ] 面板型：`cordis.patch.yml` 存在；`package.json` 的 `files` 含 `dist`
- [ ] 跑三套校验（均只读）：

  ```bash
  cd /vol1/1000/AI/DSHPlugin
  bash scripts/preflight.sh                    # 安装前自检
  python3 scripts/validate_repo.py             # 结构 / 契约校验
  python3 scripts/tests/test_cred_parity.py    # 凭据粗筛一致性守卫
  ```

  或一条命令跑全套：`make verify`
- [ ] 根 `README.md` 的内容清单已登记该插件
- [ ] 若新增技能，确认 `panels/dsh-plugin-repo-manager/cordis.patch.yml`
      的 `repoDir` 指向**包含它的目录**（默认 `skills/`）
- [ ] 引入外部技能：**安全审计已做并定级**（P0 一票否决）
- [ ] 引入外部技能：上游 LICENSE 已放 `docs/upstream/<来源>/`，且写了 `SOURCE.md`
- [ ] 引入外部技能：新上游已在 `gen-manifest.py` 的 `PROVENANCE` + `SKILL_PROVENANCE`
      两处登记（漏登记会套用错许可证）
- [ ] 引入外部技能：上游文档里的**异宿主路径**（`~/.claude/skills/` 等）已改写为
      `SKILL_DIR` 目标中立写法，且该改动已记入 `SOURCE.md`
- [ ] 引入 zip 分发包：解压前 `unzip -t` 验过完整性，且确认无路径穿越 / 符号链接条目
- [ ] 引入 zip 分发包：**可执行位已补齐**。zip 里 `scripts/` 的权限常是**混合的**
      （实测 jdgold：20 个 `.py` 里只有 2 个是 755，其余 644 —— 属打包机残留，非设计），
      而本仓库规则要求 `scripts/` 一律 755。收录时显式 `git add --chmod=+x`，
      并在 `SOURCE.md` 里把这处改动**枚举出来**（只改 mode、内容未动）。
- [ ] 引入 zip 分发包：包内置默认凭据若走豁免，`KNOWN_PUBLIC_KEYS`（Python）与
      `KNOWN_PUBLIC_KEYS_RE`（Bash）**两处已同步**，且一致性测试仍通过
- [ ] **动过凭据判据的话**：`make verify` 三套全绿（两套实现判定必须一致，
      否则其中一套失去信号价值）