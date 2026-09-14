# 如何新增一个插件（step-by-step）

## A. 技能型插件（最常用，推荐）

```bash
cd /vol1/1000/AI/DSHPlugin

# 1. 复制模板
cp -r templates/skill-template plugins/<你的技能名>

# 2. 改 SKILL.md 的 name / description（name 必须与目录名一致，kebab-case）
#    并把正文改成你的技能说明。

# 3. 改 manifest.json 的 version / description / author。

# 4. （可选）往 scripts/ 加可执行脚本，往 references/ 加参考文档。

# 5. 安装到 DSH
./scripts/install-plugin.sh <你的技能名>

# 6. 验证
./scripts/list-plugins.sh
```

技能名规则：只能 `小写字母 + 数字 + 连字符`，如 `my-gold-quoter`。不能有中文、下划线、大写。

---

## B. 运行时 / 面板型插件

```bash
cd /vol1/1000/AI/DSHPlugin

# 1. 复制模板
cp -r templates/runtime-template plugins/<你的面板插件名>

# 2. 在 src/（host 半）和 client/（浏览器面板半）写 TS 代码，
#    删除 PLACEHOLDER.md。

# 3. 改 manifest.json（type: runtime，配好 scripts.build）。

# 4. 用 DSH 的 extensions 工具定义/运行这个动态包；client 半编译后
#    注册全局面板 slot 即出现在 Web GUI。

# 5. 安装（连同面板目录一起纳入仓库管理）
./scripts/install-plugin.sh <你的面板插件名>
```

> 双半包规范见 DSH 源码 `packages/extensions/` 与 `docs/subsystems/extensions.zh.md`。

---

## C. 混合型（技能 + 面板）

一个目录同时有 `SKILL.md`（描述用法）和 `src/`/`client/`（面板）。`manifest.json` 的 `type` 设为 `both`。`install-plugin.sh` 会把整个目录一并复制，技能与面板各自按机制生效。

---

## 校验清单（安装前自检）

- [ ] 目录名 = SKILL.md 的 `name`，且为 kebab-case
- [ ] SKILL.md 首行为 `---`，frontmatter 含 `name` 和 `description`
- [ ] manifest.json 的 `name` 与目录名一致
- [ ] scripts 里的脚本有可执行权限（`chmod +x`）
- [ ] 跑一遍 `./scripts/build-manifest.sh` 确认无告警