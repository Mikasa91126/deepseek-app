import {
  IconMenuOutline20,
  IconNewChatOutline20,
  IconVolumeMuteOutline20,
  IconVolumeOutline20,
} from '../base/icons.js'
import { useTranslate } from '../../i18n/index.js'
import { newChat } from '../../services/chat/store.js'
import { setAutoReadAloud, useSettings } from '../../services/settings.js'
import { showToast } from '../base/toastState.js'
import { IconButton } from '../base/IconButton.js'
import { openMobileSider } from '../sider/mobileSiderState.js'
import styles from './MobileHeader.module.css'

/** 移动端顶栏：菜单、居中标题、自动朗读开关与新建对话（与官方 App 一致） */
export const MobileHeader = ({ title }: { title?: string }) => {
  const t = useTranslate()
  const autoReadAloud = useSettings((state) => state.autoReadAloud)
  return (
    <div className={styles.header}>
      <IconButton
        size="xl"
        tone="primary"
        icon={<IconMenuOutline20 />}
        aria-label={t('expandSiderbarButton')}
        onClick={openMobileSider}
      />
      <div className={styles.title}>{title}</div>
      <div className={styles.right}>
        <IconButton
          size="xl"
          tone="primary"
          icon={autoReadAloud ? <IconVolumeOutline20 /> : <IconVolumeMuteOutline20 />}
          aria-label={autoReadAloud ? t('autoReadOn') : t('autoReadOff')}
          tooltip={autoReadAloud ? t('autoReadOn') : t('autoReadOff')}
          tooltipPlacement="bottom"
          onClick={() => {
            setAutoReadAloud(!autoReadAloud)
            showToast({ key: autoReadAloud ? 'autoReadOff' : 'autoReadOn' })
          }}
        />
        <IconButton
          size="xl"
          tone="primary"
          icon={<IconNewChatOutline20 />}
          aria-label={t('newChat')}
          onClick={newChat}
        />
      </div>
    </div>
  )
}
