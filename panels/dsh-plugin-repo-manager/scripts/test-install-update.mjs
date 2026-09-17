/**
 * installPlugin 更新流程端到端测试（零依赖，临时目录，不碰生产环境）。
 *
 * 由于 src/index.ts 是 TS 且依赖 DSH 宿主类型，这里把被测逻辑的关键部分
 * 以等价 JS 重写，验证行为契约：
 *   1. 首次安装 → updated=false，无 backupDir
 *   2. 已有版本更新 → updated=true，产生 .bak-* 备份，旧文件被清掉（不残留）
 *   3. 旧 version.json 缺失时 → 仍然备份（不裸覆盖）
 *   4. 备份内容完整（含空目录）
 *
 * 用法：node scripts/test-install-update.mjs
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, statSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'

// ---- 被测逻辑（与 src/index.ts 保持等价） ----
function getPluginVersion(pluginDir) {
  for (const file of ['manifest.json', 'package.json', 'version.json']) {
    const p = join(pluginDir, file)
    if (!existsSync(p)) continue
    try {
      const data = JSON.parse(readFileSync(p, 'utf-8'))
      if (data?.version) return data.version
    } catch { /* 继续 */ }
  }
  return null
}

function installPlugin(repoDir, skillsDir, name) {
  const sourceDir = join(repoDir, name)
  if (!existsSync(sourceDir)) return { ok: false, error: { code: 'NOT_FOUND' } }
  const targetDir = join(skillsDir, name)

  mkdirSync(dirname(targetDir), { recursive: true })

  const wasInstalled = existsSync(targetDir)
  const oldVersionJson = wasInstalled ? join(targetDir, 'version.json') : null
  const oldVersionData = oldVersionJson && existsSync(oldVersionJson)
    ? (() => { try { return JSON.parse(readFileSync(oldVersionJson, 'utf-8')) } catch { return null } })()
    : null
  const fromVersion = oldVersionData?.version ?? null
  const isUpdate = wasInstalled

  const copyDir = (src, dst) => {
    const st = statSync(src)
    if (!st.isDirectory()) {
      mkdirSync(dirname(dst), { recursive: true })
      copyFileSync(src, dst)
      return
    }
    if (!existsSync(dst)) mkdirSync(dst, { recursive: true })
    for (const file of readdirSync(src)) copyDir(join(src, file), join(dst, file))
  }

  let backupDir = null
  if (isUpdate) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    backupDir = `${targetDir}.bak-${stamp}`
    try {
      copyDir(targetDir, backupDir)
    } catch (e) {
      return { ok: false, error: { code: 'BACKUP_FAILED', message: e.message } }
    }
    for (const file of readdirSync(targetDir)) {
      rmSync(join(targetDir, file), { recursive: true, force: true })
    }
  }

  copyDir(sourceDir, targetDir)

  const version = getPluginVersion(sourceDir)
  if (version) {
    const versionJson = join(targetDir, 'version.json')
    const record = {
      version,
      installedAt: oldVersionData?.installedAt ?? new Date().toISOString(),
    }
    if (isUpdate) {
      record.updatedAt = new Date().toISOString()
      record.previousVersion = fromVersion
      if (backupDir) record.backupDir = backupDir
    }
    writeFileSync(versionJson, JSON.stringify(record, null, 2))
  }

  return { ok: true, name, installed: true, updated: isUpdate, from: fromVersion, to: version, backupDir }
}

