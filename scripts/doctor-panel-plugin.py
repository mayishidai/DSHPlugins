#!/usr/bin/env python3
"""面板插件「DSH 侧能否加载」的宿主状态诊断。

## 为什么需要它

DSH 启动时报的那句话 ——

    failed to apply loader entry … (dsh-plugin-repo-manager):
    invalid plugin, expect function or object with an "apply" method, received undefined

—— 是**同一个症状对应至少五种根因**的典型：

  ① 包没落在 `node_modules/<包名>`（历史事故：装在 `@deepseek-ai/` 下）
  ② 落点被 `npm install` 换成了指向自己的软链接（本仓库 profile 里那条
     `file:./node_modules/<包名>` 依赖指向自身，npm 会把它规范化成 `file:<包名>`
     再按 profile 根解析 → ENOENT 或自指链接）
  ③ 已装副本太旧（`git pull` 之后忘了重装，副本里还没有 `export default`）
  ④ 入口只有具名导出、没有默认导出 ⇒ 取 `.default` 分支的加载器拿到 undefined
  ⑤ profile 的 `dependencies` / `dsh.profile.bundles` 没登记

**光看报错无法区分**（解析失败与导出缺失的文本完全一样），所以只能把判据逐条量出来。
本脚本做的就是这件事，且**只读**：除了在 profile 下写一个瞬时探针文件（随即删除），
不改动任何状态。

## 用法

    python3 scripts/doctor-panel-plugin.py --profile <profileDir> [--plugin-src <面板目录>] [--pkg-name <包名>]

通常不必直接调用 —— 安装脚本有转发入口：

    bash scripts/install-to-profile.sh --check

退出码：0 = 无 FAIL；1 = 存在 FAIL（每一项 FAIL 后面都跟了对应的修法）。
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

DEFAULT_PKG_NAME = "dsh-plugin-repo-manager"
DEFAULT_PLUGIN_REL = Path("panels") / DEFAULT_PKG_NAME

# 由安装脚本注入（仓库根）；独立调用时按脚本位置推导
REPO_ROOT = Path(__file__).resolve().parent.parent

# 真实 ESM 探针。必须写成独立 .mjs 文件按**裸包名** import：
#   - `node -e` 是 CJS 引导，会注入 require，**会完全掩盖 ESM 类问题**（本仓库铁律）；
#   - 复制成别的路径会测不到「按包名解析」这一步，而那正是最常见的根因。
PROBE_SOURCE = r"""
import { createRequire } from 'node:module'

const NAME = process.argv[2]
const out = {}
const shape = (v) => (v === undefined ? 'undefined' : v === null ? 'null' : typeof v)

try {
  const m = await import(NAME)
  out.keys = Object.keys(m).sort()
  out.apply = shape(m.apply)
  out.default = shape(m.default)
  out.defaultApply = shape(m.default && m.default.apply)
  out.defaultName = m.default && m.default.name
  const coalesced = m.apply ?? m.default
  out.viaCoalesce = shape(coalesced && coalesced.apply ? coalesced.apply : coalesced)
} catch (e) {
  out.error = String((e && (e.code || e.name)) + ': ' + (e && e.message))
}

// import.meta.resolve 在 Node 20.6 以前不存在 —— 缺了它不该让整步判 FAIL
try {
  out.resolvedUrl = typeof import.meta.resolve === 'function'
    ? import.meta.resolve(NAME)
    : '(import.meta.resolve 不可用，跳过)'
} catch (e) {
  out.resolvedUrl = 'resolve 失败: ' + String(e && e.message)
}

try {
  const req = createRequire(import.meta.url)
  const r = req(NAME)
  out.viaRequire = shape(r && (r.apply ? r.apply : r.default && r.default.apply))
} catch (e) {
  out.viaRequire = String((e && (e.code || e.name)) + ': ' + (e && e.message)).slice(0, 160)
}

