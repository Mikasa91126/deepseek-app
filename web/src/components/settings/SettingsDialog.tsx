import { usePresence } from '../../hooks/usePresence.js'
import { useSettingsDialog } from './settingsDialogState.js'
import { SettingsScreen } from './SettingsScreen.js'

/** 设置：打开时渲染全屏二级页（移动端整页，桌面端居中卡片）；关闭时播放退出动画 */
export const SettingsDialog = () => {
  const open = useSettingsDialog((state) => state.open)
  const { rendered, closing } = usePresence(open, 220)
  return rendered ? <SettingsScreen closing={closing} /> : null
}
