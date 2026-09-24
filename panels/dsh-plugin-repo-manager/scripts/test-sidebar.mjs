/**
 * 侧边栏入口测试：钉住「入口注册在哪、由什么开关控制、行与本体是否成对」。
 * 零依赖，不碰生产环境。
 *
 * 用法：node scripts/test-sidebar.mjs
 *
 * ## 为什么这个测试值得存在
 *
 * 两件事都是**不报错的失效**：
 *
 * 1. `showSidebarEntry` 曾是**声明了但没人读**的死配置（改了 false 毫无效果、也不报错）。
 * 2. 入口从「设置 tab + 侧边栏按钮」迁到「侧边栏面板行 + 主界面工作区」后，
 *    行（`sidebar.panellist` 的 `id`）与本体（`main` keyed 槽的 `key`）**必须成对且逐字同 id**
 *    —— 缺本体时 `ctx.layout.selectPanel(id)` 会直接 **throw** 并保留原选中态，
 *    用户看到的正是「点了没反应」。
 *
 * ## 这一版修掉了一个自欺（2026-09-24）
 *
 * 旧版测试在自己的文件里**重写了一遍** `resolveShowSidebarButton` 再断言它 ——
 * 那是「测的是测试自己的实现」，产品代码里的解析器坏掉它照样全绿。
 * 现在直接 `import` 构建产物的导出函数（`dist/index.js` 已 export），
 * **测的是真正发货的那份代码**。
 * 代价是必须先构建：产物过期时下面会明确报「未导出 → 先 npm run build:server」，
 * 而不是含糊地失败。
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CLIENT_JS = join(ROOT, 'client', 'client.js')
const SRC_ENTRY = join(ROOT, 'src', 'client', 'index.tsx')

let pass = 0, fail = 0
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label} ${extra}`) }
}

/** 取 [start, end) 之间的文本；任一端找不到返回 ''（配合显式断言使用）。 */
function slice(text, start, end) {
  const i = text.indexOf(start)
  if (i < 0) return ''
  const j = text.indexOf(end, i + start.length)
  return j < 0 ? '' : text.slice(i, j)
}

// ============================================================
console.log('\n【1】布尔解析：直接跑构建产物里的真实函数，不重写一份')
// ============================================================
const dist = await import(pathToFileURL(join(ROOT, 'dist', 'index.js')).href)
const resolveShowSidebarEntry = dist.resolveShowSidebarEntry
if (typeof resolveShowSidebarEntry !== 'function') {
  console.log('  ✗ dist/index.js 未导出 resolveShowSidebarEntry')
  console.log('    → 产物是旧的，先跑：npm run build:server')
  process.exit(1)
}
check('dist/index.js 导出了 resolveShowSidebarEntry（可被直接断言）', true)

/** 造一个只认 `config` 的假 ctx。 */
const ctxWith = (config) => ({ get: (k) => (k === 'config' ? config : undefined) })

// 环境变量兜底要能清干净，否则会污染后面的用例
function withCleanEnv(fn) {
  const keys = ['DSH_PLUGIN_SHOW_SIDEBAR_ENTRY', 'DSH_PLUGIN_SHOW_SIDEBAR']
  const saved = keys.map((k) => process.env[k])
  keys.forEach((k) => { delete process.env[k] })
  try { return fn() } finally {
    keys.forEach((k, i) => { saved[i] === undefined ? delete process.env[k] : (process.env[k] = saved[i]) })
  }
}

