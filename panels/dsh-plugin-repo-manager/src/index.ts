/**
 * dsh-plugin-repo-manager - 自定义插件仓库管理插件
 * 
 * 功能：
 * - 侧边栏按钮，打开面板
 * - 列出本地 skill 仓库
 * - 显示安装状态
 * - 安装/卸载 skill
 * - 轮询刷新（可自定义间隔）
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, mkdirSync, statSync } from 'node:fs'
import { resolve, join, dirname, relative, isAbsolute } from 'node:path'
import { homedir } from 'node:os'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const name = 'dsh-plugin-repo-manager'

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
  /** 仓库目录：本仓库按「类型」分层，技能型统一放在顶层 skills/ 下 */
  repoDir: '/vol1/1000/AI/DSHPlugin/skills',
  /** skills 目录 */
  skillsDir: () => join(process.env.DSH_HOME || join(process.env.HOME || '', '.dsh'), 'skills'),
  /** 轮询间隔（毫秒） */
  pollInterval: 3000,
  /** 是否启用侧边栏按钮 */
  showSidebarButton: true,
  /** 侧边栏按钮标题 */
  sidebarTitle: '插件仓库',
}

/**
 * 解析仓库目录
 */
function resolveRepoDir(ctx: any): string {
  const config = ctx.get?.('config') as Record<string, unknown> | undefined
  const raw = (config?.['repoDir'] as string | undefined)
    ?? process.env.DSH_PLUGIN_REPO_DIR
    ?? DEFAULT_CONFIG.repoDir
  return expandHome(raw)
}

/**
 * 解析 skills 目录
 */
/**
 * 展开路径中的 `~`（Node 的 fs 不认波浪号，配置文件里常写 ~/.dsh/skills）。
 * 仅处理开头的 `~` 或 `~/`，与 shell 语义一致。
 */
function expandHome(p: string): string {
  if (!p) return p
  if (p === '~') return homedir()
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return join(homedir(), p.slice(2))
  }
  return p
}

/**
 * 一个「候选 skills 目录」及其现状。
 *
 * 为什么要把候选摊开：`skillsDir` 决定「安装写到哪」，而 **DSH 只扫描它自己的
 * `$DSH_HOME/skills/`**。两者一旦错位，就会出现本插件最阴的一类失效 ——
 * 面板显示「已安装」、磁盘上文件也确实写好了、接口全部 `ok:true`、日志一行不报，
 * 但 DSH 永远看不到那个技能；反过来「卸载」也只删掉那份没人看的副本，
 * DSH 扫描目录里的原件纹丝不动。用户的感受就是**「点了安装和卸载都没生效」**。
 *
 * 所以这里不猜，而是把每个候选的「存不存在 / 装了几个技能」都算出来，
 * 由 `/_health` 直接暴露给人核对。
 */
export interface SkillsDirCandidate {
  dir: string
  source: string
  exists: boolean
  /** 该目录下「有 SKILL.md 的合法子目录」个数 —— 用来判断它像不像真正的 skills 目录 */
  skillCount: number
}

function probeSkillsDir(dir: string): { exists: boolean; skillCount: number } {
  if (!existsSync(dir)) return { exists: false, skillCount: 0 }
  try {
    const skillCount = readdirSync(dir).filter((entry) => {
      if (!isValidName(entry)) return false
      try {
        return statSync(join(dir, entry)).isDirectory() && existsSync(join(dir, entry, 'SKILL.md'))
      } catch {
        return false
      }
    }).length
    return { exists: true, skillCount }
  } catch {
    return { exists: true, skillCount: 0 }
  }
}

/**
 * 列出所有候选 skills 目录（去重后按优先级排序）。
 *
 * 顺序 = 优先级：`config.skillsDir` > `DSH_PLUGIN_SKILLS_DIR` > `$DSH_HOME/skills`
 * > `~/.dsh/skills` > 文档记载的 NAS 数据根（仅兜底，见 `resolveSkillsDir`）。
 */
export function skillsDirCandidates(explicit?: string): SkillsDirCandidate[] {
  const raw: Array<{ dir: string; source: string }> = []
  const push = (dir: string | undefined, source: string) => {
    if (dir && dir.trim()) raw.push({ dir: expandHome(dir.trim()), source })
  }

  push(explicit, 'config.skillsDir')
  push(process.env['DSH_PLUGIN_SKILLS_DIR'], 'env:DSH_PLUGIN_SKILLS_DIR')
  push(process.env['DSH_HOME'] ? join(expandHome(process.env['DSH_HOME'].trim()), 'skills') : undefined, 'env:DSH_HOME')
  push(join(homedir(), '.dsh', 'skills'), 'default:~/.dsh')
  // 仓库文档（docs/development-runbook.md）记载的 NAS 数据根。
  // 只作为**最后一个候选**：它既不会覆盖任何显式配置，也不会在别处可用时被选中，
  // 仅在「主候选明显是空的、而它确实装着技能」这种毫无歧义的情况下兜底。
  push('/vol2/@appdata/deepseek.harness/dsh-data/skills', 'documented:NAS')

  const seen = new Set<string>()
  const out: SkillsDirCandidate[] = []
  for (const c of raw) {
    const key = resolve(c.dir)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...c, ...probeSkillsDir(c.dir) })
  }
  return out
}

