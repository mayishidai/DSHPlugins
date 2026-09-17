# skills/ — 技能型插件

放 **技能型** 能力：一个目录 = 一个技能，含 `SKILL.md`，DSH 的
`dsh-skill-filesystem` 提供方扫描发现，安装到 `$DSH_HOME/skills/<name>/`。

## 目录约定

```
skills/<name>/
├── SKILL.md          # 必需。frontmatter: name / description / whenToUse / invocation
├── manifest.json     # 建议保留：version / author / type: skill / keywords
├── scripts/          # 可选。可执行脚本（零第三方依赖，Python stdlib 优先）
├── references/       # 可选。长文档、接口清单等参考材料
└── templates/        # 可选。输出模板
```

## 命名与校验

- 目录名 = `SKILL.md` 的 `name` = `manifest.json` 的 `name`
- kebab-case：`^[a-z0-9]+(?:-[a-z0-9]+)*$`（不能有中文、大写、下划线）
- 自校验：

  ```bash
  python3 ~/.workbuddy/skills/dsh-plugin-repo-add/scripts/validate_plugin.py skills/<name> --repo .
  ```

## 当前收录

| 技能 | 说明 |
|---|---|
| [lucky-api](lucky-api/) | 调用自建 Lucky 实例的 HTTP API（零依赖客户端 + 273 接口清单） |
| [hello-plugin](hello-plugin/) | 示例技能：演示本仓库技能插件的标准结构 |

## 安装到 DSH

```bash
./scripts/install-plugin.sh <name>     # 单个；--force 覆盖旧版本
./scripts/sync-to-dsh.sh               # 批量：已装则更新、未装则安装
```

> NAS 侧仓库路径：`/vol1/1000/AI/DSHPlugin`，技能落点 `$DSH_HOME/skills/`。
> `dsh-plugin-repo-manager` 管理面板的扫描目录配置为
> `/vol1/1000/AI/DSHPlugin/skills`（见 `panels/dsh-plugin-repo-manager/cordis.patch.yml`）。
