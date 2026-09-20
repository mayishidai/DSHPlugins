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

/** 侧边栏按钮在槽位中的 id，也是点击后要导航到的路由片段。 */
export const SIDEBAR_SLOT_ID = 'plugin-repo-btn'
/** 设置面板 tab 的路由 id（点击侧边栏按钮跳到这里）。 */
export const TAB_SLOT_ID = 'plugin-repo'

/**
 * 内联 SVG 图标（package / 箱子）。
 *
 * 为什么不用 `icon: 'package'` 让宿主去渲染：把图标名交给宿主，等于把
 * 「这个图标名宿主认不认」变成运行时未知数 —— 名字写错时**不会报错**，
 * 只会静默显示成空白或回退字符，是那种「看着像没问题、其实没生效」的失效。
 * 自己画内联 SVG 则完全不依赖宿主的图标集，`currentColor` 还能自动跟随
 * 侧边栏的深浅色主题。
 */
function PackageIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  )
}

export function apply(ctx: any): void {
  const config = ctx.get?.('pluginRepoConfig') as
    | {
        pollInterval?: number
        repoDir?: string
        skillsDir?: string
        showSidebarButton?: boolean
        sidebarTitle?: string
      }
    | undefined
  const pollInterval = config?.pollInterval ?? 3000
  const repoDir = config?.repoDir ?? '/vol1/1000/AI/DSHPlugin/skills'
  const skillsDir = config?.skillsDir ?? ''
  // 默认 true：配置缺失时保持与旧行为一致，不能因为宿主没注入配置就把按钮弄丢。
  const showSidebarButton = config?.showSidebarButton !== false
  const sidebarTitle = config?.sidebarTitle || ''

  ctx.effect(
    () => ctx.locale.register(NS, { zh, en }),
    'dsh-plugin-repo-manager: dictionaries',
  )
  const t = ctx.locale.bind(NS)
  const title = sidebarTitle || t('sidebar')

  // 注册到设置面板的插件 tab
  ctx.slots.inject('settings.plugins.tab', () =>
    ctx.slots.register(
      {
        name: 'settings.plugins.tab',
        id: TAB_SLOT_ID,
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

  // 注册到主界面侧边栏（图标按钮）。
  // showSidebarButton 为 false 时整个不注册 —— 注意这里必须用「不注册」而不是
  // 「注册但渲染 null」：渲染 null 仍会占位、仍可能被宿主画出分隔线或触发
  // 布局抖动，只有不注册才是真正干净地拿掉。
  if (showSidebarButton) {
    ctx.slots.inject('sidebar', () =>
      ctx.slots.register(
        {
          name: 'sidebar',
          id: SIDEBAR_SLOT_ID,
          order: 100,
          // icon 字段仍保留：宿主若支持就会用它给原生按钮配图标；
          // 不支持也无妨，下面的 render 会自己画一个。
          icon: 'package',
          label: () => title,
        },
        (props: any) => (
          <button
            type="button"
            title={title}
            aria-label={title}
            onClick={() => props.navigateTo?.(`settings.plugins.tab.${TAB_SLOT_ID}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              padding: '8px',
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              borderRadius: '6px',
            }}
          >
            <PackageIcon />
          </button>
        )
      ),
    )
  }
}
