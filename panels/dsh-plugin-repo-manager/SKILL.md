---
name: dsh-plugin-repo-manager
description: "DSH 设置面板插件：浏览/安装/卸载/更新自建插件仓库（DSHPlugins）中的插件，支持版本检测与一键更新。"
whenToUse: "当需要在 DSH 设置面板里管理自建插件仓库、或排查插件安装/更新问题时。"
invocation:
  modelInvocable: false
  userInvocable: true
---

# dsh-plugin-repo-manager（面板插件）

在 DSH 设置页以面板形式管理自建插件仓库：扫描仓库目录、安装/卸载插件、检测版本更新并一键更新。

## 这是面板型插件（不是技能）

| 项 | 值 |
|----|-----|
| 类型 | `runtime`（Cordis 双半包：host + client） |
| 入口 | host `src/index.ts` / client `client/client.js` |
| 挂载 | `cordis.patch.yml` |

它由 DSH 运行时加载，**不通过技能加载器调用**（`modelInvocable: false`）。人的入口是设置面板 UI。

## 用法

1. 重启 DSH
2. 打开 `http://127.0.0.1:2298/`
3. 进入 **设置** → **插件** → 点击 **「我的插件仓库」** tab

## 版本与更新

- 版本号解析顺序：`manifest.json` → `package.json` → `version.json`
- 已装版本从 `skillsDir/<name>/version.json` 读取
- `isNewer()` 做语义化版本逐段比较；版本缺失或无法解析时不提示更新
- 更新前自动整目录备份为 `<插件名>.bak-<ISO时间戳>`，并留档 `previousVersion` / `updatedAt` / `backupDir`

详细机制与 `version.json` 字段说明见本目录 `README.md`。

## 配置

默认仓库目录 `/vol1/1000/AI/DSHPlugin/skills`。修改 `cordis.patch.yml`：

```yaml
- insert:
    - id: plugin-repo
      name: 'dsh-plugin-repo-manager'
      config:
        repoDir: '/path/to/your/skills'
        skillsDir: '~/.dsh/skills'
        pollInterval: 3000
```

> `repoDir` **必须指向按类型分层的仓库根**（含插件子目录的那一层，通常是 `DSHPlugins/skills`），不是仓库根目录本身。

## 开发速查

```bash
npm install --no-save @types/react@18 @types/react-dom@18 @types/node@20
npx tsc --noEmit                # 期望 0 error
node scripts/test-isnewer.mjs        # 版本比较（23 例）
node scripts/test-install-update.mjs # 安装/更新流程（24 例）
node generate-client.mjs        # 改过 src/client/* 或 generate-client.mjs 后必须重跑
```
