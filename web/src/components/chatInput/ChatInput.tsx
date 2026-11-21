import clsx from 'clsx'
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  IconCameraOutline24,
  IconGlobeLanguageOutline14,
  IconPaperclipOutline16,
  IconPhotoOutline24,
  IconPlusOutline16,
  IconSendOutline16,
  IconStopFill16,
  IconThinkOutline14,
} from '../base/icons.js'
import { setSearch, setThinking, useSettings } from '../../services/settings.js'
import { useAndroidBack } from '../../services/backStack.js'
import { usePresence } from '../../hooks/usePresence.js'
import { useSwipe } from '../../hooks/useSwipe.js'
import { useIsMobile } from '../../app/viewport.js'
import { sendMessage, stopReply, useChatStore } from '../../services/chat/store.js'
import {
  readRecentImages,
  recentImageToFile,
  rememberRecentImages,
  type RecentImage,
} from '../../services/recentImages.js'
import {
  addDraftFiles,
  EMPTY_DRAFT,
  getDraft,
  prepareDraftMessage,
  removeDraftAttachment,
  retryDraftAttachment,
  setDraftText,
  useDrafts,
} from '../../services/chat/drafts.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import { IconButton } from '../base/IconButton.js'
import { Tooltip } from '../base/Tooltip.js'
import { ensureApiKey } from '../settings/settingsDialogState.js'
import { DragMask, useFileDrop } from './DragMask.js'
import { showToast } from '../base/toastState.js'
import { ACCEPT, useUploads } from '../../services/attachments.js'
import { DraftAttachments } from './DraftAttachments.js'
import { useVoiceInput } from './useVoiceInput.js'
import { VoiceButton } from './VoiceButton.js'
import { Spectrum } from './Spectrum.js'
import { useTranslate } from '../../i18n/index.js'
import styles from './ChatInput.module.css'

/** 安卓壳注入的原生能力：相册列表、图片选择、历史 ZIP 选择 */
type AndroidGalleryItem = { id: string; name: string; dataUrl: string }
type AndroidBridge = {
  pickZip?: () => boolean
  listRecentImages?: (limit: number) => string
  listRecentImagesAsync?: (limit: number) => void
  pickGalleryImage?: (id: string) => boolean
  isSystemDark?: () => boolean
}
const getAndroidBridge = () => (window as unknown as { AndroidBridge?: AndroidBridge }).AndroidBridge

/** 输入框：自适应高度的文本框 + 文件 + 深度思考与智能搜索开关 + 语音输入 + 发送 / 停止 */
export const ChatInput = memo(function ChatInput({ sessionId }: { sessionId: string | null }) {
  // 切换目标时释放录音、转写和 DOM 状态；文字与附件由草稿服务保留。
  return <Input key={sessionId === null ? 'new' : `session:${sessionId}`} sessionId={sessionId} />
})

