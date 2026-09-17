/**
 * isNewer 单元测试（零依赖，node 直接跑）。
 * 用法：node test-isnewer.mjs
 */
function isNewer(latest, current) {
  if (!latest || !current) return false
  const parse = (v) => {
    const core = v.trim().replace(/^v/i, '').split('-')[0]
    if (!core) return null
    const parts = core.split('.')
    if (!parts.every(p => /^\d+$/.test(p))) return null
    return parts.map(p => parseInt(p, 10))
  }
  const a = parse(latest)
  const b = parse(current)
  if (!a || !b) return false
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x > y) return true
    if (x < y) return false
  }
  return false
}

// [latest, current, expected]
const cases = [
  ['1.0.1', '1.0.0', true],
  ['1.1.0', '1.0.9', true],
  ['2.0.0', '1.9.9', true],
  ['1.0.0', '1.0.0', false],
  ['1.0.0', '1.0.1', false],
  ['0.9.0', '1.0.0', false],
  ['1.0', '0.9.9', true],
  ['1', '0.9.9', true],
  ['1.0.0.1', '1.0.0', true],
  ['1.0.0', '1.0.0.1', false],
  ['1.10.0', '1.9.0', true],
  ['1.9.0', '1.10.0', false],
  ['v2.0.0', '1.0.0', true],
  ['1.0.0', 'v1.0.0', false],
  ['1.0.0-beta.1', '1.0.0', false],
  ['1.1.0-alpha', '1.0.0', true],
  [null, '1.0.0', false],
  ['1.0.0', null, false],
  [null, null, false],
  ['', '1.0.0', false],
  ['abc', '1.0.0', false],
  ['1.0.0', 'abc', false],
  [' 1.0.1 ', '1.0.0', true],
]

let pass = 0
let fail = 0
for (const [latest, current, expected] of cases) {
  const got = isNewer(latest, current)
  const ok = got === expected
  if (ok) pass++
  else {
    fail++
    console.log(`FAIL: isNewer(${JSON.stringify(latest)}, ${JSON.stringify(current)}) = ${got}, 期望 ${expected}`)
  }
}
console.log(`\n结果: ${pass} 通过 / ${fail} 失败 / 共 ${cases.length} 例`)
process.exit(fail === 0 ? 0 : 1)
