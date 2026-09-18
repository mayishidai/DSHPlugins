// 在「模拟 profile」目录里运行：按**包名**解析面板插件，检查导出形态是否可加载。
//
// 由 test-panel-resolve.mjs 复制进临时目录后 spawn 执行。
// 之所以必须在这里跑：ESM 的 bare specifier 是相对**导入者所在位置**解析的，
// 只有把探针放进临时 profile 的目录树里，才能真实复现 DSH 的解析路径。
//
// 输出一行 JSON，交给父进程判定。
const name = process.argv[2]

const out = { name, resolved: false, keys: [], hasApply: false, hasDefault: false, error: null }

try {
  const mod = await import(name)
  out.resolved = true
  out.keys = Object.keys(mod)
  out.hasApply = typeof mod.apply === 'function'
  // default 应是 Cordis 认可的插件对象（有 apply）
  out.hasDefault = !!(mod.default && typeof mod.default.apply === 'function')
  // 三种常见加载器实现都要能取到合法插件
  const p1 = mod.apply ? mod : undefined
  const p2 = mod.default
  const p3 = mod.default ?? mod
  out.viaNamed = isValid(p1)
  out.viaDefault = isValid(p2)
  out.viaCoalesce = isValid(p3)
} catch (e) {
  out.error = e.code || e.message
}

function isValid(p) {
  return typeof p === 'function' || !!(p && typeof p.apply === 'function')
}

console.log(JSON.stringify(out))