const Input = ({ sessionId }: { sessionId: string | null }) => {
  const t = useTranslate()
  const draft = useDrafts((state) => state.drafts.get(sessionId) ?? EMPTY_DRAFT)
  const { text, attachments } = draft
  const setText = (value: string) => setDraftText(sessionId, value)
  const draftReady = useUploads((state) => prepareDraftMessage(draft, state.tasks) !== null)
  const streaming = useChatStore(
    (state) => sessionId !== null && Object.hasOwn(state.streaming, sessionId)
  )
  const thinking = useSettings((state) => state.thinking)
  const importingHistory = useChatStore((state) => state.importingHistory)
  const isMobile = useIsMobile()
  const search = useSettings((state) => state.search)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const togglesRef = useRef<HTMLDivElement>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [recent, setRecent] = useState<RecentImage[]>(readRecentImages)
  const [gallery, setGallery] = useState<AndroidGalleryItem[]>([])
  const [galleryLoading, setGalleryLoading] = useState(false)
  const nativeGallery = Boolean(
    getAndroidBridge()?.listRecentImagesAsync || getAndroidBridge()?.listRecentImages
  )
  const { rendered: panelRendered, closing: panelClosing } = usePresence(panelOpen, 160)
  // 「+」面板向下滑动收起
  const panelSwipeRef = useSwipe<HTMLDivElement>({
    onSwipeDown: () => setPanelOpen(false),
    verticalThreshold: 60,
  })

  // 打开「+」面板时读取系统相册（仅安卓壳）：按拍摄时间从新到旧。
  // 缩略图走异步桥，避免解码图片时阻塞打开动画。
  useEffect(() => {
    if (!panelOpen) {
      return
    }
    const bridge = getAndroidBridge()
    const applyGallery = (raw: string) => {
      try {
        const items: unknown = JSON.parse(raw)
        if (Array.isArray(items)) {
          setGallery(
            items.filter(
              (item): item is AndroidGalleryItem =>
                typeof item === 'object' &&
                item !== null &&
                typeof (item as AndroidGalleryItem).id === 'string' &&
                typeof (item as AndroidGalleryItem).dataUrl === 'string'
            )
          )
        }
      } catch (error) {
        console.error('gallery list failed', error)
      }
      setGalleryLoading(false)
    }
    const refresh = () => {
      if (bridge?.listRecentImagesAsync) {
        setGalleryLoading(true)
        bridge.listRecentImagesAsync(30)
      } else if (bridge?.listRecentImages) {
        applyGallery(bridge.listRecentImages(30))
      }
    }
    const host = window as unknown as {
      __onNativeGalleryReady?: (json?: unknown) => void
      __onNativeImagePicked?: (url: string, name: string) => void
      __onNativeImagePickFailed?: () => void
    }
    host.__onNativeGalleryReady = (json?: unknown) => {
      if (typeof json === 'string') {
        applyGallery(json)
      } else {
        refresh()
      }
    }
    host.__onNativeImagePicked = async (url: string, name: string) => {
      try {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const blob = await response.blob()
        acceptFiles([
          new File([blob], name || 'image.jpg', {
            type: blob.type.startsWith('image/') ? blob.type : 'image/jpeg',
          }),
        ])
      } catch (error) {
        console.error('native image pick failed', error)
        showToast({ key: 'readingImageFailed', type: 'error' })
      }
    }
    host.__onNativeImagePickFailed = () => {
      showToast({ key: 'readingImageFailed', type: 'error' })
    }
    refresh()
    return () => {
      delete host.__onNativeGalleryReady
      delete host.__onNativeImagePicked
      delete host.__onNativeImagePickFailed
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen])

  // 安卓返回键：优先收起「+」附件面板
  useAndroidBack(() => {
    setPanelOpen(false)
    return true
  }, panelOpen)

  useLayoutEffect(() => {
    const toggles = togglesRef.current
    if (!toggles) {
      return
    }

    const updateLabels = () => {
      toggles.classList.remove(styles.collapsedToggles)
      toggles.classList.toggle(styles.collapsedToggles, toggles.scrollWidth > toggles.clientWidth)
    }

    updateLabels()
    const observer = new ResizeObserver(updateLabels)
    observer.observe(toggles)
    return () => observer.disconnect()
  }, [t])

  const acceptFiles = (files: File[]) => {
    if (files.length === 0 || useChatStore.getState().importingHistory || !ensureApiKey()) {
      return
    }
    const error = addDraftFiles(sessionId, files, useSettings.getState().apiKey ?? '')
    if (error) {
      showToast(error)
    }
    void rememberRecentImages(files).then(() => setRecent(readRecentImages()))
    setPanelOpen(false)
  }
  const retryFile = useCallback(
    (id: string) => {
      if (!useChatStore.getState().importingHistory && ensureApiKey()) {
        retryDraftAttachment(sessionId, id, useSettings.getState().apiKey ?? '')
      }
    },
    [sessionId]
  )
  const removeFile = useCallback(
    (id: string) => {
      if (!useChatStore.getState().importingHistory) {
        removeDraftAttachment(sessionId, id)
      }
    },
    [sessionId]
  )
  const dragging = useFileDrop(acceptFiles)

  /** 转写结果插入到光标处，并把光标移到插入内容之后 */
  const voice = useVoiceInput((transcript) => {
    const textarea = textareaRef.current
    const current = getDraft(sessionId).text
    const start = textarea?.selectionStart ?? current.length
    const end = textarea?.selectionEnd ?? current.length
    setText(current.slice(0, start) + transcript + current.slice(end))
    requestAnimationFrame(() => {
      textarea?.focus({ preventScroll: true })
      textarea?.setSelectionRange(start + transcript.length, start + transcript.length)
    })
  })

  // 欢迎页导入后会话 ID 不变，不能依赖卸载取消语音；订阅开始事件也覆盖快速完成的导入。
  const cancelVoice = voice.cancel
  useEffect(
    () =>
      useChatStore.subscribe((state, previous) => {
        if (state.importingHistory && !previous.importingHistory) {
          cancelVoice()
        }
      }),
    [cancelVoice]
  )

  // 移动端录音时用频谱替代输入框内容
  const recording = voice.status === 'recording'

  // 排队、上传中或上传失败的附件都留在输入框，全部上传成功后才能发送
  const canSend = !importingHistory && !streaming && voice.status === 'idle' && draftReady
  // 与官方 App 一致：没有内容时不显示发送键，只保留「+」与语音
  const hasContent = text.trim() !== '' || attachments.length > 0

  const send = () => {
    if (
      useChatStore.getState().importingHistory ||
      voice.status !== 'idle' ||
      !prepareDraftMessage(getDraft(sessionId), useUploads.getState().tasks)
    ) {
      return
    }
    // 文本与上传完成态由提交动作读取最新快照，不使用上一次渲染的草稿。
    if (!ensureApiKey() || !sendMessage(sessionId)) {
      return
    }
    setPanelOpen(false)
    stopReadAloud()
    if (isMobile) {
      textareaRef.current?.blur()
    } else {
      textareaRef.current?.focus()
    }
  }

  return (
    <div className={styles.composer}>
      <div
        className={clsx(styles.wrapper, sessionId === null ? styles.home : styles.session)}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setPanelOpen(false)
            textareaRef.current?.focus({ preventScroll: true })
          }
        }}
      >
      <DraftAttachments items={attachments} onRetry={retryFile} onRemove={removeFile} />
      <div className={styles.textareaWrapper}>
        <textarea
          ref={textareaRef}
          className={clsx(styles.textarea, recording && isMobile && styles.textareaHidden)}
          placeholder={t('chatInputPlaceholderChat')}
          rows={2}
          // 移动端不自动聚焦，避免一打开就弹出键盘
          autoFocus={!isMobile}
          disabled={importingHistory}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onFocus={() => setPanelOpen(false)}
          onMouseDown={(event) => {
            // 首次点击时手动聚焦，避免 Safari 把整个页面滚到输入框位置。
            if (isMobile && event.button === 0 && document.activeElement !== event.currentTarget) {
              event.preventDefault()
              event.currentTarget.focus({ preventScroll: true })
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              send()
            }
          }}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files)
            if (files.length > 0) {
              event.preventDefault()
              acceptFiles(files)
            }
          }}
        />
        {recording && isMobile ? <Spectrum getAnalyser={voice.getAnalyser} /> : null}
        <div className={styles.mirror} aria-hidden>
          {`${text}\n`}
        </div>
      </div>
      <div className={styles.functionRow}>
        {/* 深度思考 / 智能搜索开关，tooltip 在按钮上方 */}
        <div ref={togglesRef} className={styles.toggles}>
          <Tooltip content={t('deactivatedThinkTooltip')}>
            <button
              type="button"
              className={clsx(styles.toggle, thinking && styles.selected)}
              aria-label={t('thinkingSwitch')}
              aria-pressed={thinking}
              onClick={() => setThinking(!thinking)}
            >
              <IconThinkOutline14 />
              <span className={styles.toggleLabel}>{t('thinkingSwitch')}</span>
            </button>
          </Tooltip>
          <Tooltip content={t('deactivatedSearchTooltip')}>
            <button
              type="button"
              className={clsx(styles.toggle, search && styles.selected)}
              aria-label={t('search')}
              aria-pressed={search}
              onClick={() => setSearch(!search)}
            >
              <IconGlobeLanguageOutline14 />
              <span className={styles.toggleLabel}>{t('search')}</span>
            </button>
          </Tooltip>
        </div>
        <div className={styles.right}>
          <IconButton
            size="m"
            tone="primary"
            className={styles.roundAction}
            icon={
              <span className={clsx(styles.plusGlyph, panelOpen && styles.plusGlyphOpen)}>
                <IconPlusOutline16 />
              </span>
            }
            tooltip={t('uploadFile')}
            aria-expanded={panelOpen}
            disabled={importingHistory}
            onClick={() => {
              if (ensureApiKey()) {
                setPanelOpen((open) => !open)
              }
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept={ACCEPT}
            onChange={(event) => {
              acceptFiles(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            hidden
            accept="image/*"
            capture="environment"
            onChange={(event) => {
              acceptFiles(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            multiple
            hidden
            accept="image/*"
            onChange={(event) => {
              acceptFiles(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
          <VoiceButton
            status={voice.status}
            disabled={!voice.available}
            seconds={voice.seconds}
            onClick={() => {
              if (
                voice.status !== 'idle' ||
                (!useChatStore.getState().importingHistory && ensureApiKey())
              ) {
                void voice.toggle()
              }
            }}
          />
          {streaming && sessionId ? (
            <button
              type="button"
              className={styles.sendButton}
              aria-label={t('chatInputStopButtonTooltip')}
              onClick={() => {
                stopReadAloud()
                stopReply(sessionId)
              }}
            >
              <IconStopFill16 />
            </button>
          ) : hasContent ? (
            <button
              type="button"
              className={clsx(styles.sendButton, !canSend && styles.disabled)}
              aria-label={t('send')}
              aria-disabled={!canSend}
              onClick={send}
            >
              <IconSendOutline16 />
            </button>
          ) : null}
        </div>
      </div>
      {dragging ? <DragMask /> : null}
    </div>
      {panelRendered ? (
        <div
          ref={panelSwipeRef}
          className={clsx(styles.attachPanel, panelClosing && styles.closing)}
          role="dialog"
          aria-label={t('uploadFile')}
        >
          {nativeGallery || gallery.length > 0 ? (
            <div className={styles.recentStrip} aria-label={t('chooseFromAlbum')}>
              {gallery.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={styles.recentCard}
                  aria-label={item.name}
                  onClick={() => {
                    const bridge = getAndroidBridge()
                    if (bridge?.pickGalleryImage) {
                      showToast({ key: 'readingImage' })
                      bridge.pickGalleryImage(item.id)
                    }
                  }}
                >
                  <img
                    src={item.dataUrl}
                    alt=""
                    draggable={false}
                    decoding="async"
                    loading="lazy"
                  />
                </button>
              ))}
              {gallery.length === 0 && galleryLoading
                ? Array.from({ length: 4 }, (_, index) => (
                    <div key={index} className={styles.recentSkeleton} aria-hidden />
                  ))
                : null}
            </div>
          ) : recent.length > 0 ? (
            <div className={styles.recentStrip} aria-label={t('recentImages')}>
              {recent.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={styles.recentCard}
                  aria-label={item.name}
                  onClick={() => {
                    void recentImageToFile(item)
                      .then((file) => acceptFiles([file]))
                      .catch(() => setPanelOpen(false))
                  }}
                >
                  <img src={item.dataUrl} alt="" draggable={false} decoding="async" />
                </button>
              ))}
            </div>
          ) : null}
          <div className={styles.actionTiles}>
            <button
              type="button"
              className={styles.actionTile}
              onClick={() => cameraInputRef.current?.click()}
            >
              <IconCameraOutline24 />
              <span>{t('takePhoto')}</span>
            </button>
            <button
              type="button"
              className={styles.actionTile}
              onClick={() => galleryInputRef.current?.click()}
            >
              <IconPhotoOutline24 />
              <span>{t('chooseFromAlbum')}</span>
            </button>
            <button
              type="button"
              className={styles.actionTile}
              onClick={() => fileInputRef.current?.click()}
            >
              <span className={styles.actionIcon}>
                <IconPaperclipOutline16 />
              </span>
              <span>{t('chooseFile')}</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