/**
 * 解析 skills 目录。
 *
 * 三级策略，原则是**「人的显式配置永远赢，启发式只在毫无歧义时兜底」**：
 *   ① 显式给出（`config.skillsDir` / `DSH_PLUGIN_SKILLS_DIR`）→ 直接用，不做任何纠偏；
 *   ② 主候选（`$DSH_HOME/skills`，无 `DSH_HOME` 时 `~/.dsh/skills`）确实装着技能 → 用它；
 *   ③ 主候选不装技能，而**恰好只有一个**候选装着 → 用它兜底。
 *      若有多个候选都装着技能，则**不猜**，保持主候选不动，交给 `/_health` 报警
 *      —— 猜错目录会把技能写到另一个地方，比不猜更危险。
 */
function resolveSkillsDir(ctx: any): string {
  return resolveSkillsDirWithSource(ctx).dir
}

/** 与 `resolveSkillsDir` 同源，但额外回报「这个值是从哪来的」——用于自检与日志。 */
export function resolveSkillsDirWithSource(ctx: any): { dir: string; source: string } {
  const config = ctx.get?.('config') as Record<string, unknown> | undefined
  const explicit = (config?.['skillsDir'] as string | undefined) ?? process.env['DSH_PLUGIN_SKILLS_DIR']
  // ① 显式配置优先
  if (explicit && String(explicit).trim()) {
    return { dir: expandHome(String(explicit).trim()), source: 'config.skillsDir' }
  }

  const candidates = skillsDirCandidates()
  const primary = candidates[0] ?? {
    dir: DEFAULT_CONFIG.skillsDir(),
    source: 'default:~/.dsh',
    exists: false,
    skillCount: 0,
  }
  // ② 主候选已经是「像样的 skills 目录」
  if (primary.skillCount > 0) return { dir: primary.dir, source: primary.source }
  // ③ 主候选不装技能时的兜底 —— **但仅限 DSH_HOME 未导出的情况**。
  //    `$DSH_HOME` 一旦存在就是权威（DSH 就是按它扫描的），偏离它反而是错的；
  //    只有主候选退化成「瞎猜的 ~/.dsh/skills」时，才允许用唯一定位去救。
  if (!process.env['DSH_HOME']) {
    const withSkills = candidates.filter((c) => c.skillCount > 0)
    // 恰好一个候选装着技能才兜底；多个都有则不猜（猜错等于把技能写到另一个地方）
    if (withSkills.length === 1) return { dir: withSkills[0].dir, source: `${withSkills[0].source}(兜底)` }
  }
  return { dir: primary.dir, source: primary.source }
}

/**
 * 生成 skillsDir 的完整诊断：候选清单 + 「装的地方 ≠ DSH 扫的地方」告警。
 *
 * `/_health` 与 `/list` **共用这一个判断**，避免「自检端点说没事、面板却在报错」
 * 这种两处判据漂移。
 */
export function describeSkillsDir(skillsDir: string, source?: string): {
  source: string
  candidates: SkillsDirCandidate[]
  warning: string | null
} {
  const candidates = skillsDirCandidates()
  const key = resolve(skillsDir)
  let chosen = candidates.find((c) => resolve(c.dir) === key)
  if (!chosen) {
    // 解析值不在候选链里 → 它来自显式配置
    chosen = { dir: skillsDir, source: source ?? 'config.skillsDir', ...probeSkillsDir(skillsDir) }
    candidates.unshift(chosen)
  }

  const withSkills = candidates.filter((c) => c.skillCount > 0)
  const othersWithSkills = withSkills.filter((c) => resolve(c.dir) !== key)
  let warning: string | null = null

  if (chosen.skillCount === 0 && othersWithSkills.length > 0) {
    // 最明确的错位信号：当前这个目录一个技能都没有，别处却装着。
    warning =
      `当前 skillsDir（${skillsDir}）里没有任何技能，但另有目录装着：` +
      othersWithSkills.map((c) => `${c.dir}（${c.skillCount} 个）`).join('、') +
      `。插件读写的是前者，而 DSH 只扫描它自己的 $DSH_HOME/skills —— ` +
      `两者不一致时，装/卸在面板上有反应、DSH 侧却毫无变化，且全程不报错。` +
      `请把 config.skillsDir 设为 DSH 真正扫描的那个目录。`
  } else if (chosen.skillCount > 0 && othersWithSkills.length > 0) {
    // 多个位置都装着技能 → 无法确定 DSH 认哪个，提示人工确认（不自动猜）
    warning =
      `检测到多个目录都装着技能（当前使用的是 ${skillsDir}，${chosen.skillCount} 个）：` +
      othersWithSkills.map((c) => `${c.dir}（${c.skillCount} 个）`).join('、') +
      `。DSH 只会扫描其中一个，若技能装了不生效，请确认并把 config.skillsDir 指向正确的那个。`
  } else if (!chosen.exists) {
    warning =
      `当前 skillsDir 不存在：${skillsDir}。安装会自动创建它，` +
      `但若 DSH 扫描的是别的目录，装了也不会生效。`
  }

  return { source: chosen.source, candidates, warning }
}