console.log('__DOCTOR__' + JSON.stringify(out))
"""


class Report:
    def __init__(self):
        self.fails = 0
        self.warns = 0

    def ok(self, msg):
        print(f"  [OK]   {msg}")

    def fail(self, msg):
        print(f"  [FAIL] {msg}")
        self.fails += 1

    def warn(self, msg):
        print(f"  [WARN] {msg}")
        self.warns += 1

    def info(self, msg):
        print(f"         {msg}")


def read_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def patch_loader_name(patch_path):
    """从 cordis.patch.yml 里取 loader entry 的 name（加载器解析时用的就是它）。"""
    try:
        text = Path(patch_path).read_text(encoding="utf-8")
    except Exception:
        return None
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            continue
        if stripped.startswith("name:"):
            value = stripped[len("name:"):].strip().strip("'\"")
            return value or None
    return None


def check_names(rep, pkg_name, plugin_src, profile_pkg, patch_name):
    print("1. 名字一致性（同一字符串必须在四处的每一处都相同）")
    print(f"     ① 仓库 package.json name   : {pkg_name}")
    print(f"     ② cordis.patch.yml name    : {patch_name}")
    if patch_name != pkg_name:
        rep.fail(
            f"② 与 ① 不一致（patch='{patch_name}'）—— 加载器按 patch 里的名字解析，"
            "这个名字必须等于 package.json 的 name"
        )
    else:
        rep.ok("② cordis.patch.yml 的 loader name 与 package.json 一致")

    deps = (profile_pkg or {}).get("dependencies") or {}
    spec = deps.get(pkg_name)
    if spec is None:
        rep.fail(
            f"③ profile package.json 的 dependencies 里没有 '{pkg_name}'"
            "（重跑安装脚本即可补上）"
        )
    else:
        rep.ok(f"③ profile dependencies 已登记 → {spec}")
        if str(spec).startswith("file:") and "/node_modules/" in str(spec):
            rep.warn(
                "③ 该 file: 依赖指向 node_modules 内部（也就是它自己）—— npm 会把"
                " file:./node_modules/X 规范化成 file:X 再按 profile 根解析，"
                "所以在该 profile 里跑 npm install 必然失败（已实测 ENOENT）。"
                "不要在这个 profile 跑 npm install；真要修复就重跑安装脚本。"
            )

    dsh = (profile_pkg or {}).get("dsh") or {}
    bundles = (dsh.get("profile") or {}).get("bundles") or []
    if pkg_name in bundles:
        rep.ok("④ profile dsh.profile.bundles 已登记")
    else:
        rep.fail(
            f"④ profile dsh.profile.bundles 里没有 '{pkg_name}'"
            "（DSH 不会去加载它；重跑安装脚本即可补上）"
        )

    physical = Path(plugin_src).name
    if physical == pkg_name:
        rep.ok(f"⑤ 面板物理目录名与包名一致（{physical}）")
    else:
        rep.warn(f"⑤ 面板物理目录名 '{physical}' 与包名 '{pkg_name}' 不同（仓库内重命名会触发）")
    return spec


def check_landing(rep, pkg_name, profile_dir):
    print("\n2. 落点（决定 Node 到底能不能解析到这个包）")
    node_modules = Path(profile_dir) / "node_modules"
    target = node_modules / pkg_name

    if target.is_symlink():
        try:
            link_to = os.readlink(target)
        except OSError:
            link_to = "(readlink 失败)"
        # ⚠️ 软链接**本身不是问题** —— npm 对 file: 依赖建的链接就是软链，
        # 能解析到真目录就没毛病。有问题的只有「目标不存在」和「指向自己」：
        # 两者都会让 Node 抛 ELOOP / ENOENT，而 DSH 把这类失败一律报成
        # received undefined，和「导出缺失」长得一模一样。
        try:
            resolved = target.resolve(strict=True)
        except Exception:
            resolved = None
        if resolved is None:
            rep.fail(
                f"落点是**软链接且解析不通** → {link_to}"
                "（目标不存在或指向自己）。真目录被换掉了，Node 解析直接失败。"
                "修法：重跑安装脚本（会重建真目录），并且**不要在这个 profile 跑 npm install**。"
            )
        else:
            rep.ok(f"落点是软链接 → {link_to}（可解析到 {resolved}）")
            rep.info("软链本身无害；但请注意别名/链接失效后症状与「导出缺失」无法区分")
    elif target.is_dir():
        rep.ok(f"落点存在且是真目录：{target}")
        if target.parent.resolve() == node_modules.resolve():
            rep.ok("父目录正好是 node_modules")
        else:
            rep.fail(f"父目录不是 node_modules（实际 {target.parent}）—— Node 解析不到")
    else:
        rep.fail(
            f"落点不存在：{target} —— Node 会报 ERR_MODULE_NOT_FOUND，"
            "而 DSH 把解析失败与导出缺失报成同一句话。修法：bash scripts/install-to-profile.sh"
        )

    legacy = node_modules / "@deepseek-ai" / pkg_name
    if legacy.exists():
        rep.fail(
            f"存在**历史错误落点** {legacy}。它不会被解析，却会让人误以为「已安装」。"
            "重跑安装脚本会自动清掉它。"
        )
    else:
        rep.ok("无历史错误落点（node_modules/@deepseek-ai/<包名>）")
    return target


def check_payload(rep, target, plugin_src):
    print("\n3. 已装副本的完整性 + 是否与仓库同版本")
    if not target.is_dir():
        rep.warn("落点不存在，跳过")
        return None

    needed = ["package.json", "manifest.json", "cordis.patch.yml", "dist/index.js", "client/client.js"]
    missing = [f for f in needed if not (target / f).exists()]
    if missing:
        rep.fail(f"已装副本缺文件：{', '.join(missing)} —— 重跑安装脚本")
    else:
        rep.ok(f"关键文件齐全（{len(needed)} 项：{'、'.join(needed)}）")

    installed = read_json(target / "package.json") or {}
    repo = read_json(Path(plugin_src) / "package.json") or {}
    iv, rv = installed.get("version"), repo.get("version")
    print(f"     已装版本 {iv}   仓库版本 {rv}")
    if iv and rv and iv != rv:
        rep.warn(
            f"已装副本是 v{iv}，仓库已到 v{rv} —— 副本不是最新的（「改了没效果」的头号原因）。"
            "修法：bash scripts/update-and-install.sh（= git pull + 重装）"
        )
    elif iv and rv:
        rep.ok("已装副本与仓库同版本")

    # 直接看静态导出面：即便解析失败，也能区分「文件里到底有没有 default」
    dist = target / "dist/index.js"
    if dist.exists():
        text = dist.read_text(encoding="utf-8", errors="replace")
        has_named = "export async function apply" in text or "export function apply" in text
        has_default = "export default" in text
        if has_named:
            rep.ok("dist/index.js 有具名导出 apply")
        else:
            rep.fail("dist/index.js 缺少具名导出 apply")
        if has_default:
            rep.ok("dist/index.js 有默认导出（加载器取 .default 分支时的兜底）")
        else:
            rep.fail("dist/index.js 缺少默认导出 —— 取 .default 的加载器会拿到 undefined")
    return installed


def check_resolve(rep, pkg_name, profile_dir):
    print("\n4. 真实解析（按加载器使用的方式：裸包名 import）")
    node = shutil.which("node")
    if not node:
        rep.warn(
            "PATH 里找不到 node，跳过这一步。手动确认用："
            f"cd {profile_dir} && node --input-type=module -e \"…\"（须写成真实 .mjs，"
            "node -e 会掩盖 ESM 问题）"
        )
        return
    probe_path = None
    try:
        fd, probe_path = tempfile.mkstemp(
            dir=profile_dir, prefix=".dsh-doctor-", suffix=".mjs"
        )
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(PROBE_SOURCE)
        r = subprocess.run(
            [node, probe_path, pkg_name],
            cwd=profile_dir,
            capture_output=True,
            text=True,
            timeout=60,
        )
        line = ""
        for candidate in (r.stdout or "").splitlines():
            if candidate.startswith("__DOCTOR__"):
                line = candidate[len("__DOCTOR__"):]
        if not line:
            rep.fail(
                "探针未返回结果。stdout="
                + json.dumps((r.stdout or "")[-400:])
                + " stderr="
                + json.dumps((r.stderr or "")[-400:])
            )
            return
        res = json.loads(line)
        if res.get("error"):
            rep.fail(
                f"按裸包名 '{pkg_name}' 解析失败：{res['error']}\n"
                f"         → 这就是全部症状的来源：DSH 把解析失败与导出缺失报成同一句话。"
            )
            return
        rep.ok(f"解析成功 → {res.get('resolvedUrl')}")
        rep.ok("导出键: " + ", ".join(res.get("keys") or []))
        if res.get("apply") == "function":
            rep.ok("mod.apply 是函数")
        else:
            rep.fail(f"mod.apply 是 {res.get('apply')}（应为 function）")
        if res.get("defaultApply") == "function":
            rep.ok(f"mod.default.apply 是函数（name={res.get('defaultName')}）")
        else:
            rep.fail(
                f"mod.default 取不到 apply（default={res.get('default')}）—— "
                "取 .default 分支的加载器会拿到 undefined"
            )
        if res.get("viaCoalesce") == "function":
            rep.ok("合并写法（mod.apply ?? mod.default）同样可用")
        else:
            rep.fail("合并写法取不到合法插件")
        req = res.get("viaRequire")
        if req == "function":
            rep.ok("createRequire 路径同样可用")
        else:
            rep.warn(f"createRequire 路径不可用（{req}）—— 若加载器走 require 分支就会拿到 undefined")
    except subprocess.TimeoutExpired:
        rep.warn("探针超时（60s），跳过")
    except Exception as e:  # noqa: BLE001
        rep.warn(f"探针执行异常，跳过：{e}")
    finally:
        if probe_path:
            try:
                os.unlink(probe_path)
            except OSError:
                pass


def check_repo_dir(rep, plugin_src):
    print("\n5. 面板要管理的仓库目录（与加载无关，但装了没反应常出在这里）")
    patch = Path(plugin_src) / "cordis.patch.yml"
    repo_dir = None
    try:
        for line in patch.read_text(encoding="utf-8").splitlines():
            s = line.strip()
            if s.startswith("#"):
                continue
            if s.startswith("repoDir:"):
                repo_dir = s[len("repoDir:"):].strip().strip("'\"")
                break
    except Exception:
        pass
    if not repo_dir:
        rep.ok("cordis.patch.yml 未写 repoDir（DSH 侧配置为准，跳过）")
        return
    if os.path.isdir(repo_dir):
        rep.ok(f"仓库模板里的 repoDir 可达：{repo_dir}")
    else:
        rep.warn(
            f"仓库模板里的 repoDir 不可达：{repo_dir} —— "
            "面板会显示空列表。DSH 侧实际用哪个值，看 GET /api/plugin-repo/_health 的 config.repoDir"
        )


def main():
    ap = argparse.ArgumentParser(description="面板插件宿主状态诊断（只读）")
    ap.add_argument("--profile", required=True, help="DSH profile 目录（含 package.json）")
    ap.add_argument(
        "--plugin-src",
        default=None,
        help="仓库里的面板目录（默认 <仓库根>/panels/dsh-plugin-repo-manager）",
    )
    ap.add_argument("--pkg-name", default=None, help="包名（默认读 package.json 的 name）")
    args = ap.parse_args()

    plugin_src = Path(args.plugin_src) if args.plugin_src else REPO_ROOT / DEFAULT_PLUGIN_REL
    profile_dir = Path(args.profile)

    repo_pkg = read_json(plugin_src / "package.json") or {}
    pkg_name = args.pkg_name or repo_pkg.get("name") or DEFAULT_PKG_NAME

    print("=== 面板插件宿主状态诊断 ===")
    print(f"仓库根:   {REPO_ROOT}")
    print(f"面板源:   {plugin_src}")
    print(f"profile:  {profile_dir}")
    print(f"包名:     {pkg_name}")
    print()

    rep = Report()

    if not (plugin_src / "package.json").exists():
        rep.fail(f"面板源目录不含 package.json：{plugin_src}")
    if not (profile_dir / "package.json").exists():
        rep.fail(f"profile 目录不含 package.json：{profile_dir}（profile 解析错了？）")
    if rep.fails:
        print("\n=== 结果 ===")
        print(f"  失败: {rep.fails}    警告: {rep.warns}")
        return 1

    profile_pkg = read_json(profile_dir / "package.json")
    patch_name = patch_loader_name(plugin_src / "cordis.patch.yml")

    check_names(rep, pkg_name, plugin_src, profile_pkg, patch_name)
    target = check_landing(rep, pkg_name, profile_dir)
    check_payload(rep, target, plugin_src)
    check_resolve(rep, pkg_name, profile_dir)
    check_repo_dir(rep, plugin_src)

    print("\n=== 结果 ===")
    print(f"  失败: {rep.fails}    警告: {rep.warns}")
    if rep.fails:
        print("\n存在失败项。按上面每条 [FAIL] 后面给出的修法处理；")
        print("最常用的两条：")
        print("  bash scripts/update-and-install.sh      # git pull + 重装（推荐）")
        print("  bash scripts/install-to-profile.sh      # 只重装")
        print("然后重启 DSH。")
        return 1
    print("\n无失败项。")
    if rep.warns:
        print("警告项不影响加载，但值得看一眼。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
