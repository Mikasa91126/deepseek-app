import { useEffect, useRef, useState } from 'react'
import { useTranslate } from '../i18n/index.js'
import { applyFontScale, useSettings } from '../services/settings.js'
import { useIsMobile, useMobileViewport, usePreventPageScroll } from './viewport.js'
import {
  bindChatPersistence,
  initChat,
  newChat,
  retrySaveSessions,
  selectSession,
  useChatStore,
} from '../services/chat/store.js'
import { useAndroidBack } from '../services/backStack.js'
import { SearchPanel } from '../components/search/SearchPanel.js'
import { closeSearchPanel } from '../components/search/searchPanelState.js'
import { SessionView } from '../components/session/SessionView.js'
import { MobileHeader } from '../components/session/MobileHeader.js'
import { Welcome } from '../components/session/Welcome.js'
import { ensureApiKey } from '../components/settings/settingsDialogState.js'
import { SettingsDialog } from '../components/settings/SettingsDialog.js'
import { Toast } from '../components/base/Toast.js'
import { showToast } from '../components/base/toastState.js'
import { onUploadNotice } from '../services/attachments.js'
import { Button } from '../components/base/Button.js'
import { stopReadAloud } from '../services/speech/readAloud.js'
import { CollapsedSider } from '../components/sider/CollapsedSider.js'
import { closeMobileSider, openMobileSider, useMobileSider } from '../components/sider/mobileSiderState.js'
import { MobileSider, Sider } from '../components/sider/Sider.js'
import styles from './App.module.css'