/**
 * 解析轮询间隔
 */
function resolvePollInterval(ctx: any): number {
  const config = ctx.get?.('config') as Record<string, unknown> | undefined
  return (config?.['pollInterval'] as number | undefined)
    ?? parseInt(process.env.DSH_PLUGIN_POLL_INTERVAL || '3000')
    ?? 3000
}

/**
 * 解析「是否显示主界面侧边栏按钮」。
 *
 * 优先级：`config.showSidebarButton` > `DSH_PLUGIN_SHOW_SIDEBAR` > 默认 true。
 *
 * 布尔解析刻意宽容：配置文件（YAML/JSON）与环境变量都只能给字符串，
 * `"false"` / `"0"` / `"no"` / `"off"` 都必须识别为 false —— 若用
 * `Boolean(raw)` 判断，字符串 `"false"` 是**真值**，会导致「在配置里关掉、
 * 实际却仍然显示」这种最难排查的失效。
 * 不认识的写法一律回退到默认值，避免拼错配置项把按钮弄丢。
 */
function resolveShowSidebarButton(ctx: any): boolean {
  const config = ctx.get?.('config') as Record<string, unknown> | undefined
  const fromConfig = config?.['showSidebarButton']
  const raw = (fromConfig !== undefined ? fromConfig : process.env['DSH_PLUGIN_SHOW_SIDEBAR'])
  if (raw === undefined || raw === null || raw === '') return DEFAULT_CONFIG.showSidebarButton
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw !== 0
  const s = String(raw).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(s)) return true
  if (['0', 'false', 'no', 'off'].includes(s)) return false
  return DEFAULT_CONFIG.showSidebarButton
}

/**
 * 解析侧边栏按钮标题（hover 提示 / 无障碍标签）。
 */
function resolveSidebarTitle(ctx: any): string {
  const config = ctx.get?.('config') as Record<string, unknown> | undefined
  const raw = (config?.['sidebarTitle'] as string | undefined)
    ?? process.env['DSH_PLUGIN_SIDEBAR_TITLE']
    ?? DEFAULT_CONFIG.sidebarTitle
  return raw || DEFAULT_CONFIG.sidebarTitle
}

/**
 * 从请求 URL 中取出「相对本插件前缀」的子路径，并归一化为 `/list` 这种形式。
 *
 * ## 为什么不能直接 `url.pathname === '/list'`
 *
 * `webServer.register({ kind: 'prefix', path: '/api/plugin-repo' })` 之后，
 * handler 收到的 `req.url` 到底是**剥掉前缀的** `'/list'`，还是**保留全路径的**
 * `'/api/plugin-repo/list'`，取决于宿主的实现约定 —— 本仓库没有 DSH 源码，
 * 这一点**无法在本机验证**。
 *
 * 只按其中一种写，另一种下会**全部落进 404 分支**：
 * 返回 `HTTP 200 + { ok:false, message:'接口不存在' }`，
 * 前端表现为「插件列表空 + 一个重试按钮」，看起来像后端没起来，极难排查。
 *
 * 这里两种都兼容：**先剥掉自己的前缀，剩下的按 `/list` 匹配**。
 * 无论宿主给的是哪一种形状，都能归一化到同一个子路径。
 */
export function normalizeSubPath(pathname: string, prefix = '/api/plugin-repo'): string {
  let p = pathname || ''
  // 去掉查询串（handler 里用的是 url.pathname，理论上没有，防御性处理）
  const q = p.indexOf('?')
  if (q >= 0) p = p.slice(0, q)
  // 宿主若保留全路径，这里剥掉；若已剥掉，startsWith 不成立则原样保留
  if (p === prefix) return '/'
  if (p.startsWith(prefix + '/')) p = p.slice(prefix.length)
  // 末尾斜杠归一化：'/list/' 与 '/list' 等价
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p || '/'
}

