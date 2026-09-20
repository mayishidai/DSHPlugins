/**
 * 源码 / bundle 副本一致性测试。
 *
 * 用法：node scripts/test-client-parity.mjs
 *
 * ## 为什么需要这个文件
 *
 * `generate-client.mjs` 内嵌了 `src/client/*` 的**第二份实现**（因为目标机
 * 不编译，只能直接产出自包含 bundle）。两份必然漂移，本项目已经**实际踩过三次**：
 *
 *   1. install 落点 —— 插件内 install.sh 与仓库根脚本各写一份 → DSH 报
 *      `invalid plugin, ... received undefined`
 *   2. 侧边栏显隐 —— 源码有开关、bundle 里没读 → 配置改了不生效（死配置）
 *   3. **错误渲染** —— 源码显示 `{error}` 内容、bundle 只画「重试」按钮
 *      → 所有失败长得一模一样，无法定位
 *
 * 三次的共同点：**编译通过、测试全绿、运行时不报错**。
 * 所以「靠人眼比对两份」是不可靠的，必须用机器钉住。
 *
 * ## 判据为什么不比较源码文本
 *
 * 两份本来就不是同一份代码（一份 TSX/JSX，一份手写 `jsxRuntime.jsx(...)`），
 * 逐字比对必然失败。这里比对的是**行为特征**：对每条「用户可感知的行为」，
 * 断言两份**都有**对应实现。
 *
 * ## 局限（必须说明）
 *
 * 这是「特征存在性」检查，不是语义等价证明。它能抓住「一边改了一边没改」，
 * 但抓不住「两边都写错」。后者要靠单独的单元测试。
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG = join(__dirname, '..')

const bundleGen = readFileSync(join(PKG, 'generate-client.mjs'), 'utf-8')
const panelSrc = readFileSync(join(PKG, 'src', 'client', 'PluginRepoPanel.tsx'), 'utf-8')
const indexSrc = readFileSync(join(PKG, 'src', 'client', 'index.tsx'), 'utf-8')
const clientJs = readFileSync(join(PKG, 'client', 'client.js'), 'utf-8')

let pass = 0, fail = 0
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label} ${extra}`) }
}

/** 对一条行为，断言「源码」与「生成器」两份都有实现。 */
function bothHave(label, re, { src = panelSrc, gen = bundleGen } = {}) {
  const inSrc = re.test(src)
  const inGen = re.test(gen)
  if (inSrc && inGen) { pass++; console.log(`  ✓ ${label}`) }
  else {
    fail++
    console.log(`  ✗ ${label}  [源码=${inSrc ? '有' : '缺'} / 生成器=${inGen ? '有' : '缺'}]`)
  }
}

console.log('\n[1. 错误态：必须显示错误内容（本项目的第 3 次漂移）]')
bothHave('源码与生成器都渲染 error 内容',
  /children:\s*error|\{error\}/)
bothHave('错误块存在（不只一个按钮）',
  /error[\s\S]{0,400}?(repoDir|仓库目录|接口)/)
bothHave('错误里带请求 URL 便于定位',
  /apiBase\s*\+\s*'\/list'|`\$\{apiBase\}\/list`/)
bothHave('错误里带已解析的 repoDir',
  /repoDir/)

console.log('\n[2. HTTP 状态码：不能只看 body]')
bothHave('先判 r.ok / response.ok 再解析',
  /!r\.ok|!response\.ok/)
bothHave('错误信息含 HTTP 状态码',
  /HTTP\s*'?\s*\+\s*r\.status|HTTP \$\{response\.status\}/)

console.log('\n[3. 侧边栏显隐（第 2 次漂移）]')
bothHave('读取 showSidebarButton', /showSidebarButton/, { src: indexSrc })
bothHave('用 !== false 判断（缺省即显示）', /!== false/, { src: indexSrc })
bothHave('注册被 if(showSidebarButton...) 包住', /if\s*\(\s*showSidebarButton\b/, { src: indexSrc })
bothHave('自绘 SVG 图标（不依赖宿主图标集）', /PackageIcon/, { src: indexSrc })
bothHave('图标用 currentColor 跟随主题', /currentColor/, { src: indexSrc })

console.log('\n[4. 三个接口路径：源码 / 生成器 / bundle 必须一致]')
const endpoints = ['/list', '/install', '/uninstall']
for (const ep of endpoints) {
  const inGen = bundleGen.includes(`apiBase + '${ep}'`)
  const inBundle = clientJs.includes(`apiBase + '${ep}'`)
  const inSrc = panelSrc.includes(`\${apiBase}${ep}`)
  if (inGen && inBundle && inSrc) { pass++; console.log(`  ✓ ${ep}`) }
  else {
    fail++
    console.log(`  ✗ ${ep}  [源码=${inSrc ? '有' : '缺'} / 生成器=${inGen ? '有' : '缺'} / bundle=${inBundle ? '有' : '缺'}]`)
  }
}

console.log('\n[5. 产物已重新生成（bundle 应包含最新生成器内容）]')
// bundle 由生成器产出，抽样几个只在生成器里出现的新标记
for (const marker of ["HTTP ' + r.status", 'PackageIcon', 'showSidebarButton !== false']) {
  const inGen = bundleGen.includes(marker)
  const inBundle = clientJs.includes(marker)
  if (inGen && inBundle) { pass++; console.log(`  ✓ bundle 含 "${marker}"`) }
  else if (inGen && !inBundle) {
    fail++
    console.log(`  ✗ bundle 缺 "${marker}" —— generate-client.mjs 改了但没重跑 npm run build`)
  } else {
    // 生成器里也没有，说明该标记已改名，另行处理
    pass++; console.log(`  – 跳过 "${marker}"（生成器中已不存在）`)
  }
}

console.log('\n[6. 空态语义：没有插件 ≠ 出错]')
// 两份的空态文案来源不同（源码直接写中文，生成器用 zh.empty 字典），
// 但都必须存在「空仓库」这个独立分支，否则会把「空」误报成「错」。
bothHave('存在独立的空态文案', /仓库中没有插件|No plugins in repository|zh\.empty/)

console.log(`\n结果: ${pass} 通过 / ${fail} 失败 / 共 ${pass + fail} 例`)
if (fail > 0) {
  console.log('\n两份实现已经漂移。请同步修改：')
  console.log('  src/client/*            （开发者读/改的那份）')
  console.log('  generate-client.mjs     （真正打进 client.js 的那份）')
  console.log('然后重跑 npm run build')
}
process.exit(fail === 0 ? 0 : 1)