withCleanEnv(() => {
  // ---- 新键 ----
  check('新键：true → true', resolveShowSidebarEntry(ctxWith({ showSidebarEntry: true })) === true)
  check('新键：false → false', resolveShowSidebarEntry(ctxWith({ showSidebarEntry: false })) === false)
  check('新键：数字 1 → true', resolveShowSidebarEntry(ctxWith({ showSidebarEntry: 1 })) === true)
  check('新键：数字 0 → false', resolveShowSidebarEntry(ctxWith({ showSidebarEntry: 0 })) === false)
  // YAML / 环境变量只能给字符串；若用 Boolean(raw) 判断，"false" 是真值 → 关不掉
  check('新键："false" → false（Boolean() 会误判为 true）', resolveShowSidebarEntry(ctxWith({ showSidebarEntry: 'false' })) === false)
  check('新键："0" → false', resolveShowSidebarEntry(ctxWith({ showSidebarEntry: '0' })) === false)
  check('新键："off" → false', resolveShowSidebarEntry(ctxWith({ showSidebarEntry: 'off' })) === false)
  check('新键："FALSE " → false（大小写+空白）', resolveShowSidebarEntry(ctxWith({ showSidebarEntry: 'FALSE ' })) === false)
  check('新键："on" → true', resolveShowSidebarEntry(ctxWith({ showSidebarEntry: 'on' })) === true)

  // ---- 旧键兼容（改名的唯一风险是「改了旧键没反应还不报错」）----
  check('旧键 showSidebarButton:"false" 仍然生效', resolveShowSidebarEntry(ctxWith({ showSidebarButton: 'false' })) === false)
  check('旧键 showSidebarButton:false 仍然生效', resolveShowSidebarEntry(ctxWith({ showSidebarButton: false })) === false)
  check('两键同时存在时**新键优先**',
    resolveShowSidebarEntry(ctxWith({ showSidebarEntry: true, showSidebarButton: false })) === true)
  check('两键同时存在时新键优先（反向）',
    resolveShowSidebarEntry(ctxWith({ showSidebarEntry: false, showSidebarButton: true })) === false)

  // ---- 缺失 / 无法识别 → 回退默认，不能把入口弄丢 ----
  check('config 无该项 → 默认 true', resolveShowSidebarEntry(ctxWith({})) === true)
  check('config 为 undefined → 默认 true', resolveShowSidebarEntry(ctxWith(undefined)) === true)
  check('ctx 没有 get → 默认 true', resolveShowSidebarEntry({}) === true)
  check('null → 默认 true', resolveShowSidebarEntry(ctxWith({ showSidebarEntry: null })) === true)
  check('空串 → 默认 true', resolveShowSidebarEntry(ctxWith({ showSidebarEntry: '' })) === true)
  check('拼错的 "flase" → 默认 true（不静默弄丢入口）', resolveShowSidebarEntry(ctxWith({ showSidebarEntry: 'flase' })) === true)

  // ---- 环境变量兜底 ----
  process.env.DSH_PLUGIN_SHOW_SIDEBAR_ENTRY = 'false'
  check('env DSH_PLUGIN_SHOW_SIDEBAR_ENTRY=false → false', resolveShowSidebarEntry(ctxWith({})) === false)
  delete process.env.DSH_PLUGIN_SHOW_SIDEBAR_ENTRY
  process.env.DSH_PLUGIN_SHOW_SIDEBAR = 'false'
  check('旧 env DSH_PLUGIN_SHOW_SIDEBAR=false 仍然生效', resolveShowSidebarEntry(ctxWith({})) === false)
  process.env.DSH_PLUGIN_SHOW_SIDEBAR_ENTRY = 'true'
  check('两 env 同时存在时新 env 优先', resolveShowSidebarEntry(ctxWith({})) === true)
  check('config 优先于 env', resolveShowSidebarEntry(ctxWith({ showSidebarEntry: false })) === false)
  delete process.env.DSH_PLUGIN_SHOW_SIDEBAR_ENTRY
  delete process.env.DSH_PLUGIN_SHOW_SIDEBAR
})

// ============================================================
console.log('\n【2】入口注册形态：sidebar.panellist（行）+ main（本体），成对且同 id')
// ============================================================
const bundle = readFileSync(CLIENT_JS, 'utf-8')
const entrySrc = readFileSync(SRC_ENTRY, 'utf-8')

check('bundle 读取 showSidebarEntry', bundle.includes('showSidebarEntry'))
check('bundle 仍然读旧键（两半混装时入口不丢）', bundle.includes('config.showSidebarButton'))
check('bundle 用 !== false 判断（缺省即显示）', bundle.includes('!== false'))
check('注册被「!showSidebarEntry」包住（false 时两项都不注册）',
  /!\s*showSidebarEntry/.test(bundle) && /!\s*showSidebarEntry/.test(entrySrc))

// ---- ① 侧边栏那一行：必须是 panellist 子席位 ----
check('注册进 sidebar.panellist（而不是整栏 sidebar）', bundle.includes("inject('sidebar.panellist'"))
check('panellist 注册项的 name 是 sidebar.panellist', bundle.includes("name:'sidebar.panellist'"))
// ⚠️ 不能写成 includes("inject('sidebar'") —— "inject('sidebar.panellist'" 也包含它。
// 必须用引号闭合的精确形态。
check('**不再**注册整栏 sidebar 槽（那是「替换整根导航栏」而非添加）',
  !/inject\(\s*'sidebar'\s*[,)]/.test(bundle))
check('不再声明 icon:"package" 交给宿主渲染图标', !bundle.includes("icon:'package'"))

// ---- ② 本体：必须是 main keyed 槽，且字段名是 key（不是 id）----
check('注册进 main（主界面工作区）', bundle.includes("inject('main'"))
check('main 注册项的 name 是 main', bundle.includes("name:'main'"))
check('main 用 key 字段（keyed 槽的字段名是 key，写 id 会永不命中）',
  bundle.includes('key:PANEL_ID'))
check('main 的 key 不是写成 id:（后者是单/列表槽的字段）',
  !/name:'main'[\s\S]{0,40}?id:/.test(bundle))