/**
 * 检查名称是否合法（kebab-case）
 */
function isValidName(name: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)
}

/**
 * 判断 `target` 是否确实位于 `base` 目录**之内**（防路径穿越）。
 *
 * ## ⚠️ 这里曾经写成 `require('path').relative(...)` —— 一个静默失效的 bug
 *
 * 本包是 `"type": "module"`（ESM），而 ESM **没有** `require`。
 * `require('path')` 于是抛 `ReferenceError: require is not defined`。
 * 它为什么能藏很久：
 *   - 该行在 `isValidName` 之后、`existsSync` 之前，**参数合法且目录存在时必然执行**；
 *   - 异常被 `handleApiRequest` 的 catch 兜住，只回一个
 *     `{ ok:false, error:{ code:'INTERNAL_ERROR', message:'require is not defined' } }`，
 *     HTTP 状态**仍是 200**，日志里也只是一行 ERROR；
 *   - 前端「卸载」按钮因此表现为**点了没反应**（列表不刷新、也没有明显报错）。
 * 教训：**ESM 里绝不能用 `require`**；且构建产物必须由测试断言「不含 `require(`」，
 * 否则编译能过、单测若用 CJS 方式加载也会骗过（`node -e` 会注入 `require`）。
 *
 * 用已导入的 `path.relative` 实现，语义与旧写法一致：
 * 结果为空、以 `..` 开头、或仍是绝对路径，都说明 target 不在 base 内。
 */
export function isInsideDir(base: string, target: string): boolean {
  const rel = relative(resolve(base), resolve(target))
  if (!rel) return false              // 两者是同一个路径
  if (rel.startsWith('..')) return false
  if (isAbsolute(rel)) return false   // Windows 上跨盘符时 relative 会返回绝对路径
  return true
}

/**
 * 读取插件版本
 */
function getPluginVersion(pluginDir: string): string | null {
  // 依次尝试：manifest.json（技能/agent/mcp 型）→ package.json（面板型）→ version.json（已装留档）
  for (const file of ['manifest.json', 'package.json', 'version.json']) {
    const p = join(pluginDir, file)
    if (!existsSync(p)) continue
    try {
      const data = JSON.parse(readFileSync(p, 'utf-8'))
      if (data?.version) return data.version
    } catch { /* 该文件损坏则继续尝试下一个 */ }
  }
  return null
}

/**
 * 读取技能/插件的**描述**，供面板展示。
 *
 * 来源按优先级依次尝试（本仓库实测：**全部 19 个插件都能从 manifest.json 拿到**，
 * 后两条是给尚未补 manifest 的插件兜底）：
 *   1. `manifest.json` 的 `description`
 *   2. `SKILL.md` 的 YAML frontmatter `description:`（去引号、压平换行）
 *   3. `package.json` 的 `description`
 * 取不到就返回 null —— 前端显示占位符，**不编造内容**。
 */
export function getPluginDescription(pluginDir: string): string | null {
  // 1. manifest.json
  const mf = join(pluginDir, 'manifest.json')
  if (existsSync(mf)) {
    try {
      const d = JSON.parse(readFileSync(mf, 'utf-8'))
      if (typeof d?.description === 'string' && d.description.trim()) {
        return d.description.trim()
      }
    } catch { /* 损坏则继续往下找 */ }
  }

  // 2. SKILL.md frontmatter
  const skillMd = join(pluginDir, 'SKILL.md')
  if (existsSync(skillMd)) {
    try {
      const text = readFileSync(skillMd, 'utf-8')
      // 只在前置的 frontmatter 块里找，避免正文里的 "description:" 误命中
      const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
      if (fm) {
        const m = /^description:\s*(.+)$/m.exec(fm[1])
        if (m) {
          let v = m[1].trim()
          // 去掉包裹的引号（YAML 里单双引号都常见）
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1)
          }
          v = v.replace(/\s+/g, ' ').trim()
          if (v) return v
        }
      }
    } catch { /* 继续往下找 */ }
  }

  // 3. package.json
  const pkg = join(pluginDir, 'package.json')
  if (existsSync(pkg)) {
    try {
      const d = JSON.parse(readFileSync(pkg, 'utf-8'))
      if (typeof d?.description === 'string' && d.description.trim()) {
        return d.description.trim()
      }
    } catch { /* 忽略 */ }
  }

  return null
}

/**
 * 仓库列表的一行。
 *
 * `source` 分两类，这是「把 DSH 侧清干净、仓库侧不动」的关键：
 *   - `repo`           —— 仓库里有，`repoDirName` 即仓库中的目录名
 *   - `installed-only` —— **DSH 里装着，但仓库里已经没有了**（`repoDirName: null`）
 */
