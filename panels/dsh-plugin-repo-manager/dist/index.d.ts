import type { IncomingMessage, ServerResponse } from 'node:http';
export declare const name = "dsh-plugin-repo-manager";
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
    dir: string;
    source: string;
    exists: boolean;
    /** 该目录下「有 SKILL.md 的合法子目录」个数 —— 用来判断它像不像真正的 skills 目录 */
    skillCount: number;
}
/**
 * 列出所有候选 skills 目录（去重后按优先级排序）。
 *
 * 顺序 = 优先级：`config.skillsDir` > `DSH_PLUGIN_SKILLS_DIR` > `$DSH_HOME/skills`
 * > `~/.dsh/skills` > 文档记载的 NAS 数据根（仅兜底，见 `resolveSkillsDir`）。
 */
export declare function skillsDirCandidates(explicit?: string): SkillsDirCandidate[];
/** 与 `resolveSkillsDir` 同源，但额外回报「这个值是从哪来的」——用于自检与日志。 */
export declare function resolveSkillsDirWithSource(ctx: any): {
    dir: string;
    source: string;
};
/**
 * 生成 skillsDir 的完整诊断：候选清单 + 「装的地方 ≠ DSH 扫的地方」告警。
 *
 * `/_health` 与 `/list` **共用这一个判断**，避免「自检端点说没事、面板却在报错」
 * 这种两处判据漂移。
 */
export declare function describeSkillsDir(skillsDir: string, source?: string): {
    source: string;
    candidates: SkillsDirCandidate[];
    warning: string | null;
};
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
export declare function normalizeSubPath(pathname: string, prefix?: string): string;
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
export declare function isInsideDir(base: string, target: string): boolean;
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
export declare function getPluginDescription(pluginDir: string): string | null;
/**
 * 仓库列表的一行。
 *
 * `source` 分两类，这是「把 DSH 侧清干净、仓库侧不动」的关键：
 *   - `repo`           —— 仓库里有，`repoDirName` 即仓库中的目录名
 *   - `installed-only` —— **DSH 里装着，但仓库里已经没有了**（`repoDirName: null`）
 */
export interface RepoPluginEntry {
    name: string;
    /** 仓库中的目录名；`installed-only` 时为 null */
    repoDirName: string | null;
    version: string | null;
    description: string | null;
    installed: boolean;
    installedVersion: string | null;
    hasUpdate: boolean;
    source: 'repo' | 'installed-only';
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
export declare function listPlugins(repoDir: string, skillsDir: string): RepoPluginEntry[];
/**
 * 语义化版本比较：latest 是否比 current 新。
 * 缺任一版本、或版本号无法解析时返回 false（不确定就不提示更新）。
 */
export declare function isNewer(latest: string | null, current: string | null): boolean;
/**
 * 卸载插件
 */
export declare function uninstallPlugin(skillsDir: string, name: string): {
    ok: boolean;
    name?: string;
    removed?: boolean;
    error?: {
        code: string;
        message: string;
        details?: string;
    };
};
/**
 * 安装插件
 */
export declare function installPlugin(repoDir: string, skillsDir: string, name: string): {
    ok: boolean;
    name?: string;
    installed?: boolean;
    updated?: boolean;
    from?: string | null;
    to?: string | null;
    backupDir?: string | null;
    error?: {
        code: string;
        message: string;
        details?: string;
    };
};
/** HTTP API 的挂载前缀（唯一定义处，注册与归一化共用）。 */
export declare const API_PREFIX = "/api/plugin-repo";
/**
 * HTTP API 的请求处理器。
 *
 * **刻意抽成独立导出函数**（而不是写在 `apply()` 里）：
 * 写在 `apply()` 内部的闭包无法被测试直接调用，端到端测试就只能
 * 「重新实现一遍路由再测」，于是**测的是测试自己的实现，不是产品代码** ——
 * 上一版就是这样漏掉了路由 bug 的回归。抽出来后 e2e 能直接打真实 handler。
 */
export declare function handleApiRequest(req: IncomingMessage, res: ServerResponse, opts: {
    repoDir: string;
    skillsDir: string;
    pollInterval: number;
    showSidebarButton: boolean;
    sidebarTitle: string;
    /** skillsDir 的来源（仅用于诊断展示；缺省时由 describeSkillsDir 反推） */
    skillsDirSource?: string;
}): Promise<void>;
/**
 * 主 apply 函数
 */
export declare function apply(ctx: any): Promise<void>;
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
declare const _default: {
    name: string;
    apply: typeof apply;
};
export default _default;