// ---- ③ 行与本体必须用同一个常量 → 保证逐字相同的 id ----
const panelIdDecl = bundle.match(/var PANEL_ID\s*=\s*'([^']+)'/)
check('bundle 声明了 PANEL_ID 常量', panelIdDecl !== null)
check('PANEL_ID 的值仍是 plugin-repo（对外身份不变）', panelIdDecl?.[1] === 'plugin-repo')
check('panellist 的 id 用的是 PANEL_ID（与本体同一个身份）', bundle.includes('id:PANEL_ID'))
check('两侧 register 成对出现（缺本体 → 点击 throw「点了没反应」）',
  (bundle.match(/ctx\.slots\.register\(/g) || []).length === 2)

// ---- ④ 不再自己导航到设置 ----
check('不再有 navigateTo（点击由 shell 的 selectPanel(id) 处理）', !bundle.includes('navigateTo'))
check('**不再**注册设置 panel 的 tab（入口只留侧边栏）', !bundle.includes('settings.plugins.tab'))
check('不再有 TAB_SLOT_ID / SIDEBAR_SLOT_ID 常量', !bundle.includes('TAB_SLOT_ID') && !bundle.includes('SIDEBAR_SLOT_ID'))

// ---- ⑤ 行的内容：只画自绘图标，不画文字 ----
check('渲染的是自绘图标而非文字', bundle.includes('PackageIcon'))
check('图标用 currentColor 跟随主题/选中态', bundle.includes("stroke: 'currentColor'"))
check('行只渲染图标（文字由 sidebar 用 label 渲染，不会溢出窄条）',
  /jsxRuntime\.jsx\(PackageIcon,\s*\{\s*size:/.test(bundle))
check('图标尺寸取自 owner props.size（SidebarRoot 传 16/18）', bundle.includes('props.size'))
// 回归：最早那版直接渲染文字，在窄侧边栏里会溢出
check('不再把标题当按钮内容渲染（回归）',
  !/jsxRuntime\.jsx\('div',\s*\{\s*onClick[\s\S]{0,200}?\},\s*t\('sidebar'\)\)/.test(bundle))

// ---- ⑥ 字符串宽容解析只在服务端有一份 ----
// 客户端只消费服务端归一化后的布尔值；若它也去 toLowerCase() 解析字符串，
// 就是「同一判据两处实现」——必然漂移。
const bundleEntryRegion = slice(bundle, 'var rawShowSidebarEntry', 'if (!showSidebarEntry')
check('客户端不重复实现字符串宽容解析（唯一实现在 dist/index.js）',
  bundleEntryRegion.length > 0 && !/toLowerCase\(/.test(bundleEntryRegion),
  bundleEntryRegion.length === 0 ? '（切片为空，标记可能已改）' : '')

// ============================================================
console.log('\n【3】开发态源码与产物必须同款（src/client/index.tsx ↔ bundle）')
// ============================================================
// 这一节补的是一个**真实存在的洞**：`test-client-parity.mjs` 只比对了面板主体
// （PluginRepoPanel.tsx ↔ bundle），入口文件 src/client/index.tsx 从未被比对过 ——
// 改了源码忘了重跑 generate-client.mjs，产物仍是旧入口，且没有任何测试会红。
check('两份都注册进 sidebar.panellist', entrySrc.includes("inject('sidebar.panellist'") && bundle.includes("inject('sidebar.panellist'"))
check('两份都注册进 main', entrySrc.includes("inject('main'") && bundle.includes("inject('main'"))
check('两份的 PANEL_ID 值相同',
  (entrySrc.match(/PANEL_ID\s*=\s*'([^']+)'/) || [])[1] === panelIdDecl?.[1])
check('两份都不再有整栏 sidebar 注册',
  !/inject\(\s*'sidebar'\s*[,)]/.test(entrySrc) && !/inject\(\s*'sidebar'\s*[,)]/.test(bundle))
check('两份都不再有设置 tab 注册',
  !entrySrc.includes('settings.plugins.tab') && !bundle.includes('settings.plugins.tab'))
check('两份都不再有 navigateTo',
  !entrySrc.includes('navigateTo') && !bundle.includes('navigateTo'))

// ============================================================
console.log('\n【4】产物契约：host 侧必须下发该配置')
// ============================================================
const distSrc = readFileSync(join(ROOT, 'dist', 'index.js'), 'utf-8')
check('dist 有 resolveShowSidebarEntry（已导出可见）', distSrc.includes('resolveShowSidebarEntry'))
check('dist 有 resolveSidebarTitle', distSrc.includes('resolveSidebarTitle'))
check('dist 向客户端 provide 该字段',
  /provide\?\.\('pluginRepoConfig',\s*\{[\s\S]*?showSidebarEntry/.test(distSrc))
check('dist 打印生效值（可排查）', distSrc.includes('showSidebarEntry: ${showSidebarEntry}'))
check('dist 的 _health 也回报该配置', /config:\s*\{\s*pollInterval,\s*showSidebarEntry/.test(distSrc))

// ============================================================
console.log('\n【5】配置文档：cordis.patch.yml 应暴露开关')
// ============================================================
const patch = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf-8')
check('patch 含 showSidebarEntry', patch.includes('showSidebarEntry'))
check('patch 不再把 showSidebarButton 当作用户该改的键', !/^\s*showSidebarButton\s*:/m.test(patch))

console.log(`\n结果: ${pass} 通过 / ${fail} 失败 / 共 ${pass + fail} 例`)
process.exit(fail === 0 ? 0 : 1)
