# DSH 插件仓库管理插件

## 概述

一个**可插拔的 DSH 面板插件**（Cordis 双半包：服务端 half + 浏览器 half）。
已随仓库提供**编译好的产物**，目标机（NAS）不需要 npm、不需要编译，安装 = 纯复制。

## 目录结构

```
DSHPlugins/
├── skills/                                  # 技能型插件（DSH 直接扫）
├── panels/
│   └── dsh-plugin-repo-manager/
│       ├── src/
│       │   ├── index.ts                     # Host（服务端）入口
│       │   ├── client/
│       │   │   ├── index.tsx                # Client 注册（含 JSX，必须是 .tsx）
│       │   │   ├── PluginRepoPanel.tsx      # React 组件
│       │   │   └── locales.ts               # 国际化
│       │   └── types/host.d.ts              # DSH 宿主类型桩
│       ├── dist/index.js                    # ✅ 编译产物，已入库
│       ├── client/client.js                 # ✅ 客户端 bundle，已入库
│       ├── scripts/
│       │   ├── install.sh                   # 转发桩 → 仓库根的同名脚本
│       │   ├── test-isnewer.mjs             # 版本比较 23 例
│       │   ├── test-install-update.mjs      # 安装/更新流程 24 例
│       │   └── test-paths.mjs               # 路径处理 14 例
│       ├── generate-client.mjs              # 生成 client/client.js
│       ├── cordis.patch.yml                 # Cordis 加载器配置
│       ├── manifest.json                    # 仓库侧清单（entry.server/client/patch）
│       ├── package.json
│       ├── tsconfig.json / tsconfig.build.json
│       └── README.md / SKILL.md / INSTALL.md
└── scripts/                                 # 仓库级脚本（安装/校验/同步）
```

## 安装步骤

### 0. 一条命令：拉取 + 安装（推荐日常更新用）

```bash
cd /vol1/1000/AI/DSHPlugin
bash scripts/update-and-install.sh
```

它只做两件事：**在已有仓库里 `git pull`** → **转发到 `scripts/install-to-profile.sh`**。

> ⚠️ 为什么不能只 `git pull`：DSH 读的是 profile 里**复制过去的独立副本**（不是软链接），
> 所以 `git pull` 只更新「源」，已装的那份**纹丝不动** —— 看起来就是「改了没效果」。
> 而只重装不拉取，装的还是旧的。两步都得做。

常用变体：

| 命令 | 作用 |
|---|---|
| `bash scripts/update-and-install.sh` | 拉取 + 重装面板（默认） |
| `bash scripts/update-and-install.sh --skills` | 顺便重装 `skills/` 下全部技能 |
| `bash scripts/update-and-install.sh --no-pull` | 只重装，不拉取（本地已改好时用） |
| `bash scripts/update-and-install.sh --list-profiles` | 只列出 profile 候选（排查「装到哪去了」） |
| `bash scripts/install-to-profile.sh --check` | **只读诊断**：装完能不能被 DSH 加载（等价 `make doctor-panel`） |
| `make update-panel` / `make list-profiles` / `make doctor-panel` | 等价的 make 目标 |

> 工作区**有未提交改动时会拒绝拉取并以 3 退出**（不静默 stash/覆盖），
> 避免把你的本地修改冲掉。此时请先 commit/stash，或加 `--no-pull`。
> 脚本内部用 `SCRIPT_DIR`/`REPO_ROOT` 相对定位自身，**仓库放任何目录都能跑**。

装完仍需**重启 DSH** 才生效。

### 1. 装到 DSH profile

**只用这一个脚本**（在目标机、仓库根执行）：

```bash
cd <仓库目录>
bash scripts/install-to-profile.sh
```

它做三件事：把 `dist/` + `client/` + 配置复制到 `profile/node_modules/<包名>/`、
用 python3 JSON 库注册 profile `package.json`（`dependencies` + `dsh.profile.bundles`）、
备份原 `package.json`。**幂等**，可重复执行；并会清理历史错误落点。

> ⚠️ 不要用 `panels/dsh-plugin-repo-manager/scripts/install.sh` ——
> 它已改为**转发桩**，本身不实现安装逻辑（原因见下「为什么只有一个安装脚本」）。

**profile 目录自动查找**，一般不传参数即可。找错了或找不到时：

```bash
bash scripts/lib/resolve-profile.sh --list                       # 只读：看候选与检查结果
PROFILE_DIR=<数据根>/profiles/web bash scripts/install-to-profile.sh   # 显式指定（最准）
DSH_HOME=<数据根>                 bash scripts/install-to-profile.sh   # 只给数据根
DSH_PROFILE=web DSH_HOME=<数据根> bash scripts/install-to-profile.sh   # 多个 profile 时指定名字
```

