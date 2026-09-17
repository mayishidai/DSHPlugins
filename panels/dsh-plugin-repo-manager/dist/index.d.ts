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
