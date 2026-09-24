/**
 * 反向回归：证明 `test-sidebar.mjs` 的断言**不是空转**。
 *
 * 用法：node scripts/test-sidebar-negatives.mjs
 *
 * ## 为什么需要它
 *
 * `test-sidebar.mjs` 里大量断言是静态字符串匹配（`includes('inject('sidebar.panellist'')`
 * 之类）。静态匹配有个特性：**标记改名后它会静默变成「永远为真」的废断言**，
 * 而测试照样全绿 —— 于是守卫看着在、其实早就瞎了。
 * 这个文件逐条注入「真实会发生的那种错误」，要求守卫**必须变红**。
 *
 * ## 铁律：在系统临时目录里建镜像再跑
 *
 * 绝不就地改被 git 跟踪的文件 —— 那会与并行的 `make verify` 打架
 * （实测表现为 `validate_repo` 报出一条莫名其妙的 FAIL）。本文件对真实
 * 工作区**完全只读**，`try/finally` 保证临时目录被清掉。
 *
 * ## 注入的 10 种错误，都不是假想
 *
 * ①②③⑥ 是这次迁移真正踩过的坑：`sidebar` 是 `single` 且被 SidebarRoot 占用，
 * 往那里注册是「替换整根导航栏」；行与本体必须是同一个 id，缺本体时
 * `ctx.layout.selectPanel(id)` 直接 throw（用户看到「点了没反应」）。
 * ④ 对外身份变化，⑤ 设置 tab 复活，⑦ 改了源码忘了重跑生成器，
 * ⑧ 判据出现第二份实现，⑨ 产物没重建，⑩ 文档把旧键当新键推荐。
 */
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG = join(__dirname, '..')

/** 被测守卫实际会读到的文件，一个都不能少（少一个基线就红）。 */
const NEEDED = [
  'scripts/test-sidebar.mjs',
  'client/client.js',
  'src/client/index.tsx',
  'dist/index.js',
  'cordis.patch.yml',
]

function buildMirror() {
  const root = mkdtempSync(join(tmpdir(), 'neg-sidebar-'))
  for (const rel of NEEDED) {
    const dst = join(root, rel)
    mkdirSync(dirname(dst), { recursive: true })
    cpSync(join(PKG, rel), dst)
  }
  return root
}

function runGuard(root) {
  const r = spawnSync(process.execPath, [join(root, 'scripts', 'test-sidebar.mjs')], {
    cwd: root, encoding: 'utf-8',
  })
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }
}

function edit(root, rel, fn) {
  const p = join(root, rel)
  const before = readFileSync(p, 'utf-8')
  const after = fn(before)
  if (after === before) throw new Error(`注入点不存在（守卫可能已重写）: ${rel}`)
  writeFileSync(p, after)
}

/** [说明, 注入函数] —— 注入后守卫**必须**变红。 */
const CASES = [
  ['① main 的 key 被改成别的值（行与本体不再同 id）',
    (r) => edit(r, 'client/client.js', (s) => s.replace('key:PANEL_ID', "key:'plugin-repo-body'"))],

  ['② 入口行不再注册到 sidebar.panellist',
    (r) => edit(r, 'client/client.js', (s) => s.replace("inject('sidebar.panellist'", "inject('sidebar.footer.action'"))],

  ['③ 有人又把入口注册回整栏 sidebar（注定不显示的写法）',
    (r) => edit(r, 'client/client.js', (s) => s.replace(
      "ctx.slots.inject('sidebar.panellist'",
      "ctx.slots.inject('sidebar', function(){return null;}) || ctx.slots.inject('sidebar.panellist'"))],

  ['④ PANEL_ID 的值被改（对外身份变化）',
    (r) => edit(r, 'client/client.js', (s) => s.replace("var PANEL_ID = 'plugin-repo';", "var PANEL_ID = 'plugin-repo-x';"))],

  ['⑤ 设置 tab 又被注册回来',
    (r) => edit(r, 'client/client.js', (s) => s.replace(
      'if (!showSidebarEntry', "ctx.slots.inject('settings.plugins.tab', function(){});if (!showSidebarEntry"))],

  ['⑥ 本体注册被删掉（只剩行 → 点击 selectPanel 会 throw）',
    (r) => edit(r, 'client/client.js', (s) => s.replace("ctx.slots.inject('main'", "ctx.slots.inject('main_disabled'"))],

  ['⑦ 开发态源码漏改（src 仍有整栏注册）',
    (r) => edit(r, 'src/client/index.tsx', (s) => s.replace(
      "ctx.slots.inject('sidebar.panellist'", "ctx.slots.inject('sidebar'"))],

  ['⑧ 客户端自己又写了一份字符串宽容解析（判据两处实现）',
    (r) => edit(r, 'client/client.js', (s) => s.replace(
      'var showSidebarEntry = rawShowSidebarEntry !== false;',
      "var showSidebarEntry = String(rawShowSidebarEntry).toLowerCase() !== 'false';"))],

  ['⑨ dist 没重建（导出还没跟上）',
    (r) => edit(r, 'dist/index.js', (s) => s.replace(/resolveShowSidebarEntry/g, 'resolveShowSidebarEntryOld'))],

  ['⑩ 配置模板把旧键当作用户该改的键',
    (r) => edit(r, 'cordis.patch.yml', (s) => s.replace('showSidebarEntry: true', 'showSidebarButton: true'))],
]

let ok = 0, bad = 0
for (const [label, inject] of CASES) {
  const root = buildMirror()
  try {
    const base = runGuard(root)
    if (base.code !== 0) {
      bad++
      const reds = base.out.split('\n').filter((l) => l.includes('✗')).join(' | ')
      console.log(`  ✗ ${label}\n      基线就是红的（镜像不完整？）：${reds}`)
      continue
    }
    inject(root)
    const after = runGuard(root)
    if (after.code === 0) {
      bad++
      console.log(`  ✗ ${label}\n      注入后守卫仍然全绿 —— 这条断言是空转`)
    } else {
      ok++
      const hits = after.out.split('\n').filter((l) => l.includes('✗')).length
      console.log(`  ✓ ${label}（变红，命中 ${hits} 条断言）`)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

console.log(`\n结果: ${ok} 有效 / ${bad} 空转 / 共 ${CASES.length} 例`)
process.exit(bad === 0 ? 0 : 1)
