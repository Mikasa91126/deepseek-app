import clsx from 'clsx'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslate } from '../../i18n/index.js'
import { pushBackHandler } from '../../services/backStack.js'
import { IconCloseOutline16 } from './icons.js'
import { IconButton } from './IconButton.js'
import styles from './Modal.module.css'

/** 当前打开的弹窗，后打开的在末尾；叠放时 Esc 只关闭最上层 */
const openModals: object[] = []

/** 退出动画时长，与 Modal.module.css 保持一致 */
const CLOSE_DURATION = 160

/** 遮罩 + 居中卡片，Esc / 点遮罩关闭；带进入与退出动画 */
export const Modal = ({
  title,
  children,
  footer,
  closable = false,
  className,
  mainClassName,
  onClose,
}: {
  title: ReactNode
  children?: ReactNode
  footer?: ReactNode
  /** 标题栏右侧显示关闭按钮 */
  closable?: boolean
  className?: string
  /** 内容区的 class */
  mainClassName?: string
  onClose: () => void
}) => {
  const t = useTranslate()
  const titleId = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const timerRef = useRef<number>()
  // 先播放退出动画，再通知调用方卸载
  const requestClose = () => {
    if (closingRef.current) {
      return
    }
    closingRef.current = true
    setClosing(true)
    timerRef.current = window.setTimeout(() => onCloseRef.current(), CLOSE_DURATION)
  }
  useEffect(() => {
    const token = {}
    openModals.push(token)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && openModals.at(-1) === token) {
        requestClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    // 安卓返回键：先关闭最上层弹窗
    const removeBackHandler = pushBackHandler(() => {
      requestClose()
      return true
    })
    return () => {
      openModals.splice(openModals.indexOf(token), 1)
      document.removeEventListener('keydown', onKeyDown)
      removeBackHandler()
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createPortal(
    <div
      className={clsx(styles.overlay, closing && styles.closing)}
      onMouseDown={(event) => event.target === event.currentTarget && requestClose()}
    >
      <div
        className={clsx(styles.content, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <div id={titleId} className={styles.title}>
            {title}
          </div>
          {closable ? (
            <IconButton
              className={styles.close}
              tone="primary"
              icon={<IconCloseOutline16 />}
              aria-label={t('close')}
              onClick={requestClose}
            />
          ) : null}
        </div>
        {children ? <div className={clsx(styles.main, mainClassName)}>{children}</div> : null}
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>,
    document.body
  )
}
