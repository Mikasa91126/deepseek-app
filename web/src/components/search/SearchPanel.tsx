import { useTranslate } from '../../i18n/index.js'
import { useAndroidBack } from '../../services/backStack.js'
import { useSwipe } from '../../hooks/useSwipe.js'
import { IconCloseOutline16 } from '../base/icons.js'
import { IconButton } from '../base/IconButton.js'
import { closeSearchPanel, useSearchPanel } from './searchPanelState.js'
import { SourceCard } from './SourceCard.js'
import styles from './SearchPanel.module.css'

/** 右侧「搜索结果」面板 */
export const SearchPanel = () => {
  const t = useTranslate()
  const entry = useSearchPanel((state) => state.entry)
  const sources = useSearchPanel((state) => state.sources)
  // 安卓返回键：优先关闭搜索结果面板
  useAndroidBack(() => {
    closeSearchPanel()
    return true
  }, entry !== null)
  // 移动端向右滑动关闭面板
  const panelSwipeRef = useSwipe<HTMLElement>({ onSwipeRight: closeSearchPanel })
  if (!entry) {
    return null
  }
  return (
    <aside ref={panelSwipeRef} className={styles.panel}>
      <div className={styles.header}>
        <div role="heading" className={styles.title}>
          {t('searchResult')}
        </div>
        <IconButton
          icon={<IconCloseOutline16 />}
          aria-label={t('close')}
          onClick={closeSearchPanel}
        />
      </div>
      <div className={styles.content}>
        {sources.map((source) => (
          <SourceCard key={source.url} source={source} className={styles.item} />
        ))}
      </div>
    </aside>
  )
}