> ⚠️ 2026-09-21 之前这里写死的默认值是 `/vol2/@appdata/.../profiles/web`，
> **换一台机器就报 `ERROR: DSH profile 不存在`**（用户原话：「我不止部署一个机器的 DSH」）。
> 现在一律运行时探测，且多个命中**不猜**、会列出候选让你指定。

### 2. 重启 DSH

重启方式取决于你的部署（fnOS 应用中心重启该应用，或按进程管理方式重启）。
DSH 默认监听 `2298`。

### 3. 验证

打开 `http://127.0.0.1:2298/`：

- **主界面左侧栏** → 点 New Session 按钮正下方的 📦「插件仓库」行

面板会开到主界面工作区（再点一次该行回到会话界面）。位置由席位决定：
`sidebar.panellist` 是 ui-sidebar 为「全局面板入口」保留的子槽，渲染顺序紧接
New Session 之后。入口若不想显示，在 `cordis.patch.yml` 里设
`showSidebarEntry: false`（或环境变量 `DSH_PLUGIN_SHOW_SIDEBAR_ENTRY=false`）后重启。

> 若装的是 **1.2.x**：那一版注册的是整栏 `sidebar` 槽，ui-layout 会把它当成
> 「替换整根导航栏」，**注定不显示** —— 升级到 1.3.0+ 才有侧边栏入口。
> 重跑 `bash scripts/install-to-profile.sh` 并重启 DSH 即可。

若启动时仍报
`invalid plugin, expect function or object with an "apply" method, received undefined`，
**先跑只读诊断**（一句话就把五种同形根因区分开）：

```bash
make doctor-panel        # = bash scripts/install-to-profile.sh --check
```

每条 `[FAIL]` 后面都跟了对应修法。另外：安装脚本**在装完的最后一步会自动跑它**
（「6. 宿主状态自检」），所以正常情况下你不会是「装完才发现装歪了」。
人读版说明见 `docs/FAQ.md` 的 **Q4b**。

## 为什么只有一个安装脚本

这里曾**有两份**「把插件装到 profile」的实现：仓库根的 `scripts/install-to-profile.sh`
和插件内的 `scripts/install.sh`。两份必然漂移 —— 实测就是插件内那份把落点写成
`node_modules/@deepseek-ai/<包名>`，而包名全是不带作用域的 `dsh-plugin-repo-manager`
→ Node 解析不到包 → 就是上面那条 `received undefined` 报错。

按本仓库的「**实现只放一处**」原则，唯一实现留在 `scripts/install-to-profile.sh`，
插件内那份改为**转发桩**（`exec` 过去，退出码原样穿透）。

## 配置

默认仓库目录：`/vol1/1000/AI/DSHPlugin/skills`（在 `cordis.patch.yml` 里）：

```yaml
- insert:
    - id: plugin-repo
      name: 'dsh-plugin-repo-manager'
      config:
        repoDir: '/path/to/your/plugins'
```

> ⚠️ `name` 必须与 `package.json` 的 `name`、profile `dependencies` 的 key、
> 以及物理目录 `node_modules/<name>` **四处完全一致**。
> 判据细节：物理目录的**父目录必须正好是 `node_modules`**（只看「末段 == 包名」
> 会漏判，因为错误的 `@deepseek-ai/` 落点末段同样是包名）。
> `validate_repo.py` 的 `check_panel_names` / `check_install_targets` 会自动校验。

## 与官方实现的区别

| 方面 | 官方实现 | 本插件 |
|------|----------|--------|
| 位置 | DSH 源码树 | profile 的 `node_modules/<包名>/` |
| 编译 | 需要重新编译 DSH | 无需编译（产物已入库） |
| 安装 | 内置 | 可插拔 |
| 更新 | 随 DSH 版本 | 独立更新 |

## 持久化

若 DSH 重装/升级导致 profile 的 `node_modules` 被重建，重跑一次即可恢复（幂等）：

```bash
cd /vol1/1000/AI/DSHPlugin && bash scripts/update-and-install.sh
```

（只想要「装」不想要「拉」，用 `bash scripts/install-to-profile.sh`。）

> 安装脚本按 `dependencies` 的 key（= 包名）把插件放到
> `node_modules/dsh-plugin-repo-manager`，与包名严格对应，
> 所以即使 `npm install` 没跑过也能被解析到 —— 不再依赖 npm 额外建链接。

> ⚠️ 网上流传的「每次登录自动重装」片段（往 `/etc/profile.d/` 写 heredoc）**不必再用**：
> 它指向的旧插件内脚本曾是错误落点的来源。若你确实需要，让它调用
> `/vol1/1000/AI/DSHPlugin/scripts/install-to-profile.sh`（唯一实现），别指向插件内那份。
