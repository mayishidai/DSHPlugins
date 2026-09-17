# panels/ — 运行时 / 面板型插件

放 **带 UI 的运行时插件**（DSH extensions 的 Cordis 双半包：host + client）。
它们不是被「调用」的技能，而是作为扩展动态包加载后出现在 Web GUI 里。

## 目录约定

```
panels/<name>/
├── src/                    # host 半（服务端逻辑）
│   ├── index.ts
│   └── client/             # client 半源码
├── client/                 # 预编译客户端 bundle
├── cordis.patch.yml        # Cordis 配置（含 repoDir 等运行时配置）
├── package.json
├── generate-client.mjs     # client bundle 生成脚本
├── scripts/install.sh      # 安装到 DSH runtime
└── README.md / INSTALL.md / IMPLEMENTATION.md / FINAL.md
```

## 与 skills/ 的本质区别

| | skills/ | panels/ |
|---|---|---|
| 机制 | `dsh-skill-filesystem` 扫描 | DSH extensions（Cordis 双半包） |
| 形态 | 指令型能力 | 有 UI 的运行时扩展 |
| 安装 | 复制到 `$DSH_HOME/skills/` | 复制到 `dsh-runtime/node_modules/@deepseek-ai/` |
| 生效 | 自动发现，通常无需重启 | 需重启 DSH + 配 `cordis.patch.yml` |

## 当前收录

| 面板 | 说明 |
|---|---|
| [dsh-plugin-repo-manager](dsh-plugin-repo-manager/) | DSH 设置面板里的「我的插件仓库」：列技能、装/卸、批量操作、轮询刷新 |

## 注意

`dsh-plugin-repo-manager` 的扫描目录 `repoDir` 指向本仓库的 **`skills/`**：

```yaml
repoDir: '/vol1/1000/AI/DSHPlugin/skills'
```

仓库目录结构调整后必须同步这个值，否则管理面板会扫不到技能（列表变空）。
详见 `panels/dsh-plugin-repo-manager/cordis.patch.yml`。
