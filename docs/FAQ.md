# 常见问题（FAQ）

## Q0: 安装会不会修改 DSH 的源码？
**不会。** 安装只写 DSH 的 **profile 目录**（`dsh-data/profiles/<profile>/`，属用户数据区）：

- 复制编译产物到 `profile/node_modules/@deepseek-ai/<name>/`
- 更新 profile 的 `package.json`（`dependencies` + `dsh.profile.bundles`）
- 备份原 `package.json`

`dsh-runtime/` 下的任何文件都不会被改动。

> 历史遗留：早期脚本曾用 `sed -i` 改写 `dsh-api-remotes` 里的 lib 文件，那会污染 DSH 安装。
> 现已移除，`scripts/install-plugin-repo.sh` 也废弃了（执行即退出并提示新方式）。
> `bash scripts/preflight.sh` 会自动扫描脚本里是否还有这类操作。

## Q0b: 我需要编译吗？目标机要装 npm 吗？
**都不需要。** 编译产物（`panels/*/dist/index.js` 与 `panels/*/client/client.js`）
**已提交进 git**。目标机上只要：

```bash
git pull
bash scripts/install-to-profile.sh
```

即可。npm 与 TypeScript 只在开发机上用来重新编译。

改完源码后请在开发机执行 `npm run build`，并把产物一起提交——别忘了这一步，
否则目标机装到的是旧产物。`bash scripts/preflight.sh` 会检查产物是否存在与合法。

## Q1: 装好的技能，DSH 会话里怎么用？
装进 `$DSH_HOME/skills/` 后，DSH 的 skill 提供方会自动发现。会话中模型会通过 `skill` 工具看到它；也可用用户命令面触发（取决于 SKILL.md 的 `invocation`）。若没立刻出现，可触发一次目录刷新或重启 DSH。

## Q2: 重复安装同一个技能会不会出问题？
不会。`make install NAME=<name>` 是**幂等**的：先把目标目录整个删掉再复制，
所以没有「目标已存在」这类报错，重复跑就是覆盖更新。

面板插件的「更新」更完整：更新前会把整个已装目录备份为 `<name>.bak-<ISO时间戳>`，并在 `version.json` 记录 `previousVersion` / `updatedAt` / `backupDir`，同时清空旧目录以防上游已删除的文件残留。详见 `docs/architecture.md` §4。

## Q2b: 面板里显示「可更新」，但我确定版本一样，为什么？
理论上不会——`isNewer()` 在任一版本号缺失或**无法解析**（含非数字段，如 `abc`）时一律返回 `false`，宁可不提示也不误报。

若确实出现，检查两处版本号：
- 仓库侧：`manifest.json`（优先）或 `package.json` 的 `version`
- 已装侧：`skillsDir/<name>/version.json` 的 `version`

两者都必须是规范语义化版本（`1.2.3`）。改动 `isNewer` 后请跑 `panels/dsh-plugin-repo-manager/scripts/test-isnewer.mjs`（23 例）回归。

## Q2c: 更新失败或想回滚怎么办？
更新前已整目录留档在当前目录旁：`<skillsDir>/<name>.bak-<ISO时间戳>/`。回滚即删除现目录、把 `.bak-*` 改回原名。备份不会自动清理，确认无误后可手动删除。

## Q3: 我的插件名带中文或大写，装不上？
DSH 只接受 kebab-case 技能名：`^[a-z0-9]+(?:-[a-z0-9]+)*$`。请改名，例如 `黄金助手` → `gold-assistant`。

## Q4: 面板插件装了，但 GUI 没看到面板？
面板插件走 extensions 机制，不是靠复制进 `skills/` 就生效。你需要在 DSH 会话里用 extensions 工具（`cordis_define`/`cordis_run`）把动态包定义并运行起来；client 半要编译进 client 面并注册全局面板 slot。`make install-panel` 只负责编译并把产物装到 DSH profile。

## Q5: 卸载会不会误删别的？
`make uninstall NAME=<name>` 只删 `$DSH_HOME/skills/<name>/`，不影响其它插件。
面板走 `make uninstall-panel`，它只动 profile 的 `package.json` 与 `node_modules`，并可完整还原。

注意：**在仓库里删掉一个技能，不会自动从 DSH 里清掉它**——需要手工跑一次
`make uninstall NAME=<name>`，否则那份副本会一直留在 `$DSH_HOME/skills/` 里。

## Q6: `registry/manifest.json` 有什么用？
它汇总整仓插件目录，可托管到静态服务器，供远程商店/自动更新使用。
由面板插件（`dsh-plugin-repo-manager`）扫描生成；单个技能的 manifest 用
`python3 scripts/gen-manifest.py "$(cygpath -w "$(pwd)")"` 刷新。

## Q7: 我不想装到 `$DSH_HOME/skills/`，想用项目级 `.dsh/skills/`？
`make install` 的目标目录由 `DSH_HOME` 变量决定，覆盖它即可：

```bash
make install NAME=<name> DSH_HOME=/你的/目标/根
```

或改用 `customSkillDirs` 配置指向仓库的 `skills/` 目录直接扫描。

## Q8: 需要 jq 吗？
不需要。本仓库的辅助脚本都是 **Python 3（只用 stdlib）**，不依赖 `jq`
也不需要 `pip install`。只要机器上有 `python3` 即可。

## Q9: 如何让 DSH 直接扫描本仓库而不用每次安装？
在 DSH 的 skill-filesystem 配置里，把本仓库的 `skills/` 加进 `customSkillDirs`。这样 `skills/` 下的技能会被实时发现，无需复制。安装脚本则用于「分发/打包」场景。