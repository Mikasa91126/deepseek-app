import { useEffect, useState } from 'react'

/**
 * 保留正在退出的浮层：open 变为 false 后继续渲染 duration 毫秒，
 * 期间 closing 为 true，供 CSS 播放退出动画，结束后卸载。
 */
export const usePresence = (open: boolean, duration = 180) => {
  const [rendered, setRendered] = useState(open)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (open) {
      setRendered(true)
      setClosing(false)
      return
    }
    if (!rendered) {
      return
    }
    setClosing(true)
    const timer = window.setTimeout(() => {
      setRendered(false)
      setClosing(false)
    }, duration)
    return () => window.clearTimeout(timer)
  }, [open, rendered, duration])

  return { rendered, closing }
}
