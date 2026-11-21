import { useSyncExternalStore } from 'react'
import { useSettings, type ThemePreference } from '../services/settings.js'

export type Theme = 'light' | 'dark'

const query = window.matchMedia('(prefers-color-scheme: dark)')

type NativeThemeBridge = { isSystemDark?: () => boolean }
const getNativeBridge = () =>
  (window as unknown as { AndroidBridge?: NativeThemeBridge }).AndroidBridge

/**
 * 安卓 WebView 的 prefers-color-scheme 取自应用主题而非系统设置，
 * 应用主题为 Light 时会永远返回浅色。壳里通过 isSystemDark() 读取
 * 系统 uiMode，并在系统深浅色切换时回调 __onNativeThemeChanged。
 */
const osThemeListeners = new Set<() => void>()
const notifyOsTheme = () => {
  for (const listener of osThemeListeners) {
    listener()
  }
}

const subscribeOsTheme = (listener: () => void) => {
  osThemeListeners.add(listener)
  query.addEventListener('change', listener)
  return () => {
    osThemeListeners.delete(listener)
    query.removeEventListener('change', listener)
  }
}

const getOsTheme = (): Theme => {
  try {
    const bridge = getNativeBridge()
    if (bridge?.isSystemDark) {
      return bridge.isSystemDark() ? 'dark' : 'light'
    }
  } catch {
    // 桥接不可用时退回 media query
  }
  return query.matches ? 'dark' : 'light'
}

const resolveTheme = (preference: ThemePreference, osTheme: Theme): Theme =>
  preference === 'system' ? osTheme : preference

/** 当前实际生效的深浅色：手动选择优先，「跟随系统」时取系统设置 */
export const useTheme = (): Theme => {
  const preference = useSettings((state) => state.themePreference)
  const osTheme = useSyncExternalStore(subscribeOsTheme, getOsTheme)
  return resolveTheme(preference, osTheme)
}

const syncPageBackground = () => {
  const backgroundColor = getComputedStyle(document.body).backgroundColor
  document.documentElement.style.backgroundColor = backgroundColor
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', backgroundColor)
}

/** 同步页面主题、根画布背景和支持 theme-color 的浏览器栏。 */
const applyTheme = (theme: Theme) => {
  const body = document.body
  // 主题切换帧禁用过渡，使页面颜色同步更新
  body.classList.add('change-theme')
  body.classList.toggle('dark', theme === 'dark')
  body.classList.toggle('light', theme === 'light')
  if (theme === 'dark') {
    body.setAttribute('data-ds-dark-theme', 'dark')
  } else {
    body.removeAttribute('data-ds-dark-theme')
  }
  document.documentElement.style.colorScheme = theme
  // 首次背景色同步在样式表加载完成后执行，适配 WebKit 的 defer 脚本执行顺序。
  if (document.readyState === 'complete') {
    syncPageBackground()
  }
  setTimeout(() => {
    body.classList.remove('change-theme')
  }, 0)
}

let appliedTheme: Theme | null = null

const syncTheme = () => {
  const theme = resolveTheme(useSettings.getState().themePreference, getOsTheme())
  if (theme !== appliedTheme) {
    appliedTheme = theme
    applyTheme(theme)
  }
}

/** 首屏渲染前同步应用一次，之后随主题设置与系统深浅色变化更新 */
export const setupTheme = () => {
  syncTheme()
  if (document.readyState !== 'complete') {
    window.addEventListener('load', syncPageBackground, { once: true })
  }
  query.addEventListener('change', syncTheme)
  // 安卓壳在系统深浅色切换（含回到应用）时通知网页重新取色
  const host = window as unknown as { __onNativeThemeChanged?: () => void }
  host.__onNativeThemeChanged = () => {
    notifyOsTheme()
    syncTheme()
  }
  useSettings.subscribe(syncTheme)
}
