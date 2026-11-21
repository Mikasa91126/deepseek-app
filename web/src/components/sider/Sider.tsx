import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  IconCloseOutline16,
  IconEllipsisOutline16,
  IconPanelLeftOutline16,
  IconPersonOutline16,
  IconPinOutline16,
  IconSearchOutline16,
  IconSettingsOutline16,
  IconSlidersOutline16,
  IconTrashOutline16,
  NewChatIcon,
} from '../base/icons.js'
import { setSiderCollapsed, useSettings } from '../../services/settings.js'
import { useAndroidBack } from '../../services/backStack.js'
import { usePresence } from '../../hooks/usePresence.js'
import { groupSessions } from '../../services/chat/sessionGroups.js'
import { newChat, removeSession, setPinned, useChatStore } from '../../services/chat/store.js'
import { searchSessionIds } from '../../services/chat/search.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { closeMobileSider, useMobileSider } from './mobileSiderState.js'
import { SessionItem } from './SessionItem.js'
import styles from './Sider.module.css'

/** 置顶数量上限（对应官方设置的「会话最大置顶数量」） */
const MAX_PINNED = 10

/** 展开的侧边栏：名称与收起按钮、开启新对话、按时间分组的会话列表、底部设置；移动端放在抽屉里，收起按钮关闭抽屉 */
export const Sider = ({ mobile = false }: { mobile?: boolean }) => {
  const t = useTranslate()
  const sessions = useChatStore((state) => state.sessions)
  const activeId = useChatStore((state) => state.activeId)
  const apiKey = useSettings((state) => state.apiKey)
  const [query, setQuery] = useState('')
  const [matchIds, setMatchIds] = useState<Set<string> | null>(null)
  const [searching, setSearching] = useState(false)
  const [now, setNow] = useState(Date.now)
  // 标题即时过滤；正文与思考的全文搜索在输入短暂停顿后异步进行
  useEffect(() => {
    const keyword = query.trim()
    if (!keyword) {
      setMatchIds(null)
      setSearching(false)
      return
    }
    setMatchIds(null)
    setSearching(true)
    let cancelled = false
    const timer = window.setTimeout(() => {
      void searchSessionIds(keyword)
        .then((ids) => {
          if (!cancelled) {
            setMatchIds(ids)
            setSearching(false)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setMatchIds(new Set())
            setSearching(false)
          }
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) {
      return sessions
    }
    return sessions.filter(
      (session) =>
        (session.title ?? '').toLowerCase().includes(keyword) || Boolean(matchIds?.has(session.id))
    )
  }, [sessions, query, matchIds])
  const groups = useMemo(() => groupSessions(filtered, now, t), [filtered, now, t])
  const [deleting, setDeleting] = useState<SessionSummary | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  // 多选管理（移动端）：选择对话后置顶或批量删除
  const [managing, setManaging] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  const exitManage = () => {
    setManaging(false)
    setSelected(new Set())
  }
  const toggleSelect = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }
  const selectedSessions = sessions.filter((session) => selected.has(session.id))
  const allPinned = selectedSessions.length > 0 && selectedSessions.every((s) => s.pinned)
  const pinSelected = () => {
    if (selected.size === 0 || bulkBusy) {
      return
    }
    if (!allPinned) {
      const pinnedOthers = sessions.filter(
        (session) => session.pinned && !selected.has(session.id)
      ).length
      if (pinnedOthers + selected.size > MAX_PINNED) {
        showToast({ key: 'pinLimitReached', params: { count: MAX_PINNED }, type: 'error' })
        return
      }
    }
    setPinned([...selected], !allPinned)
    showToast({ key: allPinned ? 'unpinnedToast' : 'pinnedToast' })
    exitManage()
  }
  const deleteSelected = async () => {
    if (selected.size === 0 || bulkBusy) {
      return
    }
    setBulkBusy(true)
    let deleted = 0
    for (const id of selected) {
      if (await removeSession(id)) {
        deleted += 1
      }
    }
    setBulkBusy(false)
    setBulkDeleteOpen(false)
    exitManage()
    if (deleted === selected.size) {
      showToast({ key: 'bulkDeleted', params: { count: deleted } })
    } else {
      showToast({ key: 'bulkDeleteFailed', type: 'error' })
    }
  }
  // 安卓返回键：管理模式先退出管理
  useAndroidBack(() => {
    exitManage()
    return true
  }, managing)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      clearTimeout(timer)
      const time = Date.now()
      setNow(time)
      const midnight = new Date(time).setHours(24, 0, 0, 0)
      timer = setTimeout(refresh, midnight - time)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }
    refresh()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return (
    <div className={clsx(styles.sider, mobile && styles.mobile)}>
      {mobile ? (
        managing ? (
          <div className={styles.manageHeader}>
            <div className={styles.manageTitle}>{t('manageChats')}</div>
            <IconButton
              icon={<IconCloseOutline16 />}
              aria-label={t('close')}
              onClick={exitManage}
            />
          </div>
        ) : (
          <div className={styles.searchRow}>
            <span className={styles.searchIcon}>
              <IconSearchOutline16 />
            </span>
            <input
              className={styles.searchInput}
              type="text"
              placeholder={t('searchSessionsPlaceholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        )
      ) : (
        <div className={styles.top}>
          <div className={styles.appName}>{t('appName')}</div>
          <IconButton
            size="m"
            icon={<IconPanelLeftOutline16 />}
            tooltip={t('collapseSiderbarButton')}
            tooltipPlacement="bottom"
            onClick={() => setSiderCollapsed(true)}
          />
        </div>
      )}
      {mobile ? null : (
        <button
          type="button"
          className={styles.newChat}
          onClick={() => {
            newChat()
            closeMobileSider()
          }}
        >
          <span className={styles.newChatIcon}>
            <NewChatIcon />
          </span>
          {t('newChat')}
        </button>
      )}
      <div className={styles.listWrap}>
        {mobile && !managing ? (
          <div className={styles.listTools}>
            <IconButton
              icon={<IconSlidersOutline16 />}
              aria-label={t('manageChats')}
              tooltip={t('manageChats')}
              onClick={() => setManaging(true)}
            />
          </div>
        ) : null}
        <div className={styles.list}>
          {groups.length === 0 && query.trim() ? (
            <div className={styles.empty}>
              {searching ? t('searchingChats') : t('sessionsSearchEmpty')}
            </div>
          ) : null}
          {groups.map((group) => (
            <div key={group.key} className={styles.section}>
              <div className={styles.sectionHeader}>{group.label}</div>
              {group.sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  active={session.id === activeId}
                  onDelete={() => setDeleting(session)}
                  selectable={mobile && managing}
                  selected={mobile && managing && selected.has(session.id)}
                  onToggle={() => toggleSelect(session.id)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.bottom}>
        {mobile ? (
          managing ? (
            <div className={clsx(styles.bulkBar)}>
              <button
                type="button"
                className={styles.bulkAction}
                disabled={selected.size === 0 || bulkBusy}
                onClick={pinSelected}
              >
                <IconPinOutline16 />
                <span>{t('pin')}</span>
              </button>
              <span className={styles.bulkDivider} />
              <button
                type="button"
                className={clsx(styles.bulkAction, styles.bulkDanger)}
                disabled={selected.size === 0 || bulkBusy}
                onClick={() => setBulkDeleteOpen(true)}
              >
                <IconTrashOutline16 />
                <span>{t('delete')}</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.account}
              onClick={() => {
                closeMobileSider()
                openSettings('general')
              }}
            >
              <span className={styles.avatar}>
                <IconPersonOutline16 />
              </span>
              <span className={styles.accountText}>
                <span className={styles.accountName}>{t('appName')}</span>
                <span className={styles.accountSub}>
                  {apiKey ? `API Key ····${apiKey.slice(-4)}` : t('apiKeyStart')}
                </span>
              </span>
              <span className={styles.accountMore}>
                <IconEllipsisOutline16 />
              </span>
            </button>
          )
        ) : (
          <button type="button" className={styles.settings} onClick={() => openSettings('general')}>
            <span className={styles.settingsIcon}>
              <IconSettingsOutline16 />
            </span>
            <span className={styles.settingsLabel}>{t('settings')}</span>
          </button>
        )}
      </div>
      {bulkDeleteOpen ? (
        <Modal
          title={t('bulkDeleteTitle')}
          onClose={() => {
            if (!bulkBusy) {
              setBulkDeleteOpen(false)
            }
          }}
          footer={
            <>
              <Button
                variant="outlined"
                disabled={bulkBusy}
                onClick={() => setBulkDeleteOpen(false)}
              >
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={bulkBusy}
                onClick={() => void deleteSelected()}
              >
                {t('delete')}
              </Button>
            </>
          }
        >
          {t('bulkDeleteDescription', { count: selected.size })}
        </Modal>
      ) : null}
      {deleting ? (
        <Modal
          title={t('deleteSessionModalContentTitle')}
          onClose={() => {
            if (!deletePending) {
              setDeleting(null)
            }
          }}
          footer={
            <>
              <Button variant="outlined" disabled={deletePending} onClick={() => setDeleting(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={deletePending}
                onClick={async () => {
                  setDeletePending(true)
                  try {
                    if (await removeSession(deleting.id)) {
                      setDeleting(null)
                    } else {
                      showToast({ key: 'sessionDeleteFailed', type: 'error' })
                    }
                  } finally {
                    setDeletePending(false)
                  }
                }}
              >
                {t('delete')}
              </Button>
            </>
          }
        >
          {t('deleteSessionWithFilesDescription')}
        </Modal>
      ) : null}
    </div>
  )
}

/** 移动端抽屉：浮在页面上方，点空白区域关闭。 */
export const MobileSider = () => {
  const open = useMobileSider((state) => state.open)
  const { rendered, closing } = usePresence(open, 200)
  // 安卓返回键：优先收起抽屉
  useAndroidBack(() => {
    closeMobileSider()
    return true
  }, open)
  if (!rendered) {
    return null
  }
  return (
    <>
      <div className={clsx(styles.drawerMask, closing && styles.closing)} onClick={closeMobileSider} />
      <div className={clsx(styles.drawer, closing && styles.closing)}>
        <Sider mobile />
      </div>
    </>
  )
}
