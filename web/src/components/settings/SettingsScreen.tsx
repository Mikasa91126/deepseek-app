import clsx from 'clsx'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  IconChevronRightOutline14,
  IconCloseOutline16,
  IconDataOutline16,
  IconDocOutline16,
  IconDownloadOutline16,
  IconFontSizeOutline16,
  IconGlobeLanguageOutline14,
  IconHelpCircleOutline16,
  IconInfoOutline16,
  IconLightOutline16,
  IconLogoutOutline16,
  IconModelOutline16,
  IconPersonOutline16,
  IconPlayMediaOutline16,
  IconSparkleOutline16,
  IconUploadOutline14,
} from '../base/icons.js'
import { useIsMobile } from '../../app/viewport.js'
import { useChatStore } from '../../services/chat/store.js'
import { clearHistory, exportHistory, importHistory } from '../../services/chat/backup.js'
import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  isChineseBrowser,
  setApiKey,
  setAutoCollapseThinking,
  setFollowSystemFont,
  setFontScale,
  setLocale,
  setLocation,
  setModel,
  setSafetyCheck,
  setThemePreference,
  setTtsVoice,
  useSettings,
  type ThemePreference,
} from '../../services/settings.js'
import { getRegionName, provinces, regionCodes } from '../../services/location.js'
import { fetchBalance, listModels, type ModelInfo } from '../../services/api/client.js'
import { useAndroidBack } from '../../services/backStack.js'
import { useSwipe } from '../../hooks/useSwipe.js'
import { useTranslate } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { Select } from '../base/Select.js'
import { showToast } from '../base/toastState.js'
import { ApiKeyConfirm, ApiKeyField, useApiKeyEditor } from './ApiKeyField.js'
import { closeSettings, ensureApiKey, useSettingsDialog } from './settingsDialogState.js'
import styles from './SettingsScreen.module.css'

/** 设置页内的二级页面；接口兼容旧调用方：'data' 表示打开账号页（含 API Key 输入） */
type Page = 'root' | 'account' | 'data' | 'font' | 'personalize' | 'permissions'
type Dialog = 'appearance' | 'language' | 'voice' | 'model' | null

const HELP_URL = 'https://api-docs.deepseek.com/zh-cn/guides/build_a_chatbot'
const TERMS_URL = 'https://platform.deepseek.com'