export interface RepoPluginEntry {
  name: string
  /** 仓库中的目录名；`installed-only` 时为 null */
  repoDirName: string | null
  version: string | null
  description: string | null
  installed: boolean
  installedVersion: string | null
  hasUpdate: boolean
  source: 'repo' | 'installed-only'
}

/**
 * 列出插件：仓库里的 + **DSH 里装着但仓库已没有的**。
 *
 * ## ⚠️ 第二类必须有，不要退回「只遍历 repoDir」
 *
 * 早先这里**只遍历 `repoDir`**，`installedNames` 仅被用来给仓库条目"打已装标记"。
 * 后果：仓库里删掉、DSH 里还留着的技能**根本不出现在列表里** —— 面板上看着
 * 已经干净了，而 DSH 的 `skills/` 里那份纹丝不动，**既看不见也没有卸载入口**
 * （卸载按钮只存在于列表行内）。用户感受是「面板可以移除，但并没有真实从 DSH 中移除」。
 *
 * 修法只是把 `installedNames` 里仓库中不存在的那部分补成列表项：
 * **卸载路径本来就只依赖 `skillsDir + name`（与仓库无关）**，补上列表即可直接复用。
 *
 * 教训（可迁移）：凡是「收集了一组数据却只用于判存在」的地方，都要追问一句
 * 「这组数据的另一侧去哪了」—— 一半被丢弃时不会报错，只会有一类东西永远看不见。
 */
export function listPlugins(repoDir: string, skillsDir: string): RepoPluginEntry[] {
  const installedNames = new Set<string>()
  if (existsSync(skillsDir)) {
    for (const name of readdirSync(skillsDir)) {
      if (isValidName(name)) installedNames.add(name)
    }
  }

  const plugins: RepoPluginEntry[] = []
  const repoNames = new Set<string>()

  if (existsSync(repoDir)) {
    for (const dirName of readdirSync(repoDir)) {
      const pluginDir = join(repoDir, dirName)
      if (!existsSync(pluginDir) || readdirSync(pluginDir).length === 0) continue

      // 识别为插件的依据：SKILL.md（技能型）/ manifest.json / package.json（面板型）
      const markers = ['SKILL.md', 'manifest.json', 'package.json']
      if (!markers.some(f => existsSync(join(pluginDir, f)))) continue

      repoNames.add(dirName)
      const version = getPluginVersion(pluginDir)
      const isInstalled = installedNames.has(dirName)
      const installedVersion = isInstalled ? getInstalledVersion(skillsDir, dirName) : null

      plugins.push({
        name: dirName,
        repoDirName: dirName,
        version,
        description: getPluginDescription(pluginDir),
        installed: isInstalled,
        installedVersion,
        hasUpdate: isInstalled && isNewer(version, installedVersion),
        source: 'repo',
      })
    }
  }

  // 「DSH 里装着、仓库里已没有」的补进来（否则无法卸载，见上方说明）。
  // 排在仓库插件之后、按名字排序 —— 轮询每几秒重拉一次，顺序必须稳定。
  const orphans = [...installedNames].filter(n => !repoNames.has(n)).sort()
  for (const name of orphans) {
    const installedVersion = getInstalledVersion(skillsDir, name)
    plugins.push({
      name,
      repoDirName: null,
      // 没有仓库版本可比 → 版本列直接显示已装版本，hasUpdate 恒为 false
      version: installedVersion,
      description: getPluginDescription(join(skillsDir, name)),
      installed: true,
      installedVersion,
      hasUpdate: false,
      source: 'installed-only',
    })
  }

  return plugins
}

/**
 * 读取已安装版本
 */
function getInstalledVersion(skillsDir: string, name: string): string | null {
  const versionJson = join(skillsDir, name, 'version.json')
  if (existsSync(versionJson)) {
    try {
      const data = JSON.parse(readFileSync(versionJson, 'utf-8'))
      return data.version ?? null
    } catch { return null }
  }
  return null
}

/**
 * 语义化版本比较：latest 是否比 current 新。
 * 缺任一版本、或版本号无法解析时返回 false（不确定就不提示更新）。
 */
