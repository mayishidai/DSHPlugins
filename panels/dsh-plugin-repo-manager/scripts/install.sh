#!/bin/bash
set -euo pipefail

# 【已改为转发桩】本文件不再自己实现安装逻辑。
#
# 为什么：这里曾**另写了一份**「把插件装到 DSH profile」的实现，与
# `scripts/install-to-profile.sh` 各存一份。两份必然漂移 —— 实测就是：
# 本文件把落点写成 `node_modules/@deepseek-ai/<包名>`，而包名（package.json 的
# name / cordis.patch.yml 的 name / profile dependencies 的 key）全是不带作用域的
# `dsh-plugin-repo-manager` → Node 解析不到这个包，DSH 启动报：
#
#   failed to apply loader entry … (dsh-plugin-repo-manager):
#   invalid plugin, expect function or object with an "apply" method, received undefined
#
# 而更糟的是：本文件还被 `INSTALL.md` 当成「安装步骤 1」推荐，并出现在一份
# 每次登录都会跑的自动恢复片段里 —— 等于**持续把这个错误落点再造出来**。
#
# 按本仓库的「实现只放一处」原则（见 .workbuddy/memory/MEMORY.md），
# 唯一实现留在 `scripts/install-to-profile.sh`，本文件只转发。
#
# 用法不变：
#   bash panels/dsh-plugin-repo-manager/scripts/install.sh
#   PROFILE_DIR=/path/to/profile bash panels/dsh-plugin-repo-manager/scripts/install.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_SCRIPTS="$(cd "$SCRIPT_DIR/../../.." && pwd)/scripts"

echo "[deprecated] 本脚本已改为转发桩，实际安装由仓库根脚本执行：" >&2
echo "             scripts/install-to-profile.sh" >&2
echo "" >&2

if [ ! -f "$REPO_SCRIPTS/install-to-profile.sh" ]; then
    echo "ERROR: 找不到唯一实现 $REPO_SCRIPTS/install-to-profile.sh" >&2
    echo "" >&2
    echo "本目录**不能单独安装** —— 唯一安装脚本在仓库根的 scripts/ 下。" >&2
    echo "本文件（插件内的 scripts/install.sh）只在仓库内有效。" >&2
    echo "" >&2
    echo "请改用仓库根（DSH 在 NAS 上时）：" >&2
    echo "    cd /vol1/1000/AI/DSHPlugin" >&2
    echo "    bash scripts/install-to-profile.sh" >&2
    echo "" >&2
    echo "⚠️ 不要把本目录 cp 到 node_modules/@deepseek-ai/ 或 dsh-runtime/ 下：" >&2
    echo "   包名不带作用域，必须落在 node_modules/<包名>（父目录正好是 node_modules），" >&2
    echo "   否则 Node 解析不到，DSH 会报 received undefined。" >&2
    exit 1
fi

# exec 转发：环境变量（如 PROFILE_DIR）与退出码原样穿透
exec bash "$REPO_SCRIPTS/install-to-profile.sh" "$@"