export const App = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const locale = useSettings((state) => state.locale)
  const followSystemFont = useSettings((state) => state.followSystemFont)
  const fontScale = useSettings((state) => state.fontScale)
  // 设置中的字体大小即时生效
  useEffect(() => {
    applyFontScale(followSystemFont, fontScale)
  }, [followSystemFont, fontScale])
  // 移动端侧边栏以独立抽屉管理开合状态
  const siderCollapsed = useSettings((state) => state.siderCollapsed) && !isMobile
  const ready = useChatStore((state) => state.ready)
  const initError = useChatStore((state) => state.initError)
  const saveError = useChatStore((state) => Object.values(state.sessionSaveErrors).some(Boolean))
  const importingHistory = useChatStore((state) => state.importingHistory)
  const session = useChatStore((state) =>
    state.activeId !== null && Object.hasOwn(state.sessionCache, state.activeId)
      ? state.sessionCache[state.activeId]
      : undefined
  )
  const sessionLoadError = useChatStore((state) =>
    state.activeId === null ? false : state.sessionLoadErrors[state.activeId] === true
  )
  const frameRef = useMobileViewport(isMobile)
  const streaming = useChatStore((state) =>
    state.activeId === null ? false : Object.hasOwn(state.streaming, state.activeId)
  )
  const activeId = useChatStore((state) => state.activeId)

  // 移动端侧栏跟手滑动：拖动时主界面随手指右移并压暗，松手按进度吸附
  const siderOpen = useMobileSider((state) => state.open)
  const [siderDragging, setSiderDragging] = useState(false)
  const siderDraggingRef = useRef(false)
  useEffect(() => {
    const frame = frameRef.current
    if (!frame || !isMobile) {
      return
    }
    const drawerWidth = () => Math.min(340, window.innerWidth - 48)
    let mode: 'open' | 'close' | null = null
    let startX = 0
    let startY = 0
    let lastX = 0
    let pending = false
    let active = false
    let progress = 0
    let raf = 0
    let suppressClickUntil = 0

    const isHorizontalScroller = (target: EventTarget | null) => {
      let node: Element | null = target instanceof Element ? target : null
      while (node && node !== frame) {
        const style = getComputedStyle(node)
        if (
          /auto|scroll/.test(style.overflowX) &&
          (node as HTMLElement).scrollWidth > (node as HTMLElement).clientWidth
        ) {
          return true
        }
        node = node.parentElement
      }
      return false
    }
    const setProgress = (value: number, animate: boolean) => {
      progress = value
      frame.style.setProperty('--sider-transition', animate ? '220ms' : '0ms')
      frame.style.setProperty('--sider-progress', String(value))
    }
    const settle = (target: number) => {
      setProgress(target, true)
      if (target >= 1) {
        openMobileSider()
      } else {
        closeMobileSider()
      }
      active = false
      pending = false
      mode = null
      siderDraggingRef.current = false
      setSiderDragging(false)
    }
    const applyProgress = () => {
      raf = 0
      if (!active || !mode) {
        return
      }
      const dx = lastX - startX
      const width = drawerWidth()
      const raw = mode === 'open' ? dx / width : 1 + dx / width
      setProgress(Math.max(0, Math.min(1, raw)), false)
    }
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        pending = false
        return
      }
      const target = event.target
      // 搜索结果面板、横向滚动区域（相册条/代码块）不参与侧栏手势
      if (target instanceof Element && target.closest('aside')) {
        pending = false
        return
      }
      if (isHorizontalScroller(target)) {
        pending = false
        return
      }
      mode = useMobileSider.getState().open ? 'close' : 'open'
      startX = event.touches[0].clientX
      startY = event.touches[0].clientY
      lastX = startX
      pending = true
      active = false
    }
    const onMove = (event: TouchEvent) => {
      if (!pending) {
        return
      }
      const touch = event.touches[0]
      if (!touch) {
        return
      }
      lastX = touch.clientX
      const dx = lastX - startX
      const dy = touch.clientY - startY
      if (!active) {
        if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) {
          // 纵向滚动优先，放弃本次手势（不挂载遮罩，点按与滚动都不受影响）
          pending = false
          return
        }
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.1) {
          active = true
          siderDraggingRef.current = true
          setSiderDragging(true)
          setProgress(mode === 'close' ? 1 : 0, false)
        } else {
          return
        }
      }
      if (event.cancelable) {
        // 进入横向拖拽后阻止文本选择与页面滚动
        event.preventDefault()
      }
      if (!raf) {
        raf = requestAnimationFrame(applyProgress)
      }
    }
    const onEnd = () => {
      if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
      if (active) {
        applyProgress()
        suppressClickUntil = Date.now() + 300
        // 打开方向：拖过 30% 吸附打开；关闭方向：向左拖过 30% 即收起
        const target = mode === 'open' ? (progress > 0.3 ? 1 : 0) : progress < 0.7 ? 0 : 1
        settle(target)
      }
      pending = false
      active = false
    }
    const onCancel = () => {
      if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
      if (active) {
        settle(mode === 'close' ? 1 : 0)
      }
      pending = false
      active = false
    }
    const onClickCapture = (event: MouseEvent) => {
      if (Date.now() < suppressClickUntil) {
        event.stopPropagation()
        event.preventDefault()
      }
    }
    frame.addEventListener('touchstart', onStart, { passive: true })
    frame.addEventListener('touchmove', onMove, { passive: false })
    frame.addEventListener('touchend', onEnd, { passive: true })
    frame.addEventListener('touchcancel', onCancel, { passive: true })
    document.addEventListener('click', onClickCapture, true)
    return () => {
      frame.removeEventListener('touchstart', onStart)
      frame.removeEventListener('touchmove', onMove)
      frame.removeEventListener('touchend', onEnd)
      frame.removeEventListener('touchcancel', onCancel)
      document.removeEventListener('click', onClickCapture, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile])
  // 非拖动状态下由 store 驱动进度（打开/关闭按钮、返回键、选择会话等）
  useEffect(() => {
    if (siderDragging) {
      return
    }
    const frame = frameRef.current
    if (!frame) {
      return
    }
    frame.style.setProperty('--sider-transition', '220ms')
    frame.style.setProperty('--sider-progress', siderOpen ? '1' : '0')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siderOpen, siderDragging])

  // 安卓返回键的兜底：处于会话页时回到首页；首页（以及没有其他可返回层级时）交给原生退出应用
  useAndroidBack(() => {
    if (useChatStore.getState().activeId !== null) {
      newChat()
      return true
    }
    return false
  })

  usePreventPageScroll(isMobile)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  // 文件数、存储空间达到上限时，附件上只显示「上传失败」，原因用 toast 说明
  useEffect(() => onUploadNotice(showToast), [])
  useEffect(bindChatPersistence, [])

  // 搜索结果面板只属于当前会话
  useEffect(closeSearchPanel, [activeId])
  // 切换会话时停止朗读
  useEffect(stopReadAloud, [activeId])
  // 移动端选中会话、切换布局后收起抽屉
  useEffect(closeMobileSider, [activeId, isMobile])

  useEffect(() => {
    void initChat()
    // 首次打开先在设置里输入 API Key
    ensureApiKey()
  }, [])

  return (
    <>
      <div ref={frameRef} className={styles.frame}>
        {isMobile ? <MobileSider active={siderOpen || siderDragging} /> : siderCollapsed ? null : <Sider />}
        <main className={styles.main}>
          {saveError ? (
            <div className={styles.saveError} role="alert">
              <span>{t('sessionSaveFailed')}</span>
              <Button
                variant="outlined"
                size="s"
                disabled={importingHistory}
                onClick={retrySaveSessions}
              >
                {t('retry')}
              </Button>
            </div>
          ) : null}
          <div className={styles.content}>
            {siderCollapsed ? <CollapsedSider /> : null}
            {!ready || (activeId !== null && !session) ? (
              <div className={styles.loadingView}>
                {isMobile ? <MobileHeader /> : null}
                <div className={styles.loadingState} role="status" aria-live="polite">
                  <span>
                    {(!ready ? initError : sessionLoadError)
                      ? t(!ready ? 'sessionListLoadFailed' : 'sessionLoadFailed')
                      : t('sessionLoading')}
                  </span>
                  {(!ready ? initError : sessionLoadError) ? (
                    <Button
                      variant="outlined"
                      size="m"
                      onClick={() => {
                        if (!ready) {
                          void initChat()
                        } else if (activeId !== null) {
                          selectSession(activeId)
                        }
                      }}
                    >
                      {t('retry')}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : session ? (
              <SessionView
                key={session.id}
                session={session}
                streaming={streaming}
                siderCollapsed={siderCollapsed}
              />
            ) : (
              <Welcome />
            )}
          </div>
        </main>
        <SearchPanel />
      </div>
      <SettingsDialog />
      <Toast />
    </>
  )
}