export function isNewer(latest: string | null, current: string | null): boolean {
  if (!latest || !current) return false
  // 只在「看起来像版本号」时比较：每段必须是纯数字，否则视为无法判定
  const parse = (v: string): number[] | null => {
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

/**
 * 卸载插件
 */
export function uninstallPlugin(skillsDir: string, name: string): {
  ok: boolean
  name?: string
  removed?: boolean
  error?: { code: string; message: string; details?: string }
} {
  if (!isValidName(name)) {
    return { ok: false, error: { code: 'INVALID_NAME', message: `插件名 "${name}" 不是合法的 kebab-case` } }
  }

  const targetDir = join(skillsDir, name)
  if (!isInsideDir(skillsDir, targetDir)) {
    return { ok: false, error: { code: 'PATH_TRAVERSAL', message: '路径穿越检测失败' } }
  }

  if (!existsSync(targetDir)) {
    return { ok: false, error: { code: 'NOT_INSTALLED', message: `插件 "${name}" 未安装` } }
  }

  try {
    rmSync(targetDir, { recursive: true, force: true })
    return { ok: true, name, removed: true }
  } catch (error) {
    return { ok: false, error: { code: 'UNINSTALL_FAILED', message: `卸载失败`, details: error instanceof Error ? error.message : '未知错误' } }
  }
}

/**
 * 安装插件
 */
export function installPlugin(repoDir: string, skillsDir: string, name: string): {
  ok: boolean
  name?: string
  installed?: boolean
  updated?: boolean
  from?: string | null
  to?: string | null
  backupDir?: string | null
  error?: { code: string; message: string; details?: string }
} {
  if (!isValidName(name)) {
    return { ok: false, error: { code: 'INVALID_NAME', message: `插件名 "${name}" 不是合法的 kebab-case` } }
  }

  const sourceDir = join(repoDir, name)
  if (!existsSync(sourceDir)) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `插件 "${name}" 在仓库中不存在` } }
  }

  const targetDir = join(skillsDir, name)
  if (!isInsideDir(skillsDir, targetDir)) {
    return { ok: false, error: { code: 'PATH_TRAVERSAL', message: '路径穿越检测失败' } }
  }

  try {
    mkdirSync(dirname(targetDir), { recursive: true })

    // 更新前先留档：读旧 version.json + 备份整个已装目录
    const wasInstalled = existsSync(targetDir)
    const oldVersionJson = wasInstalled ? (join(targetDir, 'version.json')) : null
    const oldVersionData = oldVersionJson && existsSync(oldVersionJson)
      ? (() => { try { return JSON.parse(readFileSync(oldVersionJson, 'utf-8')) } catch { return null } })()
      : null
    const fromVersion = (oldVersionData?.version as string | undefined) ?? null
    // 只要目标目录已存在就按「更新」处理：即使旧 version.json 缺失/损坏，
    // 也必须先备份再覆盖，避免用户数据无留档丢失。
    const isUpdate = wasInstalled

    // 递归复制（正确处理空目录与空文件）
    const copyDir = (src: string, dst: string) => {
      // 空文件（如 .gitkeep）也要复制，判断“是目录”而不是“非空目录”
      const st = statSync(src)
      if (!st.isDirectory()) {
        mkdirSync(dirname(dst), { recursive: true })
        copyFileSync(src, dst)
        return
      }
      if (!existsSync(dst)) mkdirSync(dst, { recursive: true })
      for (const file of readdirSync(src)) {
        copyDir(join(src, file), join(dst, file))
      }
    }

    let backupDir: string | null = null
    if (isUpdate) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      backupDir = `${targetDir}.bak-${stamp}`
      try {
        copyDir(targetDir, backupDir)
      } catch (e) {
        // 备份失败就中止更新：宁可更新失败，也不能在无留档的情况下覆盖用户数据
        return {
          ok: false,
          error: { code: 'BACKUP_FAILED', message: `更新前备份失败，已中止以免数据丢失：${(e as Error).message}` },
        }
      }
      // 清掉旧目录里的文件（保留目录本身），避免已删除的文件残留
      try {
        for (const file of readdirSync(targetDir)) {
          rmSync(join(targetDir, file), { recursive: true, force: true })
        }
      } catch { /* 忽略，下面复制时会覆盖 */ }
    }

    // 复制整个目录
    copyDir(sourceDir, targetDir)

    // 写入版本信息
    const version = getPluginVersion(sourceDir)
    if (version) {
      const versionJson = join(targetDir, 'version.json')
      const record: Record<string, unknown> = {
        version,
        installedAt: oldVersionData?.installedAt ?? new Date().toISOString(),
      }
      if (isUpdate) {
        record.updatedAt = new Date().toISOString()
        record.previousVersion = fromVersion
        if (backupDir) record.backupDir = backupDir
      }
      writeFileSync(versionJson, JSON.stringify(record, null, 2))
    }

    return {
      ok: true,
      name,
      installed: true,
      updated: isUpdate,
      from: fromVersion,
      to: version,
      backupDir,
    }
  } catch (error) {
    return { ok: false, error: { code: 'INSTALL_FAILED', message: `安装失败`, details: error instanceof Error ? error.message : '未知错误' } }
  }
}

