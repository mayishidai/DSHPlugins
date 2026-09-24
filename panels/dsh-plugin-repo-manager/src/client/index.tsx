/**
 * Main client entry - 把「我的插件仓库」挂成侧边栏的一个全局面板。
 *
 * ## 席位选择（2026-09-24 修正，此前是错的）
 *
 * 旧实现把入口注册到 `sidebar` 槽 —— **那是整栏替换，注定不显示**。
 * `sidebar` 的 cardinality 是 `single`，且已被 ui-sidebar 的 SidebarRoot 占用；
 * ui-layout 的 `SlotMap` 注释原话：
 *
 *   "The whole left column. OCCUPIED by ui-sidebar's SidebarRoot, which declares the
 *    workspace and settings seats inside it - registering here replaces the navigation
 *    column outright rather than adding to it, and the seats it declares disappear with
 *    it. To add something to the sidebar, register into one of those inner seats instead."
 *
 * 症状与那句原话完全对得上：用户在侧边栏里找不到入口，只找得到设置里那个 tab。
 *
 * 正确席位是 ui-sidebar 声明的子槽 **`sidebar.panellist`**（`{kind:'list', scope:'root'}`），
 * 它在 SidebarRoot 的渲染顺序里紧接 New Session 按钮之后：
 *
 *   logoRow → New Session 按钮 → panelList（就是 panellist 行） → workspaces → foot
 *
 * 这正是「新会话下面的侧边栏」，也正是 ui-sidebar 为**全局面板入口**保留的席位。
 */
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { PluginRepoPanel } from './PluginRepoPanel.tsx'
import { en, zh } from './locales.ts'

// 席位归属（来自上游 docs/subsystems/slots.zh.md 的当前层级树）：
//   `sidebar.panellist` 由 ui-sidebar 声明（它是 `sidebar` 槽的占用者）
//   `main`              由 ui-layout 声明（root 单例，keyed / scope root）
// 两个包的 factory 到达顺序由宿主的 boot 图管理，插件侧靠 `ctx.slots.inject()`
// 等声明就绪即可 —— package.json 的 `dsh.client.inject` 里**不**加这两个包名：
// 那条边一旦写错包名，本插件工厂会一直等、面板永不出现（比不声明更糟）。

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    pluginRepo: import('./locales.ts').PluginRepoLocaleKey
  }
}

/**
 * 字典命名空间。
 *
 * 名字里不再带 `settings.` 前缀：这个面板已经不在设置里了，命名空间名继续叫
 * `settings.pluginRepo` 属于「名字与语义漂移」，下一个读代码的人会以为它还是个设置页。
 */
export const NS = 'pluginRepo'

export const inject = ['slots', 'locale']

/**
 * 面板 ID —— 侧边栏入口行与本体的**共享身份**。
 *
 * ⚠️ 这一个字符串同时是两个登记项的地址，**必须逐字相同**：
 *
 *   1. `sidebar.panellist` 的 `id` —— 侧边栏那一行的列表定址（list 槽用 `id`）；
 *   2. `main` keyed 槽的 `key` —— 主界面工作区里渲染的面板本体（keyed 槽用 `key`）。
 *
 * ui-layout 的 `MainPanelId` 注释写得很直白：
 * "Identity shared by a sidebar panel entry and its main-slot occupant."
 *
 * 缺任一侧都是静默失效：
 *   - 有行、无本体 → 点击时 `ctx.layout.selectPanel(id)` 直接 **throw**
 *     （"layout.selectPanel: main panel \"X\" is not registered"）并保留当前选中态，
 *     用户看到的就是「点了没反应」；
 *   - 有本体、无行 → 永远没有入口，面板只能靠别处跳转。
 * 所以下面两处 `register` 必须**成对**出现，并由同一个开关一起控制。
 */
export const PANEL_ID = 'plugin-repo'

/**
 * 内联 SVG 图标（package / 箱子）。
 *
 * 为什么不用 `icon: 'package'` 让宿主去渲染：把图标名交给宿主，等于把
 * 「这个图标名宿主认不认」变成运行时未知数 —— 名字写错时**不会报错**，
 * 只会静默显示成空白或回退字符，是那种「看着像没问题、其实没生效」的失效。
 * 自己画内联 SVG 则完全不依赖宿主的图标集，`currentColor` 还能自动跟随
 * 侧边栏的深浅色主题（选中态的变色由 shell 打在按钮上的 class 负责，
 * 我们只要别把颜色写死）。
 */
