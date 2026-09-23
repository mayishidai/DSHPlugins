/** Plugin repository management panel component. */
import { useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'

export interface RepoPlugin {
  name: string
  /** 仓库中的目录名；`installed-only`（仓库里已没有）时为 null */
  repoDirName: string | null
  version: string | null
  /** 插件描述（后端从 manifest.json / SKILL.md / package.json 读出；取不到为 null） */
  description?: string | null
  installed: boolean
  installedVersion: string | null
  /** 仓库版本比已装版本新（后端算好的） */
  hasUpdate?: boolean
  /**
   * `repo` = 仓库里有；`installed-only` = **DSH 里装着但仓库里已经没有了**。
   *
   * 后者**仍然可以卸载**（后端卸载只依赖 skillsDir + name，与仓库无关）——
   * 这正是「把 DSH 侧清干净、仓库侧不动」的入口。缺了它，这类技能
   * 不会出现在列表里，也就永远卸不掉。
   */
  source: 'repo' | 'installed-only'
}

/** 安装/更新接口的返回 */
export interface InstallResult {
  ok: boolean
  name?: string
  installed?: boolean
  updated?: boolean
  from?: string | null
  to?: string | null
  /** 更新前的整目录备份位置（仅在更新时存在） */
  backupDir?: string | null
  error?: { code: string; message: string; details?: string }
}

export interface PluginRepoPanelProps {
  /** API base URL */
  apiBase: string
  /** Current poll interval in milliseconds */
  pollInterval: number
  /** Repository directory */
  repoDir: string
  /** Skills directory */
  skillsDir: string
  /** Callback when poll interval changes */
  onPollIntervalChange?: (interval: number) => void
  /** Custom class name */
  className?: string
}

interface ApiResponse<T> {
  ok: boolean
  plugins?: T
  error?: { code: string; message: string; details?: string }
  /** 当前生效的 skills 目录（后端解析结果） */
  skillsDir?: string
  /** skillsDir 的来源，如 config.skillsDir / env:DSH_HOME */
  skillsDirSource?: string
  /**
   * 「插件读写的位置 ≠ DSH 扫描的位置」时的告警。
   * 这类错位不报任何错：面板显示「已安装」、文件也写好了，但 DSH 看不到 ——
   * 用户感受就是「点了安装和卸载都没生效」。所以必须显式提示出来。
   */
  skillsDirWarning?: string | null
}

export function PluginRepoPanel({
  apiBase = '/api/plugin-repo',
  pollInterval: initialPollInterval,
  repoDir,
  skillsDir,
  onPollIntervalChange,
  className = '',
}: PluginRepoPanelProps): ReactNode {
  const [plugins, setPlugins] = useState<RepoPlugin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showConfirm, setShowConfirm] = useState<{ type: 'install' | 'uninstall' | 'update'; name: string } | null>(null)
  const [pollInterval, setPollInterval] = useState(initialPollInterval)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [showSettings, setShowSettings] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [skillsDirWarning, setSkillsDirWarning] = useState<string | null>(null)
  const [warningDismissed, setWarningDismissed] = useState(false)

  // 加载插件列表
  const loadPlugins = useCallback(async () => {
    setLoading(true)
    setError(null)
    const url = `${apiBase}/list`
    try {
      const response = await fetch(url)
      // 必须先判 HTTP 状态再解析 body。
      // 后端没注册时返回的是 404 + HTML，直接 response.json() 会抛
      // "Unexpected token '<'" —— 把「接口不存在」误报成「JSON 解析失败」，
      // 排查方向会被带偏。这里把状态码和 URL 一起带进错误里。
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} @ ${url}`)
      }
      const data: ApiResponse<RepoPlugin[]> = await response.json()
      if (data.ok && data.plugins) {
        setPlugins(data.plugins)
        // 后端每次都会带上 skillsDir 诊断；没有问题时是 null。
        setSkillsDirWarning(data.skillsDirWarning ?? null)
        setLastUpdate(new Date())
      } else {
        setError(data.error?.message || '接口返回 OK=false')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '未知错误'
      setError(msg.includes('@') ? msg : `请求失败：${msg} @ ${url}`)
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  // 初始加载
  useEffect(() => {
    loadPlugins()
  }, [loadPlugins])

  // 轮询
  useEffect(() => {
    if (pollInterval <= 0) return
    const timer = setInterval(() => {
      loadPlugins()
    }, pollInterval)
    return () => clearInterval(timer)
  }, [pollInterval, loadPlugins])

  // 处理安装 / 更新（同一个接口，后端按已装情况决定是否留档备份）
  const handleInstall = async (name: string, opts?: { silent?: boolean }) => {
    setActionLoading(name)
    setShowConfirm(null)
    try {
      const response = await fetch(`${apiBase}/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data: InstallResult = await response.json()
      if (data.ok) {
        if (data.updated) {
          const backup = data.backupDir ? `，旧版已备份至 ${data.backupDir}` : ''
          setNotice(`已更新 ${name}：${data.from ?? '?'} → ${data.to ?? '?'}${backup}`)
        } else if (!opts?.silent) {
          setNotice(`已安装 ${name}${data.to ? ` (${data.to})` : ''}`)
        }
        await loadPlugins()
      } else {
        setError(data.error?.message || '安装失败')
      }
      return data
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      return null
    } finally {
      setActionLoading(null)
    }
  }

  /** 一键更新所有有新版可用的插件（串行，逐个报告结果） */
  const handleUpdateAll = async () => {
    const targets = plugins.filter(p => p.installed && p.hasUpdate).map(p => p.name)
    if (targets.length === 0) return
    const succeeded: string[] = []
    const failed: string[] = []
    for (const name of targets) {
      // silent: 逐个结果由本函数统一汇总，避免中间态文案闪烁
      const r = await handleInstall(name, { silent: true })
      if (r?.ok) succeeded.push(name)
      else failed.push(name)
    }
    await loadPlugins()
    if (failed.length === 0) {
      setNotice(`全部更新完成（${succeeded.length} 个）`)
    } else {
      setError(`更新失败 ${failed.length} 个：${failed.join('、')}（成功 ${succeeded.length} 个）`)
    }
  }

  // 处理卸载
  const handleUninstall = async (name: string) => {
    setActionLoading(name)
    setShowConfirm(null)
    setNotice(null)
    setError(null)
    const url = `${apiBase}/uninstall`
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      // 与 loadPlugins 同理：先判 HTTP 状态再解析，避免 404 返回 HTML 时
      // 抛 "Unexpected token '<'" 把「接口不存在」误报成「JSON 解析失败」。
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} @ ${url}`)
      }
      const data: ApiResponse<null> & { details?: string } = await response.json()
      if (data.ok) {
        setNotice(`已卸载 ${name}`)
        await loadPlugins()
      } else {
        // ⚠️ 必须把后端 error 的**内容**显示出来。
        // 曾经这里也是「失败只在控制台」，于是后端抛的
        // `require is not defined` 用户完全看不到 —— 表现就是「点了没反应」。
        const detail = data.error?.details ? `（${data.error.details.split('\n')[0]}）` : ''
        setError(`卸载 ${name} 失败：${data.error?.message || '未知原因'}${detail}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '未知错误'
      setError(`卸载 ${name} 失败：${msg.includes('@') ? msg : `${msg} @ ${url}`}`)
    } finally {
      setActionLoading(null)
    }
  }

  // 切换选择
  const toggleSelect = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // 批量操作
  const handleBatchInstall = async () => {
    for (const name of selected) {
      await handleInstall(name)
    }
    setSelected(new Set())
  }

  const handleBatchUninstall = async () => {
    for (const name of selected) {
      await handleUninstall(name)
    }
    setSelected(new Set())
  }

  // 打开文件管理器
  const openInExplorer = (dir: string) => {
    window.open(`file://${encodeURIComponent(dir)}`, '_blank')
  }

  // 切换设置
  const toggleSettings = () => {
    setShowSettings(!showSettings)
  }

  // 更新轮询间隔
  const updatePollInterval = (value: string) => {
    const num = parseInt(value)
    if (!isNaN(num) && num >= 500) {
      setPollInterval(num)
      onPollIntervalChange?.(num)
    }
  }

  if (loading && plugins.length === 0) {
    return (
      <div style={{ padding: '12px 14px', color: 'var(--dsw-alias-label-tertiary)' }}>
        加载中...
      </div>
    )
  }

  // 错误态：必须把 error 的**内容**显示出来，并附上诊断信息。
  // 曾经这里只画了一个「重试」按钮，error 仅当开关用 —— 结果
  // 「后端没注册(404)」「路径写错」「仓库目录不存在」等完全不同的故障
  // 长得一模一样，只能靠猜。诊断信息给出请求 URL 与已解析的 repoDir，
  // 一眼就能判断是哪一种。
  if (error && plugins.length === 0) {
    return (
      <div style={{ padding: '12px 14px' }}>
        <div style={{ color: 'var(--dsw-alias-state-error-primary)', marginBottom: '6px', wordBreak: 'break-all', fontSize: '13px' }}>
          {error}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)', marginBottom: '2px', wordBreak: 'break-all', lineHeight: 1.4 }}>
          接口: {apiBase}/list
        </div>
        <div style={{ fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)', marginBottom: '10px', wordBreak: 'break-all', lineHeight: 1.4 }}>
          仓库目录: {repoDir}
        </div>
        <button
          onClick={loadPlugins}
          style={{ padding: '4px 10px', borderRadius: '5px', border: '1px solid var(--dsw-alias-border-l3)', background: 'transparent', cursor: 'pointer', fontSize: '13px' }}
        >
          重试
        </button>
      </div>
    )
  }

  return (
    <div className={className} style={{ width: '100%', maxWidth: '900px', padding: '12px 14px' }}>
      {/* 头部工具栏：紧凑单行 —— 左侧只有「刷新」，时间戳移到右侧
          （原先 time 与按钮同组，窄面板下会把右侧按钮挤到第二行）。 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            onClick={loadPlugins}
            disabled={loading}
            style={styles.button}
          >
            {loading ? '⟳ 刷新中...' : '⟳ 刷新'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px' }}>
            {lastUpdate.toLocaleTimeString()}
          </span>
          {plugins.some(p => p.installed && p.hasUpdate) && (
            <button
              onClick={handleUpdateAll}
              style={{ ...styles.button, background: 'var(--dsw-alias-state-warning-bg, #fff7e6)', color: 'var(--dsw-alias-state-warning-primary, #b26b00)' }}
            >
              ⬆ 全部更新 ({plugins.filter(p => p.installed && p.hasUpdate).length})
            </button>
          )}
          {selected.size > 0 && (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={handleBatchInstall}
                style={{ ...styles.button, background: 'var(--dsw-alias-state-success-bg)', color: 'var(--dsw-alias-state-success-primary)' }}
              >
                安装选中 ({selected.size})
              </button>
              <button
                onClick={handleBatchUninstall}
                style={{ ...styles.button, background: 'var(--dsw-alias-state-error-bg)', color: 'var(--dsw-alias-state-error-primary)' }}
              >
                卸载选中 ({selected.size})
              </button>
            </div>
          )}
          <button
            onClick={toggleSettings}
            style={styles.button}
          >
            ⚙ 设置
          </button>
        </div>
      </div>

      {/* 操作结果提示 */}
      {notice && (
        <div style={{
          marginBottom: '8px', padding: '5px 10px', borderRadius: '5px',
          fontSize: '12px', background: 'var(--dsw-alias-state-success-bg)',
          color: 'var(--dsw-alias-state-success-primary)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
        }}>
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} style={{ ...styles.smallButton }}>关闭</button>
        </div>
      )}

      {/* skillsDir 错位告警。
          这一类失效**全程不报错**：面板显示「已安装」、文件确实写进磁盘了、接口
          全部 ok:true —— 但 DSH 扫描的是另一个目录，所以技能装了也看不见；
          「卸载」同理只删掉那份没人看的副本。用户只会感觉「点了没生效」。
          所以后端一发现错位就在这里直接说清楚，别让人去猜。 */}
      {skillsDirWarning && !warningDismissed && (
        <div style={{
          marginBottom: '8px', padding: '6px 10px', borderRadius: '5px',
          fontSize: '12px', lineHeight: 1.5,
          background: 'var(--dsw-alias-state-warning-bg, #fff7e6)',
          color: 'var(--dsw-alias-state-warning-primary, #b26b00)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px',
        }}>
          <span style={{ flex: 1, wordBreak: 'break-word' }}>⚠ {skillsDirWarning}</span>
          <button onClick={() => setWarningDismissed(true)} style={{ ...styles.smallButton }}>知道了</button>
        </div>
      )}

      {/* 设置面板：三项并排一行（原先是纵向 grid，很占高度）。
          窄屏时 flexWrap 自动折回纵向堆叠。 */}
      {showSettings && (
        <div style={{ marginBottom: '10px', padding: '10px 12px', background: 'var(--dsw-alias-bg-layer-2)', borderRadius: '6px' }}>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={styles.label}>轮询间隔 (毫秒)</label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  type="number"
                  min="500"
                  step="500"
                  value={pollInterval}
                  onChange={(e) => updatePollInterval(e.target.value)}
                  style={styles.input}
                />
                <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px' }}>
                  自动刷新间隔
                </span>
              </div>
            </div>
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <label style={styles.label}>仓库目录</label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <code style={styles.code}>{repoDir}</code>
                <button onClick={() => openInExplorer(repoDir)} style={styles.smallButton}>打开</button>
              </div>
            </div>
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <label style={styles.label}>Skills 目录</label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <code style={styles.code}>{skillsDir}</code>
                <button onClick={() => openInExplorer(skillsDir)} style={styles.smallButton}>打开</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 插件列表 */}
      {plugins.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--dsw-alias-label-tertiary)' }}>
          仓库中没有插件
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--dsw-alias-border-l2)' }}>
              <th style={{ padding: '5px 4px', width: '32px' }}>
                <input
                  type="checkbox"
                  checked={selected.size === plugins.length && plugins.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) setSelected(new Set(plugins.map(p => p.name)))
                    else setSelected(new Set())
                  }}
                />
              </th>
              <th style={{ padding: '5px 6px', textAlign: 'left', width: '22%' }}>插件名称</th>
              <th style={{ padding: '5px 6px', textAlign: 'left' }}>描述</th>
              <th style={{ padding: '5px 6px', textAlign: 'left', width: '96px' }}>版本</th>
              <th style={{ padding: '5px 6px', textAlign: 'center', width: '76px' }}>状态</th>
              <th style={{ padding: '5px 6px', textAlign: 'right', width: '152px' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {plugins.map(plugin => (
              <tr key={plugin.name} style={{ borderBottom: '1px solid var(--dsw-alias-border-l3)' }}>
                <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selected.has(plugin.name)}
                    onChange={() => toggleSelect(plugin.name)}
                  />
                </td>
                <td style={{ padding: '6px', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 500 }}>{plugin.name}</div>
                  {/* 副标题：仓库插件显示仓库目录名；孤立已装显示「仓库中已不存在」——
                      用户必须一眼看出这一行在仓库里已经没有对应物，卸载后无从重装。 */}
                  <div style={{ fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)', lineHeight: 1.4 }}>
                    {plugin.source === 'installed-only' ? '仓库中已不存在' : plugin.repoDirName}
                  </div>
                </td>
                {/* 描述列：长描述截断显示，完整内容放 title 里，鼠标悬停可看全。
                    行数上限 2 是刻意的 —— 压到 1 行会让绝大多数描述都读不出信息。 */}
                <td style={{ padding: '6px', verticalAlign: 'top' }}>
                  {plugin.description ? (
                    <span
                      title={plugin.description}
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        fontSize: '12px',
                        lineHeight: 1.4,
                        color: 'var(--dsw-alias-label-secondary)',
                        wordBreak: 'break-word',
                      } as React.CSSProperties}
                    >
                      {plugin.description}
                    </span>
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '6px', color: 'var(--dsw-alias-label-tertiary)', verticalAlign: 'top', fontSize: '12px' }}>
                  {plugin.version || '—'}
                  {plugin.installed && plugin.installedVersion && plugin.installedVersion !== plugin.version && (
                    <div style={{ fontSize: '11px' }}>已装: {plugin.installedVersion}</div>
                  )}
                  {plugin.installed && plugin.hasUpdate && (
                    <div style={{
                      display: 'inline-block', marginTop: '2px', padding: '0 5px',
                      borderRadius: '8px', fontSize: '11px',
                      background: 'var(--dsw-alias-state-warning-bg, #fff7e6)',
                      color: 'var(--dsw-alias-state-warning-primary, #b26b00)',
                    }}>
                      可更新
                    </div>
                  )}
                </td>
                <td style={{ padding: '6px', textAlign: 'center', verticalAlign: 'top' }}>
                  {plugin.installed ? (
                    <span style={{
                      display: 'inline-block',
                      padding: '1px 7px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      whiteSpace: 'nowrap',
                      background: plugin.hasUpdate
                        ? 'var(--dsw-alias-state-warning-bg, #fff7e6)'
                        : 'var(--dsw-alias-state-success-bg)',
                      color: plugin.hasUpdate
                        ? 'var(--dsw-alias-state-warning-primary, #b26b00)'
                        : 'var(--dsw-alias-state-success-primary)',
                    }}>
                      {plugin.hasUpdate ? '可更新' : '已安装'}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px' }}>未安装</span>
                  )}
                </td>
                <td style={{ padding: '6px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                  {!plugin.installed && !actionLoading ? (
                    <button
                      onClick={() => setShowConfirm({ type: 'install', name: plugin.name })}
                      style={{ ...styles.button, marginRight: '4px' }}
                    >
                      安装
                    </button>
                  ) : actionLoading === plugin.name ? (
                    <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px' }}>处理中...</span>
                  ) : plugin.installed ? (
                    <>
                      {plugin.hasUpdate && (
                        <button
                          onClick={() => setShowConfirm({ type: 'update', name: plugin.name })}
                          style={{
                            ...styles.button, marginRight: '4px',
                            background: 'var(--dsw-alias-state-warning-bg, #fff7e6)',
                            color: 'var(--dsw-alias-state-warning-primary, #b26b00)',
                          }}
                        >
                          更新
                        </button>
                      )}
                      <button
                        onClick={() => setShowConfirm({ type: 'uninstall', name: plugin.name })}
                        style={{ ...styles.button, background: 'var(--dsw-alias-state-error-bg)', color: 'var(--dsw-alias-state-error-primary)' }}
                      >
                        卸载
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 确认对话框 */}
      {showConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ background: 'var(--dsw-alias-bg-layer-3)', padding: '18px 20px', borderRadius: '10px', maxWidth: '400px', width: '90%' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '15px' }}>
              {showConfirm.type === 'uninstall' ? '确认卸载'
                : showConfirm.type === 'update' ? '确认更新' : '确认安装'}
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '13px', lineHeight: 1.5 }}>
              {showConfirm.type === 'uninstall'
                ? `确定要卸载 "${showConfirm.name}" 吗？将从 DSH 的 skills 目录删除，仓库目录不受影响。`
                : showConfirm.type === 'update'
                  ? `确定要更新 "${showConfirm.name}" 吗？将用仓库中的新版本覆盖已装版本，旧版本会留档备份（记录在 version.json 的 previousVersion / backupDir）。`
                  : `确定要安装 "${showConfirm.name}" 吗？将从仓库复制到 skills 目录。`}
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowConfirm(null)} style={{ ...styles.button, padding: '5px 14px' }}>取消</button>
              <button
                onClick={() => showConfirm.type === 'uninstall'
                  ? handleUninstall(showConfirm.name)
                  : handleInstall(showConfirm.name)}
                style={{
                  ...styles.button,
                  padding: '5px 14px',
                  border: 'none',
                  background: showConfirm.type === 'uninstall'
                    ? 'var(--dsw-alias-state-error-primary)'
                    : 'var(--dsw-alias-state-success-primary)',
                  color: 'white',
                }}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 样式
