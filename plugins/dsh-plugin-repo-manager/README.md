# dsh-plugin-repo-manager

DSH 插件：从设置面板管理自定义插件仓库。

## 功能

- 查看插件仓库中的所有插件
- 显示已安装/未安装状态
- 一键卸载已安装插件（带确认对话框）
- 支持多语言（中文/英文）

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

默认仓库目录：`/vol1/1000/AI/DSHPlugin/plugins`

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
│   ├── index.ts          # Host 入口
│   └── client/
│       ├── index.ts      # Client 注册
│       ├── locales.ts    # 国际化字典
│       └── PluginRepoTab.tsx  # React 组件
├── client/
│   └── client.js         # 预编译客户端 bundle
├── cordis.patch.yml      # Cordis 配置
├── package.json
└── scripts/
    └── install.sh        # 安装脚本
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
bash /vol1/1000/AI/DSHPlugin/plugins/dsh-plugin-repo-manager/scripts/install.sh 2>/dev/null &
EOF
```

## 开发

```bash
# 类型检查
npx tsc --noEmit

# 生成客户端 bundle
node generate-client.mjs > client/client.js
```
