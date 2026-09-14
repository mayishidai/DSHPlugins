# 插件开发与迭代手册（Runbook）

> 目的：让「新增/修改/安装/卸载/发布一个插件」成为可复制的流程，快速迭代。
> 适用：本仓库 `/vol1/1000/AI/DSHPlugin`，目标 DSH 数据根 `/vol2/@appdata/deepseek.harness/dsh-data`。

---

## 0. 环境速查

| 项 | 值 |
|---|---|
| 仓库根 | `/vol1/1000/AI/DSHPlugin` |
| DSH 数据根 `$DSH_HOME` | `/vol2/@appdata/deepseek.harness/dsh-data` |
| 技能安装目录 `$SKILLS_DIR` | `$DSH_HOME/skills/`（DSH 自动扫描，装进去即被发现） |
| 已装示例 | `jdgold`（原有）、`hello-plugin`（本仓库示例） |
| 依赖 | bash + python3；可选 jq（完整功能） |

脚本在 `scripts/`，均带 `set -euo pipefail`，公共函数与路径探测在 `scripts/lib.sh`。

---

## 1. 新增一个插件（标准流程）

### 技能型（最常用）

```bash
cd /vol1/1000/AI/DSHPlugin

# 1) 复制模板
cp -r templates/skill-template plugins/<技能名>

# 2) 编辑
#    - SKILL.md：改 name（须与目录名一致，kebab-case）、description、whenToUse、正文
#    - manifest.json：改 version / description / author

# 3) 校验（自检）
./scripts/build-manifest.sh          # 生成清单，看有无告警

# 4) 安装到 DSH
./scripts/install-plugin.sh <技能名>

# 5) 确认被 DSH 发现
./scripts/list-plugins.sh
#   （应显示 [已安装]；新技能随后出现在可用技能目录）
```

### 运行时 / 面板型

```bash
cp -r templates/runtime-template plugins/<面板插件名>
# 在 src/（host 半）和 client/（浏览器面板半）写代码，删 PLACEHOLDER.md
# manifest.json 的 type 设为 runtime / both
# 用 DSH extensions 工具（cordis_define / cordis_run）定义并运行动态包；
# client 半编译进 @deepseek-ai/dsh-client-* 面并注册全局面板 slot，即出现在 GUI。
./scripts/install-plugin.sh <面板插件名>     # 把源码/产物纳入仓库统一管理
```

---

## 2. 技能名 / 格式铁律（DSH 校验规则）

- 技能名（目录名 = SKILL.md 的 `name`）必须是 kebab-case：`^[a-z0-9]+(?:-[a-z0-9]+)*$`
  - 只允许小写字母、数字、连字符；禁中文 / 下划线 / 大写 / 空格。
- `SKILL.md` 首行必须是 `---`，frontmatter 至少含 `name` 和 `description`。
- 可选 frontmatter：`whenToUse`、`invocation`（`modelInvocable`/`userInvocable`，默认都 true）、`metadata`。
- 违反规则的目录会被 DSH 静默忽略（不报错但也不加载）。

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

## 3. 迭代 / 升级一个已装插件

```bash
# 改 plugins/<name> 里的内容 + 升 manifest.json 的 version

# 覆盖式安装（旧 version.json 自动存为 previous_version）
./scripts/install-plugin.sh <name> --force

# 或一键同步全部（已装更新、未装安装）
./scripts/sync-to-dsh.sh

# 清理 DSH 中已不在仓库的孤儿插件（谨慎）
./scripts/sync-to-dsh.sh --prune
```

---

## 4. 卸载

```bash
./scripts/uninstall-plugin.sh <name>     # 只删 $SKILLS_DIR/<name>
```

---

## 5. 发布 / 分发（可选）

```bash
./scripts/build-manifest.sh
# 生成 registry/manifest.json（字段对齐 DSH 的 SkillSummary）
# 可托管到静态服务器，供远程商店 / 自动更新使用。
```

---

## 6. 高级：让 DSH 直接扫描本仓库（免复制）

在 DSH 的 skill-filesystem 配置里，把仓库的 `plugins/` 加入 `customSkillDirs`，
即可让 `plugins/` 下的技能被实时发现，省去安装复制。
`install-plugin.sh` 则保留给「分发 / 打包 / 版本记录」场景。

---

## 7. 常见坑

| 症状 | 原因 | 解决 |
|---|---|---|
| `install-plugin.sh: $2: unbound variable` | `set -u` + 未加参数保护 | 已修复：用 `${2:-}` |
| `sync-to-dsh.sh: REPO_ROOT: unbound` | 忘了 source lib.sh | 已修复：脚本头部 source lib.sh |
| `mkdir: Permission denied` | 写 DSH 数据目录超出沙箱 | 以更宽权限运行（安装到系统路径） |
| 技能没出现在目录 | 目录名/SKILL.md 的 name 非 kebab-case | 改名对齐 |
| 面板插件 GUI 没面板 | 面板走 extensions 机制，非复制生效 | 用 cordis_define/run 定义并运行 |

---

## 8. 一页速查（常用命令）

```bash
./scripts/list-plugins.sh                    # 看仓库内 + 已安装
./scripts/install-plugin.sh <name> [--force] # 安装 / 覆盖更新
./scripts/uninstall-plugin.sh <name>         # 卸载
./scripts/sync-to-dsh.sh [--prune]           # 一键同步
./scripts/build-manifest.sh                  # 生成清单
make help                                    # Makefile 别名帮助
```