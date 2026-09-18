export declare const name = "dsh-plugin-repo-manager";
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
