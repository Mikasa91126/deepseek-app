import { useSettingsDialog } from './settingsDialogState.js'
import { SettingsScreen } from './SettingsScreen.js'

/** 设置：打开时渲染全屏二级页（移动端整页，桌面端居中卡片） */
export const SettingsDialog = () => {
  const open = useSettingsDialog((state) => state.open)
  return open ? <SettingsScreen /> : null
}
