/** Plugin repository settings tab component. */
import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'

export interface RepoPlugin {
  name: string
  repoDirName: string
  version: string | null
  installed: boolean
  installedVersion: string | null
  source: 'repo'
}

export interface PluginRepoTabInjected {
  list: () => Promise<{ plugins: RepoPlugin[] }>
  uninstall: (name: string) => Promise<{ ok: boolean; name?: string; removed?: boolean; error?: { code: string; message: string } }>
}

export interface PluginRepoTabProps {
  list: () => Promise<{ plugins: RepoPlugin[] }>
  uninstall: (name: string) => Promise<any>
  t: (key: string) => string
}

export function PluginRepoTab({ list, uninstall, t }: PluginRepoTabProps): ReactNode {
  const [plugins, setPlugins] = useState<RepoPlugin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uninstalling, setUninstalling] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showConfirm, setShowConfirm] = useState<string | null>(null)

  const loadPlugins = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await list()
      setPlugins(result.plugins || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPlugins()
  }, [])

  const handleUninstall = async (name: string) => {
    setUninstalling(name)
    setShowConfirm(null)
    try {
      const result = await uninstall(name)
      if (result.ok) {
        setSelected(prev => { const next = new Set(prev); next.delete(name); return next })
        await loadPlugins()
      } else {
        setError(result.error?.message || 'Uninstall failed')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setUninstalling(null)
    }
  }

  const toggleSelect = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  if (loading) {
    return <div style={{ padding: '20px', color: 'var(--dsw-alias-label-tertiary)' }}>{t('loading')}</div>
  }

  if (error) {
    return (
      <div style={{ padding: '20px' }}>
        <div style={{ color: 'var(--dsw-alias-state-error-primary)' }}>{error}</div>
        <button onClick={loadPlugins} style={{ marginTop: '10px' }}>{t('retry')}</button>
      </div>
    )
  }

  if (plugins.length === 0) {
    return <div style={{ padding: '20px', color: 'var(--dsw-alias-label-tertiary)' }}>{t('empty')}</div>
  }

  return (
    <div style={{ width: '100%', maxWidth: '800px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--dsw-alias-border-l2)' }}>
            <th style={{ padding: '8px', textAlign: 'left' }}>插件</th>
            <th style={{ padding: '8px', textAlign: 'left' }}>版本</th>
            <th style={{ padding: '8px', textAlign: 'center' }}>状态</th>
            <th style={{ padding: '8px', textAlign: 'right' }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {plugins.map(plugin => (
            <tr key={plugin.name} style={{ borderBottom: '1px solid var(--dsw-alias-border-l3)' }}>
              <td style={{ padding: '12px 8px' }}>
                <input type="checkbox" checked={selected.has(plugin.name)} onChange={() => toggleSelect(plugin.name)} disabled={!plugin.installed} style={{ marginRight: '8px' }} />
                {plugin.name}
              </td>
              <td style={{ padding: '12px 8px', color: 'var(--dsw-alias-label-tertiary)' }}>{plugin.version || t('notInstalled')}</td>
              <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                {plugin.installed ? (
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', background: 'var(--dsw-alias-state-success-bg)', color: 'var(--dsw-alias-state-success-primary)' }}>{t('installed')}</span>
                ) : <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>—</span>}
              </td>
              <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                {plugin.installed && !uninstalling ? (
                  <button onClick={() => setShowConfirm(plugin.name)} disabled={selected.size === 0 || !selected.has(plugin.name)} style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l3)', background: 'transparent', color: 'var(--dsw-alias-label-primary)', cursor: selected.has(plugin.name) ? 'pointer' : 'not-allowed', opacity: selected.has(plugin.name) ? 1 : 0.5 }}>{t('uninstall')}</button>
                ) : uninstalling === plugin.name ? (
                  <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>{t('uninstalling')}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showConfirm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--dsw-alias-bg-layer-3)', padding: '24px', borderRadius: '12px', maxWidth: '400px', width: '90%' }}>
            <h3 style={{ margin: '0 0 16px' }}>{t('confirmUninstall')}</h3>
            <p style={{ margin: '0 0 24px' }}>{t('confirmUninstallMsg').replace('{{name}}', showConfirm)}</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowConfirm(null)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l3)', background: 'transparent', cursor: 'pointer' }}>取消</button>
              <button onClick={() => handleUninstall(showConfirm)} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'var(--dsw-alias-state-error-primary)', color: 'white', cursor: 'pointer' }}>确认卸载</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
