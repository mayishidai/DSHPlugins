# dsh-plugin-repo-manager - 最终实现

> ⚠️ **本文是历史实现记录，不是安装指引。** 文中出现的
> `cp -r … dsh-runtime/node_modules/@deepseek-ai/` 一类命令**已废弃**：
> 它会污染 DSH 运行时源码树，且正是 `invalid plugin, … received undefined`
> 报错的来源（包名不带作用域，却装进 `@deepseek-ai/`，Node 解析不到）。
> **安装请看 [`INSTALL.md`](INSTALL.md)：`bash scripts/install-to-profile.sh`。**

## ✅ 已实现功能

### 1. 主界面侧边栏图标按钮
- 注册到 `sidebar` 槽位，渲染**自绘内联 SVG** 箱子图标（`currentColor`，跟随主题）
- 点击后导航到设置面板的「我的插件仓库」
- 由 `showSidebarButton` 控制（默认 `true`）；关闭时**整个不注册槽位**
- ⚠️ 早期版本此处渲染的是中文字符串 `t('sidebar')`，在窄侧边栏里会溢出；
  且 `showSidebarButton` 曾是**声明了但无人读取**的死配置（改了无效、也不报错）。

### 2. Skill 管理面板
- 列出本地仓库中的所有 skill
- 显示安装状态（已安装/未安装）
- 显示版本号
- 支持批量操作（勾选多个）

### 3. 安装/卸载功能
- 安装：复制仓库中的 skill 到 skills 目录
- 卸载：删除 skills 目录中的 skill
- 带确认对话框
- 操作后自动刷新

### 4. 轮询刷新（可自定义）
- 默认每 3 秒自动刷新
- 可在设置面板中调整间隔（500ms - 无限）
- 手动刷新按钮
- 显示最后更新时间

### 5. 安全守卫
- kebab-case 名称校验
- 路径穿越防护
- 仅允许删除 skills/<name>/

## 📁 文件结构

```
dsh-plugin-repo-manager/
├── src/
│   ├── index.ts              # Host 入口（HTTP API）
│   └── client/
│       ├── index.ts          # Client 注册
│       ├── locales.ts        # 国际化
│       ├── PluginRepoPanel.tsx  # React 组件（开发用）
│       └── PluginRepoTab.tsx    # 旧版组件
├── client/
│   └── client.js             # 预编译 bundle (14KB)
├── cordis.patch.yml          # Cordis 配置
├── package.json
├── generate-client.mjs       # Bundle 生成器
└── scripts/
    └── install.sh            # 安装脚本
```

## 🔧 配置

### cordis.patch.yml
```yaml
- insert:
    - id: plugin-repo
      name: 'dsh-plugin-repo-manager'
      config:
        repoDir: '/vol1/1000/AI/DSHPlugin/skills'
        skillsDir: '~/.dsh/skills'
        pollInterval: 3000
```

### 环境变量
```bash
export DSH_PLUGIN_REPO_DIR=/path/to/plugins
export DSH_PLUGIN_SKILLS_DIR=~/.dsh/skills
export DSH_PLUGIN_POLL_INTERVAL=3000
```

## 🚀 使用方式

### 1. 安装
```bash
# 复制插件到 runtime
cp -r dsh-plugin-repo-manager /vol2/@appdata/deepseek.harness/dsh-runtime/node_modules/@deepseek-ai/
```

### 2. 重启 DSH
```bash
pkill -f 'dsh.*web' || true
dsh --profile web &
```

### 3. 访问
打开 `http://127.0.0.1:2298/` → 设置 → 插件 → 「我的插件仓库」

或通过侧边栏按钮直接访问。

## 🔄 更新流程

### 更新客户端代码
```bash
cd dsh-plugin-repo-manager
node generate-client.mjs
```

### 重新安装
```bash
rm -rf /vol2/@appdata/deepseek.harness/dsh-runtime/node_modules/@deepseek-ai/dsh-plugin-repo-manager
cp -r . /vol2/@appdata/deepseek.harness/dsh-runtime/node_modules/@deepseek-ai/
```

## 📊 对比其他方案

| 特性 | 官方方案 | dsh-market | 本插件 |
|------|----------|------------|--------|
| 侧边栏按钮 | ✅ | ✅ | ✅ |
| Skill 管理 | ✅ | ✅ | ✅ |
| 实时更新 | ⭐⭐⭐ Typert | ⭐⭐ WebSocket | ⭐ 轮询 |
| 安装复杂度 | 高（编译源码） | 中（npm install） | 低（复制） |
| 体积 | 大（284M） | 中 | 小（14K） |
| 依赖 | DSH 源码 | 外部 API | 无 |

## ⚠️ 限制

1. **轮询非实时**：默认 3 秒刷新，非真正实时
2. **无 WebSocket**：未实现服务端推送
3. **手动安装**：需要手动复制插件包

## 🔮 未来改进

1. 添加 WebSocket 支持实现真正实时
2. 添加插件搜索功能
3. 添加插件版本历史
4. 支持从 GitHub 直接安装
5. 添加插件更新检测

## 📝 HTTP API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/plugin-repo/list` | GET | 列出所有插件 |
| `/api/plugin-repo/install` | POST | 安装插件 |
| `/api/plugin-repo/uninstall` | POST | 卸载插件 |

### 请求/响应示例

```json
// GET /api/plugin-repo/list
{
  "ok": true,
  "plugins": [
    {
      "name": "hello-plugin",
      "repoDirName": "hello-plugin",
      "version": "1.0.0",
      "installed": true,
      "installedVersion": "1.0.0",
      "source": "repo"
    }
  ],
  "pollInterval": 3000
}

// POST /api/plugin-repo/install
{ "name": "hello-plugin" }

// Response
{ "ok": true, "name": "hello-plugin", "installed": true }

// POST /api/plugin-repo/uninstall
{ "name": "hello-plugin" }

// Response
{ "ok": true, "name": "hello-plugin", "removed": true }
```
