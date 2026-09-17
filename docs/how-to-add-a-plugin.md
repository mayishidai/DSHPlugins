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

- 保留上游 LICENSE，放到 `docs/upstream/<来源>/`
- 用 `python3 scripts/gen-manifest.py <仓库根> <技能名...>` 批量生成 `manifest.json`
- 在 `docs/upstream/<来源>/SOURCE.md` 记录来源、版本、收录日期与已知限制
- 参考实现：`docs/upstream/cloudflare-skills/SOURCE.md`

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
- [ ] 面板型：`dist/index.js` 与 `client/client.js` **已入库**，`main` 指向 `dist/index.js`
- [ ] 面板型：`cordis.patch.yml` 存在；`package.json` 的 `files` 含 `dist`
- [ ] 跑两套校验（均只读）：

  ```bash
  cd /vol1/1000/AI/DSHPlugin
  bash scripts/preflight.sh          # 安装前自检
  python3 scripts/validate_repo.py   # 结构 / 契约校验
  ```
- [ ] 根 `README.md` 的内容清单已登记该插件
- [ ] 若新增技能，确认 `panels/dsh-plugin-repo-manager/cordis.patch.yml`
      的 `repoDir` 指向**包含它的目录**（默认 `skills/`）
- [ ] 引入外部技能：上游 LICENSE 已放 `docs/upstream/<来源>/`，且写了 `SOURCE.md`