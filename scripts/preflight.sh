#!/bin/bash
set -euo pipefail

# 安装前自检（只读，不修改任何东西）。
# 检查仓库中每个插件是否「编译完整、可直接安装」。
#
# 用法:
#   bash scripts/preflight.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

PASS=0
FAIL=0
WARN=0

ok()   { echo "  [OK]   $1"; PASS=$((PASS+1)); }
bad()  { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); }
warn() { echo "  [warn] $1"; WARN=$((WARN+1)); }

echo "=== DSHPlugins 安装前自检 ==="
echo "仓库: $REPO_ROOT"
echo ""

# ---------- 1. 结构完整性 ----------
echo "1. 结构完整性"
for d in skills agents mcps panels; do
    if [ -d "$d" ]; then ok "$d/ 存在"; else bad "$d/ 缺失"; fi
done
for f in README.md .gitignore; do
    if [ -f "$f" ]; then ok "$f 存在"; else bad "$f 缺失"; fi
done
echo ""

# ---------- 2. 技能型插件 ----------
echo "2. 技能型插件（skills/）"
if [ -d skills ]; then
    for d in skills/*/; do
        [ -d "$d" ] || continue
        n="$(basename "$d")"
        if [ -f "$d/SKILL.md" ]; then
            ok "$n: SKILL.md 存在"
        else
            bad "$n: 缺 SKILL.md"
            continue
        fi
        # frontmatter name 必须与目录名一致
        fm_name="$(sed -n '2p' "$d/SKILL.md" | sed 's/^name:[[:space:]]*//' | tr -d '"'"'"'')"
        if [ "$fm_name" = "$n" ]; then
            ok "$n: frontmatter name 与目录一致"
        else
            bad "$n: frontmatter name='$fm_name' ≠ 目录名"
        fi
        # python 脚本语法
        if [ -d "$d/scripts" ]; then
            for py in "$d"/scripts/*.py; do
                [ -f "$py" ] || continue
                if python3 -m py_compile "$py" 2>/dev/null; then
                    ok "$n: $(basename "$py") 语法通过"
                else
                    bad "$n: $(basename "$py") 语法错误"
                fi
            done
        fi
    done
else
    warn "skills/ 不存在"
fi
echo ""

# ---------- 3. MCP 型插件：脚本语法 + 配置合法 ----------
echo "3. MCP 型插件（mcps/）"
if [ -d mcps ]; then
    for d in mcps/*/; do
        [ -d "$d" ] || continue
        n="$(basename "$d")"
        [ -f "$d/README.md" ] && ok "$n: README.md 存在" || warn "$n: 建议补 README.md"
        # 脚本语法：.py 与 .sh 都查（.sh 漏查过，故一并纳入）
        if [ -d "$d/scripts" ]; then
            for py in "$d"/scripts/*.py; do
                [ -f "$py" ] || continue
                if PYTHONPATH= python3 -m py_compile "$py" 2>/dev/null; then
                    ok "$n: $(basename "$py") 语法通过"
                else
                    bad "$n: $(basename "$py") 语法错误"
                fi
            done
            for sh in "$d"/scripts/*.sh; do
                [ -f "$sh" ] || continue
                if bash -n "$sh" 2>/dev/null; then
                    ok "$n: $(basename "$sh") 语法通过"
                else
                    bad "$n: $(basename "$sh") 语法错误"
                fi
            done
        fi
        # 配置片段：必须含 mcpServers 键，且不得硬编码易变隧道地址
        for cfg in "$d"/*.json; do
            [ -f "$cfg" ] || continue
            [ "$(basename "$cfg")" = "manifest.json" ] && continue
            if python3 -c "import json,sys; json.load(open(sys.argv[1],encoding='utf-8'))" "$cfg" 2>/dev/null; then
                ok "$n: $(basename "$cfg") JSON 合法"
            else
                bad "$n: $(basename "$cfg") JSON 非法"
                continue
            fi
            if grep -q '"mcpServers"' "$cfg"; then
                ok "$n: $(basename "$cfg") 含 mcpServers 键"
            else
                bad "$n: $(basename "$cfg") 缺 mcpServers 键（写成 servers 会静默失效）"
            fi
            if grep -qE 'stun\.[a-z0-9.-]+:[0-9]{2,5}' "$cfg" && ! grep -qE '<[A-Za-z_]+>' "$cfg"; then
                bad "$n: $(basename "$cfg") 疑似硬编码易变隧道地址"
            else
                ok "$n: $(basename "$cfg") 未硬编码易变隧道地址"
            fi
        done
    done
else
    warn "mcps/ 不存在"
fi
echo ""

# ---------- 4. 面板型插件：编译产物必须齐全 ----------
echo "4. 面板型插件（panels/）— 编译产物检查"
if [ -d panels ]; then
    for d in panels/*/; do
        [ -d "$d" ] || continue
        n="$(basename "$d")"

        # 3.1 服务端编译产物（核心：装了就能用）
        if [ -f "$d/dist/index.js" ]; then
            ok "$n: dist/index.js 存在（服务端已编译）"
            if head -5 "$d/dist/index.js" | grep -qE '^\s*(export )?(interface|type|const \w+:)'; then
                warn "$n: dist/index.js 疑似仍含 TS 语法"
            fi
            # 必须能被 node 解析
            if node --check "$d/dist/index.js" 2>/dev/null; then
                ok "$n: dist/index.js 语法合法"
            else
                bad "$n: dist/index.js 语法错误"
            fi
        else
            bad "$n: 缺 dist/index.js（服务端未编译，需 npm run build）"
        fi

        # 3.2 客户端 bundle
        if [ -f "$d/client/client.js" ]; then
            ok "$n: client/client.js 存在"
            if node --check "$d/client/client.js" 2>/dev/null; then
                ok "$n: client/client.js 语法合法"
            else
                bad "$n: client/client.js 语法错误"
            fi
        else
            bad "$n: 缺 client/client.js"
        fi

        # 3.3 清单与 patch
        if [ -f "$d/package.json" ]; then
            # main 必须指向编译产物，不能指向 .ts
            main_val="$(python3 -c "import json;print(json.load(open('$d/package.json',encoding='utf-8')).get('main',''))" 2>/dev/null || echo '')"
            if echo "$main_val" | grep -qE '\.ts$'; then
                bad "$n: package.json main 指向 .ts（应为 dist/index.js）"
            elif [ -n "$main_val" ]; then
                ok "$n: main = $main_val"
            else
                warn "$n: package.json 缺 main"
            fi
            # files 必须包含 dist
            has_dist="$(python3 -c "import json;print('yes' if 'dist' in json.load(open('$d/package.json',encoding='utf-8')).get('files',[]) else 'no')" 2>/dev/null || echo no)"
            if [ "$has_dist" = "yes" ]; then
                ok "$n: files 含 dist"
            else
                warn "$n: package.json files 未含 dist"
            fi
        else
            bad "$n: 缺 package.json"
        fi

        [ -f "$d/cordis.patch.yml" ] && ok "$n: cordis.patch.yml 存在" || bad "$n: 缺 cordis.patch.yml"
        [ -f "$d/manifest.json" ] && ok "$n: manifest.json 存在" || warn "$n: 缺 manifest.json"
    done