/**
 * 读取请求体
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

/** HTTP API 的挂载前缀（唯一定义处，注册与归一化共用）。 */
export const API_PREFIX = '/api/plugin-repo'

/**
 * HTTP API 的请求处理器。
 *
 * **刻意抽成独立导出函数**（而不是写在 `apply()` 里）：
 * 写在 `apply()` 内部的闭包无法被测试直接调用，端到端测试就只能
 * 「重新实现一遍路由再测」，于是**测的是测试自己的实现，不是产品代码** ——
 * 上一版就是这样漏掉了路由 bug 的回归。抽出来后 e2e 能直接打真实 handler。
 */
export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: {
    repoDir: string
    skillsDir: string
    pollInterval: number
    showSidebarButton: boolean
    sidebarTitle: string
    /** skillsDir 的来源（仅用于诊断展示；缺省时由 describeSkillsDir 反推） */
    skillsDirSource?: string
  },
): Promise<void> {
  const { repoDir, skillsDir, pollInterval, showSidebarButton, sidebarTitle, skillsDirSource } = opts
  const url = new URL(req.url || '', `http://${req.headers.host}`)
  const method = req.method || 'GET'
  // 兼容「宿主剥前缀」与「宿主保留全路径」两种约定，见 normalizeSubPath
  const sub = normalizeSubPath(url.pathname, API_PREFIX)

  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')

  try {
    // 自检端点：一条命令看清后端到底起来了没、路径怎么解析的、目录在不在。
    // 排查「面板空白只有一个重试按钮」时先打这个，能立刻区分
    // 「路由没命中」「目录不存在」「压根没注册」三种情况。
    if (sub === '/_health') {
      const repoExists = existsSync(repoDir)
      let repoEntryCount: number | null = null
      if (repoExists) {
        try {
          repoEntryCount = readdirSync(repoDir).filter((n) => isValidName(n)).length
        } catch { repoEntryCount = null }
      }
      // skillsDir 诊断：把所有候选摊开。技能「装了却看不见」时先看这里 ——
      // 一眼就能看出插件读写的位置和 DSH 扫描的位置是否错位。
      const skills = describeSkillsDir(skillsDir, skillsDirSource)
      sendJson(res, {
        ok: true,
        plugin: name,
        // 路由自检：把两种约定的归一化结果都算出来给排查者看
        route: {
          rawPathname: url.pathname,
          normalizedSub: sub,
          note: '两者不同即说明宿主保留/剥掉了前缀，本插件两种都兼容',
        },
        paths: {
          repoDir,
          repoExists,
          repoEntryCount,
          skillsDir,
          skillsExists: existsSync(skillsDir),
          skillsSource: skills.source,
          skillsEntryCount: probeSkillsDir(skillsDir).skillCount,
        },
        // 「装的地方 ≠ DSH 扫的地方」的告警（没有问题时为 null）
        skillsDirWarning: skills.warning,
        skillsDirCandidates: skills.candidates,
        config: { pollInterval, showSidebarButton, sidebarTitle },
        // 运行时自检：直接验证两个「会写盘」的操作在**当前模块系统下**可用。
        // 曾经的 bug 是 ESM 里误用 require，导致 /uninstall 恒返回 INTERNAL_ERROR
        // 而 HTTP 仍是 200 —— 前端表现为「点了没反应」。这里各跑一次纯路径判定
        // （不触碰磁盘），有任何异常都会暴露出来。
        selfTest: (() => {
          try {
            const okInside = isInsideDir(skillsDir, join(skillsDir, '__probe__'))
            const okOutside = !isInsideDir(skillsDir, join(skillsDir, '..', 'x'))
            return {
              ok: okInside && okOutside,
              pathGuard: 'ok',
              moduleSystem: typeof require === 'undefined' ? 'esm' : 'cjs',
            }
          } catch (e) {
            return {
              ok: false,
              pathGuard: e instanceof Error ? e.message : String(e),
              moduleSystem: typeof require === 'undefined' ? 'esm' : 'cjs',
            }
          }
        })(),
      })
    } else if (sub === '/list' && method === 'GET') {
      const plugins = listPlugins(repoDir, skillsDir)
      // 把 skillsDir 诊断一并带回：面板就能在列表上方显示告警横幅，
      // 用户不必自己去翻 /_health 才明白「装的地方 ≠ DSH 扫的地方」。
      const skills = describeSkillsDir(skillsDir, skillsDirSource)
      sendJson(res, {
        ok: true,
        plugins,
        pollInterval,
        skillsDir,
        skillsDirSource: skills.source,
        skillsDirWarning: skills.warning,
      })
    } else if (sub === '/install' && method === 'POST') {
      const body = await readBody(req)
      const { name: pkgName } = JSON.parse(body || '{}')
      const result = installPlugin(repoDir, skillsDir, pkgName)
      sendJson(res, result)
    } else if (sub === '/uninstall' && method === 'POST') {
      const body = await readBody(req)
      const { name: pkgName } = JSON.parse(body || '{}')
      const result = uninstallPlugin(skillsDir, pkgName)
      sendJson(res, result)
    } else {
      // 带上实际收到的路径与归一化结果，方便排查路径约定不一致
      console.warn(`[plugin-repo-manager] NOT_FOUND sub=${sub} raw=${url.pathname}`)
      sendJson(res, {
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `接口不存在：${sub}（原始路径 ${url.pathname}）`,
        },
      })
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : '未知错误'
    // 打印完整堆栈：曾经这里只打 message，而 `require is not defined` 这类
    // ESM/CJS 混用错误**只有堆栈才能指出出错行**（当时排查靠猜）。
    const stack = error instanceof Error ? error.stack : undefined
    console.error(`[plugin-repo-manager] ERROR sub=${sub}: ${msg}`)
    if (stack) console.error(stack)
    sendJson(res, {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: msg,
        // 把首行堆栈回给客户端，前端错误框能直接显示「哪一行炸的」
        details: stack ? stack.split('\n').slice(0, 3).join('\n') : undefined,
      },
    })
  }
}

