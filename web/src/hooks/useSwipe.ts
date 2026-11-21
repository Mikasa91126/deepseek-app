import { useCallback, useEffect, useRef } from 'react'

type SwipeHandlers = {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeDown?: () => void
  /** 水平触发距离，默认 64px */
  threshold?: number
  /** 下滑触发距离，默认 80px */
  verticalThreshold?: number
}

/** 判断触点是否位于可横向滚动的区域（例如相册图片条、代码块），避免误触发手势 */
const isInsideHorizontalScroller = (target: EventTarget | null, root: HTMLElement) => {
  let node: Element | null = target instanceof Element ? target : null
  while (node && node !== root) {
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

/**
 * 轻量触摸手势：水平左/右滑与下滑（不阻止页面滚动，纵向或横向滚动优先）。
 * 返回回调 ref：元素挂载/卸载时自动绑定或解绑，适用于条件渲染的浮层。
 */
export const useSwipe = <T extends HTMLElement>(handlers: SwipeHandlers) => {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const cleanupRef = useRef<(() => void) | null>(null)

  const ref = useCallback((element: T | null) => {
    cleanupRef.current?.()
    cleanupRef.current = null
    if (!element) {
      return
    }
    let startX = 0
    let startY = 0
    let tracking = false

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || isInsideHorizontalScroller(event.target, element)) {
        tracking = false
        return
      }
      startX = event.touches[0].clientX
      startY = event.touches[0].clientY
      tracking = true
    }
    const onEnd = (event: TouchEvent) => {
      if (!tracking) {
        return
      }
      tracking = false
      const touch = event.changedTouches[0]
      if (!touch) {
        return
      }
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      const threshold = handlersRef.current.threshold ?? 64
      const verticalThreshold = handlersRef.current.verticalThreshold ?? 80
      if (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.4) {
        if (dx < 0) {
          handlersRef.current.onSwipeLeft?.()
        } else {
          handlersRef.current.onSwipeRight?.()
        }
        return
      }
      if (dy >= verticalThreshold && Math.abs(dy) > Math.abs(dx) * 1.4) {
        handlersRef.current.onSwipeDown?.()
      }
    }
    const onCancel = () => {
      tracking = false
    }
    element.addEventListener('touchstart', onStart, { passive: true })
    element.addEventListener('touchend', onEnd, { passive: true })
    element.addEventListener('touchcancel', onCancel, { passive: true })
    cleanupRef.current = () => {
      element.removeEventListener('touchstart', onStart)
      element.removeEventListener('touchend', onEnd)
      element.removeEventListener('touchcancel', onCancel)
    }
  }, [])

  useEffect(() => () => cleanupRef.current?.(), [])

  return ref
}
