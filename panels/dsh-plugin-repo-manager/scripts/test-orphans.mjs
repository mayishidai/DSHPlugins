/**
 * 孤立已装技能测试：「DSH 里装着、仓库里已没有」的必须可见且可卸载。
 *
 * 用法：node scripts/test-orphans.mjs
 *
 * ## 为什么需要这个文件
 *
 * 用户报的故障原话：**「面板可以移除，但是并没有真实从DSH中移除」**。
 *
 * 根因不在卸载逻辑（它一直是对的，删的就是 `skillsDir/<name>`），
 * 而在**列表**：`listPlugins` 只遍历 `repoDir`，`installedNames` 仅被用来给
 * 仓库条目「打已装标记」。于是仓库里删掉、DSH 里还留着的技能
 * **根本不出现在列表里** —— 面板上看着干净了，DSH 的 `skills/` 里那份纹丝不动，
 * 而且没有卸载入口（卸载按钮只存在于列表行内）。**不报任何错**。
 *
 * 本测试钉住三件事：
 *   1. 这类条目**出现在列表里**（回归断言：修复前这里为空）；
 *   2. 它能被 `uninstallPlugin` 删掉，**且仓库目录完全不受影响**；
 *   3. 边界：非 kebab-case 的目录（如更新残留的 `x.bak-<时间戳>`）
 *      **不得**被当成可卸载技能列出来。
 */
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ⚠️ 动态 import 绝对路径必须转成 file:// URL。
// Windows 上直接 `import('C:/.../dist/index.js')` 会抛
//   ERR_UNSUPPORTED_ESM_URL_SCHEME: Received protocol 'c:'
// —— 因为默认 ESM loader 只认 file/data/node 三种 scheme。
// （相对 specifier 如 `import('../dist/index.js')` 没这个问题，它是相对本模块解析的；
//   这里用绝对路径是为了显式表达"测的就是本包产物"。）
const mod = await import(pathToFileURL(join(ROOT, 'dist', 'index.js')).href)