else
    warn "panels/ 不存在"
fi
echo ""

# ---------- 5. 安装脚本安全性：不得改写 DSH 源码 ----------
echo "5. 安装脚本安全性（禁止污染 DSH 源码）"
for f in scripts/*.sh; do
    [ -f "$f" ] || continue
    b="$(basename "$f")"
    # 跳过自检脚本自身（它内含检测用模式串）
    [ "$b" = "preflight.sh" ] && continue
    # 只匹配「非注释行里的 sed 原位改写」，避免把说明文字误判为风险
    if grep -nE 'sed[[:space:]]+(-[a-zA-Z]+[[:space:]]+)*-i' "$f" 2>/dev/null \
        | grep -vE ':[[:space:]]*#' | head -1 | grep -q .; then
        bad "$b: 含对文件的原位改写（sed -i）"
    else
        ok "$b: 未见原位改写源码"
    fi
done
echo ""

# ---------- 5.5 说明：脚本可执行位不在本脚本里查 ----------
# 「所有 .py/.sh 必须是 100755」这一项**只在 validate_repo.py 的 check_exec_bits 里实现**，
# 本脚本刻意不复制一份 —— 参见下面第 6 节的教训：同一判据写两遍必然漂移。
#
# 为什么不在此处实现：可执行位的权威来源是 **git 索引**（本仓库 core.filemode=false，
# Windows 工作区的文件权限不可靠），而 shell 里解析 `git ls-files -s` 比 Python 更脆。
# 交给 Python 一处实现，`make verify` 会把两者一起跑。
#
# 实测价值（2026-09-18）：新增该检查后立刻抓出 4 个既存违规
# （skills/turnstile-spin/scripts/*.sh 是 644，而上游实为 755 —— 从 Windows 复制时丢的位）。
echo ""

# ---------- 6. 无凭据入库 ----------
echo "6. 凭据粗筛"
# 与 validate_repo.py 的 check_credentials 保持同一判据。
#
# ⚠️ 历史教训：这里曾是「正则 + shell 逐行抽取」的独立实现，结果**必然漂移**。
#    实测漏判：`DEFAULT_CLAWX_JR_API_KEY = "clawx_..."` 这一行。两处根因：
#      ① 关键字必须允许前缀 —— Python 版从整行任意位置 re.search 到 `API_KEY` 子串，
#         而旧 shell 正则要求 `api_?key` **紧邻** `=`，直接漏掉。
#      ② 必须大小写不敏感 —— Python 版用 re.IGNORECASE，旧 shell 正则没有 `-i`，
#         于是 `api_?key` 匹配不到全大写的 `API_KEY`。两处都得对齐才等价。
#    修法：关键字用 `[A-Za-z0-9_]*` 打头 + grep 加 `-i`，与 Python 的语义完全对齐。
#    两套校验给出不同结论，等于其中一套失去信号价值 —— 改这里必须同步改 validate_repo.py。
CRED_RE='[A-Za-z0-9_]*(token|secret|password|api_?key)[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"'[:space:]]{16,}["'"'"']'
PLACEHOLDER_RE='your[-_]|_here|xxx|<[a-z_-]+>|example|placeholder|changeme|redacted|dummy|fake|test-|sample'
# 已知公开标识（与 validate_repo.py 的 KNOWN_PUBLIC_KEYS 保持一致，改一处要同步改两处）
KNOWN_PUBLIC_KEYS_RE='^clawx_def123456uUbOxn2UGmmcUCCgln6zscT$'
cred_hits=""
cred_whitelisted=""
while IFS= read -r line; do
    [ -z "$line" ] && continue
    value="$(printf '%s' "$line" | sed -E 's/.*[:=][[:space:]]*["'"'"']([^"'"'"']*)["'"'"'].*/\1/')"
    case "$value" in
        \$*) continue ;;
    esac
    printf '%s' "$value" | grep -qEi "$PLACEHOLDER_RE" && continue
    if printf '%s' "$value" | grep -qE "$KNOWN_PUBLIC_KEYS_RE"; then
        cred_whitelisted="${cred_whitelisted}${line%%:*} "
        continue
    fi
    cred_hits="$cred_hits$line"$'\n'
done < <(grep -rInEi "$CRED_RE" \
        --include='*.json' --include='*.md' --include='*.py' --include='*.ts' --include='*.sh' \
        skills panels mcps scripts 2>/dev/null | grep -v node_modules | head -20)

if [ -n "$cred_hits" ]; then
    bad "疑似明文凭据命中（请人工确认）"
    printf '%s' "$cred_hits" | head -3
else
    ok "未发现明文凭据（占位示例已排除）"
fi
if [ -n "$cred_whitelisted" ]; then
    ok "命中已知公开标识豁免: $(printf '%s' "$cred_whitelisted" | tr ' ' '\n' | sort -u | tr '\n' ' ')"
fi
echo ""

echo "=== 自检结果 ==="
echo "  通过: $PASS    失败: $FAIL    警告: $WARN"
echo ""
if [ "$FAIL" -gt 0 ]; then
    echo "存在失败项，请修复后再安装。"
    exit 1
fi
echo "全部通过，可以安装。"
