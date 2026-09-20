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
import { existsSync, readdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
export const name = 'dsh-plugin-repo-manager';
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
};
/**
 * 解析仓库目录
 */
function resolveRepoDir(ctx) {
    const config = ctx.get?.('config');
    const raw = config?.['repoDir']
        ?? process.env.DSH_PLUGIN_REPO_DIR
        ?? DEFAULT_CONFIG.repoDir;
    return expandHome(raw);
}
/**
 * 解析 skills 目录
 */
/**
 * 展开路径中的 `~`（Node 的 fs 不认波浪号，配置文件里常写 ~/.dsh/skills）。
 * 仅处理开头的 `~` 或 `~/`，与 shell 语义一致。
 */
function expandHome(p) {
    if (!p)
        return p;
    if (p === '~')
        return homedir();
    if (p.startsWith('~/') || p.startsWith('~\\')) {
        return join(homedir(), p.slice(2));
    }
    return p;
}
function resolveSkillsDir(ctx) {
    const config = ctx.get?.('config');
    const raw = config?.['skillsDir']
        ?? process.env.DSH_PLUGIN_SKILLS_DIR
        ?? DEFAULT_CONFIG.skillsDir();
    return expandHome(raw);
}
/**
 * 解析轮询间隔
 */
function resolvePollInterval(ctx) {
    const config = ctx.get?.('config');
    return config?.['pollInterval']
        ?? parseInt(process.env.DSH_PLUGIN_POLL_INTERVAL || '3000')
        ?? 3000;
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
function resolveShowSidebarButton(ctx) {
    const config = ctx.get?.('config');
    const fromConfig = config?.['showSidebarButton'];
    const raw = (fromConfig !== undefined ? fromConfig : process.env['DSH_PLUGIN_SHOW_SIDEBAR']);
    if (raw === undefined || raw === null || raw === '')
        return DEFAULT_CONFIG.showSidebarButton;
    if (typeof raw === 'boolean')
        return raw;
    if (typeof raw === 'number')
        return raw !== 0;
    const s = String(raw).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(s))
        return true;
    if (['0', 'false', 'no', 'off'].includes(s))
        return false;
    return DEFAULT_CONFIG.showSidebarButton;
}
/**
 * 解析侧边栏按钮标题（hover 提示 / 无障碍标签）。
 */