/** 账号页：API Key 状态、余额与更换 Key */
const AccountPage = () => {
  const t = useTranslate()
  const apiKey = useSettings((state) => state.apiKey)
  const editor = useApiKeyEditor()
  const isMobile = useIsMobile()
  const [balance, setBalance] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = async () => {
    if (!apiKey) {
      return
    }
    setLoading(true)
    setFailed(false)
    try {
      const data = await fetchBalance(apiKey)
      const info = data.balance_infos?.[0]
      setBalance(
        info
          ? t('settingsAccountBalanceValue', {
              currency: info.currency,
              amount: info.total_balance,
            })
          : '—'
      )
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  return (
    <>
      <Group label={t('settingsGroupAccount')}>
        <div className={styles.statusRow}>
          <span className={styles.rowIcon}>
            <IconPersonOutline16 />
          </span>
          <span className={styles.rowLabel}>{t('settingsAccountApiKey')}</span>
          <span className={styles.rowValue}>
            {apiKey
              ? t('settingsAccountApiKeySet', { tail: apiKey.slice(-4) })
              : t('settingsAccountApiKeyUnset')}
          </span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.rowIcon}>
            <IconInfoOutline16 />
          </span>
          <span className={styles.rowLabel}>{t('settingsAccountBalance')}</span>
          <span className={styles.rowValue}>
            {loading
              ? t('apiKeyVerifying')
              : failed
                ? t('settingsAccountBalanceFailed')
                : (balance ?? '—')}
          </span>
          <Button size="s" variant="outlined" disabled={!apiKey || loading} onClick={() => void load()}>
            {t('settingsAccountRefresh')}
          </Button>
        </div>
      </Group>
      <ApiKeyField editor={editor} />
      {isMobile ? <ApiKeyConfirm editor={editor} /> : null}
    </>
  )
}

/** 数据页：导入、导出与删除全部历史对话 */
const DataPage = () => {
  const t = useTranslate()
  const historyImport = useHistoryImport()
  const historyDelete = useHistoryDelete()
  const replacing = useChatStore((state) => state.importingHistory)
  const busy = historyImport.busy || historyDelete.busy || replacing
  const [exporting, setExporting] = useState(false)
  const empty = useChatStore((state) => state.sessions.length === 0)
  const inputRef = useRef<HTMLInputElement>(null)

  // 安卓壳：原生选择器把 ZIP 拷到缓存后，通过同源 URL 通知页面（绕开 WebView 对 content:// 的读取）
  useEffect(() => {
    const host = window as unknown as {
      __onNativeZipPicked?: (url: string, name: string) => void
      __onNativeZipPickedFailed?: () => void
    }
    host.__onNativeZipPicked = async (url: string, name: string) => {
      try {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const blob = await response.blob()
        historyImport.select(
          new File([blob], name || 'deepseek_data.zip', { type: 'application/zip' })
        )
      } catch (error) {
        console.error('native zip import failed', error)
        showToast({ key: 'historyImportFailed', type: 'error' })
      }
    }
    host.__onNativeZipPickedFailed = () => {
      showToast({ key: 'historyImportFailed', type: 'error' })
    }
    return () => {
      host.__onNativeZipPicked = undefined
      host.__onNativeZipPickedFailed = undefined
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onExport = async () => {
    setExporting(true)
    try {
      const { name, blob } = await exportHistory()
      // 安卓壳：通过原生桥接保存到系统「下载」目录
      const bridge = (
        window as unknown as { AndroidBridge?: { saveFile?: (name: string, base64: string) => boolean } }
      ).AndroidBridge
      if (bridge?.saveFile) {
        const base64 = await blobToBase64(blob)
        if (base64 && bridge.saveFile(name, base64)) {
          showToast({ key: 'exportSaved' })
          return
        }
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (error) {
      showToast({
        key: 'historyExportFailed',
        params: { message: error instanceof Error ? error.message : String(error) },
        type: 'error',
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <Group label={t('settingsGroupAccount')}>
        <Row
          icon={<IconUploadOutline14 />}
          label={t('historyImport')}
          onClick={() => {
            if (busy) {
              return
            }
            // 安卓壳内使用原生选择器（先拷贝到缓存再读取），网页端走普通文件选择
            const bridge = (
              window as unknown as { AndroidBridge?: { pickZip?: () => boolean } }
            ).AndroidBridge
            if (bridge?.pickZip) {
              showToast({ key: 'readingZipFile' })
              bridge.pickZip()
              return
            }
            inputRef.current?.click()
          }}
        />
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) {
              historyImport.select(file)
            }
          }}
        />
        <Row
          icon={<IconDownloadOutline16 />}
          label={t('exportAllLabel')}
          onClick={() => {
            if (!busy && !exporting && !empty) {
              void onExport()
            }
          }}
        />
        <Row
          icon={<IconDataOutline16 />}
          label={t('deleteAllSessions')}
          danger
          onClick={() => {
            if (!busy) {
              historyDelete.open()
            }
          }}
        />
      </Group>
      <p className={styles.hint}>{t('historyImportHint')}</p>
      {historyImport.file ? <ImportConfirm historyImport={historyImport} /> : null}
      {historyDelete.opened ? <DeleteAllConfirm historyDelete={historyDelete} /> : null}
    </>
  )
}

/** 字体大小页：预览、跟随系统开关与滑块 */
const FontPage = () => {
  const t = useTranslate()
  const follow = useSettings((state) => state.followSystemFont)
  const scale = useSettings((state) => state.fontScale)
  return (
    <>
      <div className={styles.previewArea}>
        <div className={styles.previewBubble}>{t('fontSizePreview')}</div>
        <p className={styles.previewText}>{t('fontSizeInstruction')}</p>
        <p className={styles.previewText}>{t('fontSizeFeedback')}</p>
      </div>
      <div className={styles.fontCard}>
        <div className={styles.switchRow}>
          <span>{t('fontSizeFollowSystem')}</span>
          <Switch checked={follow} onChange={setFollowSystemFont} label={t('fontSizeFollowSystem')} />
        </div>
        <div className={styles.sliderRow}>
          <span className={styles.sliderA}>A</span>
          <div className={styles.sliderWrap}>
            <span className={styles.sliderValue}>
              {scale === 1 ? t('fontSizeStandard') : `${Math.round(scale * 100)}%`}
            </span>
            <input
              className={styles.slider}
              type="range"
              min={FONT_SCALE_MIN}
              max={FONT_SCALE_MAX}
              step={0.05}
              value={scale}
              disabled={follow}
              aria-label={t('settingsFontSize')}
              onChange={(event) => setFontScale(Number(event.target.value))}
            />
          </div>
          <span className={clsx(styles.sliderA, styles.sliderALarge)}>A</span>
        </div>
      </div>
    </>
  )
}

/** 个性化页：思考内容自动折叠、位置信息与内容安全审核 */
const PersonalizePage = () => {
  const t = useTranslate()
  const autoCollapse = useSettings((state) => state.autoCollapseThinking)
  const safetyCheck = useSettings((state) => state.safetyCheck)
  const locale = useSettings((state) => state.locale)
  const location = useSettings((state) => state.location)
  const province =
    location?.region === 'CN'
      ? provinces.find((item) => item.code === location.province)
      : undefined
  return (
    <>
      <div className={styles.fontCard}>
        <div className={styles.switchRow}>
          <span>{t('personalizeAutoCollapse')}</span>
          <Switch
            checked={autoCollapse}
            onChange={setAutoCollapseThinking}
            label={t('personalizeAutoCollapse')}
          />
        </div>
      </div>
      <p className={styles.hint}>{t('personalizeAutoCollapseDesc')}</p>
      <Group label={t('settingsLocation')}>
        <div className={styles.locationRow}>
          {isChineseBrowser() ? (
            <>
              <Select
                ariaLabel={t('settingsLocationProvince')}
                value={province?.code ?? ''}
                placeholder={t('settingsLocationProvince')}
                options={provinces.map((item) => ({ value: item.code, label: item.name }))}
                onChange={(value) => {
                  if (value !== province?.code) {
                    setLocation({ region: 'CN', province: value })
                  }
                }}
              />
              <Select
                ariaLabel={t('settingsLocationCity')}
                value={province ? (location?.city ?? '') : ''}
                disabled={!province?.cities.length}
                placeholder={t('settingsLocationCity')}
                options={
                  province?.cities.map((item) => ({ value: item.code, label: item.name })) ?? []
                }
                onChange={(value) => {
                  if (province) {
                    setLocation({ region: 'CN', province: province.code, city: value })
                  }
                }}
              />
            </>
          ) : (
            <Select
              ariaLabel={t('settingsLocationRegion')}
              value={location?.region ?? ''}
              placeholder={t('settingsLocationRegion')}
              options={regionCodes
                .map((code) => ({ value: code, label: getRegionName(code, locale) }))
                .sort((a, b) => a.label.localeCompare(b.label, locale))}
              onChange={(value) => setLocation({ region: value })}
            />
          )}
        </div>
      </Group>
      <div className={styles.fontCard}>
        <div className={styles.switchRow}>
          <span>{t('settingsSafetyCheck')}</span>
          <Switch
            checked={safetyCheck}
            onChange={setSafetyCheck}
            label={t('settingsSafetyCheck')}
          />
        </div>
      </div>
      <p className={styles.hint}>{t('settingsSafetyCheckDescription')}</p>
    </>
  )
}

/** 权限说明的条目：名称 / 功能说明 / 使用场景 */
const PERMISSION_ITEMS = [
  ['permissionCameraName', 'permissionCameraFunc', 'permissionCameraPurpose'],
  ['permissionWriteName', 'permissionWriteFunc', 'permissionWritePurpose'],
  ['permissionAudioName', 'permissionAudioFunc', 'permissionAudioPurpose'],
  ['permissionReadImagesName', 'permissionReadImagesFunc', 'permissionReadImagesPurpose'],
  ['permissionVisualName', 'permissionVisualFunc', 'permissionVisualPurpose'],
  ['permissionReadStorageName', 'permissionReadStorageFunc', 'permissionReadStoragePurpose'],
  ['permissionInternetName', 'permissionInternetFunc', 'permissionInternetPurpose'],
] as const

/** 关于 → 应用权限申请与使用情况说明（对应官方 App 的同名文档页） */
const PermissionsPage = () => {
  const t = useTranslate()
  return (
    <>
      <p className={styles.docMeta}>{t('permissionsMeta')}</p>
      {(
        [
          'permissionsIntro1',
          'permissionsIntro2',
          'permissionsIntro3',
          'permissionsIntro4',
          'permissionsIntro5',
        ] as const
      ).map((key) => (
        <p key={key} className={styles.docParagraph}>
          {t(key)}
        </p>
      ))}
      <Group label={t('permissionsAndroidTitle')}>
        {PERMISSION_ITEMS.map(([name, func, purpose]) => (
          <div key={name} className={styles.permissionItem}>
            <div className={styles.permissionName}>{t(name)}</div>
            <div className={styles.permissionLabel}>{t('permissionsFuncLabel')}</div>
            <p className={styles.permissionText}>{t(func)}</p>
            <div className={styles.permissionLabel}>{t('permissionsPurposeLabel')}</div>
            <p className={styles.permissionText}>{t(purpose)}</p>
          </div>
        ))}
      </Group>
      <p className={styles.hint}>{t('permissionsManageHint')}</p>
    </>
  )
}

/** 设置主页面：全屏二级页，分组卡片与官方 App 一致 */
export const SettingsScreen = ({ closing = false }: { closing?: boolean }) => {
  const t = useTranslate()
  const [page, setPage] = useState<Page>(() =>
    useSettingsDialog.getState().section === 'data' ? 'account' : 'root'
  )
  const [dialog, setDialog] = useState<Dialog>(null)
  const themePreference = useSettings((state) => state.themePreference)
  const locale = useSettings((state) => state.locale)
  const ttsVoice = useSettings((state) => state.ttsVoice)
  const selectedModel = useSettings((state) => state.model)
  const version =
    document.querySelector('meta[name="application-version"]')?.getAttribute('content') ?? '0.1.3'

  const titles: Record<Page, string> = {
    root: t('settings'),
    account: t('settingsAccountManage'),
    data: t('settingsDataManage'),
    font: t('settingsFontSize'),
    personalize: t('settingsPersonalize'),
    permissions: t('settingsPermissions'),
  }
  const themeLabel =
    themePreference === 'light'
      ? t('settingsThemeLight')
      : themePreference === 'dark'
        ? t('settingsThemeDark')
        : t('settingsThemeSystem')

  const goBack = () => {
    if (page === 'root') {
      closeSettings()
    } else {
      setPage('root')
    }
  }

  // 安卓返回键：弹窗 → 子页 → 设置根页 → 关闭设置
  useAndroidBack(() => {
    if (dialog) {
      setDialog(null)
      return true
    }
    if (page !== 'root') {
      setPage('root')
      return true
    }
    closeSettings()
    return true
  })

  // 设置页向右滑动返回上一级
  const pageSwipeRef = useSwipe<HTMLDivElement>({ onSwipeRight: goBack })

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => event.target === event.currentTarget && closeSettings()}
    >
      <div
        ref={pageSwipeRef}
        className={clsx(styles.page, closing && styles.closing)}
        role="dialog"
        aria-modal="true"
        aria-label={titles[page]}
      >
        <div className={styles.header}>
          <button type="button" className={styles.back} aria-label={t('cancel')} onClick={goBack}>
            <span className={styles.backIcon}>
              <IconChevronRightOutline14 />
            </span>
          </button>
          <div className={styles.title}>{titles[page]}</div>
          <span className={styles.headerSpacer} />
        </div>
        <div className={styles.content}>
          <div
            key={page}
            className={clsx(styles.pageBody, page === 'root' ? styles.pageBodyRoot : styles.pageBodySub)}
          >
          {page === 'root' ? (
            <>
              <Group label={t('settingsGroupAccount')}>
                <Row
                  icon={<IconPersonOutline16 />}
                  label={t('settingsAccountManage')}
                  onClick={() => setPage('account')}
                />
                <Row
                  icon={<IconDataOutline16 />}
                  label={t('settingsDataManage')}
                  onClick={() => setPage('data')}
                />
              </Group>
              <Group label={t('settingsGroupApp')}>
                <Row
                  icon={<IconLightOutline16 />}
                  label={t('settingsAppearance')}
                  value={themeLabel}
                  onClick={() => setDialog('appearance')}
                />
                <Row
                  icon={<IconGlobeLanguageOutline14 />}
                  label={t('settingsLocalePreference')}
                  value={locale === 'zh-CN' ? t('settingsLocaleZhCN') : t('settingsLocaleEnUS')}
                  onClick={() => setDialog('language')}
                />
                <Row
                  icon={<IconModelOutline16 />}
                  label={t('settingsModel')}
                  value={selectedModel ?? 'deepseek-flash'}
                  onClick={() => setDialog('model')}
                />
                <Row
                  icon={<IconFontSizeOutline16 />}
                  label={t('settingsFontSize')}
                  onClick={() => setPage('font')}
                />
                <Row
                  icon={<IconSparkleOutline16 />}
                  label={t('settingsPersonalize')}
                  onClick={() => setPage('personalize')}
                />
              </Group>
              <Group label={t('settingsGroupVoice')}>
                <Row
                  icon={<IconPlayMediaOutline16 />}
                  label={t('settingsTtsVoice')}
                  onClick={() => setDialog('voice')}
                />
              </Group>
              <Group label={t('settingsGroupAbout')}>
                <Row
                  icon={<IconInfoOutline16 />}
                  label={t('settingsCheckUpdate')}
                  value={version}
                  onClick={() => showToast({ key: 'checkUpdateLatest' })}
                />
                <Row
                  icon={<IconDocOutline16 />}
                  label={t('settingsTerms')}
                  onClick={() => window.open(TERMS_URL, '_blank', 'noopener,noreferrer')}
                />
                <Row
                  icon={<IconInfoOutline16 />}
                  label={t('settingsPermissions')}
                  onClick={() => setPage('permissions')}
                />
              </Group>
              <Group label="">
                <Row
                  icon={<IconHelpCircleOutline16 />}
                  label={t('settingsHelpFeedback')}
                  onClick={() => window.open(HELP_URL, '_blank', 'noopener,noreferrer')}
                />
              </Group>
              <Group label="">
                <Row
                  icon={<IconLogoutOutline16 />}
                  label={t('settingsSignOut')}
                  onClick={() => {
                    setApiKey(null)
                    showToast({ key: 'signedOut' })
                    ensureApiKey()
                  }}
                />
              </Group>
              <div className={styles.legal}>{t('legalCaveat')}</div>
            </>
          ) : page === 'account' ? (
            <AccountPage />
          ) : page === 'data' ? (
            <DataPage />
          ) : page === 'font' ? (
            <FontPage />
          ) : page === 'personalize' ? (
            <PersonalizePage />
          ) : (
            <PermissionsPage />
          )}
          </div>
        </div>
      </div>
      {dialog === 'appearance' ? (
        <OptionDialog
          title={t('settingsThemeTitle')}
          value={themePreference}
          options={[
            { value: 'system', label: t('settingsThemeSystem') },
            { value: 'light', label: t('settingsThemeLight') },
            { value: 'dark', label: t('settingsThemeDark') },
          ]}
          onConfirm={(value) => setThemePreference(value as ThemePreference)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'language' ? (
        <OptionDialog
          title={t('settingsLanguageTitle')}
          value={locale}
          options={[
            { value: 'zh-CN', label: t('settingsLocaleZhCN') },
            { value: 'en-US', label: t('settingsLocaleEnUS') },
          ]}
          onConfirm={(value) => setLocale(value as 'zh-CN' | 'en-US')}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'voice' ? (
        <VoiceDialog value={ttsVoice} onConfirm={(value) => setTtsVoice(value)} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'model' ? (
        <ModelDialog
          value={selectedModel}
          onConfirm={(model) => setModel(model)}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  )
}

const blobToBase64 = (blob: Blob): Promise<string | null> =>
  new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : null)
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(blob)
  })

const Group = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className={styles.group}>
    {label ? <div className={styles.groupLabel}>{label}</div> : null}
    <div className={styles.card}>{children}</div>
  </div>
)

const Row = ({
  icon,
  label,
  value,
  danger,
  onClick,
}: {
  icon: ReactNode
  label: string
  value?: string
  danger?: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    className={clsx(styles.row, danger && styles.rowDanger)}
    onClick={onClick}
  >
    <span className={styles.rowIcon}>{icon}</span>
    <span className={styles.rowLabel}>{label}</span>
    {value ? <span className={styles.rowValue}>{value}</span> : null}
    <span className={styles.chevron}>
      <IconChevronRightOutline14 />
    </span>
  </button>
)

/** iOS 风格开关（与官方 App 的绿色开关一致） */
const Switch = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label?: string
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className={clsx(styles.switch, checked && styles.switchOn)}
    onClick={() => onChange(!checked)}
  >
    <span className={styles.switchKnob} />
  </button>
)

/** 外观 / 语言 / 音色的单选弹窗：确认后生效 */
const OptionDialog = ({
  title,
  value,
  options,
  onConfirm,
  onClose,
}: {
  title: string
  value: string
  options: { value: string; label: string }[]
  onConfirm: (value: string) => void
  onClose: () => void
}) => {
  const t = useTranslate()
  const [draft, setDraft] = useState(value)
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <button
          type="button"
          className={styles.dialogConfirmText}
          onClick={() => {
            onConfirm(draft)
            onClose()
          }}
        >
          {t('dialogConfirm')}
        </button>
      }
    >
      <div className={styles.options} role="radiogroup" aria-label={title}>
        {options.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              type="radio"
              name={title}
              checked={draft === option.value}
              onChange={() => setDraft(option.value)}
            />
            <span className={styles.radioMark} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </Modal>
  )
}

/** 朗读音色选择：与官方 App 一致的底部弹层、流体色块与分页圆点。
 *  官方 API 仅提供 stella（海星）与 tide（暗潮）两个音色。 */
const VOICES = [
  {
    id: 'stella' as const,
    nameKey: 'ttsVoiceStellaName' as const,
    descKey: 'ttsVoiceStellaDesc' as const,
    blob: styles.blobStella,
  },
  {
    id: 'tide' as const,
    nameKey: 'ttsVoiceTideName' as const,
    descKey: 'ttsVoiceTideDesc' as const,
    blob: styles.blobTide,
  },
]

const VoiceDialog = ({
  value,
  onConfirm,
  onClose,
}: {
  value: 'stella' | 'tide'
  onConfirm: (value: 'stella' | 'tide') => void
  onClose: () => void
}) => {
  const t = useTranslate()
  const [index, setIndex] = useState(() => Math.max(0, VOICES.findIndex((v) => v.id === value)))
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const requestClose = () => {
    if (closingRef.current) {
      return
    }
    closingRef.current = true
    setClosing(true)
    window.setTimeout(onClose, 200)
  }
  // 音色弹层向下滑动关闭
  const sheetSwipeRef = useSwipe<HTMLDivElement>({
    onSwipeDown: requestClose,
    verticalThreshold: 70,
  })
  useAndroidBack(() => {
    requestClose()
    return true
  })
  const goTo = (next: number) => {
    setIndex(next)
    const el = scrollerRef.current
    if (el) {
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
    }
  }
  return (
    <div
      className={clsx(styles.sheetOverlay, closing && styles.closing)}
      onMouseDown={(event) => event.target === event.currentTarget && requestClose()}
    >
      <div
        ref={sheetSwipeRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={t('settingsVoiceTitle')}
      >
        <div className={styles.sheetHeader}>
          <div className={styles.sheetTitle}>{t('settingsVoiceTitle')}</div>
          <button type="button" className={styles.sheetClose} aria-label={t('close')} onClick={requestClose}>
            <IconCloseOutline16 />
          </button>
        </div>
        <div
          ref={scrollerRef}
          className={styles.voiceScroller}
          onScroll={() => {
            const el = scrollerRef.current
            if (!el) {
              return
            }
            const next = Math.round(el.scrollLeft / el.clientWidth)
            if (next !== index && next >= 0 && next < VOICES.length) {
              setIndex(next)
            }
          }}
        >
          {VOICES.map((voice) => (
            <div key={voice.id} className={styles.voicePage}>
              <div className={clsx(styles.voiceBlob, voice.blob)}>
                <span className={styles.blobSheen} />
              </div>
              <div className={styles.voiceName}>{t(voice.nameKey)}</div>
              <div className={styles.voiceDesc}>{t(voice.descKey)}</div>
            </div>
          ))}
        </div>
        <div className={styles.dots}>
          {VOICES.map((voice, dot) => (
            <button
              key={voice.id}
              type="button"
              className={clsx(styles.dot, dot === index && styles.dotActive)}
              aria-label={t(voice.nameKey)}
              onClick={() => goTo(dot)}
            />
          ))}
        </div>
        <Button
          block
          className={styles.voiceConfirm}
          onClick={() => {
            onConfirm(VOICES[index].id)
            requestClose()
          }}
        >
          {t('dialogConfirm')}
        </Button>
      </div>
    </div>
  )
}

/** 上下文长度缩写：1M / 128K 等 */
const formatTokens = (tokens?: number): string | null => {
  if (tokens === undefined) {
    return null
  }
  if (tokens >= 1024 * 1024) {
    const value = tokens / (1024 * 1024)
    return `${Number.isInteger(value) ? value : value.toFixed(1)}M`
  }
  if (tokens >= 1024) {
    return `${Math.round(tokens / 1024)}K`
  }
  return String(tokens)
}

/** 模型选择：从开放平台 /models 拉取，展示名称、上下文、模态与思考档位 */
const ModelDialog = ({
  value,
  onConfirm,
  onClose,
}: {
  value: string | null
  onConfirm: (model: string) => void
  onClose: () => void
}) => {
  const t = useTranslate()
  const apiKey = useSettings((state) => state.apiKey)
  const [models, setModels] = useState<ModelInfo[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [draft, setDraft] = useState(value ?? 'deepseek-flash')

  const load = () => {
    if (!apiKey) {
      return
    }
    setFailed(false)
    setModels(null)
    void listModels(apiKey)
      .then((list) => {
        setModels(list)
        if (list.length > 0 && !list.some((model) => model.id === draft)) {
          setDraft(list[0].id)
        }
      })
      .catch((error) => {
        console.error('list models failed', error)
        setFailed(true)
      })
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  const ready = models !== null && models.length > 0
  return (
    <Modal
      title={t('modelDialogTitle')}
      onClose={onClose}
      footer={
        <button
          type="button"
          className={styles.dialogConfirmText}
          disabled={!ready}
          onClick={() => {
            if (ready) {
              onConfirm(draft)
              onClose()
            }
          }}
        >
          {t('dialogConfirm')}
        </button>
      }
    >
      {!apiKey ? (
        <div className={styles.modelHint}>{t('modelNeedKey')}</div>
      ) : failed ? (
        <div className={styles.modelHint}>
          {t('modelLoadFailed')}
          <button type="button" className={styles.retryLink} onClick={load}>
            {t('retry')}
          </button>
        </div>
      ) : models === null ? (
        <div className={styles.modelHint}>{t('modelLoading')}</div>
      ) : models.length === 0 ? (
        <div className={styles.modelHint}>{t('modelLoadFailed')}</div>
      ) : (
        <div className={styles.options} role="radiogroup" aria-label={t('modelDialogTitle')}>
          {models.map((model) => {
            const context = formatTokens(model.context_window)
            const image = model.input_modalities?.includes('image')
            const levels = model.effort?.supported_levels
            const meta = [
              context ? t('modelContext', { tokens: context }) : null,
              model.input_modalities ? (image ? t('modelImageInput') : t('modelTextOnly')) : null,
              levels && levels.length > 0 ? t('modelEffort', { levels: levels.join(' / ') }) : null,
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <label key={model.id} className={styles.option}>
                <input
                  type="radio"
                  name="model"
                  checked={draft === model.id}
                  onChange={() => setDraft(model.id)}
                />
                <span className={styles.radioMark} />
                <span className={styles.modelLabel}>
                  <span className={styles.modelName}>{model.name || model.id}</span>
                  <span className={styles.modelMeta}>{model.id}</span>
                  {meta ? <span className={styles.modelMeta}>{meta}</span> : null}
                </span>
              </label>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

/** 删除全部对话确认 */
const DeleteAllConfirm = ({
  historyDelete,
}: {
  historyDelete: ReturnType<typeof useHistoryDelete>
}) => {
  const t = useTranslate()
  return (
    <Modal
      title={t('deleteAllSessionsModalTitle')}
      onClose={historyDelete.cancel}
      footer={
        <div className={styles.dialogActions} aria-busy={historyDelete.busy}>
          <Button variant="outlined" autoFocus disabled={historyDelete.busy} onClick={historyDelete.cancel}>
            {t('cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={historyDelete.busy}
            onClick={() => void historyDelete.confirm()}
          >
            {t(historyDelete.busy ? 'historyDeleting' : 'deleteAllSessions')}
          </Button>
        </div>
      }
    >
      {t('deleteAllSessionsModalDescription')}
    </Modal>
  )
}

const useHistoryDelete = () => {
  const [opened, setOpened] = useState(false)
  const [busy, setBusy] = useState(false)
  const deleting = useRef(false)

  const confirm = async () => {
    if (deleting.current) {
      return
    }
    deleting.current = true
    setBusy(true)
    try {
      await clearHistory()
      setOpened(false)
      showToast({ key: 'historyDeleted' })
    } catch {
      showToast({ key: 'historyDeleteFailed', type: 'error' })
    } finally {
      deleting.current = false
      setBusy(false)
    }
  }

  return {
    opened,
    busy,
    open: () => setOpened(true),
    cancel: () => {
      if (!deleting.current) {
        setOpened(false)
      }
    },
    confirm,
  }
}

/** 覆盖导入的二次确认 */
const ImportConfirm = ({
  historyImport,
}: {
  historyImport: ReturnType<typeof useHistoryImport>
}) => {
  const t = useTranslate()
  return (
    <Modal
      title={t('historyImportConfirmTitle')}
      onClose={historyImport.cancel}
      footer={
        <>
          <Button variant="outlined" autoFocus onClick={historyImport.cancel}>
            {t('cancel')}
          </Button>
          <Button variant="dangerOutlined" onClick={() => void historyImport.confirm()}>
            {t('historyImportConfirm')}
          </Button>
        </>
      }
    >
      <div className={styles.importConfirmText}>{t('historyImportConfirmDescription')}</div>
    </Modal>
  )
}

/** 选文件后先提示覆盖；确认后才检查文件并执行导入 */
const useHistoryImport = () => {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const importing = useRef(false)

  const confirm = async () => {
    if (!file || importing.current) {
      return
    }
    importing.current = true
    setFile(null)
    setBusy(true)
    try {
      const count = await importHistory(file)
      showToast({ key: count === 1 ? 'historyImportedOne' : 'historyImported', params: { count } })
    } catch (error) {
      console.error('history import failed', error)
      showToast({ key: 'historyImportFailed', type: 'error' })
    } finally {
      importing.current = false
      setBusy(false)
    }
  }

  return { file, busy, select: setFile, cancel: () => setFile(null), confirm }
}
