/**
 * 侧边栏注册测试：验证 showSidebarButton 的布尔解析与槽位注册行为。
 * 零依赖，不碰生产环境。
 *
 * 用法：node scripts/test-sidebar.mjs
 *
 * 为什么这个测试值得存在：`showSidebarButton` 曾是**声明了但没人读**的死配置
 * （改了 false 毫无效果、也不报错）。死配置属于最隐蔽的一类失效——它看起来
 * 完全正常。这个文件把「配置 → 解析 → 是否注册槽位」整条链钉住。
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLIENT_JS = join(__dirname, '..', 'client', 'client.js')

let pass = 0, fail = 0
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label} ${extra}`) }
}

// ---- 被测逻辑（与 src/index.ts 的 resolveShowSidebarButton 保持等价） ----
const DEFAULT_SHOW = true
function resolveShowSidebarButton(raw, hasConfig) {
  const value = hasConfig ? raw : undefined
  if (value === undefined || value === null || value === '') return DEFAULT_SHOW
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const s = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(s)) return true
  if (['0', 'false', 'no', 'off'].includes(s)) return false
  return DEFAULT_SHOW
}

console.log('\n[showSidebarButton：布尔值直传]')
check('true → true', resolveShowSidebarButton(true, true) === true)
check('false → false', resolveShowSidebarButton(false, true) === false)
check('数字 1 → true', resolveShowSidebarButton(1, true) === true)
check('数字 0 → false', resolveShowSidebarButton(0, true) === false)

console.log('\n[showSidebarButton：字符串（YAML/环境变量只能给字符串）]')
// 这一组是关键回归：若用 Boolean(raw) 判断，"false" 是真值 → 关不掉
check('"false" → false（Boolean() 会误判为 true）', resolveShowSidebarButton('false', true) === false)
check('"FALSE" → false（不区分大小写）', resolveShowSidebarButton('FALSE', true) === false)
check('" false " → false（去空白）', resolveShowSidebarButton(' false ', true) === false)
check('"0" → false', resolveShowSidebarButton('0', true) === false)
check('"no" → false', resolveShowSidebarButton('no', true) === false)
check('"off" → false', resolveShowSidebarButton('off', true) === false)
check('"true" → true', resolveShowSidebarButton('true', true) === true)
check('"YES" → true', resolveShowSidebarButton('YES', true) === true)
check('"on" → true', resolveShowSidebarButton('on', true) === true)
check('"1" → true', resolveShowSidebarButton('1', true) === true)

console.log('\n[showSidebarButton：缺失 / 无法识别 → 回退默认，不能把按钮弄丢]')
check('config 无该项 → 默认 true', resolveShowSidebarButton(undefined, true) === true)
check('完全没有 config → 默认 true', resolveShowSidebarButton(undefined, false) === true)
check('null → 默认 true', resolveShowSidebarButton(null, true) === true)
check('空串 → 默认 true', resolveShowSidebarButton('', true) === true)
check('拼错的 "flase" → 默认 true（不静默弄丢按钮）', resolveShowSidebarButton('flase', true) === true)
check('乱码 "abc" → 默认 true', resolveShowSidebarButton('abc', true) === true)

console.log('\n[客户端契约：产物必须真的读取该开关]')
const bundle = readFileSync(CLIENT_JS, 'utf-8')
check('bundle 读取 showSidebarButton', bundle.includes('showSidebarButton'))
check('bundle 用 !== false 判断（缺省即显示）', bundle.includes('config.showSidebarButton !== false'))
check('注册被 if(showSidebarButton ...) 包住', /if\s*\(\s*showSidebarButton\s*&&/.test(bundle))
check('注册的槽位名是 sidebar', bundle.includes("inject('sidebar'"))
check('槽位 id 为 plugin-repo-btn', bundle.includes("'plugin-repo-btn'"))
check('渲染的是自绘图标而非文字', bundle.includes('PackageIcon'))
check('图标用 currentColor 跟随主题', bundle.includes("stroke: 'currentColor'"))
check('按钮带 aria-label（无障碍）', bundle.includes("'aria-label': title"))
check('点击导航到设置 tab', bundle.includes("'settings.plugins.tab.' + TAB_SLOT_ID"))
// 回归：旧实现直接渲染 t('sidebar') 文字，在窄侧边栏里会溢出
check('不再直接渲染中文文字作为按钮内容（回归）',
  !/jsxRuntime\.jsx\('div',\s*\{\s*onClick[\s\S]{0,200}?\},\s*t\('sidebar'\)\)/.test(bundle))

console.log('\n[产物契约：host 侧必须下发该配置]')
const dist = readFileSync(join(__dirname, '..', 'dist', 'index.js'), 'utf-8')
check('dist 有 resolveShowSidebarButton', dist.includes('resolveShowSidebarButton'))
check('dist 有 resolveSidebarTitle', dist.includes('resolveSidebarTitle'))
check('dist 向客户端 provide 该字段', /provide\?\.\('pluginRepoConfig',\s*\{[\s\S]*?showSidebarButton/.test(dist))
check('dist 打印生效值（可排查）', dist.includes('showSidebarButton: ${showSidebarButton}'))

console.log('\n[配置文档：cordis.patch.yml 应暴露开关]')
const patch = readFileSync(join(__dirname, '..', 'cordis.patch.yml'), 'utf-8')
check('patch 含 showSidebarButton', patch.includes('showSidebarButton'))

console.log(`\n结果: ${pass} 通过 / ${fail} 失败 / 共 ${pass + fail} 例`)
process.exit(fail === 0 ? 0 : 1)
