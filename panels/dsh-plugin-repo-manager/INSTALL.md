# DSH 插件仓库管理插件

## 概述

这是一个**可插拔的 DSH 插件**，无需编译源码，可直接安装到 DSH runtime 中使用。

## 目录结构

```
DSHPlugin/
├── skills/                         # 技能型插件
├── panels/
│   └── dsh-plugin-repo-manager/    # 面板插件包（可插拔）
│       ├── src/
│       │   ├── index.ts            # Host 入口
│       │   └── client/
│       │       ├── index.ts        # Client 注册
│       │       ├── locales.ts      # 国际化
│       │       └── PluginRepoTab.tsx  # React 组件
│       ├── scripts/
│       │   ├── install.sh          # 安装脚本
│       │   └── wrap-client.mjs     # 客户端打包
│       ├── cordis.patch.yml        # Cordis 配置
│       ├── package.json
│       └── tsconfig.json
├── deepseek-harness/               # 官方 DSH 源码（参考用）
└── ...
```

## 安装步骤

### 1. 复制插件到 DSH runtime

```bash
bash /vol1/1000/AI/DSHPlugin/panels/dsh-plugin-repo-manager/scripts/install.sh
```

### 2. 重启 DSH

```bash
# 停止当前 DSH
kill $(cat /vol2/@appdata/deepseek.harness/harness.pid)

# 等待重启，或手动启动
dsh --profile web &
```

### 3. 验证

打开 `http://127.0.0.1:2298/` → 设置 → 插件 → 「我的插件仓库」

## 功能特性

| 功能 | 说明 |
|------|------|
| 列出插件 | 扫描仓库目录，显示所有插件 |
| 安装状态 | 标记已安装/未安装 |
| 卸载插件 | 勾选后点击卸载，带确认对话框 |
| 安全守卫 | kebab-case 校验 + 路径穿越防护 |

## 配置

默认仓库目录：`/vol1/1000/AI/DSHPlugin/skills`

如需修改，编辑 `cordis.patch.yml`：

```yaml
- insert:
    - id: plugin-repo
      name: '@deepseek-ai/dsh-plugin-repo-manager'
      config:
        repoDir: '/path/to/your/plugins'
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

1. 将安装脚本加入 DSH 启动流程
2. 或使用 `persist-plugin-repo.sh` 自动恢复

```bash
# 添加自动恢复脚本
cat >> /etc/profile.d/dsh-plugin-repo.sh << 'EOF'
# Auto-install plugin-repo-manager on DSH start
if [ -d "/vol1/1000/AI/DSHPlugin/panels/dsh-plugin-repo-manager" ]; then
    bash /vol1/1000/AI/DSHPlugin/panels/dsh-plugin-repo-manager/scripts/install.sh
fi
EOF
```
