/**
 * DSH 宿主包的类型声明桩。
 *
 * 这些包由 DSH 运行时（Cordis loader）在加载插件时注入，本仓库不安装、
 * 也不应安装它们（否则会把宿主版本钉死在插件里）。这里仅声明最小可用签名，
 * 让 `tsc --noEmit` 能在干净环境下跑通，用于校验我们自己写的代码。
 *
 * 若宿主升级导致 API 变化，只需同步本文件。
 */

declare module '@deepseek-ai/dsh-client-locale/client' {
  const _default: unknown
  export default _default
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  const _default: unknown
  export default _default
}

declare module '@deepseek-ai/dsh-client-ui-slots/client' {
  const _default: unknown
  export default _default
}

declare module '@deepseek-ai/cordis' {
  const _default: unknown
  export default _default
}
