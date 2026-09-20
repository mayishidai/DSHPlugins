/**
 * ESM 安全 + 描述字段测试。
 *
 * 用法：node scripts/test-esm-safety.mjs
 *
 * ## 这个测试是为了钉死一个「静默失效」的线上 bug（2026-09-20）
 *
 * 症状：面板里点「卸载」**毫无反应** —— 列表不刷新、也没有可见报错。
 *
 * 根因：`src/index.ts` 的 `uninstallPlugin` / `installPlugin` 里写了
 *   `const rel = require('path').relative(skillsDir, targetDir)`
 * 而本包是 `"type": "module"`（ESM），**ESM 没有 `require`** →
 * 抛 `ReferenceError: require is not defined`。异常被 handler 的 catch 兜住，
 * 只回 `{ ok:false, error:{ code:'INTERNAL_ERROR' } }`，HTTP 状态**仍是 200**，
 * 前端当时又「只在控制台记录失败」，于是用户看到的就是「点了没反应」。
 *
 * ## 为什么普通单测抓不到（这个测试必须这样写）
 *
 * 用 `node -e` 或 CJS 方式 require 产物时，Node 会**注入 `require`**，
 * 于是同样的代码**跑得通**、测试全绿 —— 环境与 DSH 不一致，测了个寂寞。
 * 所以本测试坚持两条：
 *   1. 静态断言构建产物里**没有真正的 `require(` 调用**（剔除注释后再匹配）；
 *   2. 动态**在真实 ESM 模块里**调用这两个函数，任何 throw 都算失败。
 *
 * 另外一并钉住「描述字段」：面板只有名字/版本/状态、缺描述，
 * 而后端 `listPlugins` 从未读取过描述 —— 数据明明在 manifest.json 里。
 */
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

let pass = 0
let fail = 0
function check(label, ok) {
  if (ok) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

// ============================================================
console.log('【1】构建产物不得含真正的 require( 调用（ESM 下 require 未定义）')
// ============================================================
const distSrc = readFileSync(join(ROOT, 'dist', 'index.js'), 'utf-8')

// 剔除注释：本文件的 docstring 里**故意**引用了旧写法作为反面教材，
// 不剔除就会误报（这个坑在 test-route-prefix.mjs 里踩过一次）。
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')      // 块注释
    .replace(/^\s*\/\/.*$/gm, '')          // 行注释
}
const distCode = stripComments(distSrc)

