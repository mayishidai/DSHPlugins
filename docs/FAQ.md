# 常见问题（FAQ）

## Q0: 安装会不会修改 DSH 的源码？
**不会。** 安装只写 DSH 的 **profile 目录**（`dsh-data/profiles/<profile>/`，属用户数据区）：

- 复制编译产物到 `profile/node_modules/<包名>/`（**必须是这个路径**，见下）
- 更新 profile 的 `package.json`（`dependencies` + `dsh.profile.bundles`）
- 备份原 `package.json`

`dsh-runtime/` 下的任何文件都不会被改动。

> **⚠️ 落点必须与包名严格对应：`node_modules/<package.json 的 name>`。**
> 不能放到 `node_modules/@deepseek-ai/<name>/` 而名字却是不带作用域的 —— 那样
> Node 解析不到包，DSH 启动时报
> `invalid plugin, expect function or object with an "apply" method, received undefined`
> （**这个报错不代表代码有问题，而是模块压根没被解析出来**）。
> 必须一致的四处：`package.json` 的 `name`、`cordis.patch.yml` 的 `name`、
> `dependencies` 的 key、物理目录。`validate_repo.py` 会校验前两者与落点。
>
> 另外：DSH 重启可能清空 profile 的 `node_modules`（或让 `npm install` 建出的链接失效），
> 此时**重跑一次安装脚本**即可恢复（幂等）。

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

## Q4b: 启动报 `invalid plugin, expect function or object with an "apply" method, received undefined`？

**先别怀疑代码。** 这句话的意思是「加载器拿到的值是 `undefined`」，而它**至少对应五种
根因，报错文本一字不差**：

① 包没落成 `node_modules/<包名>` ② 落点被换成解析不通的软链（自指 / 目标已删）
③ 已装副本太旧 ④ 入口只有具名导出、没有默认导出 ⑤ profile 没登记

**光看报错无法区分**（解析失败与导出缺失的文本完全一样），所以别猜 —— 先把判据量出来：

```bash
make doctor-panel     # 等价于 bash scripts/install-to-profile.sh --check，只读，不写任何文件
```

它逐条给出 `[OK]`/`[FAIL]`，每条 `[FAIL]` 后面都跟了对应修法。下面是人读版：

1. **落点与包名不一致**（最常见）。包必须落在 `profile/node_modules/<package.json 的 name>`。
   若装进 `node_modules/@deepseek-ai/<name>/` 而配置里写的是不带作用域的名字，Node 就找不到它。
   ⚠️ 判据是「父目录**正好是** `node_modules`」—— 只比路径末段会漏报。
   修法：`bash scripts/install-to-profile.sh`（会顺带清理历史错误落点）。

2. **落点是软链接且解析不通**（自指 / 目标不存在）。软链**本身**不一定错（npm 的健康
   `file:` 链接就是软链），错的是解析不到真目录 —— 那种情况下 Node 抛 ELOOP/ENOENT，
   而 DSH 把这类失败一律报成 `received undefined`。
   成因见下方 ⚠️ **不要跑 `npm install`**。

3. **已装副本太旧**。`git pull` 只更新了仓库目录，DSH 读的是 profile 里那份**独立副本**
   （复制过去的，不是软链）—— 症状是「改了没效果」。
   修法：`bash scripts/update-and-install.sh`（= `git pull` + 重装）。

4. **入口没导出 `apply`**。`grep -n "^export" panels/dsh-plugin-repo-manager/dist/index.js`
   应当能看到 `export async function apply` 与 `export default { name, apply }`。
   本插件**同时提供具名导出与默认导出** —— 不同加载器实现有的取 `mod.apply`、
   有的取 `mod.default`；只提供一种时，走另一条分支的加载器就拿到 `undefined`。

5. **profile 没登记**。`package.json` 的 `dependencies` 与 `dsh.profile.bundles` 都得有包名。
   重跑安装脚本即可补齐。

> 判据：**只要报的是 "received undefined"，优先查「有没有解析到这个包」，
> 而不是「包里的 apply 对不对」。** 解析失败与导出缺失的症状完全一样。

> ⚠️ **不要在这个 profile 里跑 `npm install`。** profile 的 `dependencies` 里写的是
> `"<包名>": "file:./node_modules/<包名>"` —— 指向它自己。npm 会把 `file:./node_modules/X`
> 规范化成 `file:X` 再按 profile 根解析，于是必然失败（实测 `ENOENT`），中途还可能把
> `node_modules/<包名>` 换成自指软链。**真目录是安装脚本直接铺好的，本来就不需要 npm 参与。**
> 该 profile 的依赖管理请走 `install-to-profile.sh` / `uninstall-from-profile.sh`。

## Q5: 卸载会不会误删别的？
`make uninstall NAME=<name>` 只删 `$DSH_HOME/skills/<name>/`，不影响其它插件。
面板走 `make uninstall-panel`，它只动 profile 的 `package.json` 与 `node_modules`，并可完整还原。

注意：**在仓库里删掉一个技能，不会自动从 DSH 里清掉它**。二选一：

- **面板**（推荐）：打开左侧栏「插件仓库」入口（位置在 **New Session 按钮正下方**；
  1.2.x 及以前在「设置 → 插件」，v1.3.0 起已迁走）。列表里带「仓库中已不存在」
  副标题的那一条，点「卸载」即可（也可勾选后批量卸载）。
  **只删 `$DSH_HOME/skills/<name>`，仓库不受影响。**
- **命令行**：`make uninstall NAME=<name>`。

否则那份副本会一直留在 `$DSH_HOME/skills/` 里 —— 而且**技能照样生效**，
因为 DSH 扫的就是那个目录。（面板在 2026-09-23 之前**看不到**这类技能，
列表只列仓库里有的，所以那时只能上机器手删。）

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