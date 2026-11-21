import clsx from 'clsx'
import { memo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { IconEditOutline16, IconEllipsisOutline16, IconTrashOutline16 } from '../base/icons.js'
import { renameSession, selectSession } from '../../services/chat/store.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { IconButton } from '../base/IconButton.js'
import { Menu } from '../base/Menu.js'
import { closeMobileSider } from './mobileSiderState.js'
import styles from './SessionItem.module.css'

export const SessionItem = memo(function SessionItem({
  session,
  active,
  onDelete,
  snippet,
  selectable = false,
  selected = false,
  onToggle,
}: {
  session: SessionSummary
  active: boolean
  onDelete: () => void
  /** 搜索命中片段（来自对话正文/思考），标题命中时为空 */
  snippet?: string
  /** 多选管理模式下显示选择圈，点击切换选中而非打开 */
  selectable?: boolean
  selected?: boolean
  onToggle?: () => void
}) {
  const t = useTranslate()
  const [editing, setEditing] = useState(false)
  const displayTitle = session.title || t('untitledChat')

  if (editing) {
    const finish = (title: string) => {
      setEditing(false)
      if (title.trim() && title.trim() !== displayTitle) {
        renameSession(session.id, title.trim())
      }
    }
    return (
      <input
        className={styles.renameInput}
        defaultValue={displayTitle}
        autoFocus
        onFocus={(event) => event.target.select()}
        onBlur={(event) => finish(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            finish(event.currentTarget.value)
          } else if (event.key === 'Escape') {
            setEditing(false)
          }
        }}
      />
    )
  }

  if (selectable) {
    return (
      <div
        className={clsx(styles.item, styles.selectable, selected && styles.selected)}
        role="option"
        aria-selected={selected}
        onClick={onToggle}
      >
        <span className={clsx(styles.selector, selected && styles.selectorOn)} />
        <div className={styles.title}>{displayTitle}</div>
      </div>
    )
  }

  return (
    <div
      className={clsx(styles.item, active && styles.active, snippet && styles.hasSnippet)}
      onClick={() => {
        selectSession(session.id)
        closeMobileSider()
      }}
    >
      <div className={styles.texts}>
        <div className={styles.title}>{displayTitle}</div>
        {snippet ? <div className={styles.snippet}>{snippet}</div> : null}
      </div>
      <div className={styles.action} onClick={(event) => event.stopPropagation()}>
        <Menu
          options={[
            {
              key: 'rename',
              label: t('sessionItemMenuRenameOption'),
              icon: <IconEditOutline16 />,
              onSelect: () => setEditing(true),
            },
            {
              key: 'delete',
              label: t('delete'),
              icon: <IconTrashOutline16 />,
              danger: true,
              onSelect: onDelete,
            },
          ]}
        >
          {({ toggle }) => (
            <IconButton icon={<IconEllipsisOutline16 />} aria-label={t('more')} onClick={toggle} />
          )}
        </Menu>
      </div>
    </div>
  )
})
