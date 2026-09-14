/** Main client entry - registers the plugin repo panel. */
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { PluginRepoPanel } from './PluginRepoPanel.tsx'
import { en, zh } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.pluginRepo': import('./locales.ts').PluginRepoLocaleKey
  }
}

export const NS = 'settings.pluginRepo'
export const inject = ['slots', 'locale']

export function apply(ctx: any): void {
  const config = ctx.get?.('pluginRepoConfig') as { pollInterval: number; repoDir: string; skillsDir: string } | undefined
  const pollInterval = config?.pollInterval ?? 3000
  const repoDir = config?.repoDir ?? '/vol1/1000/AI/DSHPlugin/plugins'
  const skillsDir = config?.skillsDir ?? ''

  ctx.effect(
    () => ctx.locale.register(NS, { zh, en }),
    'dsh-plugin-repo-manager: dictionaries',
  )
  const t = ctx.locale.bind(NS)

  // 注册到设置面板的插件 tab
  ctx.slots.inject('settings.plugins.tab', () =>
    ctx.slots.register(
      {
        name: 'settings.plugins.tab',
        id: 'plugin-repo',
        order: 20,
        label: () => t('tab'),
        locale: NS,
      },
      (props: any) => (
        <PluginRepoPanel
          apiBase="/api/plugin-repo"
          pollInterval={pollInterval}
          repoDir={repoDir}
          skillsDir={skillsDir}
        />
      )
    ),
  )

  // 注册到侧边栏
  ctx.slots.inject('sidebar', () =>
    ctx.slots.register(
      {
        name: 'sidebar',
        id: 'plugin-repo-btn',
        order: 100,
        icon: 'package',
        label: () => t('sidebar'),
      },
      (props: any) => (
        <div
          onClick={() => props.navigateTo?.('settings.plugins.tab.plugin-repo')}
          style={{ cursor: 'pointer', padding: '8px' }}
        >
          {t('sidebar')}
        </div>
      )
    ),
  )
}
