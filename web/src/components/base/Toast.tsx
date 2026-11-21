import clsx from 'clsx'
import { useRef } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { usePresence } from '../../hooks/usePresence.js'
import { IconToastError16 } from './icons.js'
import { useToast } from './toastState.js'
import styles from './Toast.module.css'

export const Toast = () => {
  const t = useTranslate()
  const { id, message } = useToast()
  const lastMessage = useRef(message)
  if (message) {
    lastMessage.current = message
  }
  // 消失时保留最后一条内容，播放退出动画后再卸载
  const { rendered, closing } = usePresence(message !== null, 180)
  const shown = message ?? lastMessage.current
  if (!rendered || !shown) {
    return null
  }
  if (typeof shown === 'string') {
    return (
      <div key={id} className={clsx(styles.toast, closing && styles.closing)} role="status">
        {shown}
      </div>
    )
  }
  const error = shown.type === 'error'
  return (
    <div
      key={id}
      className={clsx(styles.toast, error && styles.error, closing && styles.closing)}
      role="status"
    >
      {error ? (
        <span className={styles.icon}>
          <IconToastError16 />
        </span>
      ) : null}
      <span className={styles.content}>
        {t(shown.key, shown.params)}
        {shown.link ? (
          <a className={styles.link} href={shown.link.href} target="_blank" rel="noreferrer">
            {t(shown.link.key)}
          </a>
        ) : null}
      </span>
    </div>
  )
}
