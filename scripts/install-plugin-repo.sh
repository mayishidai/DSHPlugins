#!/bin/bash
set -euo pipefail

# 【已废弃】原用途：把插件装进 DSH **运行时源码树**（dsh-runtime/node_modules/@deepseek-ai）。
#
# 为什么不推荐再用它：
#   1. 它会写入 DSH 运行时目录，属于「污染 DSH 源码/安装」；
#   2. 旧版本还会用 sed -i 直接改 dsh-api-remotes 的 lib 文件；
#   3. 旧版本引用的 packages/host/plugin-repo 路径在本仓库并不存在，必然失败。
#
# 现在请改用 **profile 级安装**（只写用户数据区，不碰运行时源码）：
#
#     bash scripts/install-to-profile.sh
#
# 该脚本会：
#   - 把编译好的 dist/ 与 client/ 复制到 profile 的 node_modules
#   - 用 python3 安全地更新 profile package.json（dependencies + dsh.profile.bundles）
#   - 备份原 package.json，可用 uninstall-from-profile.sh 完整还原
#
# 本文件保留仅为兼容旧文档中的引用，执行它会直接退出。

echo "本脚本已废弃，不再执行任何安装动作。" >&2
echo "" >&2
echo "请改用（只写 profile，不污染 DSH 源码）：" >&2
echo "    bash scripts/install-to-profile.sh" >&2
echo "" >&2
echo "若需临时以 --patch 方式加载（同样不改源码）：" >&2
echo "    bash scripts/start-dsh-with-plugin.sh" >&2
echo "" >&2

exit 1
