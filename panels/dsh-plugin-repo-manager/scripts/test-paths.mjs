/**
 * 路径解析测试：验证 expandHome 语义与 skillsDir / repoDir 解析优先级。
 * 零依赖，临时目录，不碰生产环境。
 *
 * 用法：node scripts/test-paths.mjs
 */
import { join } from 'node:path'
import { homedir } from 'node:os'

// ---- 被测逻辑（与 src/index.ts 的 expandHome 保持等价） ----
function expandHome(p) {
  if (!p) return p
  if (p === '~') return homedir()
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return join(homedir(), p.slice(2))
  }
  return p
}

let pass = 0, fail = 0
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label} ${extra}`) }
}

const HOME = homedir()

console.log('\n[expandHome]')
check('~ → 家目录', expandHome('~') === HOME)
check('~/.dsh/skills 被展开', expandHome('~/.dsh/skills') === join(HOME, '.dsh', 'skills'))
check('展开后不再以 ~ 开头', !expandHome('~/.dsh/skills').startsWith('~'))
check('未展开的 ~ 会导致写错目录（回归基线）', expandHome('~/.dsh/skills') !== '~/.dsh/skills')
check('绝对路径原样返回', expandHome('/vol1/1000/AI/DSHPlugin/skills') === '/vol1/1000/AI/DSHPlugin/skills')
check('带 ~ 在中间的不展开（与 shell 一致）', expandHome('/a/~/b') === '/a/~/b')
check('空串原样返回', expandHome('') === '')
check('Windows 反斜杠形式被展开', expandHome('~\\.dsh\\skills') === join(HOME, '.dsh\\skills'))

console.log('\n[解析优先级：config > env > default]')
// 与 src/index.ts resolveRepoDir 等价：ctx.get('config') 直接返回 config 对象
function resolveRepoDirStub(ctx, envVal, defaultVal = '/default/repo') {
  const config = ctx.get?.('config')
  const raw = config?.repoDir ?? envVal ?? defaultVal
  return expandHome(raw)
}
check('config 优先', resolveRepoDirStub({ get: () => ({ repoDir: '/from/config' }) }, '/from/env') === '/from/config')
check('无 config 时用 env', resolveRepoDirStub({ get: () => (undefined) }, '/from/env') === '/from/env')
check('config 为空对象时用 env', resolveRepoDirStub({ get: () => ({}) }, '/from/env') === '/from/env')
check('都没有时用默认', resolveRepoDirStub({ get: () => undefined }, undefined) === '/default/repo')
check('config 里的 ~ 也会被展开', resolveRepoDirStub({ get: () => ({ repoDir: '~/repo' }) }, undefined) === join(HOME, 'repo'))
check('无 get 方法时不崩', resolveRepoDirStub({}, undefined) === '/default/repo')

console.log(`\n结果: ${pass} 通过 / ${fail} 失败 / 共 ${pass + fail} 例`)
process.exit(fail === 0 ? 0 : 1)
