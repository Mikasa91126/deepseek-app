import { create } from 'zustand'
import type { TtsVoice } from './api/speech.js'
import { normalizeLocation, type UserLocation } from './location.js'

export type Locale = 'zh-CN' | 'en-US'

/** 主题偏好；默认跟随系统 */
export type ThemePreference = 'light' | 'dark' | 'system'

/** 本机设置，存 localStorage：API Key、语言、主题、位置、朗读音色、深度思考与智能搜索开关、内容安全审核、字号、个性化、侧边栏收起状态 */
type Settings = {
  apiKey: string | null
  locale: Locale
  themePreference: ThemePreference
  location: UserLocation | null
  ttsVoice: TtsVoice
  thinking: boolean
  search: boolean
  /** 与官方 App 一致的服务端内容安全审核；个人自用默认关闭 */
  safetyCheck: boolean
  /** 思考结束后自动折叠思考内容（与官方 App 默认一致） */
  autoCollapseThinking: boolean
  /** 回答结束自动朗读 */
  autoReadAloud: boolean
  /** 聊天字号缩放，跟随系统时为 1 */
  fontScale: number
  /** 跟随系统字号 */
  followSystemFont: boolean
  siderCollapsed: boolean
}

const KEYS = {
  apiKey: 'chat-demo:api-key',
  locale: 'chat-demo:locale',
  location: 'chat-demo:location',
  themePreference: 'chat-demo:theme-preference',
  ttsVoice: 'chat-demo:tts-voice',
  thinking: 'chat-demo:thinking',
  search: 'chat-demo:search',
  safetyCheck: 'chat-demo:safety-check',
  autoCollapseThinking: 'chat-demo:auto-collapse-thinking',
  autoReadAloud: 'chat-demo:auto-read-aloud',
  fontScale: 'chat-demo:font-scale',
  followSystemFont: 'chat-demo:follow-system-font',
  siderCollapsed: 'chat-demo:sider-collapsed',
} as const

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // 存储不可用时只在内存中生效
  }
}

/** 位置选择模式跟随浏览器语言，与应用内选择的界面语言无关。 */
export const isChineseBrowser = (): boolean =>
  (typeof navigator === 'undefined' ? 'zh' : navigator.language).toLowerCase().startsWith('zh')

const initialLocale = (): Locale => {
  const saved = read(KEYS.locale)
  if (saved === 'zh-CN' || saved === 'en-US') {
    return saved
  }
  return isChineseBrowser() ? 'zh-CN' : 'en-US'
}

const initialLocation = (): UserLocation | null => {
  try {
    const location = normalizeLocation(JSON.parse(read(KEYS.location) ?? 'null'))
    if (!location) {
      return null
    }
    return isChineseBrowser()
      ? location.region === 'CN' && location.province
        ? location
        : null
      : { region: location.region }
  } catch {
    return null
  }
}

/** 未保存过时跟随系统 */
const initialThemePreference = (): ThemePreference => {
  const saved = read(KEYS.themePreference)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

/** 未保存过时使用服务端默认音色 stella（海星） */
const initialTtsVoice = (): TtsVoice => (read(KEYS.ttsVoice) === 'tide' ? 'tide' : 'stella')

/** 字号缩放范围与默认值（标准档） */
export const FONT_SCALE_MIN = 0.85
export const FONT_SCALE_MAX = 1.3

const initialFontScale = (): number => {
  const saved = Number(read(KEYS.fontScale))
  return Number.isFinite(saved) && saved >= FONT_SCALE_MIN && saved <= FONT_SCALE_MAX ? saved : 1
}

export const useSettings = create<Settings>(() => ({
  apiKey: read(KEYS.apiKey),
  locale: initialLocale(),
  location: initialLocation(),
  themePreference: initialThemePreference(),
  ttsVoice: initialTtsVoice(),
  thinking: read(KEYS.thinking) === 'true',
  search: read(KEYS.search) === 'true',
  safetyCheck: read(KEYS.safetyCheck) === 'true',
  autoCollapseThinking: read(KEYS.autoCollapseThinking) !== 'false',
  autoReadAloud: read(KEYS.autoReadAloud) === 'true',
  fontScale: initialFontScale(),
  followSystemFont: read(KEYS.followSystemFont) !== 'false',
  siderCollapsed: read(KEYS.siderCollapsed) === 'true',
}))

export const setLocale = (locale: Locale) => {
  write(KEYS.locale, locale)
  useSettings.setState({ locale })
}

export const setLocation = (value: UserLocation | null) => {
  const location = normalizeLocation(value)
  write(KEYS.location, location ? JSON.stringify(location) : null)
  useSettings.setState({ location })
}

export const setThemePreference = (themePreference: ThemePreference) => {
  write(KEYS.themePreference, themePreference)
  useSettings.setState({ themePreference })
}

export const setTtsVoice = (ttsVoice: TtsVoice) => {
  write(KEYS.ttsVoice, ttsVoice)
  useSettings.setState({ ttsVoice })
}

export const setApiKey = (apiKey: string | null) => {
  write(KEYS.apiKey, apiKey)
  useSettings.setState({ apiKey })
}

export const setThinking = (thinking: boolean) => {
  write(KEYS.thinking, String(thinking))
  useSettings.setState({ thinking })
}

export const setSearch = (search: boolean) => {
  write(KEYS.search, String(search))
  useSettings.setState({ search })
}

export const setSafetyCheck = (safetyCheck: boolean) => {
  write(KEYS.safetyCheck, String(safetyCheck))
  useSettings.setState({ safetyCheck })
}

export const setAutoCollapseThinking = (autoCollapseThinking: boolean) => {
  write(KEYS.autoCollapseThinking, String(autoCollapseThinking))
  useSettings.setState({ autoCollapseThinking })
}

export const setAutoReadAloud = (autoReadAloud: boolean) => {
  write(KEYS.autoReadAloud, String(autoReadAloud))
  useSettings.setState({ autoReadAloud })
}

export const setFontScale = (fontScale: number) => {
  const value = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, fontScale))
  write(KEYS.fontScale, String(value))
  useSettings.setState({ fontScale: value })
}

export const setFollowSystemFont = (followSystemFont: boolean) => {
  write(KEYS.followSystemFont, String(followSystemFont))
  useSettings.setState({ followSystemFont })
}

/** 把字号缩放应用到全局 CSS 变量（跟随系统时保持标准） */
export const applyFontScale = (followSystemFont: boolean, fontScale: number) => {
  const scale = followSystemFont ? 1 : fontScale
  document.documentElement.style.setProperty('--app-font-scale', String(scale))
}

export const setSiderCollapsed = (siderCollapsed: boolean) => {
  write(KEYS.siderCollapsed, String(siderCollapsed))
  useSettings.setState({ siderCollapsed })
}