function resolveSidebarTitle(ctx) {
    const config = ctx.get?.('config');
    const raw = config?.['sidebarTitle']
        ?? process.env['DSH_PLUGIN_SIDEBAR_TITLE']
        ?? DEFAULT_CONFIG.sidebarTitle;
    return raw || DEFAULT_CONFIG.sidebarTitle;
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
export function normalizeSubPath(pathname, prefix = '/api/plugin-repo') {
    let p = pathname || '';
    // 去掉查询串（handler 里用的是 url.pathname，理论上没有，防御性处理）
    const q = p.indexOf('?');
    if (q >= 0)
        p = p.slice(0, q);
    // 宿主若保留全路径，这里剥掉；若已剥掉，startsWith 不成立则原样保留
    if (p === prefix)
        return '/';
    if (p.startsWith(prefix + '/'))
        p = p.slice(prefix.length);
    // 末尾斜杠归一化：'/list/' 与 '/list' 等价
    if (p.length > 1 && p.endsWith('/'))
        p = p.slice(0, -1);
    return p || '/';
}
/**
 * 检查名称是否合法（kebab-case）
 */
function isValidName(name) {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
}
/**
 * 读取插件版本
 */
function getPluginVersion(pluginDir) {
    // 依次尝试：manifest.json（技能/agent/mcp 型）→ package.json（面板型）→ version.json（已装留档）
    for (const file of ['manifest.json', 'package.json', 'version.json']) {
        const p = join(pluginDir, file);
        if (!existsSync(p))
            continue;
        try {
            const data = JSON.parse(readFileSync(p, 'utf-8'));
            if (data?.version)
                return data.version;
        }
        catch { /* 该文件损坏则继续尝试下一个 */ }
    }
    return null;
}
/**
 * 列出仓库中的插件
 */
export function listPlugins(repoDir, skillsDir) {
    const installedNames = new Set();
    if (existsSync(skillsDir)) {
        for (const name of readdirSync(skillsDir)) {
            if (isValidName(name))
                installedNames.add(name);
        }
    }
    const plugins = [];
    if (!existsSync(repoDir))
        return plugins;
    for (const dirName of readdirSync(repoDir)) {
        const pluginDir = join(repoDir, dirName);
        if (!existsSync(pluginDir) || readdirSync(pluginDir).length === 0)
            continue;
        // 识别为插件的依据：SKILL.md（技能型）/ manifest.json / package.json（面板型）
        const markers = ['SKILL.md', 'manifest.json', 'package.json'];
        if (!markers.some(f => existsSync(join(pluginDir, f))))
            continue;
        const version = getPluginVersion(pluginDir);
        const isInstalled = installedNames.has(dirName);
        const installedVersion = isInstalled ? getInstalledVersion(skillsDir, dirName) : null;
        plugins.push({
            name: dirName,
            repoDirName: dirName,
            version,
            installed: isInstalled,
            installedVersion: installedVersion ?? undefined,
            hasUpdate: isInstalled && isNewer(version, installedVersion),
            source: 'repo',
        });
    }
    return plugins;
}
/**
 * 读取已安装版本
 */
function getInstalledVersion(skillsDir, name) {
    const versionJson = join(skillsDir, name, 'version.json');
    if (existsSync(versionJson)) {
        try {
            const data = JSON.parse(readFileSync(versionJson, 'utf-8'));
            return data.version ?? null;
        }
        catch {
            return null;
        }
    }
    return null;
}
/**
 * 语义化版本比较：latest 是否比 current 新。
 * 缺任一版本、或版本号无法解析时返回 false（不确定就不提示更新）。
 */
export function isNewer(latest, current) {
    if (!latest || !current)
        return false;
    // 只在「看起来像版本号」时比较：每段必须是纯数字，否则视为无法判定
    const parse = (v) => {
        const core = v.trim().replace(/^v/i, '').split('-')[0];
        if (!core)
            return null;
        const parts = core.split('.');
        if (!parts.every(p => /^\d+$/.test(p)))
            return null;
        return parts.map(p => parseInt(p, 10));
    };
    const a = parse(latest);
    const b = parse(current);
    if (!a || !b)
        return false;
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const x = a[i] ?? 0;
        const y = b[i] ?? 0;
        if (x > y)
            return true;
        if (x < y)
            return false;
    }
    return false;
}
/**
 * 卸载插件
 */
export function uninstallPlugin(skillsDir, name) {
    if (!isValidName(name)) {
        return { ok: false, error: { code: 'INVALID_NAME', message: `插件名 "${name}" 不是合法的 kebab-case` } };
    }
    const targetDir = join(skillsDir, name);
    const rel = require('path').relative(skillsDir, targetDir);
    if (!rel || rel.startsWith('..') || rel.startsWith('/')) {
        return { ok: false, error: { code: 'PATH_TRAVERSAL', message: '路径穿越检测失败' } };
    }
    if (!existsSync(targetDir)) {
        return { ok: false, error: { code: 'NOT_INSTALLED', message: `插件 "${name}" 未安装` } };
    }
    try {
        rmSync(targetDir, { recursive: true, force: true });
        return { ok: true, name, removed: true };
    }
    catch (error) {
        return { ok: false, error: { code: 'UNINSTALL_FAILED', message: `卸载失败`, details: error instanceof Error ? error.message : '未知错误' } };
    }
}
/**
 * 安装插件
 */