let pass = 0
let fail = 0
function check(label, ok, extra = '') {
  if (ok) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${extra ? '  ' + extra : ''}`) }
}

/** 递归列出目录树（相对路径），用于证明「仓库一个字节都没动」。 */
function snapshot(dir) {
  const out = []
  const walk = (d, rel) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name)
      const r = rel ? `${rel}/${name}` : name
      if (statSync(p).isDirectory()) { walk(p, r) } else { out.push(`${r}:${readFileSync(p, 'utf-8')}`) }
    }
  }
  walk(dir, '')
  return out
}

const tmp = mkdtempSync(join(tmpdir(), 'dsh-orphans-'))
const repo = join(tmp, 'repo')
const skills = join(tmp, 'skills')

try {
  // ---- 夹具：仓库里只有 in-repo；DSH 里装着 in-repo + gone-from-repo ----
  mkdirSync(join(repo, 'in-repo'), { recursive: true })
  writeFileSync(join(repo, 'in-repo', 'manifest.json'),
    JSON.stringify({ version: '2.0.0', description: '仓库里的插件' }))

  mkdirSync(join(skills, 'in-repo'), { recursive: true })
  writeFileSync(join(skills, 'in-repo', 'manifest.json'),
    JSON.stringify({ version: '1.0.0', description: '仓库里的插件' }))
  writeFileSync(join(skills, 'in-repo', 'version.json'), JSON.stringify({ version: '1.0.0' }))

  // 关键夹具：DSH 里装着，仓库里**没有**
  mkdirSync(join(skills, 'gone-from-repo'), { recursive: true })
  writeFileSync(join(skills, 'gone-from-repo', 'manifest.json'),
    JSON.stringify({ version: '3.1.4', description: '已从仓库移除的技能' }))
  writeFileSync(join(skills, 'gone-from-repo', 'version.json'), JSON.stringify({ version: '3.1.4' }))
  writeFileSync(join(skills, 'gone-from-repo', 'SKILL.md'), '# gone-from-repo\n')

  // 边界夹具：更新残留的备份目录（点号 + 大写，非 kebab-case）
  mkdirSync(join(skills, 'in-repo.bak-2026-09-23T10-00-00-000Z'), { recursive: true })
  writeFileSync(join(skills, 'in-repo.bak-2026-09-23T10-00-00-000Z', 'SKILL.md'), '# stale backup\n')

  // ============================================================
  console.log('【1】孤立已装技能必须出现在列表里（修复前为空）')
  // ============================================================
  const list = mod.listPlugins(repo, skills)
  const names = list.map(p => p.name)
  check('列表含仓库插件与孤立技能（共 2 条）', list.length === 2, `实际 ${list.length}: ${names.join(', ')}`)
  check('孤立技能 gone-from-repo 被列出（回归断言）', names.includes('gone-from-repo'))

  const orphan = list.find(p => p.name === 'gone-from-repo')
  check('source = installed-only', orphan?.source === 'installed-only', String(orphan?.source))
  check('repoDirName = null（仓库里没有对应目录）', orphan?.repoDirName === null, String(orphan?.repoDirName))
  check('installed = true', orphan?.installed === true)
  check('hasUpdate = false（没有仓库版本可比，不谎报可更新）', orphan?.hasUpdate === false)
  check('版本显示已装版本 3.1.4', orphan?.version === '3.1.4', String(orphan?.version))
  check('描述从 DSH 侧那份自己读出（不编造）', orphan?.description === '已从仓库移除的技能', String(orphan?.description))

  // ============================================================
  console.log('\n【2】仓库插件那一侧不受影响（顺序 + 字段）')
  // ============================================================
  check('仓库条目仍排在最前', names[0] === 'in-repo', names.join(', '))
  const normal = list.find(p => p.name === 'in-repo')
  check('source = repo', normal?.source === 'repo')
  check('repoDirName = in-repo', normal?.repoDirName === 'in-repo')
  check('已装版本仍被正确读出（1.0.0）', normal?.installedVersion === '1.0.0', String(normal?.installedVersion))
  check('仍能识别可更新（仓库 2.0.0 > 已装 1.0.0）', normal?.hasUpdate === true)

  // ============================================================
  console.log('\n【3】边界：非 kebab-case 目录不得被当成可卸载技能')
  // ============================================================
  // `in-repo.bak-<时间戳>` 是更新时留下的备份目录（点在中间、含大写），
  // 它不是插件，列出它会让「卸载」按钮指向一份备份 —— 必须是排除的。
  check('备份目录未出现在列表里', !names.some(n => n.includes('.bak-')), names.join(', '))

  // ============================================================
  console.log('\n【4】卸载孤立技能：删 DSH 侧，仓库侧纹丝不动')
  // ============================================================
  const repoBefore = snapshot(repo)
  const result = mod.uninstallPlugin(skills, 'gone-from-repo')
  check('卸载返回 ok=true', result.ok === true, JSON.stringify(result))
  check('DSH 侧目录已删除', !existsSync(join(skills, 'gone-from-repo')))
  const repoAfter = snapshot(repo)
  check('仓库目录逐字节未变', JSON.stringify(repoBefore) === JSON.stringify(repoAfter))
  check('仓库里另一个插件仍在', existsSync(join(repo, 'in-repo', 'manifest.json')))

  const after = mod.listPlugins(repo, skills)
  check('卸载后列表只剩仓库插件那 1 条', after.length === 1 && after[0].name === 'in-repo',
    after.map(p => p.name).join(', '))
  // 注意夹具：in-repo 一直装在 skills 里，所以这里应为 true ——
  // 删掉孤立技能不该顺手把同目录下的正常插件也标成未安装。
  check('同目录下的正常插件仍标记为已安装', after[0].installed === true)
  check('孤立条目确实从列表消失', !after.some(p => p.source === 'installed-only'))

  // ============================================================
  console.log('\n【5】仓库目录不存在时，孤立技能仍要列出来')
  // ============================================================
  // 仓库未挂载 / 路径写错时，DSH 侧的东西照样要能看见、能卸 ——
  // 否则「仓库一坏，面板就彻底没法清理 DSH」。
  const mk = mkdtempSync(join(tmpdir(), 'dsh-orphans-only-'))
  mkdirSync(join(mk, 'still-here'), { recursive: true })
  writeFileSync(join(mk, 'still-here', 'manifest.json'), JSON.stringify({ version: '1.0.0' }))
  const onlyOrphans = mod.listPlugins('/definitely/not/exists', mk)
  check('仓库不存在时仍列出 1 条孤立技能',
    onlyOrphans.length === 1 && onlyOrphans[0].name === 'still-here',
    JSON.stringify(onlyOrphans.map(p => p.name)))
  check('其 source = installed-only', onlyOrphans[0]?.source === 'installed-only')
  rmSync(mk, { recursive: true, force: true })

  // 两个目录都不存在 → 空数组（保持既有语义，别把"啥都没有"变成"出错了"）
  const nothing = mod.listPlugins('/definitely/not/exists', '/also/not/exists')
  check('两边都不存在 → 空数组', Array.isArray(nothing) && nothing.length === 0)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log(`\n结果: ${pass} 通过 / ${fail} 失败 / 共 ${pass + fail} 例`)
process.exit(fail === 0 ? 0 : 1)
