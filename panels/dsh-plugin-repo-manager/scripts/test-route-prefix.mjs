/**
 * 路由前缀归一化测试：验证 normalizeSubPath 同时兼容两种宿主约定。
 *
 * 用法：node scripts/test-route-prefix.mjs
 *
 * ## 背景
 *
 * `webServer.register({ kind:'prefix', path:'/api/plugin-repo' })` 之后，
 * handler 收到的 `req.url` 有两种可能形状，取决于宿主实现：
 *
 *   A. **剥掉前缀** → `'/list'`
 *   B. **保留全路径** → `'/api/plugin-repo/list'`
 *
 * 本仓库没有 DSH 源码，无法确认真实约定。旧实现只按 A 写
 * （`url.pathname === '/list'`）—— 若宿主是 B，**所有请求都落进 404 分支**，
 * 返回 `HTTP 200 + ok:false`，前端表现为「列表空 + 只有一个重试按钮」，
 * 看上去像后端没起来，极难排查。
 *
 * 这个测试把两种约定都钉住：**无论宿主给哪种，都必须归一化到同一个子路径。**
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PREFIX = '/api/plugin-repo'

// ---- 被测逻辑（与 src/index.ts 的 normalizeSubPath 等价） ----
function normalizeSubPath(pathname, prefix = PREFIX) {
  let p = pathname || ''
  const q = p.indexOf('?')
  if (q >= 0) p = p.slice(0, q)
  if (p === prefix) return '/'
  if (p.startsWith(prefix + '/')) p = p.slice(prefix.length)
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p || '/'
}

let pass = 0, fail = 0
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label} ${extra}`) }
}

console.log('\n[约定 A：宿主已剥掉前缀]')
check("'/list' → '/list'", normalizeSubPath('/list') === '/list')
check("'/install' → '/install'", normalizeSubPath('/install') === '/install')
check("'/uninstall' → '/uninstall'", normalizeSubPath('/uninstall') === '/uninstall')

console.log('\n[约定 B：宿主保留全路径]')
check("'/api/plugin-repo/list' → '/list'", normalizeSubPath('/api/plugin-repo/list') === '/list')
check("'/api/plugin-repo/install' → '/install'", normalizeSubPath('/api/plugin-repo/install') === '/install')
check("'/api/plugin-repo/uninstall' → '/uninstall'", normalizeSubPath('/api/plugin-repo/uninstall') === '/uninstall')

console.log('\n[两种约定必须归一化到同一结果（核心判据）]')
for (const ep of ['/list', '/install', '/uninstall']) {
  const a = normalizeSubPath(ep)
  const b = normalizeSubPath(PREFIX + ep)
  check(`${ep}: 两种约定一致（A=${a} / B=${b}）`, a === b && a === ep)
}

console.log('\n[边界：根路径与尾斜杠]')
check("前缀本身 → '/'", normalizeSubPath(PREFIX) === '/')
check("'/api/plugin-repo/' → '/'", normalizeSubPath(PREFIX + '/') === '/')
check("'/list/' → '/list'（尾斜杠归一）", normalizeSubPath('/list/') === '/list')
check("'/api/plugin-repo/list/' → '/list'", normalizeSubPath(PREFIX + '/list/') === '/list')
check("空串 → '/'", normalizeSubPath('') === '/')
check("undefined → '/'（不崩）", normalizeSubPath(undefined) === '/')
check("'/' → '/'", normalizeSubPath('/') === '/')

console.log('\n[防御：查询串不应影响匹配]')
check("'/list?x=1' → '/list'", normalizeSubPath('/list?x=1') === '/list')
check("'/api/plugin-repo/list?x=1' → '/list'", normalizeSubPath(PREFIX + '/list?x=1') === '/list')

console.log('\n[反例：不能把别的路径误判成本插件的]')
check("'/other/list' 不会被错误剥成 '/list'", normalizeSubPath('/other/list') === '/other/list')
check("'/api/plugin-repoX/list' 不算命中前缀", normalizeSubPath('/api/plugin-repoX/list') === '/api/plugin-repoX/list')
check("'/apiother' 保持原样", normalizeSubPath('/apiother') === '/apiother')

console.log('\n[契约：dist 里必须用归一化后的子路径判断]')
const dist = readFileSync(join(__dirname, '..', 'dist', 'index.js'), 'utf-8')
check('dist 导出 normalizeSubPath', dist.includes('normalizeSubPath'))
check('handler 用 sub 变量判断（而非 url.pathname ===）', dist.includes('sub ==='))
// 排除注释：本文件的 docstring 里会引用旧写法作为反面例子
const distNoComments = dist
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
check('不再直接用 url.pathname === 判等（回归）', !/url\.pathname === '\/list'/.test(distNoComments))
check('404 分支打印归一化结果便于排查', dist.includes('NOT_FOUND sub='))

console.log(`\n结果: ${pass} 通过 / ${fail} 失败 / 共 ${pass + fail} 例`)
if (fail > 0) {
  console.log('\n归一化失效会让所有请求落进 404 分支：')
  console.log('  返回 HTTP 200 + ok:false → 前端「列表空 + 一个重试按钮」')
  console.log('  看起来像后端没起来，但其实是路径约定不匹配。')
}
process.exit(fail === 0 ? 0 : 1)
