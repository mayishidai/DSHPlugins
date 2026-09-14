/** Plugin repository management panel component. */
import { useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'

export interface RepoPlugin {
  name: string
  repoDirName: string
  version: string | null
  installed: boolean
  installedVersion: string | null
  source: 'repo'
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
  const [showConfirm, setShowConfirm] = useState<{ type: 'install' | 'uninstall'; name: string } | null>(null)
  const [pollInterval, setPollInterval] = useState(initialPollInterval)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [showSettings, setShowSettings] = useState(false)

  // 加载插件列表
  const loadPlugins = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${apiBase}/list`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data: ApiResponse<RepoPlugin[]> = await response.json()
      if (data.ok && data.plugins) {
        setPlugins(data.plugins)
        setLastUpdate(new Date())
      } else {
        setError(data.error?.message || '加载失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
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

  // 处理安装
  const handleInstall = async (name: string) => {
    setActionLoading(name)
    setShowConfirm(null)
    try {
      const response = await fetch(`${apiBase}/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data: ApiResponse<null> = await response.json()
      if (data.ok) {
        await loadPlugins()
      } else {
        setError(data.error?.message || '安装失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setActionLoading(null)
    }
  }

  // 处理卸载
  const handleUninstall = async (name: string) => {
    setActionLoading(name)
    setShowConfirm(null)
    try {
      const response = await fetch(`${apiBase}/uninstall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data: ApiResponse<null> = await response.json()
      if (data.ok) {
        await loadPlugins()
      } else {
        setError(data.error?.message || '卸载失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
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
      <div style={{ padding: '20px', color: 'var(--dsw-alias-label-tertiary)' }}>
        加载中...
      </div>
    )
  }

  if (error && plugins.length === 0) {
    return (
      <div style={{ padding: '20px' }}>
        <div style={{ color: 'var(--dsw-alias-state-error-primary)' }}>{error}</div>
        <button onClick={loadPlugins} style={{ marginTop: '10px' }}>重试</button>
      </div>
    )
  }

  return (
    <div className={className} style={{ width: '100%', maxWidth: '900px', padding: '20px' }}>
      {/* 头部工具栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={loadPlugins}
            disabled={loading}
            style={styles.button}
          >
            {loading ? '⟳ 刷新中...' : '⟳ 刷新'}
          </button>
          <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px' }}>
            最后更新: {lastUpdate.toLocaleTimeString()}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {selected.size > 0 && (
            <div style={{ display: 'flex', gap: '8px' }}>
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

      {/* 设置面板 */}
      {showSettings && (
        <div style={{ marginBottom: '16px', padding: '16px', background: 'var(--dsw-alias-bg-layer-2)', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 12px' }}>设置</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            <div>
              <label style={styles.label}>轮询间隔 (毫秒)</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
            <div>
              <label style={styles.label}>仓库目录</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <code style={styles.code}>{repoDir}</code>
                <button onClick={() => openInExplorer(repoDir)} style={styles.smallButton}>打开</button>
              </div>
            </div>
            <div>
              <label style={styles.label}>Skills 目录</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <code style={styles.code}>{skillsDir}</code>
                <button onClick={() => openInExplorer(skillsDir)} style={styles.smallButton}>打开</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 插件列表 */}
      {plugins.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--dsw-alias-label-tertiary)' }}>
          仓库中没有插件
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--dsw-alias-border-l2)' }}>
              <th style={{ padding: '8px', width: '40px' }}>
                <input
                  type="checkbox"
                  checked={selected.size === plugins.length && plugins.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) setSelected(new Set(plugins.map(p => p.name)))
                    else setSelected(new Set())
                  }}
                />
              </th>
              <th style={{ padding: '8px', textAlign: 'left' }}>插件名称</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>版本</th>
              <th style={{ padding: '8px', textAlign: 'center' }}>状态</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {plugins.map(plugin => (
              <tr key={plugin.name} style={{ borderBottom: '1px solid var(--dsw-alias-border-l3)' }}>
                <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selected.has(plugin.name)}
                    onChange={() => toggleSelect(plugin.name)}
                  />
                </td>
                <td style={{ padding: '12px 8px' }}>
                  <div style={{ fontWeight: 500 }}>{plugin.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }}>
                    {plugin.repoDirName}
                  </div>
                </td>
                <td style={{ padding: '12px 8px', color: 'var(--dsw-alias-label-tertiary)' }}>
                  {plugin.version || '—'}
                  {plugin.installed && plugin.installedVersion && plugin.installedVersion !== plugin.version && (
                    <div style={{ fontSize: '11px' }}>已装: {plugin.installedVersion}</div>
                  )}
                </td>
                <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                  {plugin.installed ? (
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      background: 'var(--dsw-alias-state-success-bg)',
                      color: 'var(--dsw-alias-state-success-primary)',
                    }}>
                      已安装
                    </span>
                  ) : (
                    <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>未安装</span>
                  )}
                </td>
                <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                  {!plugin.installed && !actionLoading ? (
                    <button
                      onClick={() => setShowConfirm({ type: 'install', name: plugin.name })}
                      style={{ ...styles.button, marginRight: '4px' }}
                    >
                      安装
                    </button>
                  ) : actionLoading === plugin.name ? (
                    <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>处理中...</span>
                  ) : plugin.installed ? (
                    <button
                      onClick={() => setShowConfirm({ type: 'uninstall', name: plugin.name })}
                      style={{ ...styles.button, background: 'var(--dsw-alias-state-error-bg)', color: 'var(--dsw-alias-state-error-primary)' }}
                    >
                      卸载
                    </button>
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
          <div style={{ background: 'var(--dsw-alias-bg-layer-3)', padding: '24px', borderRadius: '12px', maxWidth: '400px', width: '90%' }}>
            <h3 style={{ margin: '0 0 16px' }}>
              {showConfirm.type === 'uninstall' ? '确认卸载' : '确认安装'}
            </h3>
            <p style={{ margin: '0 0 24px' }}>
              {showConfirm.type === 'uninstall'
                ? `确定要卸载 "${showConfirm.name}" 吗？此操作不可撤销。`
                : `确定要安装 "${showConfirm.name}" 吗？将从仓库复制到 skills 目录。`}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowConfirm(null)} style={styles.button}>取消</button>
              <button
                onClick={() => showConfirm.type === 'uninstall'
                  ? handleUninstall(showConfirm.name)
                  : handleInstall(showConfirm.name)}
                style={{
                  ...styles.button,
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
const styles: Record<string, React.CSSProperties> = {
  button: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid var(--dsw-alias-border-l3)',
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary)',
    cursor: 'pointer',
    fontSize: '13px',
  },
  smallButton: {
    padding: '4px 8px',
    borderRadius: '4px',
    border: '1px solid var(--dsw-alias-border-l3)',
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary)',
    cursor: 'pointer',
    fontSize: '12px',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    color: 'var(--dsw-alias-label-secondary)',
    marginBottom: '4px',
  },
  input: {
    padding: '6px 10px',
    borderRadius: '4px',
    border: '1px solid var(--dsw-alias-border-l3)',
    background: 'var(--dsw-alias-bg-layer-1)',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: '13px',
    width: '120px',
  },
  code: {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: 'var(--dsw-alias-label-secondary)',
    flex: 1,
  },
}
