/**
 * skillsDir 解析与「错位告警」测试。
 *
 * 用法：node scripts/test-skills-dir.mjs
 *
 * ## 为什么需要这个文件
 *
 * 用户报的现象是「点了安装和卸载都没生效」。根因不是接口报错，而是
 * **插件读写的位置 ≠ DSH 扫描的位置**：
 *   - DSH 只扫描 `$DSH_HOME/skills/`（NAS 上 = /vol2/@appdata/deepseek.harness/dsh-data/skills）
 *   - 旧配置却把 `skillsDir` 写死成 `~/.dsh/skills`（容器内 /root/.dsh/skills）
 *
 * 这类错位的可怕之处是**全程不报错**：面板显示「已安装」、文件确实写进磁盘、
 * 接口全部 `ok:true`，但 DSH 永远看不到；卸载也只删掉那份没人看的副本。
 * 所以必须机器钉住三件事：
 *   ① 优先级正确（显式配置 > DSH_HOME > ~/.dsh）
 *   ② 兜底只在**毫无歧义**时发生（多个候选都有技能就绝不猜）
 *   ③ 一旦错位，`describeSkillsDir` 必须给出 warning —— 这正是面板横幅的来源
 *
 * ## 为什么直接 import dist 而不是重写一遍
 *
 * 本仓库吃过大亏：测试里「重新实现一遍被测逻辑」，结果是**测测试自己**，
 * 产品代码改坏了它照样绿。所以这里一律 import 真实产物。
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const distUrl = pathToFileURL(join(process.cwd(), 'dist', 'index.js')).href
const { skillsDirCandidates, resolveSkillsDirWithSource, describeSkillsDir } = await import(distUrl)

let pass = 0, fail = 0
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label} ${extra}`) }
}

// ---------- 临时目录搭建 ----------
const root = mkdtempSync(join(tmpdir(), 'skillsdir-'))
/** 造一个「像样的 skills 目录」：里面有 N 个含 SKILL.md 的 kebab-case 子目录 */
function makeSkillsDir(parent, names) {
  const dir = join(parent, 'skills')
  mkdirSync(dir, { recursive: true })
  for (const n of names) {
    mkdirSync(join(dir, n), { recursive: true })
    writeFileSync(join(dir, n, 'SKILL.md'), `# ${n}\n`)
  }
  return dir
}
/** 造一个空的 skills 目录（存在但不含任何技能） */
function makeEmptyDir(parent, name = 'skills') {
  const dir = join(parent, name)
  mkdirSync(dir, { recursive: true })
  return dir
}

const SAVED = { DSH_HOME: process.env['DSH_HOME'], DSH_PLUGIN_SKILLS_DIR: process.env['DSH_PLUGIN_SKILLS_DIR'] }
function setEnv(dshHome, pluginSkills) {
  if (dshHome === undefined) delete process.env['DSH_HOME']; else process.env['DSH_HOME'] = dshHome
  if (pluginSkills === undefined) delete process.env['DSH_PLUGIN_SKILLS_DIR']; else process.env['DSH_PLUGIN_SKILLS_DIR'] = pluginSkills
}
const ctxNone = { get: () => undefined }

