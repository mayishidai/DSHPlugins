/**
 * HTTP API 端到端测试：真起一个 http server，按真实路径打接口。
 *
 * 用法：node scripts/test-api-e2e.mjs
 *
 * ## 为什么需要它
 *
 * 前面几个测试都是「静态检查产物里有没有某段代码」。但用户遇到的问题是
 * **请求真的打不通**，只有端到端跑一遍才能证明链路是通的。
 *
 * 这里刻意用**真实 HTTP**（不是 mock 函数调用），因为它能顺带验证：
 *   - 路由前缀在两种约定下都能命中（这是本轮修的 bug）
 *   - 请求体解析、JSON 序列化、状态码都对
 *   - 目录不存在时不抛异常，而是返回结构化的空列表
 *
 * 用临时目录，不碰任何生产数据。
 */
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { request } from 'node:http'

const PREFIX = '/api/plugin-repo'

let pass = 0, fail = 0
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label} ${extra}`) }
}

// ---- 搭一个最小可用的被测服务 ----
// 用真实的 dist/index.js 里的 listPlugins，保证测的是真实现
const dist = await import('../dist/index.js')

const REPO = mkdtempSync(join(tmpdir(), 'plugin-repo-e2e-'))
const SKILLS = mkdtempSync(join(tmpdir(), 'plugin-skills-e2e-'))

// 造两个插件
mkdirSync(join(REPO, 'alpha-plugin'), { recursive: true })
writeFileSync(join(REPO, 'alpha-plugin', 'manifest.json'),
  JSON.stringify({ name: 'alpha-plugin', version: '1.2.0' }))
mkdirSync(join(REPO, 'beta-plugin'), { recursive: true })
writeFileSync(join(REPO, 'beta-plugin', 'manifest.json'),
  JSON.stringify({ name: 'beta-plugin', version: '0.9.0' }))
// 已装一个（版本更旧 → 应显示可更新）
mkdirSync(join(SKILLS, 'alpha-plugin'), { recursive: true })
writeFileSync(join(SKILLS, 'alpha-plugin', 'version.json'),
  JSON.stringify({ name: 'alpha-plugin', version: '1.0.0' }))
// 干扰项：非 kebab-case 名字，应被忽略
mkdirSync(join(REPO, 'BadName'), { recursive: true })

// 复用真实的 handler（从 dist 导入），而不是在本文件里重写一遍路由。
// 这一点很关键：上一版 e2e 自己实现了 normalizeSubPath 调用，
// 结果「把 dist 里的路由改回旧的严格判等」这个回归**测不出来** ——
// 因为测的是测试自己的实现。现在直接打产品代码的 handleApiRequest。
const handleApiRequest = dist.handleApiRequest

const server = createServer((req, res) => {
  handleApiRequest(req, res, {
    repoDir: REPO,
    skillsDir: SKILLS,
    pollInterval: 3000,
    showSidebarEntry: true,
    sidebarTitle: '插件仓库',
  })
})

await new Promise((r) => server.listen(0, '127.0.0.1', r))
const PORT = server.address().port

function getOn(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.end()
  })
}
function get(path) {
  return getOn(PORT, path)
}

console.log('\n[1. 约定 A：宿主已剥前缀 → 直接打 "/list"]')
const a = await get('/list')
check('HTTP 200', a.status === 200)
let aJson = null
try { aJson = JSON.parse(a.body) } catch { /* 下面报错更清楚 */ }
check('返回合法 JSON', aJson !== null, a.body.slice(0, 80))
check('ok=true', aJson?.ok === true)

console.log('\n[2. 约定 B：宿主保留全路径 → 打 "/api/plugin-repo/list"]')
const b = await get(PREFIX + '/list')
check('HTTP 200', b.status === 200)
let bJson = null
try { bJson = JSON.parse(b.body) } catch { /* skip */ }
check('ok=true（这是本轮修的 bug：旧实现此处会 404）', bJson?.ok === true, b.body.slice(0, 120))

console.log('\n[3. 两种约定必须返回完全一样的列表]')
check('两次响应的 plugins 完全一致',
  JSON.stringify(aJson?.plugins) === JSON.stringify(bJson?.plugins))

console.log('\n[4. 列表内容正确性]')
const names = (aJson?.plugins ?? []).map((p) => p.name).sort()
check('列出 2 个合法插件', names.length === 2, JSON.stringify(names))
check('包含 alpha-plugin', names.includes('alpha-plugin'))
check('包含 beta-plugin', names.includes('beta-plugin'))
check('忽略非 kebab-case 的 BadName', !names.some((n) => n === 'BadName'))
const alpha = aJson?.plugins.find((p) => p.name === 'alpha-plugin')
check('alpha 标记为已安装', alpha?.installed === true)
check('alpha 已装版本 1.0.0', alpha?.installedVersion === '1.0.0')
check('alpha 仓库版本 1.2.0', alpha?.version === '1.2.0')
check('alpha 标记 hasUpdate=true（1.2.0 > 1.0.0）', alpha?.hasUpdate === true)
const beta = aJson?.plugins.find((p) => p.name === 'beta-plugin')
check('beta 未安装', beta?.installed === false)
check('beta hasUpdate=false（未装不提示更新）', beta?.hasUpdate === false)

console.log('\n[5. 自检端点 /_health 可用（排查用）]')
const h = await get(PREFIX + '/_health')
let hJson = null
try { hJson = JSON.parse(h.body) } catch { /* skip */ }
check('HTTP 200', h.status === 200)
check('ok=true', hJson?.ok === true)
check('回显原始 pathname（排查路径约定）', typeof hJson?.route?.rawPathname === 'string')
check('回显归一化后的 sub', hJson?.route?.normalizedSub === '/_health')
check('回显 repoDir 及其存在性', typeof hJson?.paths?.repoDir === 'string' && hJson?.paths?.repoExists === true)
check('回显仓库条目数', hJson?.paths?.repoEntryCount === 2, String(hJson?.paths?.repoEntryCount))
check('回显生效的配置（含 showSidebarEntry）', hJson?.config?.showSidebarEntry === true)

console.log('\n[6. 未知路径 → 结构化 404，而不是崩溃]')
const nf = await get(PREFIX + '/nope')
let nfJson = null
try { nfJson = JSON.parse(nf.body) } catch { /* skip */ }
check('ok=false', nfJson?.ok === false)
check('错误码 NOT_FOUND', nfJson?.error?.code === 'NOT_FOUND')
check('错误信息里含收到的子路径（便于定位）', String(nfJson?.error?.message || '').includes('/nope'))

console.log('\n[7. 目录不存在 → 空列表而非异常]')
const empty = dist.listPlugins('/definitely/not/exists', '/also/not/exists')
check('返回空数组', Array.isArray(empty) && empty.length === 0)

// ---- 8 / 9：skillsDir 错位的端到端证明 ----
// 这是本次事故（「点了安装和卸载都没生效」）的防线。
// 关键在于：面板横幅的数据**来自 /list 响应**，所以必须端到端证明
// 这个字段真的会被传出去 —— 只测内部函数证明不了链路是通的。
console.log('\n[8. /list 必须带上 skillsDir 诊断字段（面板横幅的数据源）]')
const listJson = JSON.parse(a.body)
check('响应含 skillsDirWarning 字段（无问题时为 null）', 'skillsDirWarning' in listJson, JSON.stringify(Object.keys(listJson)))
check('响应含 skillsDir 字段', typeof listJson.skillsDir === 'string')
check('响应含 skillsDirSource 字段（便于定位配置来源）', typeof listJson.skillsDirSource === 'string')

console.log('\n[9. 真发生错位时 /list 必须报出告警（否则用户只能靠猜）]')
// 复现真实故障：DSH 数据根（$DSH_HOME/skills）里装着技能，
// 但插件被配置成读写另一个空目录 → 装/卸都有反应，DSH 侧永远看不到。
const DSH_DATA = mkdtempSync(join(tmpdir(), 'dsh-data-e2e-'))
mkdirSync(join(DSH_DATA, 'skills', 'lucky-api'), { recursive: true })
writeFileSync(join(DSH_DATA, 'skills', 'lucky-api', 'SKILL.md'), '# lucky-api\n')
const WRONG_SKILLS = mkdtempSync(join(tmpdir(), 'wrong-skills-e2e-'))
const savedDshHome = process.env.DSH_HOME
process.env.DSH_HOME = DSH_DATA

const server2 = createServer((req, res) => {
  handleApiRequest(req, res, {
    repoDir: REPO,
    skillsDir: WRONG_SKILLS,
    pollInterval: 3000,
    showSidebarEntry: true,
    sidebarTitle: '插件仓库',
  })
})
await new Promise((r) => server2.listen(0, '127.0.0.1', r))
const PORT2 = server2.address().port
const listWrong = JSON.parse((await getOn(PORT2, PREFIX + '/list')).body)
check('错位时 skillsDirWarning 非空', typeof listWrong.skillsDirWarning === 'string' && listWrong.skillsDirWarning.length > 0,
  `实际=${listWrong.skillsDirWarning}`)
check('告警文案点出了真正装着技能的目录', String(listWrong.skillsDirWarning || '').includes(join(DSH_DATA, 'skills')))
check('告警里给了可执行的改法', String(listWrong.skillsDirWarning || '').includes('config.skillsDir'))

const healthWrong = JSON.parse((await getOn(PORT2, PREFIX + '/_health')).body)
check('/_health 也暴露出候选目录清单', Array.isArray(healthWrong.skillsDirCandidates) && healthWrong.skillsDirCandidates.length > 0)
check('/_health 的候选里带技能数', healthWrong.skillsDirCandidates.some((c) => c.skillCount > 0))
check('/_health 回报 skillsDir 来源', typeof healthWrong.paths?.skillsSource === 'string')

server2.close()
if (savedDshHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = savedDshHome
rmSync(DSH_DATA, { recursive: true, force: true })
rmSync(WRONG_SKILLS, { recursive: true, force: true })

server.close()
rmSync(REPO, { recursive: true, force: true })
rmSync(SKILLS, { recursive: true, force: true })

console.log(`\n结果: ${pass} 通过 / ${fail} 失败 / 共 ${pass + fail} 例`)
if (fail > 0) {
  console.log('\n链路没通。请检查 dist/index.js 是否已重新构建：npm run build')
}
process.exit(fail === 0 ? 0 : 1)
