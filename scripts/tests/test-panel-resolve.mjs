#!/usr/bin/env node
/**
 * 面板插件「能被 DSH 解析并加载」的回归测试。
 *
 * ## 为什么需要它
 *
 * 2026-09-18 线上事故：DSH 启动报
 *   failed to apply loader entry … (dsh-plugin-repo-manager):
 *   invalid plugin, expect function or object with an "apply" method, received undefined
 *
 * 这个报错**极易误判**成「代码里 apply 写错了」。实际根因是两个独立性缺陷：
 *   ① 包装在 `node_modules/@deepseek-ai/`，而挂载配置/package.json/dependencies
 *      用的都是不带作用域的 `dsh-plugin-repo-manager` → Node 根本解析不到这个包。
 *   ② 编译产物只有具名导出，`(await import(name)).default === undefined`
 *      → 若加载器取 `.default` 分支，同样拿到 undefined。
 *   两者症状**一字不差**，光看报错无法区分。所以必须分别测。
 *
 * 本测试在临时目录里**完整模拟 profile 的目录布局**，按包名真实 import 一次，
 * 把上面两点都验掉。任何一项退化都会失败。
 *
 * ## 用法
 *   node scripts/tests/test-panel-resolve.mjs
 *
 * 退出码: 0 = 通过；1 = 存在缺陷
 */
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const PANEL_SRC = join(ROOT, 'panels', 'dsh-plugin-repo-manager')
const PROBE = join(HERE, 'panel-resolve-probe.mjs')

let pass = 0
let fail = 0

function ok(msg) { console.log(`  [OK]   ${msg}`); pass++ }
function bad(msg) { console.log(`  [FAIL] ${msg}`); fail++ }

// ---- 读取面板自身的清单 ----
const pkg = JSON.parse(readFileSync(join(PANEL_SRC, 'package.json'), 'utf8'))
const pkgName = pkg.name

// ---- 校验 cordis.patch.yml 的 loader name 与包名一致 ----
const patch = readFileSync(join(PANEL_SRC, 'cordis.patch.yml'), 'utf8')
const m = patch.match(/^\s*name:\s*['"]?([^'"\s]+)['"]?\s*$/m)
const patchName = m ? m[1] : null

console.log(`=== 面板可加载性测试: ${pkgName} ===\n`)
console.log('1. 名字一致性')
if (patchName === pkgName) {
  ok(`cordis.patch.yml 的 name 与 package.json 一致（${pkgName}）`)
} else {
  bad(`cordis.patch.yml 的 name='${patchName}' ≠ package.json name='${pkgName}'`)
}

// ---- 搭临时 profile：包必须落在 node_modules/<包名> ----
const tmp = join(tmpdir(), `panel-resolve-test-${process.pid}`)
rmSync(tmp, { recursive: true, force: true })
const pkgDir = join(tmp, 'node_modules', pkgName)

// 解析时用**加载器实际使用的名字** —— 也就是 cordis.patch.yml 里的那个，
// 而不是 package.json 的 name。两者不一致时，落点判定的意义才体现出来。
const resolveName = patchName || pkgName

try {
  console.log('\n2. 按包名真实解析（模拟 profile 布局）')
  mkdirSync(pkgDir, { recursive: true })
  for (const f of ['dist', 'client', 'cordis.patch.yml', 'manifest.json', 'package.json']) {
    cpSync(join(PANEL_SRC, f), join(pkgDir, f), { recursive: true })
  }
  // profile 根 package.json（让 node_modules 的解析以此为基准）
  writeFileSync(
    join(tmp, 'package.json'),
    JSON.stringify({ name: 'profile', private: true, dependencies: { [pkgName]: `file:./node_modules/${pkgName}` } }, null, 2),
  )
  cpSync(PROBE, join(tmp, 'probe.mjs'))

  const r = spawnSync(process.execPath, [join(tmp, 'probe.mjs'), resolveName], {
    cwd: tmp, encoding: 'utf8',
  })
  const line = (r.stdout || '').trim().split('\n').filter(Boolean).pop()
  let res
  try {
    res = JSON.parse(line)
  } catch {
    bad(`探针未返回可解析结果。stdout=${JSON.stringify(r.stdout)} stderr=${JSON.stringify(r.stderr)}`)
    res = null
  }

  if (res) {
    if (res.resolved) {
      ok(`按加载器的名字 '${resolveName}' 解析成功`)
      ok(`导出键: ${res.keys.join(', ')}`)
    } else {
      bad(`按加载器的名字 '${resolveName}' 解析失败（${res.error}）`
        + ` —— 落点必须正好是 node_modules/<加载器使用的名字>`)
    }

    if (res.resolved) {
      if (res.hasApply) ok('具名导出 apply 存在')
      else bad('缺少具名导出 apply')

      if (res.hasDefault) ok('默认导出为合法插件对象（含 apply）')
      else bad('默认导出缺失或不含 apply —— 加载器若取 .default 分支会拿到 undefined')

      if (res.viaNamed && res.viaDefault && res.viaCoalesce) {
        ok('三种加载器实现均可取到合法插件（mod.apply / mod.default / default??mod）')
      } else {
        bad(`加载器实现兼容性不足: named=${res.viaNamed} default=${res.viaDefault} coalesce=${res.viaCoalesce}`)
      }
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log('\n=== 结果 ===')
console.log(`  通过: ${pass}    失败: ${fail}\n`)
if (fail) {
  console.log('存在失败项。')
  process.exit(1)
}
console.log('全部通过。')
