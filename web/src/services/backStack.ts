import { useEffect, useRef } from 'react'

/** 应用内返回处理器：返回 true 表示已消费本次返回 */
type BackHandler = () => boolean

const stack: BackHandler[] = []

/** 注册一个返回处理器；后注册的（更上层的浮层）先收到返回。返回注销函数。 */
export const pushBackHandler = (handler: BackHandler): (() => void) => {
  stack.push(handler)
  return () => {
    const index = stack.lastIndexOf(handler)
    if (index >= 0) {
      stack.splice(index, 1)
    }
  }
}

/** 依次询问最上层的处理器，直到有人消费；全部未消费时返回 false（由原生退出应用） */
export const handleAndroidBack = (): boolean => {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    try {
      if (stack[index]()) {
        return true
      }
    } catch {
      // 单个处理器异常不应影响其余层级
    }
  }
  return false
}

declare global {
  interface Window {
    /** 安卓壳通过 evaluateJavascript 调用 */
    __handleAndroidBack?: () => boolean
  }
}

if (typeof window !== 'undefined') {
  window.__handleAndroidBack = handleAndroidBack
}

/** 组件挂载期间注册返回处理器（enabled 为 false 时不参与） */
export const useAndroidBack = (handler: BackHandler, enabled = true) => {
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  useEffect(() => {
    if (!enabled) {
      return
    }
    return pushBackHandler(() => handlerRef.current())
  }, [enabled])
}
