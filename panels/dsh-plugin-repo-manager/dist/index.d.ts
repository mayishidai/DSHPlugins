import type { IncomingMessage, ServerResponse } from 'node:http';
export declare const name = "dsh-plugin-repo-manager";
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
 * 列出仓库中的插件
 */
export declare function listPlugins(repoDir: string, skillsDir: string): Array<{
    name: string;
    repoDirName: string;
    version: string | null;
    installed: boolean;
    installedVersion: string | null;
    hasUpdate: boolean;
    source: 'repo';
}>;
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
