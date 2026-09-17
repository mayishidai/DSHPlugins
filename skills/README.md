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
- **必须平铺**：`skills/<name>/` 只允许一层。套了父目录（如 `skills/vendor/<name>/`）
  DSH 就扫不到 —— 扫描器按 `skills/*/SKILL.md` 匹配。
- 自校验（两套，均只读）：

  ```bash
  cd /vol1/1000/AI/DSHPlugin
  python3 scripts/validate_repo.py
  bash scripts/preflight.sh
  ```

## 当前收录

| 技能 | 说明 |
|---|---|
| [lucky-api](lucky-api/) | 调用自建 Lucky 实例的 HTTP API（零依赖客户端 + 273 接口清单） |
| [hello-plugin](hello-plugin/) | 示例技能：演示本仓库技能插件的标准结构 |
| [cloudflare](cloudflare/)、[wrangler](wrangler/)、[workers-best-practices](workers-best-practices/)、[durable-objects](durable-objects/)、[agents-sdk](agents-sdk/)、[sandbox-next](sandbox-next/)、[sandbox-stable](sandbox-stable/)、[sandbox-migrate-to-next](sandbox-migrate-to-next/)、[cloudflare-email-service](cloudflare-email-service/)、[turnstile-spin](turnstile-spin/)、[web-perf](web-perf/)、[cloudflare-one](cloudflare-one/)、[cloudflare-one-migrations](cloudflare-one-migrations/)、[nextjs-on-cloudflare](nextjs-on-cloudflare/) | **Cloudflare 官方技能 ×14**，来自 [cloudflare/skills](https://github.com/cloudflare/skills)，Apache-2.0。原样引入，溯源见 [`docs/upstream/cloudflare-skills/`](../docs/upstream/cloudflare-skills/) |

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

从上游整目录引入时：

```bash
# 1. 复制（保持原生目录名，平铺）
cp -r <上游>/skills/<name> skills/<name>

# 2. 从 SKILL.md 生成 manifest.json（不要手抄 description）
python3 scripts/gen-manifest.py "$(cygpath -w "$(pwd)")" <name>
# Linux / NAS 上直接：python3 scripts/gen-manifest.py . <name>

# 3. 保留上游 LICENSE 与溯源信息
#    放到 docs/upstream/<来源>/{LICENSE,README.md,SOURCE.md}

# 4. 校验
python3 scripts/validate_repo.py && bash scripts/preflight.sh
```

参考实现：[`docs/upstream/cloudflare-skills/SOURCE.md`](../docs/upstream/cloudflare-skills/SOURCE.md)
