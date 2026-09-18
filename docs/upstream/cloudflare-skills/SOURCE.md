# Cloudflare 官方技能（上游资产）

本目录存放第三方资产的上游许可证与说明，**不是技能本体**。
技能本体已按 DSH 加载约定平铺在仓库的 `skills/` 下。

## 来源

| 项 | 值 |
|---|---|
| 上游仓库 | https://github.com/cloudflare/skills |
| 许可证 | Apache-2.0（见同目录 `LICENSE`） |
| 收录版本 | `plugin.json` 的 `version: 1.0.0` |
| 收录日期 | 2026-09-17 |
| 收录方式 | 整目录复制，**未做任何改写** |

上游 LICENSE 与 README 原样保留在本目录，以满足 Apache-2.0 的署名与声明保留要求。

## 收录了哪些技能

共 14 个，平铺在 `skills/` 下（**不能套一层父目录**，否则 DSH 扫描不到）：

| 技能 | 作用 |
|---|---|
| `cloudflare` | 路由层：发现该用哪个 Cloudflare 产品，再导到对应技能/文档。含 52 个 `references/` 参考包 |
| `wrangler` | Wrangler CLI 命令与 Worker 项目配置 |
| `workers-best-practices` | 生产级 Workers 的编写/审查/配置 |
| `durable-objects` | 有状态协调：聊天室、游戏、预订；RPC、SQLite、alarms、WebSocket |
| `agents-sdk` | 有状态 AI agent：状态、调度、RPC、MCP server、邮件、流式对话 |
| `sandbox-next` | 沙箱 SDK 1.0 预览版（新项目推荐） |
| `sandbox-stable` | 沙箱 SDK 稳定版 |
| `sandbox-migrate-to-next` | 从稳定版迁到预览版 |
| `cloudflare-email-service` | 邮件发送、路由、投递配置排障 |
| `turnstile-spin` | Turnstile 人机验证：部署、修复、迁移，含服务端 Siteverify |
| `web-perf` | Core Web Vitals、渲染阻塞、网络链审计 |
| `cloudflare-one` | 零信任 / SASE 方案设计 |
| `cloudflare-one-migrations` | 从 Zscaler / Palo Alto / 传统 VPN 迁移的评估与规划 |
| `nextjs-on-cloudflare` | Next.js 跑 Workers（vinext） |

## 本项目做的改动

1. 新增 `manifest.json`（14 份），**SKILL.md 与 references/ 全部原样未动**。

   原因：本仓库的面板 `dsh-plugin-repo-manager` 需读 `manifest.json` 才能显示版本、才能走更新机制。
   `manifest.json` 在本仓库里是**可选**文件（缺失只警告不报错），所以这 14 份属于「补全元数据」，
   不是对上游内容的改写。

   `description` 字段是从各 `SKILL.md` 的 frontmatter **读取**得到，未手抄，避免与上游不一致。

2. **恢复 4 个脚本的可执行位**（2026-09-18 修正）。

   上游 `skills/turnstile-spin/scripts/{auth-probe,persist-skill,validate,widget-create}.sh`
   的 mode 是 **`100755`**，但本仓库这三份最初入库时是 `100644` ——
   因为是在 Windows 上复制进来的，**Windows 不保留可执行位**，静默丢了。

   已修正为 `100755`，与上游一致。**内容未动**，用 blob 哈希逐一比对确认与上游
   逐字节相同（`44265cf` / `73e2c66` / `5443faf` / `bde8ad6`）。

   为什么这个修正让「原样引入」更准确而非更偏离：丢可执行位本身就是**复制失真**，
   修回去是恢复上游原状。不改的后果是在 NAS/Linux 上 `./validate.sh` 直接
   Permission denied。

   > 该问题在仓库里静默存在了多轮，直到 2026-09-18 给 `validate_repo.py`
   > 补上 `check_exec_bits` 才被抓出（新检查第一次运行就报了这 4 个）。

## 已知限制

- **MCP 那半拿不到**。上游插件捆绑了远程 MCP 服务 `https://mcp.cloudflare.com/mcp`
  （streamable-http）。DSH 需在 `~/.workbuddy/mcp.json` 单独配置，且要在连接器管理页
  **手动点「信任」** 才生效。本次收录**不含** MCP 配置。
- **`rules/workers.mdc` 未收录**。那是 Cursor 专用的 Rules 格式，不是 Agent Skills 标准，DSH 不认。
- **一处跨技能链接**：`skills/cloudflare/SKILL.md` 第 29 行引用了
  `../nextjs-on-cloudflare/SKILL.md`。两个技能均已收录，链接有效；若将来只保留其中一个，该链接会断。
- 技能内部共 57 处 `references/...` 相对引用，已实测**零缺失**。

## 如何更新

上游会持续演进。更新时保持「原样覆盖」原则：

```bash
cd /vol1/1000/AI/DSHPlugin/.tmp
git clone --depth 1 https://github.com/cloudflare/skills.git cf-skills

# 覆盖 14 个技能目录（保留本仓库生成的 manifest.json）
for d in cf-skills/skills/*/; do
    n=$(basename "$d")
    rm -rf "../skills/$n"
    cp -r "$d" "../skills/$n"
done

# 重新生成 manifest.json（从新 SKILL.md 读取 description）
python3 scripts/gen-manifest.py "$(cygpath -w ..)"   # Linux 下去掉 cygpath

# 校验
python3 scripts/validate_repo.py
bash scripts/preflight.sh
```

> Linux / NAS 上不需要 `cygpath`，直接传路径即可。

## 与本仓库约定的兼容性实测

收录前已在真实环境验证（非推断）：

| 检查项 | 结果 |
|---|---|
| 14 个技能全部通过 `validate_repo.py` | ✅ 目录名 kebab-case、SKILL.md frontmatter 齐全、name 与目录一致 |
| 嵌套 `SKILL.md`（会被误扫成技能） | ✅ 恰好 14 个，全部是技能根，无嵌套 |
| `references/` 内 57 处相对引用 | ✅ 零缺失 |
| 体量 | 2.1 MB / 14 技能（`cloudflare` 单占 1.7 MB / 289 文件） |

**一个副作用已修**：凭据粗筛原先把上游文档里的**占位示例**判为明文凭据而报错
（如 `CLOUDFLARE_API_TOKEN="your_token_here"`、反面教材 `'your-turn-key-secret'`）。
已为 `validate_repo.py` 与 `preflight.sh` 加入占位词白名单 + 「值必须是单一 token」约束，
并做了双向回归测试（占位示例放行、真凭据仍被抓）。
