import { useTranslate } from '../../i18n/index.js'
import {
  describeReadAloudError,
  toggleReadAloud,
  useReadAloud,
} from '../../services/speech/readAloud.js'
import { IconButton } from '../base/IconButton.js'
import { showToast } from '../base/toastState.js'
import { ReadingBars } from './ReadingBars.js'

/** 未朗读时的声波图标（与官方 App 的朗读按钮一致） */
const WaveIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1" y="6" width="2" height="4" rx="1" fill="currentColor" />
    <rect x="5" y="3.5" width="2" height="9" rx="1" fill="currentColor" />
    <rect x="9" y="5" width="2" height="6" rx="1" fill="currentColor" />
    <rect x="13" y="2.5" width="2" height="11" rx="1" fill="currentColor" />
  </svg>
)

/** 朗读按钮：未朗读时点击开始，加载中或朗读中点击停止；正文原样提交，由服务端过滤 markdown */
export const ReadAloudButton = ({ messageId, text }: { messageId: string; text: string }) => {
  const t = useTranslate()
  const status = useReadAloud((state) => (state.messageId === messageId ? state.status : 'idle'))
  return (
    <IconButton
      icon={status === 'idle' ? <WaveIcon /> : <ReadingBars mode={status} />}
      tooltip={status === 'idle' ? t('ttsPlay') : t('ttsStop')}
      tooltipPlacement="bottom"
      onClick={() =>
        toggleReadAloud(messageId, text, (error) => showToast(describeReadAloudError(error)))
      }
    />
  )
}
