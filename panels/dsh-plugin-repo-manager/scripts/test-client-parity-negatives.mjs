#!/usr/bin/env node
/**
 * `test-client-parity.mjs` 第 11 节（locale 字典比对）的反向回归。
 *
 * 用法：node scripts/test-client-parity-negatives.mjs
 *
 * ## 为什么必须有这个文件
 *
 * 只加正向守卫等于加了个**可能永远为真**的断言 —— 本项目在
 * `scripts/tests/test-skill-parity.py` 上就是靠配对的
 * `test-skill-parity-negatives.py` 才确认守卫不是空转的。
 * 第 11 节的判据依赖「从两份文件里把字典抠出来再比」，一旦标记改名或格式变化，
 * 抠出来的会是**两个空集合**，而「空对空」恒等于 → 守卫静默失效。
 * 所以这里逐个注入真实的漂移形态，确认它真的会变红。
 *
 * ## 为什么在临时镜像目录里跑，而不是就地改文件
 *
 * 第一版是「改 `generate-client.mjs` → 跑 → 还原」，实测踩到两个坑：
 *   1. 它**会改写被 git 跟踪的文件** —— 与 `make verify` 之类并行跑时，别的检查
 *      会读到被注入的中间状态（本项目实测：并行的 `validate_repo.py` 报出一条
 *      莫名其妙的 FAIL，单独跑又全绿，排查成本很高）；
 *   2. 中途异常会把仓库改坏（虽已用 `try/finally` 兜住，但仍然是隐患）。
 * 所以改为把守卫需要的文件复制到系统临时目录里、**在镜像里跑正向守卫** ——
 * 对真实工作区完全只读，可以随便并行。
 *
 * 注意：全程用 `process.execPath` 起子进程，不依赖 PATH 里的 node。
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG = join(__dirname, '..')

/** 正向守卫会读到的全部文件（少一个它就会读不到、直接抛异常）。 */
const NEEDED = [
  'scripts/test-client-parity.mjs',
  'generate-client.mjs',
  'client/client.js',
  'src/client/PluginRepoPanel.tsx',
  'src/client/index.tsx',
  'src/client/locales.ts',
]

/** 建一个镜像目录，返回其根。 */
function buildMirror() {
  const root = mkdtempSync(join(tmpdir(), 'parity-neg-'))
  for (const rel of NEEDED) {
    const dst = join(root, rel)
    mkdirSync(dirname(dst), { recursive: true })
    copyFileSync(join(PKG, rel), dst)
  }
  return root
}

/** 在镜像里跑一次正向守卫，返回 {fail, out}。 */
function runParity(root) {
  const r = spawnSync(process.execPath, [join(root, 'scripts', 'test-client-parity.mjs')],
    { cwd: root, encoding: 'utf-8' })
  const out = (r.stdout || '') + (r.stderr || '')
  const m = /结果: (\d+) 通过 \/ (\d+) 失败/.exec(out)
  return { fail: m ? Number(m[2]) : -1, out }
}

/**
 * 注入形态。每条：名称 / 变换 / 期望在输出里出现的关键字。
 * 变换一律只替换**单行内容**，不跨行 —— 工作区是 CRLF，跨行串里带裸 `\n` 会静默不命中。
 */
const CASES = [
  {
    name: '文案被改（gen zh 的 retry 加个后缀）',
    apply: s => s.replace("      retry: '重试',", "      retry: '重试X',", 1),
    needle: 'retry',
  },
  {
    name: '文案被改（gen en 的 confirmUninstallMsg 退回含 "cannot be undone" 的旧版）',
    apply: s => s.replace(
      "      confirmUninstallMsg: 'Uninstall \"{{name}}\"? It will be removed from the DSH skills directory; the repository directory is not affected.',",
      "      confirmUninstallMsg: 'Are you sure? This action cannot be undone.',",
      1),
    needle: 'confirmUninstallMsg',
  },
  {
    name: '键被删（gen zh 少了 pollIntervalHint）',
    apply: s => s.replace(
      "      pollIntervalHint: '自动刷新的时间间隔（毫秒）',",
      "      _removedByTest: 'x',",
      1),
    needle: 'pollIntervalHint',
  },
  {
    name: '键被改名（openInFileExplorer → openInExplorer）',
    apply: s => s.replace(/openInFileExplorer/g, 'openInExplorer'),
    needle: 'openInExplorer',
  },
]

let pass = 0, fail = 0
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label} ${extra}`) }
}

const root = buildMirror()
try {
  const genPath = join(root, 'generate-client.mjs')
  const original = readFileSync(genPath, 'utf-8')

  // 基线：未注入时必须全绿，否则反向回归本身没有意义
  const base = runParity(root)
  check(`基线 0 失败（当前${base.fail === 0 ? '全绿' : '有 ' + base.fail + ' 处红'}）`,
    base.fail === 0, base.fail < 0 ? '\n      无法解析正向守卫的输出（镜像不完整？）' : '')

  for (const c of CASES) {
    const mutated = c.apply(original)
    if (mutated === original) {
      fail++
      console.log(`  ✗ 注入点不存在（本文件已过期，请同步）：${c.name}`)
      continue
    }
    writeFileSync(genPath, mutated)
    const { fail: n, out } = runParity(root)
    writeFileSync(genPath, original)
    const hit = out.includes(c.needle)
    if (n > 0 && hit) {
      pass++
      console.log(`  ✓ ${c.name} → ${n} 处红，且输出点到了 "${c.needle}"`)
    } else {
      fail++
      console.log(`  ✗ ${c.name} → 红 ${n} 处，命中 "${c.needle}"=${hit} —— 守卫空转！`)
    }
  }

  const after = runParity(root)
  check('还原后回到 0 失败', after.fail === 0, `实得 ${after.fail}`)
} finally {
  // 镜像在系统临时目录里，删掉即可；真实工作区全程未被写入
  rmSync(root, { recursive: true, force: true })
}

console.log(`\n结果: ${pass} 通过 / ${fail} 失败 / 共 ${pass + fail} 例`)
if (fail > 0) {
  console.log('\n第 11 节守卫已空转或被绕过。检查 test-client-parity.mjs 的 sliceBlock/parseDict 标记是否与实际文件一致。')
}
process.exit(fail === 0 ? 0 : 1)
