# 常见问题（FAQ）

## Q1: 装好的技能，DSH 会话里怎么用？
装进 `$DSH_HOME/skills/` 后，DSH 的 skill 提供方会自动发现。会话中模型会通过 `skill` 工具看到它；也可用用户命令面触发（取决于 SKILL.md 的 `invocation`）。若没立刻出现，可触发一次目录刷新或重启 DSH。

## Q2: `install-plugin.sh` 提示「目标已存在」怎么办？
说明已经装过。用 `./scripts/install-plugin.sh <name> --force` 覆盖更新（旧版本会存进 `previous_version`）。

## Q3: 我的插件名带中文或大写，装不上？
DSH 只接受 kebab-case 技能名：`^[a-z0-9]+(?:-[a-z0-9]+)*$`。请改名，例如 `黄金助手` → `gold-assistant`。

## Q4: 面板插件装了，但 GUI 没看到面板？
面板插件走 extensions 机制，不是靠复制进 `skills/` 就生效。你需要在 DSH 会话里用 extensions 工具（`cordis_define`/`cordis_run`）把动态包定义并运行起来；client 半要编译进 client 面并注册全局面板 slot。`install-plugin.sh` 只负责把源码/产物纳入仓库统一管理。

## Q5: 卸载会不会误删别的？
`uninstall-plugin.sh <name>` 只删 `$DSH_HOME/skills/<name>/`，不影响其它插件。`sync-to-dsh.sh --prune` 才会删「仓库里已不存在的孤儿插件」，请谨慎使用。

## Q6: `registry/manifest.json` 有什么用？
它汇总整仓插件目录，可托管到静态服务器，供远程商店/自动更新使用。用 `./scripts/build-manifest.sh` 随时重新生成。

## Q7: 我不想装到 `$DSH_HOME/skills/`，想用项目级 `.dsh/skills/`？
把 `scripts/lib.sh` 里的 `SKILLS_DIR` 改成你的目标目录即可；或用 `customSkillDirs` 配置指向仓库的 `skills/` 目录直接扫描。

## Q8: 需要 jq 吗？
`install-plugin.sh`/`list-plugins.sh` 在无 `jq` 时会降级（版本显示 `?`、自定义安装脚本不执行），但基本功能不依赖 jq。建议 `apt install jq` 以获得完整功能。

## Q9: 如何让 DSH 直接扫描本仓库而不用每次安装？
在 DSH 的 skill-filesystem 配置里，把本仓库的 `skills/` 加进 `customSkillDirs`。这样 `skills/` 下的技能会被实时发现，无需复制。安装脚本则用于「分发/打包」场景。