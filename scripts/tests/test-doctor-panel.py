#!/usr/bin/env python3
"""doctor-panel-plugin.py 的反向回归。

## 为什么需要它

医生的**正向**用法（「一切都对 → 全绿」）单独存在是没有价值的 ——
一个永远返回「全绿」的检查器和没有检查器一样，而**后者至少不会骗人**。

所以本测试逐条注入「真实会发生的坏状态」，断言医生**确实变红**，
并且红在**正确的那一条**上（只断言 rc != 0 是不够的：别的检查顺带失败也算过）。

注入的坏状态全部来自本仓库的真实事故史（见 docs/FAQ.md 的 Q4b）：
  · 落点不存在 / 被换成自指软链（`file:` 依赖被 npm 处理后的形态）
  · 历史错误落点 `node_modules/@deepseek-ai/<包名>`（2026-09-18 事故）
  · 已装副本缺默认导出（加载器取 .default 分支时拿到 undefined）
  · 已装副本太旧（git pull 之后忘了重装）
  · profile 未登记 dependencies / dsh.profile.bundles
  · cordis.patch.yml 的 loader name 与包名不一致

## 用法

    python3 scripts/tests/test-doctor-panel.py

退出码：0 = 全部符合预期；1 = 存在不符合预期的用例。
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DOCTOR = ROOT / "scripts" / "doctor-panel-plugin.py"
PANEL = ROOT / "panels" / "dsh-plugin-repo-manager"
PKG = "dsh-plugin-repo-manager"

COPIED = ("dist", "client", "cordis.patch.yml", "manifest.json", "package.json")

passed = 0
failed = 0
skipped = 0


def ok(msg):
    global passed
    print(f"  [OK]   {msg}")
    passed += 1


def bad(msg):
    global failed
    print(f"  [FAIL] {msg}")
    failed += 1


def skip(msg):
    global skipped
    print(f"  [SKIP] {msg}")
    skipped += 1


class SkipCase(Exception):
    """环境不支持该注入（例如 Windows 无权限建软链接）—— 如实跳过，不伪装成通过。"""


def build_profile(base: Path) -> Path:
    """搭一个「刚跑完安装脚本」的 profile 镜像。"""
    prof = base / "profile"
    target = prof / "node_modules" / PKG
    target.mkdir(parents=True)
    for name in COPIED:
        src = PANEL / name
        dst = target / name
        if src.is_dir():
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)
    (prof / "package.json").write_text(
        json.dumps(
            {
                "name": "web",
                "private": True,
                "dependencies": {PKG: f"file:./node_modules/{PKG}"},
                "dsh": {"profile": {"bundles": [PKG]}},
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return prof


def build_plugin_src(base: Path) -> Path:
    """面板源目录的副本（用于注入「loader name 与包名不一致」）。"""
    dst = base / "panel-src"
    shutil.copytree(PANEL, dst)
    return dst


def run_doctor(profile: Path, plugin_src: Path):
    r = subprocess.run(
        [
            sys.executable,
            str(DOCTOR),
            "--profile",
            str(profile),
            "--plugin-src",
            str(plugin_src),
            "--pkg-name",
            PKG,
        ],
        capture_output=True,
        text=True,
        timeout=300,
    )
    return r.returncode, (r.stdout or "") + (r.stderr or "")


# ---------------- 注入器 ----------------

def m_none(prof, base):
    return None


def m_remove_target(prof, base):
    shutil.rmtree(prof / "node_modules" / PKG)


def m_self_symlink(prof, base):
    t = prof / "node_modules" / PKG
    shutil.rmtree(t)
    try:
        os.symlink(PKG, t, target_is_directory=True)  # 指向自己
    except (OSError, NotImplementedError) as e:
        raise SkipCase(f"无法创建软链接（Windows 需开发者模式/管理员）：{e}")


def m_legacy_dir(prof, base):
    legacy = prof / "node_modules" / "@deepseek-ai" / PKG
    legacy.mkdir(parents=True)
    (legacy / "package.json").write_text('{"name":"x"}', encoding="utf-8")


def m_strip_default_export(prof, base):
    f = prof / "node_modules" / PKG / "dist" / "index.js"
    text = f.read_text(encoding="utf-8")
    lines = [ln for ln in text.splitlines(keepends=True) if not ln.startswith("export default")]
    if len(lines) == len(text.splitlines(keepends=True)):
        raise SkipCase("dist/index.js 里找不到 'export default' 行，注入点不存在")
    f.write_text("".join(lines), encoding="utf-8")


def m_drop_client(prof, base):
    (prof / "node_modules" / PKG / "client" / "client.js").unlink()


def m_drop_dep(prof, base):
    f = prof / "package.json"
    data = json.loads(f.read_text(encoding="utf-8"))
    data.pop("dependencies", None)
    f.write_text(json.dumps(data, indent=2), encoding="utf-8")


def m_drop_bundle(prof, base):
    f = prof / "package.json"
    data = json.loads(f.read_text(encoding="utf-8"))
    data["dsh"]["profile"]["bundles"] = []
    f.write_text(json.dumps(data, indent=2), encoding="utf-8")


def m_drop_patch_of_profile(prof, base):
    (prof / "node_modules" / PKG / "cordis.patch.yml").unlink()


def m_stale_version(prof, base):
    f = prof / "node_modules" / PKG / "package.json"
    data = json.loads(f.read_text(encoding="utf-8"))
    data["version"] = "9.9.9"
    f.write_text(json.dumps(data, indent=2), encoding="utf-8")


def m_bad_dep_spec(prof, base):
    """注：安装脚本**默认**就写成这个形态，这里不改动 ——
    本用例守的是「它必须只是 WARN」。若哪天有人把它升级成 FAIL，
    每次安装都会以非 0 退出，而那条 while 循环的修法提示也会变成常驻噪音。"""
    return None


def m_patch_name_mismatch(prof, base, plugin_src):
    f = plugin_src / "cordis.patch.yml"
    text = f.read_text(encoding="utf-8")
    if "name: 'dsh-plugin-repo-manager'" not in text:
        raise SkipCase("cordis.patch.yml 里找不到 loader name 行，注入点不存在")
    f.write_text(
        text.replace("name: 'dsh-plugin-repo-manager'", "name: 'renamed-pkg'"),
        encoding="utf-8",
    )


# ---------------- 用例表 ----------------
# (标题, 注入器, 期望 rc, 期望出现的关键字, 是否用独立面板源副本)
CASES = [
    ("基线（刚装完）必须全绿", m_none, 0, "失败: 0", False),
    ("落点被删", m_remove_target, 1, "落点不存在", False),
    ("落点被换成自指软链", m_self_symlink, 1, "软链接且解析不通", False),
    ("历史错误落点 @deepseek-ai/", m_legacy_dir, 1, "历史错误落点", False),
    ("已装副本缺默认导出", m_strip_default_export, 1, "缺少默认导出", False),
    ("已装副本缺 client/client.js", m_drop_client, 1, "已装副本缺文件", False),
    ("已装副本缺 cordis.patch.yml", m_drop_patch_of_profile, 1, "已装副本缺文件", False),
    ("profile 未登记 dependencies", m_drop_dep, 1, "dependencies 里没有", False),
    ("profile 未登记 dsh.profile.bundles", m_drop_bundle, 1, "dsh.profile.bundles 里没有", False),
    ("已装副本版本落后 → 只应 WARN，不该 FAIL", m_stale_version, 0, "已装副本是 v9.9.9", False),
    ("默认的 file: 依赖写法 → 只应 WARN，不该 FAIL", m_bad_dep_spec, 0, "file: 依赖指向 node_modules 内部", False),
    ("loader name 与包名不一致", m_patch_name_mismatch, 1, "与 ① 不一致", True),
]


def main():
    print(f"=== doctor-panel-plugin.py 反向回归（{len(CASES)} 例）===\n")
    if not DOCTOR.exists():
        bad(f"医生脚本不存在：{DOCTOR}")
        print("\n=== 结果 ===")
        print(f"  通过: {passed}    失败: {failed}    跳过: {skipped}")
        return 1

    tmp = Path(tempfile.mkdtemp(prefix="doctor-neg-"))
    try:
        for idx, (title, mutate, want_rc, needle, use_own_src) in enumerate(CASES):
            base = tmp / f"case{idx:02d}"
            base.mkdir(parents=True)
            prof = build_profile(base)
            plugin_src = build_plugin_src(base) if use_own_src else PANEL
            try:
                if use_own_src:
                    mutate(prof, base, plugin_src)
                else:
                    mutate(prof, base)
            except SkipCase as e:
                skip(f"{title} —— {e}")
                continue

            rc, out = run_doctor(prof, plugin_src)
            problems = []
            if rc != want_rc:
                problems.append(f"退出码 {rc} ≠ 期望 {want_rc}")
            if needle not in out:
                problems.append(f"输出里没有关键字 {needle!r}")

            if problems:
                bad(f"{title} —— " + "；".join(problems))
                print("         ── 医生输出 ──")
                for line in out.strip().splitlines():
                    print(f"         {line}")
                print("         ──────────────")
            else:
                ok(f"{title}（rc={rc}，命中 “{needle}”）")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print("\n=== 结果 ===")
    print(f"  通过: {passed}    失败: {failed}    跳过: {skipped}\n")
    if failed:
        print("存在不符合预期的用例 —— 医生的判据已经不可信了。")
        return 1
    print("全部符合预期。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
