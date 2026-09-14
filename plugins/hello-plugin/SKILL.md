---
name: hello-plugin
description: "示例技能：演示本仓库插件格式。调用后返回一句问候。"
whenToUse: "当用户想测试插件仓库是否正常工作，或问怎么加新插件时。"
---

# hello-plugin（示例技能）

这是一个示例技能，用来演示本仓库插件的标准结构。你可以用它验证安装链路。

## 用法

调用 `scripts/hello.sh` 会打印一句问候，并打印当前技能目录。

```bash
cd "$(dirname "$(readlink -f "$0")")/.."   # 技能根目录
./scripts/hello.sh
```

## 结构

```
hello-plugin/
├── SKILL.md
├── manifest.json
└── scripts/hello.sh
```

## 删除它

不需要时，删除整个 `plugins/hello-plugin/` 目录，再运行 `./scripts/sync-to-dsh.sh --prune` 清理。