export function installPlugin(repoDir, skillsDir, name) {
    if (!isValidName(name)) {
        return { ok: false, error: { code: 'INVALID_NAME', message: `插件名 "${name}" 不是合法的 kebab-case` } };
    }
    const sourceDir = join(repoDir, name);
    if (!existsSync(sourceDir)) {
        return { ok: false, error: { code: 'NOT_FOUND', message: `插件 "${name}" 在仓库中不存在` } };
    }
    const targetDir = join(skillsDir, name);
    const rel = require('path').relative(skillsDir, targetDir);
    if (!rel || rel.startsWith('..') || rel.startsWith('/')) {
        return { ok: false, error: { code: 'PATH_TRAVERSAL', message: '路径穿越检测失败' } };
    }
    try {
        mkdirSync(dirname(targetDir), { recursive: true });
        // 更新前先留档：读旧 version.json + 备份整个已装目录
        const wasInstalled = existsSync(targetDir);
        const oldVersionJson = wasInstalled ? (join(targetDir, 'version.json')) : null;
        const oldVersionData = oldVersionJson && existsSync(oldVersionJson)
            ? (() => { try {
                return JSON.parse(readFileSync(oldVersionJson, 'utf-8'));
            }
            catch {
                return null;
            } })()
            : null;
        const fromVersion = oldVersionData?.version ?? null;
        // 只要目标目录已存在就按「更新」处理：即使旧 version.json 缺失/损坏，
        // 也必须先备份再覆盖，避免用户数据无留档丢失。
        const isUpdate = wasInstalled;
        // 递归复制（正确处理空目录与空文件）
        const copyDir = (src, dst) => {
            // 空文件（如 .gitkeep）也要复制，判断“是目录”而不是“非空目录”
            const st = statSync(src);
            if (!st.isDirectory()) {
                mkdirSync(dirname(dst), { recursive: true });
                copyFileSync(src, dst);
                return;
            }
            if (!existsSync(dst))
                mkdirSync(dst, { recursive: true });
            for (const file of readdirSync(src)) {
                copyDir(join(src, file), join(dst, file));
            }
        };
        let backupDir = null;
        if (isUpdate) {
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            backupDir = `${targetDir}.bak-${stamp}`;
            try {
                copyDir(targetDir, backupDir);
            }
            catch (e) {
                // 备份失败就中止更新：宁可更新失败，也不能在无留档的情况下覆盖用户数据
                return {
                    ok: false,
                    error: { code: 'BACKUP_FAILED', message: `更新前备份失败，已中止以免数据丢失：${e.message}` },
                };
            }
            // 清掉旧目录里的文件（保留目录本身），避免已删除的文件残留
            try {
                for (const file of readdirSync(targetDir)) {
                    rmSync(join(targetDir, file), { recursive: true, force: true });
                }
            }
            catch { /* 忽略，下面复制时会覆盖 */ }
        }
        // 复制整个目录
        copyDir(sourceDir, targetDir);
        // 写入版本信息
        const version = getPluginVersion(sourceDir);
        if (version) {
            const versionJson = join(targetDir, 'version.json');
            const record = {
                version,
                installedAt: oldVersionData?.installedAt ?? new Date().toISOString(),
            };
            if (isUpdate) {
                record.updatedAt = new Date().toISOString();
                record.previousVersion = fromVersion;
                if (backupDir)
                    record.backupDir = backupDir;
            }
            writeFileSync(versionJson, JSON.stringify(record, null, 2));
        }
        return {
            ok: true,
            name,
            installed: true,
            updated: isUpdate,
            from: fromVersion,
            to: version,
            backupDir,
        };
    }
    catch (error) {
        return { ok: false, error: { code: 'INSTALL_FAILED', message: `安装失败`, details: error instanceof Error ? error.message : '未知错误' } };
    }
}
/**
 * 读取请求体
 */
function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}
/** HTTP API 的挂载前缀（唯一定义处，注册与归一化共用）。 */
export const API_PREFIX = '/api/plugin-repo';
/**
 * HTTP API 的请求处理器。
 *
 * **刻意抽成独立导出函数**（而不是写在 `apply()` 里）：
 * 写在 `apply()` 内部的闭包无法被测试直接调用，端到端测试就只能
 * 「重新实现一遍路由再测」，于是**测的是测试自己的实现，不是产品代码** ——
 * 上一版就是这样漏掉了路由 bug 的回归。抽出来后 e2e 能直接打真实 handler。
 */