// ---- 测试脚手架 ----
let pass = 0, fail = 0
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label} ${extra}`) }
}

const base = join(tmpdir(), `dsh-test-${Date.now()}`)
const repo = join(base, 'repo')
const skills = join(base, 'skills')

function makePlugin(name, version, files) {
  const d = join(repo, name)
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'manifest.json'), JSON.stringify({ name, version }, null, 2))
  for (const [rel, content] of Object.entries(files ?? {})) {
    const p = join(d, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, content)
  }
}

try {
  console.log('\n[用例 1] 首次安装')
  makePlugin('demo-a', '1.0.0', { 'SKILL.md': '# demo-a v1' })
  let r = installPlugin(repo, skills, 'demo-a')
  check('ok=true', r.ok === true)
  check('updated=false', r.updated === false)
  check('无 backupDir', !r.backupDir)
  check('version.json 已写入 1.0.0', JSON.parse(readFileSync(join(skills, 'demo-a', 'version.json'), 'utf-8')).version === '1.0.0')
  check('无 .bak 目录', !readdirSync(skills).some(f => f.includes('.bak-')))

  console.log('\n[用例 2] 更新（仓库升到 1.1.0，上游删掉一个文件）')
  makePlugin('demo-a', '1.1.0', { 'SKILL.md': '# demo-a v2', 'extra.txt': 'new' })
  writeFileSync(join(skills, 'demo-a', 'stale.txt'), 'should be gone')

  r = installPlugin(repo, skills, 'demo-a')
  const bak = readdirSync(skills).find(f => f.startsWith('demo-a.bak-'))
  check('ok=true', r.ok === true)
  check('updated=true', r.updated === true)
  check('from=1.0.0', r.from === '1.0.0')
  check('to=1.1.0', r.to === '1.1.0')
  check('产生 .bak 备份', !!bak)
  check('备份里含旧 SKILL.md', bak && readFileSync(join(skills, bak, 'SKILL.md'), 'utf-8') === '# demo-a v1')
  check('备份里含旧 stale.txt', bak && existsSync(join(skills, bak, 'stale.txt')))
  check('新版 SKILL.md 已更新', readFileSync(join(skills, 'demo-a', 'SKILL.md'), 'utf-8') === '# demo-a v2')
  check('新版含 extra.txt', existsSync(join(skills, 'demo-a', 'extra.txt')))
  check('stale.txt 已清除（无残留）', !existsSync(join(skills, 'demo-a', 'stale.txt')))
  const vj = JSON.parse(readFileSync(join(skills, 'demo-a', 'version.json'), 'utf-8'))
  check('version.json 记 previousVersion=1.0.0', vj.previousVersion === '1.0.0')
  check('version.json 有 updatedAt', !!vj.updatedAt)
  check('version.json 有 backupDir', !!vj.backupDir)
  check('version.json 保留 installedAt', !!vj.installedAt)

  console.log('\n[用例 3] 旧 version.json 缺失/损坏 → 仍须备份，不许裸覆盖')
  const skills3 = join(base, 'skills3')
  makePlugin('demo-b', '1.0.0', { 'SKILL.md': 'v1' })
  installPlugin(repo, skills3, 'demo-b')
  rmSync(join(skills3, 'demo-b', 'version.json'))       // 模拟缺 version.json
  writeFileSync(join(skills3, 'demo-b', 'precious.txt'), '用户重要数据')
  makePlugin('demo-b', '2.0.0', { 'SKILL.md': 'v2' })
  r = installPlugin(repo, skills3, 'demo-b')
  const bak3 = readdirSync(skills3).find(f => f.startsWith('demo-b.bak-'))
  check('updated=true（目录存在即算更新）', r.updated === true)
  check('仍产生备份', !!bak3)
  check('备份保住了 precious.txt', bak3 && existsSync(join(skills3, bak3, 'precious.txt')))

  console.log('\n[用例 4] 备份需包含空目录')
  const skills4 = join(base, 'skills4')
  makePlugin('demo-c', '1.0.0', { 'SKILL.md': 'v1' })
  installPlugin(repo, skills4, 'demo-c')
  mkdirSync(join(skills4, 'demo-c', 'emptydir'), { recursive: true })
  makePlugin('demo-c', '1.1.0', { 'SKILL.md': 'v2' })
  r = installPlugin(repo, skills4, 'demo-c')
  const bak4 = readdirSync(skills4).find(f => f.startsWith('demo-c.bak-'))
  check('备份内含空目录', bak4 && existsSync(join(skills4, bak4, 'emptydir')))

  console.log('\n[用例 5] package.json 作为版本来源（面板型）')
  const repo5 = join(base, 'repo5')
  const d5 = join(repo5, 'demo-panel')
  mkdirSync(d5, { recursive: true })
  writeFileSync(join(d5, 'package.json'), JSON.stringify({ name: 'demo-panel', version: '1.1.0' }, null, 2))
  check('从 package.json 读到 1.1.0', getPluginVersion(d5) === '1.1.0')

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败 / 共 ${pass + fail} 例`)
} finally {
  try { rmSync(base, { recursive: true, force: true }) } catch { /* 清理失败不影响结论 */ }
}

process.exit(fail === 0 ? 0 : 1)