/**
 * 主 apply 函数
 */
export async function apply(ctx: any): Promise<void> {
  const repoDir = resolveRepoDir(ctx)
  const { dir: skillsDir, source: skillsDirSource } = resolveSkillsDirWithSource(ctx)
  const pollInterval = resolvePollInterval(ctx)
  const showSidebarButton = resolveShowSidebarButton(ctx)
  const sidebarTitle = resolveSidebarTitle(ctx)

  // 注册 HTTP API
  const webServer = ctx.get?.('webServer')
  if (webServer) {
    webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      // 转发到唯一实现（见 handleApiRequest 的注释：抽出来是为了能被测到）
      handler: (req: IncomingMessage, res: ServerResponse) =>
        handleApiRequest(req, res, { repoDir, skillsDir, pollInterval, showSidebarButton, sidebarTitle, skillsDirSource }),
    })

    console.log(`[plugin-repo-manager] HTTP API registered at /api/plugin-repo`)
    console.log(`[plugin-repo-manager] repoDir: ${repoDir}`)
    console.log(`[plugin-repo-manager] skillsDir: ${skillsDir}  (来源: ${skillsDirSource})`)
    console.log(`[plugin-repo-manager] pollInterval: ${pollInterval}ms`)
    console.log(`[plugin-repo-manager] showSidebarButton: ${showSidebarButton}`)

    // 启动即自检：skillsDir 一旦和 DSH 真正扫描的目录错位，
    // 「安装/卸载」就会变成「面板有反应、DSH 毫无变化」且不报任何错。
    // 把结论**在启动日志里喊出来**，不用等用户去翻 /_health。
    const diag = describeSkillsDir(skillsDir, skillsDirSource)
    if (diag.warning) {
      console.warn(`[plugin-repo-manager] ⚠ skillsDir 可能配置有误：`)
      console.warn(`[plugin-repo-manager] ⚠   ${diag.warning}`)
      for (const c of diag.candidates) {
        console.warn(`[plugin-repo-manager] ⚠   候选 ${c.source}: ${c.dir} (存在=${c.exists}, 技能数=${c.skillCount})`)
      }
    }
  } else {
    console.warn(`[plugin-repo-manager] webServer not available, HTTP API not registered`)
  }

  // 存储配置供客户端使用
  ctx.provide?.('pluginRepoConfig', {
    repoDir,
    skillsDir,
    skillsDirSource,
    pollInterval,
    showSidebarButton,
    sidebarTitle,
  })
}

/**
 * 发送 JSON 响应
 */
function sendJson(res: ServerResponse, data: any): void {
  const body = JSON.stringify(data)
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

/**
 * 默认导出：与具名导出并存的**互操作兜底**。
 *
 * 事实：本模块编译后只有具名导出，`(await import(name)).default === undefined`。
 * Cordis 加载器在拿到 ESM 命名空间后，有的实现取 `mod.default`、有的取具名的
 * `mod.apply`。若加载器走 `.default` 分支，就会拿到 undefined 并报：
 *   invalid plugin, expect function or object with an "apply" method, received undefined
 *
 * 两种写法同时提供，加载器走哪条分支都能拿到合法的插件对象：
 *   - 取 `mod.apply`      → 命中具名导出
 *   - 取 `mod.default`    → 命中本对象（{ name, apply } 正是 Cordis 认可的插件形态）
 */
export default { name, apply }