// 尺寸统一按「紧凑」一档取值：按钮 4px 10px / 表格单元格 6px / 间距 6~10px。
// 唯一 consciously 不压的是「可点击目标」—— 按钮高度保持在 24px 上下，
// 再小会明显影响可点性；描述列仍保留 2 行。
const styles: Record<string, React.CSSProperties> = {
  button: {
    padding: '4px 10px',
    borderRadius: '5px',
    border: '1px solid var(--dsw-alias-border-l3)',
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary)',
    cursor: 'pointer',
    fontSize: '13px',
    lineHeight: 1.5,
  },
  smallButton: {
    padding: '2px 8px',
    borderRadius: '4px',
    border: '1px solid var(--dsw-alias-border-l3)',
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary)',
    cursor: 'pointer',
    fontSize: '12px',
    lineHeight: 1.5,
    flexShrink: 0,
  },
  label: {
    display: 'block',
    fontSize: '12px',
    color: 'var(--dsw-alias-label-secondary)',
    marginBottom: '2px',
  },
  input: {
    padding: '3px 8px',
    borderRadius: '4px',
    border: '1px solid var(--dsw-alias-border-l3)',
    background: 'var(--dsw-alias-bg-layer-1)',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: '13px',
    width: '100px',
  },
  code: {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: 'var(--dsw-alias-label-secondary)',
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
}
