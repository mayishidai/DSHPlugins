# DSH 插件仓库管理插件 - 最终方案

## 📦 插件位置

```
/vol1/1000/AI/DSHPlugin/plugins/dsh-plugin-repo-manager/
├── src/
│   ├── index.ts              # Host 入口
│   └── client/
│       ├── index.ts          # Client 注册
│       ├── locales.ts        # 国际化
│       └── PluginRepoTab.tsx # React 组件
├── client/
│   └── client.js             # 预编译客户端 bundle
├── scripts/
│   └── install.sh            # 安装脚本
├── cordis.patch.yml          # Cordis 配置
├── package.json
└── README.md
```

## ✅ 已安装到 Runtime

```
/vol2/@appdata/deepseek.harness/dsh-runtime/node_modules/@deepseek-ai/dsh-plugin-repo-manager/
```

## 🚀 使用方法

### 1. 安装插件（已完成）

```bash
rm -rf /vol2/@appdata/deepseek.harness/dsh-runtime/node_modules/@deepseek-ai/dsh-plugin-repo-manager
cp -r /vol1/1000/AI/DSHPlugin/plugins/dsh-plugin-repo-manager /vol2/@appdata/deepseek.harness/dsh-runtime/node_modules/@deepseek-ai/
```

### 2. 重启 DSH

```bash
pkill -f 'dsh.*web' || true
dsh --profile web &
```

### 3. 访问

打开 `http://127.0.0.1:2298/` → 设置 → 插件 → **「我的插件仓库」**

## 🔧 配置

默认仓库目录：`/vol1/1000/AI/DSHPlugin/plugins`

如需修改，编辑 `cordis.patch.yml`：

```yaml
- insert:
    - id: plugin-repo
      name: 'dsh-plugin-repo-manager'
      config:
        repoDir: '/path/to/your/plugins'
```

## 📝 功能特性

| 功能 | 说明 |
|------|------|
| 列出插件 | 扫描仓库目录，显示所有插件 |
| 安装状态 | 标记已安装/未安装 |
| 卸载插件 | 勾选后点击卸载，带确认对话框 |
| 安全守卫 | kebab-case 校验 + 路径穿越防护 |
| 多语言 | 中文/英文支持 |

## 🎯 与 dsh-market 的对比

| 方面 | dsh-market | 本插件 |
|------|------------|--------|
| 复杂度 | 完整市场（2300+ 插件） | 轻量仓库管理 |
| 功能 | 浏览、搜索、安装、更新、主题 | 本地仓库管理 |
| 依赖 | 需要 catalog API | 无需外部依赖 |
| 适用场景 | 社区插件市场 | 个人插件仓库 |

## 📋 当前插件列表

查看 `/vol1/1000/AI/DSHPlugin/plugins/` 目录：

```bash
ls /vol1/1000/AI/DSHPlugin/plugins/
```

## 🔒 安全性

- **kebab-case 校验**：插件名必须是合法 kebab-case
- **路径穿越防护**：只允许删除 `skills/<name>`，不允许路径穿越
- **仅卸载**：不会删除仓库中的插件

## 🔄 持久化

由于 DSH 重启可能清除 `node_modules`，建议添加自动恢复：

```bash
cat >> /etc/profile.d/dsh-plugin-repo.sh << 'EOF'
bash /vol1/1000/AI/DSHPlugin/plugins/dsh-plugin-repo-manager/scripts/install.sh 2>/dev/null &
EOF
```

## 📖 参考

- [dsh-market 官方仓库](https://github.com/dsh-market/dsh-market)
- [Ceelog/dsh-plugins](https://github.com/Ceelog/dsh-plugins)
- [DSH Plugin 开发文档](https://github.com/deepseek-ai/deepseek-harness)
