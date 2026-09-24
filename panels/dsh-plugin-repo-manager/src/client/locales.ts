/** Copy dictionaries for the plugin repo global panel.
 *
 * ⚠️ 本文件与 `generate-client.mjs` 里内嵌的 `zh` / `en` **是同一个 locale 命名空间
 * （`pluginRepo`）的两份字典**，必须逐字一致 —— 两边各注册一次，宿主拿到哪份
 * 取决于哪份实现被加载。`scripts/test-client-parity.mjs` 的第 11 节会逐键比对，任一键
 * 只在一侧存在、或共有键文案不同，都会 FAIL。
 *
 * 对不一致时的取舍规则（唯一一处声明，别在别处再写）：
 *   1. **bundle 真的会渲染的键**（`zh.xxx` 被直接读到的那些）→ 以 bundle 为准，不改用户可见文案；
 *   2. **两边都没渲染的键**（error / version / settings / skillsDir / openInFileExplorer /
 *      *_Success / *_Failed / pollIntervalHint / pollIntervalDefault）→ 以本文件为准（它是
 *      `PluginRepoLocaleKey` 类型契约的来源）；
 *   3. `confirmUninstallMsg` / `confirmInstallMsg` 的**英文**是有意重写：旧文案
 *      "This action cannot be undone." 与中文「仓库目录不受影响」直接矛盾（卸载只删
 *      skills 目录那份，仓库不动），会让人以为没有退路。
 *
 * `tab` 键已于 2026-09-24 删除：入口从设置 tab 迁到侧边栏 `sidebar.panellist` 后，
 * 它是唯一读者是那个已移除的注册项 —— 留着就是「有值、没人读」的死键。
 */
export const zh = {
  sidebar: '插件仓库',
  loading: '加载中...',
  error: '加载失败，请重试',
  retry: '重试',
  empty: '仓库中没有插件',
  installed: '已安装',
  notInstalled: '未安装',
  install: '安装',
  installing: '安装中...',
  uninstall: '卸载',
  uninstalling: '卸载中...',
  confirmUninstall: '确认卸载',
  confirmUninstallMsg: '确定要卸载 "{{name}}" 吗？将从 DSH 的 skills 目录删除，仓库目录不受影响。',
  confirmInstall: '确认安装',
  confirmInstallMsg: '确定要安装 "{{name}}" 吗？将从仓库复制到 skills 目录。',
  uninstallSuccess: '卸载成功',
  uninstallFailed: '卸载失败',
  installSuccess: '安装成功',
  installFailed: '安装失败',
  version: '版本',
  description: '描述',
  refresh: '刷新',
  refreshing: '刷新中...',
  settings: '设置',
  pollInterval: '刷新间隔 (ms)',
  pollIntervalHint: '自动刷新的时间间隔（毫秒）',
  pollIntervalDefault: '3000',
  openInFileExplorer: '在文件管理器中打开',
  repoDir: '仓库目录',
  skillsDir: 'Skills 目录',
} as const

export const en = {
  sidebar: 'Plugin Repo',
  loading: 'Loading...',
  error: 'Failed to load, please retry',
  retry: 'Retry',
  empty: 'No plugins in repository',
  installed: 'Installed',
  notInstalled: 'Not installed',
  install: 'Install',
  installing: 'Installing...',
  uninstall: 'Uninstall',
  uninstalling: 'Uninstalling...',
  confirmUninstall: 'Confirm Uninstall',
  confirmUninstallMsg: 'Uninstall "{{name}}"? It will be removed from the DSH skills directory; the repository directory is not affected.',
  confirmInstall: 'Confirm Install',
  confirmInstallMsg: 'Install "{{name}}"? It will be copied from the repository to the skills directory.',
  uninstallSuccess: 'Uninstall successful',
  uninstallFailed: 'Uninstall failed',
  installSuccess: 'Install successful',
  installFailed: 'Install failed',
  version: 'Version',
  description: 'Description',
  refresh: 'Refresh',
  refreshing: 'Refreshing...',
  settings: 'Settings',
  pollInterval: 'Poll Interval (ms)',
  pollIntervalHint: 'Auto-refresh interval in milliseconds',
  pollIntervalDefault: '3000',
  openInFileExplorer: 'Open in File Explorer',
  repoDir: 'Repository Directory',
  skillsDir: 'Skills Directory',
} as const

export type PluginRepoLocaleKey = keyof typeof zh
