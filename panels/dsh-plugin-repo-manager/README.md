# dsh-plugin-repo-manager

DSH 插件：从设置面板管理自定义插件仓库。

## 功能

- 查看插件仓库中的所有插件
- 显示已安装/未安装状态
- 一键安装 / 一键卸载已安装插件（带确认对话框）
- **版本检测**：对比仓库版本与已装版本，标出「可更新」
- **一键更新**：单个更新或「⬆ 全部更新」批量串行更新
- **更新留档**：更新前自动整目录备份为 `<插件名>.bak-<ISO时间戳>`，并在 `version.json` 记录 `previousVersion` / `updatedAt` / `backupDir`
- 支持多语言（中文/英文）

## 版本与更新机制

### 版本号来源

插件版本按以下顺序解析（取第一个命中的）：

| 顺序 | 文件 | 适用类型 |
|------|------|----------|
| 1 | `manifest.json` 的 `version` | skill / agent / mcp / runtime |
| 2 | `package.json` 的 `version` | 面板型（npm 包） |
| 3 | `version.json` 的 `version` | 已安装留档兜底 |

> 已安装版本只从 `skillsDir/<name>/version.json` 读取（安装时写入）。

### 更新判定

`isNewer(latest, current)` 做语义化版本逐段数字比较，规则：

- 版本号任一侧缺失 → 不提示更新（返回 `false`）
- 版本号无法解析（含非数字段，如 `abc`）→ 不提示更新，避免误报
- 支持 `v` 前缀（`v1.2.3`）与预发布后缀（`1.1.0-alpha` 按 `1.1.0` 比较）
- 段的位数不齐时按 0 补齐（`1.0` 等价 `1.0.0`）

基础用例见 `scripts/test-isnewer.mjs`（23 例）：

```bash
node scripts/test-isnewer.mjs
```

### 更新流程（installPlugin）

1. 读取已装 `version.json` 得到 `fromVersion`，判定本次是安装还是更新
2. **更新前整目录备份**到 `<targetDir>.bak-<ISO时间戳>`
3. 清空旧目录（避免已删除文件在更新后残留）
4. 递归复制新内容（用 `statSync` 判断目录，空目录也能正确复制）
5. 写 `version.json`：保留原 `installedAt`，新增/刷新 `version`、`updatedAt`、`previousVersion`、`backupDir`

### `version.json` 示例

```json
{
  "name": "lucky-api",
  "version": "1.1.0",
  "installedAt": "2026-09-17T12:00:00.000Z",
  "updatedAt": "2026-09-18T09:30:00.000Z",
  "previousVersion": "1.0.0",
  "backupDir": "/path/to/skills/lucky-api.bak-2026-09-18T09-30-00-000Z"
}
```

## 安装

```bash
# 方式 1: 直接复制
bash scripts/install.sh

# 方式 2: 手动复制
cp -r . /vol2/@appdata/deepseek.harness/dsh-runtime/node_modules/@deepseek-ai/
```

## 使用方法

1. 重启 DSH
2. 打开 `http://127.0.0.1:2298/`
3. 进入 **设置** → **插件**
4. 点击 **「我的插件仓库」** tab

## 配置

默认仓库目录：`/vol1/1000/AI/DSHPlugin/skills`

如需修改，编辑 `cordis.patch.yml`：

```yaml
- insert:
    - id: plugin-repo
      name: 'dsh-plugin-repo-manager'
      config:
        repoDir: '/path/to/your/plugins'
```

## 架构

```
dsh-plugin-repo-manager/
├── src/
│   ├── index.ts          # Host 入口（扫描/安装/卸载/更新/版本比较）
│   ├── types/
│   │   └── host.d.ts     # DSH 宿主包类型声明桩（仅类型检查用）
│   └── client/
│       ├── index.tsx     # Client 注册（含 JSX，故为 .tsx）
│       ├── locales.ts    # 国际化字典
│       └── PluginRepoPanel.tsx  # React 面板组件
├── client/
│   └── client.js         # 预编译客户端 bundle（由 generate-client.mjs 生成）
├── cordis.patch.yml      # Cordis 配置
├── manifest.json         # 插件元数据（版本号来源之一）
├── package.json
└── scripts/
    ├── install.sh        # 安装脚本
    ├── test-isnewer.mjs  # 版本比较单元测试
    └── test-install-update.mjs  # 安装/更新流程端到端测试
```

## 与官方实现的区别

| 方面 | 官方实现 | 本插件 |
|------|----------|--------|
| 位置 | DSH 源码树 | 独立 npm 包 |
| 编译 | 需要重新编译 DSH | 无需编译 |
| 安装 | 内置 | 可插拔 |
| 更新 | 随 DSH 版本 | 独立更新 |

## 持久化

由于 DSH 重启可能清除 `node_modules`，建议：

```bash
# 添加自动恢复脚本
cat >> /etc/profile.d/dsh-plugin-repo.sh << 'EOF'
bash /vol1/1000/AI/DSHPlugin/panels/dsh-plugin-repo-manager/scripts/install.sh 2>/dev/null &
EOF
```

## 开发

```bash
# 安装类型依赖（首次）
npm install --no-save @types/react@18 @types/react-dom@18 @types/node@20

# 类型检查（应输出 0 error）
npx tsc --noEmit

# 版本比较单元测试（23 例）
node scripts/test-isnewer.mjs

# 安装/更新流程端到端测试（24 例，用临时目录，不碰生产环境）
node scripts/test-install-update.mjs

# 生成客户端 bundle
node generate-client.mjs
```

> **注意**：`generate-client.mjs` 内嵌了一份 client 源码副本。改完 `src/client/*` 后必须同步改 `generate-client.mjs`，再重跑生成脚本，否则改动会被覆盖回旧值。