check('dist/index.js 代码中无 require( 调用', !/\brequire\s*\(/.test(distCode))
check('dist 不含 "require is not defined" 的触发点', !/require\(['"]path['"]\)/.test(distCode))

// 顺带确认 import 写法在位（修好后应使用已导入的 path 模块）
check('dist 从 node:path 导入 relative', /relative/.test(distSrc))

// ============================================================
console.log('\n【2】真实 ESM 环境下调用 install / uninstall 不得抛异常')
// ============================================================
// ⚠️ 关键：必须 import 真实产物，而不是在本文件里重新实现一遍逻辑。
//    否则测的是「测试自己」，改了 src 也照样绿（本项目栽过这个坑）。
const mod = await import('../dist/index.js')

const tmp = mkdtempSync(join(tmpdir(), 'dsh-esm-safety-'))
const repo = join(tmp, 'repo')
const skills = join(tmp, 'skills')

try {
  mkdirSync(join(repo, 'lucky-api'), { recursive: true })
  writeFileSync(join(repo, 'lucky-api', 'manifest.json'),
    JSON.stringify({ version: '1.1.0', description: '测试用描述' }))
  mkdirSync(skills, { recursive: true })

  // —— installPlugin：旧代码在这一行抛 require is not defined ——
  let installRes, installThrew = null
  try {
    installRes = mod.installPlugin(repo, skills, 'lucky-api')
  } catch (e) { installThrew = e }
  check('installPlugin 不抛异常', installThrew === null)
  if (installThrew) console.log(`      → ${installThrew.message}`)
  check('installPlugin 返回 ok=true', installRes?.ok === true)
  check('安装后 skills/lucky-api 真的存在',
    installRes?.ok === true && (() => {
      try { readFileSync(join(skills, 'lucky-api', 'manifest.json')); return true } catch { return false }
    })())

  // —— uninstallPlugin：用户「点了没反应」的那个接口 ——
  let uninstallRes, uninstallThrew = null
  try {
    uninstallRes = mod.uninstallPlugin(skills, 'lucky-api')
  } catch (e) { uninstallThrew = e }
  check('uninstallPlugin 不抛异常', uninstallThrew === null)
  if (uninstallThrew) console.log(`      → ${uninstallThrew.message}`)
  check('uninstallPlugin 返回 ok=true', uninstallRes?.ok === true)

  let gone = false
  try { readFileSync(join(skills, 'lucky-api', 'manifest.json')) } catch { gone = true }
  check('卸载后目录真的被删掉', gone)

  // ============================================================
  console.log('\n【3】路径穿越防护必须照旧有效（修 bug 不能把安全一起改掉）')
  // ============================================================
  check('非法名称被拦（INVALID_NAME）',
    mod.uninstallPlugin(skills, '../etc').error?.code === 'INVALID_NAME')
  check('isInsideDir 拒绝上跳',
    mod.isInsideDir('/a/skills', '/a/skills/../etc') === false)
  check('isInsideDir 拒绝同前缀不同目录（skills vs skills-other）',
    mod.isInsideDir('/a/skills', '/a/skills-other/x') === false)
  check('isInsideDir 接受正常子目录',
    mod.isInsideDir('/a/skills', '/a/skills/foo') === true)

  // ============================================================
  console.log('\n【4】描述字段：面板要显示，就必须先被后端读出来')
  // ============================================================
  // 4a. manifest.json 优先
  mkdirSync(join(repo, 'from-manifest'), { recursive: true })
  writeFileSync(join(repo, 'from-manifest', 'manifest.json'),
    JSON.stringify({ version: '1.0.0', description: '来自 manifest' }))
  check('从 manifest.json 读描述',
    mod.getPluginDescription(join(repo, 'from-manifest')) === '来自 manifest')

  // 4b. 无 manifest.description 时回退 SKILL.md frontmatter（并去掉引号）
  mkdirSync(join(repo, 'from-skillmd'), { recursive: true })
  writeFileSync(join(repo, 'from-skillmd', 'manifest.json'), JSON.stringify({ version: '1.0.0' }))
  writeFileSync(join(repo, 'from-skillmd', 'SKILL.md'),
    '---\nname: x\ndescription: "来自 SKILL.md"\n---\n\n# 正文\n\ndescription: 这行在正文里，不该被读到\n')
  check('回退 SKILL.md frontmatter 并去掉引号',
    mod.getPluginDescription(join(repo, 'from-skillmd')) === '来自 SKILL.md')

  // 4c. 都没有 → null（不编造内容）
  mkdirSync(join(repo, 'no-desc'), { recursive: true })
  writeFileSync(join(repo, 'no-desc', 'manifest.json'), JSON.stringify({ version: '1.0.0' }))
  check('无任何描述来源时返回 null', mod.getPluginDescription(join(repo, 'no-desc')) === null)

  // 4d. listPlugins 必须把 description 带出来
  const list = mod.listPlugins(repo, skills)
  const entry = list.find(p => p.name === 'from-manifest')
  check('listPlugins 返回体含 description 字段',
    entry !== undefined && 'description' in entry)
  check('listPlugins 的 description 值正确',
    entry?.description === '来自 manifest')
  check('listPlugins 对无描述的插件给 null（不省略字段）',
    list.find(p => p.name === 'no-desc')?.description === null)

  // ============================================================
  console.log('\n【5】/_health 必须带自检结论（一条 curl 定位这类故障）')
  // ============================================================
  check('dist 暴露 isInsideDir 供自检使用', typeof mod.isInsideDir === 'function')
  check('dist 含 selfTest 字段', /selfTest/.test(distSrc))
  check('dist 的 catch 会打印堆栈（否则只看到一行 message）',
    /error\.stack|\.stack/.test(distCode))
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log(`\n结果: ${pass} 通过 / ${fail} 失败 / 共 ${pass + fail} 例`)
if (fail > 0) {
  console.log('\n提示：本测试若在 [1][2] 失败，多半是又有人在 ESM 代码里用了 require。')
  console.log('      症状会是「点卸载/安装没反应」——HTTP 200 但 error.code=INTERNAL_ERROR。')
}
process.exit(fail === 0 ? 0 : 1)