try {
  // ================= 1. 候选清单 =================
  console.log('\n[1. 候选清单必须把「可能的落点」都列出来]')
  setEnv(undefined, undefined)
  const bare = skillsDirCandidates()
  check('含默认的 ~/.dsh/skills 候选', bare.some(c => c.source === 'default:~/.dsh'))
  check('含文档记载的 NAS 数据根候选（兜底用）',
    bare.some(c => c.dir === '/vol2/@appdata/deepseek.harness/dsh-data/skills'))
  check('每个候选都带 exists / skillCount 现状',
    bare.every(c => typeof c.exists === 'boolean' && typeof c.skillCount === 'number'))
  check('候选已去重', new Set(bare.map(c => c.dir)).size === bare.length)

  setEnv('/tmp/fakehome', undefined)
  const withHome = skillsDirCandidates()
  check('导出 DSH_HOME 后多出 env:DSH_HOME 候选',
    withHome.some(c => c.source === 'env:DSH_HOME'))
  check('该候选路径 = <DSH_HOME>/skills',
    withHome.some(c => c.source === 'env:DSH_HOME' && c.dir === join('/tmp/fakehome', 'skills')))
  setEnv(undefined, undefined)

  // ================= 2. 优先级：显式配置永远赢 =================
  console.log('\n[2. 显式配置必须赢过任何启发式]')
  const envSkills = makeSkillsDir(join(root, 'envhome'), ['lucky-api', 'jdgold'])
  setEnv(join(root, 'envhome'), undefined)
  const explicitCtx = { get: () => ({ skillsDir: '/explicit/from/config' }) }
  const r1 = resolveSkillsDirWithSource(explicitCtx)
  check('config.skillsDir 命中', r1.dir === '/explicit/from/config', `实际=${r1.dir}`)
  check('来源标记为 config.skillsDir', r1.source === 'config.skillsDir')
  check('即使别处装着技能也不纠偏（人的意图优先）', r1.dir === '/explicit/from/config')

  setEnv(undefined, envSkills)
  const r2 = resolveSkillsDirWithSource(ctxNone)
  check('DSH_PLUGIN_SKILLS_DIR 生效', r2.dir === envSkills, `实际=${r2.dir}`)

  // ================= 3. DSH_HOME 是权威 =================
  console.log('\n[3. $DSH_HOME/skills 装着技能时直接用（DSH 就按它扫描）]')
  const homeSkills = makeSkillsDir(join(root, 'dshhome'), ['lucky-api', 'jdgold', 'game-dev-workflow'])
  setEnv(join(root, 'dshhome'), undefined)
  const r3 = resolveSkillsDirWithSource(ctxNone)
  check('选中 $DSH_HOME/skills', r3.dir === homeSkills, `实际=${r3.dir}`)
  check('来源为 env:DSH_HOME', r3.source === 'env:DSH_HOME', `实际=${r3.source}`)
  check('skillsDirCandidates 正确数出技能数',
    skillsDirCandidates().find(c => c.source === 'env:DSH_HOME')?.skillCount === 3)

  // ================= 4. 绝不乱猜 =================
  console.log('\n[4. DSH_HOME 存在时，即使它是空的也不偏离]')
  const emptyHome = makeEmptyDir(join(root, 'emptyhome'))
  setEnv(join(root, 'emptyhome'), undefined)
  const r4 = resolveSkillsDirWithSource(ctxNone)
  check('保持 $DSH_HOME/skills（权威优先于启发式）', r4.dir === emptyHome, `实际=${r4.dir}`)

  console.log('\n[5. 错位时必须告警（这正是「装了没生效」的面板横幅来源）]')
  // 复现真实故障：DSH 真正扫描的目录（这里是 $DSH_HOME/skills）装着技能，
  // 但插件被配置成读写另一个空目录 → 面板会显示「已安装」，DSH 却永远看不到。
  setEnv(join(root, 'dshhome'), undefined)   // dshhome/skills 有 3 个技能
  const wrongDir = makeEmptyDir(join(root, 'wrong'), 'skills')
  const diag = describeSkillsDir(wrongDir, 'config.skillsDir')
  check('当前目录为空 + DSH 目录有技能 → 必须给出 warning',
    typeof diag.warning === 'string' && diag.warning.length > 0, `实际=${diag.warning}`)
  check('告警文案点名了当前（错的）目录', diag.warning?.includes(wrongDir) === true)
  check('告警里给出可执行的改法（config.skillsDir）', diag.warning?.includes('config.skillsDir') === true)
  check('告警里点出了真正装着技能的目录', diag.warning?.includes(homeSkills) === true)
  check('候选清单一并返回', Array.isArray(diag.candidates) && diag.candidates.length > 0)

  console.log('\n[6. 位置正确时不打扰用户]')
  setEnv(join(root, 'dshhome'), undefined)
  const diagOk = describeSkillsDir(homeSkills, 'env:DSH_HOME')
  check('当前目录装着技能且别处没有 → warning 为 null', diagOk.warning === null, `实际=${diagOk.warning}`)

  console.log('\n[7. 多个位置都有技能 → 只提示、不自动猜]')
  // 让 ~/.dsh/skills 这个候选也「有技能」不现实（那是用户真实家目录，不能碰），
  // 改为直接验证判据本身：当前目录有技能 + 另有候选有技能 → 出「多个目录」告警。
  // 用 DSH_HOME 指向一个真实布局，再把另一个临时目录当作「当前」传进去。
  setEnv(join(root, 'dshhome'), undefined)
  const otherLayout = makeSkillsDir(join(root, 'other'), ['cloudflare-tunnel'])
  const diagMulti = describeSkillsDir(otherLayout, 'config.skillsDir')
  check('两边都装着技能 → 必须告警（提示人工确认）',
    typeof diagMulti.warning === 'string' && diagMulti.warning.includes('多个目录'))
  check('告警里列出了当前使用的目录', diagMulti.warning?.includes(otherLayout) === true)

  console.log('\n[8. 完全不存在的目录 → 也要提示]')
  setEnv(undefined, undefined)
  const notExist = join(root, 'no-such-dir', 'skills')
  const diagMissing = describeSkillsDir(notExist, 'config.skillsDir')
  check('目录不存在 → 给出 warning', typeof diagMissing.warning === 'string' && diagMissing.warning.includes('不存在'))
} finally {
  // 恢复环境变量，别污染同进程里的其它测试
  if (SAVED.DSH_HOME === undefined) delete process.env['DSH_HOME']; else process.env['DSH_HOME'] = SAVED.DSH_HOME
  if (SAVED.DSH_PLUGIN_SKILLS_DIR === undefined) delete process.env['DSH_PLUGIN_SKILLS_DIR']
  else process.env['DSH_PLUGIN_SKILLS_DIR'] = SAVED.DSH_PLUGIN_SKILLS_DIR
  rmSync(root, { recursive: true, force: true })
}

console.log(`\n结果: ${pass} 通过 / ${fail} 失败 / 共 ${pass + fail} 例`)
if (fail > 0) {
  console.log('\nskillsDir 解析/告警逻辑不符合预期。')
  console.log('这类 bug 的表现是「点了安装和卸载都没生效」，且全程不报错，务必修好。')
}
process.exit(fail === 0 ? 0 : 1)