export async function handleApiRequest(req, res, opts) {
    const { repoDir, skillsDir, pollInterval, showSidebarButton, sidebarTitle } = opts;
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const method = req.method || 'GET';
    // 兼容「宿主剥前缀」与「宿主保留全路径」两种约定，见 normalizeSubPath
    const sub = normalizeSubPath(url.pathname, API_PREFIX);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
        // 自检端点：一条命令看清后端到底起来了没、路径怎么解析的、目录在不在。
        // 排查「面板空白只有一个重试按钮」时先打这个，能立刻区分
        // 「路由没命中」「目录不存在」「压根没注册」三种情况。
        if (sub === '/_health') {
            const repoExists = existsSync(repoDir);
            let repoEntryCount = null;
            if (repoExists) {
                try {
                    repoEntryCount = readdirSync(repoDir).filter((n) => isValidName(n)).length;
                }
                catch {
                    repoEntryCount = null;
                }
            }
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
                },
                config: { pollInterval, showSidebarButton, sidebarTitle },
            });
        }
        else if (sub === '/list' && method === 'GET') {
            const plugins = listPlugins(repoDir, skillsDir);
            sendJson(res, { ok: true, plugins, pollInterval });
        }
        else if (sub === '/install' && method === 'POST') {
            const body = await readBody(req);
            const { name: pkgName } = JSON.parse(body || '{}');
            const result = installPlugin(repoDir, skillsDir, pkgName);
            sendJson(res, result);
        }
        else if (sub === '/uninstall' && method === 'POST') {
            const body = await readBody(req);
            const { name: pkgName } = JSON.parse(body || '{}');
            const result = uninstallPlugin(skillsDir, pkgName);
            sendJson(res, result);
        }
        else {
            // 带上实际收到的路径与归一化结果，方便排查路径约定不一致
            console.warn(`[plugin-repo-manager] NOT_FOUND sub=${sub} raw=${url.pathname}`);
            sendJson(res, {
                ok: false,
                error: {
                    code: 'NOT_FOUND',
                    message: `接口不存在：${sub}（原始路径 ${url.pathname}）`,
                },
            });
        }
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : '未知错误';
        console.error(`[plugin-repo-manager] ERROR sub=${sub}: ${msg}`);
        sendJson(res, { ok: false, error: { code: 'INTERNAL_ERROR', message: msg } });
    }
}
/**
 * 主 apply 函数
 */
export async function apply(ctx) {
    const repoDir = resolveRepoDir(ctx);
    const skillsDir = resolveSkillsDir(ctx);
    const pollInterval = resolvePollInterval(ctx);
    const showSidebarButton = resolveShowSidebarButton(ctx);
    const sidebarTitle = resolveSidebarTitle(ctx);
    // 注册 HTTP API
    const webServer = ctx.get?.('webServer');
    if (webServer) {
        webServer.register({
            kind: 'prefix',
            path: API_PREFIX,
            // 转发到唯一实现（见 handleApiRequest 的注释：抽出来是为了能被测到）
            handler: (req, res) => handleApiRequest(req, res, { repoDir, skillsDir, pollInterval, showSidebarButton, sidebarTitle }),
        });
        console.log(`[plugin-repo-manager] HTTP API registered at /api/plugin-repo`);
        console.log(`[plugin-repo-manager] repoDir: ${repoDir}`);
        console.log(`[plugin-repo-manager] skillsDir: ${skillsDir}`);
        console.log(`[plugin-repo-manager] pollInterval: ${pollInterval}ms`);
        console.log(`[plugin-repo-manager] showSidebarButton: ${showSidebarButton}`);
    }
    else {
        console.warn(`[plugin-repo-manager] webServer not available, HTTP API not registered`);
    }
    // 存储配置供客户端使用
    ctx.provide?.('pluginRepoConfig', {
        repoDir,
        skillsDir,
        pollInterval,
        showSidebarButton,
        sidebarTitle,
    });
}
/**
 * 发送 JSON 响应
 */
function sendJson(res, data) {
    const body = JSON.stringify(data);
    res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
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
export default { name, apply };