function PackageIcon({ size = 18 }: { size?: number }) {
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
        showSidebarEntry?: boolean
        /** @deprecated 旧键名，仍兼容读取。 */
        showSidebarButton?: boolean
        sidebarTitle?: string
      }
    | undefined
  const pollInterval = config?.pollInterval ?? 3000
  const repoDir = config?.repoDir ?? '/vol1/1000/AI/DSHPlugin/skills'
  const skillsDir = config?.skillsDir ?? ''
  // 默认 true：配置缺失时保持与旧行为一致，不能因为宿主没注入配置就把入口弄丢。
  //
  // 这里**只认服务端归一化后的布尔值**，不再自己解析字符串。原因：配置项（YAML /
  // 环境变量）只可能给到字符串，而字符串的宽容解析（"false" 要判成 false）是整个
  // 链路上唯一有独立语义的判据 —— 它只在服务端 half 存在一份（`resolveShowSidebarEntry`
  // ），并由 `scripts/test-sidebar.mjs` 直接 import 产物断言。客户端再写一份，就是
  // 「同一判据两处实现」，必然漂移。
  // 仍然读旧键是为了容忍「两半版本混装」：老服务端下发的字段名是 showSidebarButton。
  const rawShowSidebarEntry = config?.showSidebarEntry ?? config?.showSidebarButton
  const showSidebarEntry = rawShowSidebarEntry !== false

  ctx.effect(
    () => ctx.locale.register(NS, { zh, en }),
    'dsh-plugin-repo-manager: dictionaries',
  )
  const t = ctx.locale.bind(NS)
  const sidebarTitle = config?.sidebarTitle || ''
  // 在函数里取文案（而不是在这里算成常量），这样切换语言时 sidebar 的
  // `ctx.locale.subscribe(syncPanels)` 重新解析 label 能拿到新语言的文字。
  const label = () => sidebarTitle || t('sidebar')

  if (!showSidebarEntry) return

  // ---- ① 侧边栏入口行：位置就在 New Session 按钮正下方 --------------------
  //
  // `sidebar.panellist` 是 `list` 槽，必填 `id`（就是 PANEL_ID）；`order` 只影响
  // 与其他插件面板行的相对顺序。`label` 由 shell 用 `resolveSlotLabel` 解析后
  // 同时用于 hover 提示、无障碍名和展开态的文字。
  //
  // owner 传下来的 props 是 `{ size, active }`（SidebarRoot 里
  // `renderSlot('sidebar.panellist', { size: wide ? 16 : 18, active }, { only: id })`），
  // 所以只需要画图标；不要在这里画文字，也别自己写 onClick —— 整行的点击由 shell
  // 调 `selectPanel(id)` 处理。
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      { name: 'sidebar.panellist', id: PANEL_ID, order: 100, label },
      ({ size }: any) => <PackageIcon size={size ?? 18} />,
    ),
  )

  // ---- ② 面板本体：主界面工作区（main keyed 槽） ---------------------------
  //
  // `main` 是 `{kind:'keyed', scope:'root'}`，注册字段是 `key`（不是 `id`）——
  // ui-layout 判它是否已注册用的是 `entry.options.key === id`。
  // 用 PANEL_ID 让「侧边栏那一行」和「这个本体」成为同一个身份。
  //
  // 没有会话绑定是**预期行为**：ui-layout 对 `main` 的注释写着
  // "The reserved conversation key hosts the Conversation; other keys receive no
  // Session binding." —— 全局面板本来就不该依赖会话。
  ctx.slots.inject('main', () =>
    ctx.slots.register(
      { name: 'main', key: PANEL_ID },
      () => (
        <PluginRepoPanel
          apiBase="/api/plugin-repo"
          pollInterval={pollInterval}
          repoDir={repoDir}
          skillsDir={skillsDir}
        />
      ),
    ),
  )
}
