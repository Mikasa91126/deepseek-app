/** 最近使用的图片：存缩略图，供「+」面板的最近图片横条使用。
 *  浏览器无法枚举系统相册，这里只记录用户在本应用里选择过的图片。 */
export type RecentImage = { id: string; dataUrl: string; name: string }

const KEY = 'chat-demo:recent-images'
const MAX_ITEMS = 6
const THUMB_SIZE = 240

const isRecentImage = (value: unknown): value is RecentImage =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as RecentImage).dataUrl === 'string' &&
  typeof (value as RecentImage).id === 'string'

export const readRecentImages = (): RecentImage[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isRecentImage).slice(0, MAX_ITEMS) : []
  } catch {
    return []
  }
}

const toThumbnail = (file: File): Promise<string | null> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      try {
        const scale = Math.min(1, THUMB_SIZE / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        const context = canvas.getContext('2d')
        if (!context) {
          resolve(null)
          return
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.72))
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })

/** 记录本次选择的图片（最多 3 张），供下次打开「+」面板时展示 */
export const rememberRecentImages = async (files: File[]): Promise<void> => {
  const images = files.filter((file) => file.type.startsWith('image/')).slice(0, 3)
  if (images.length === 0) {
    return
  }
  const created: RecentImage[] = []
  for (const file of images) {
    const dataUrl = await toThumbnail(file)
    if (dataUrl) {
      created.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        dataUrl,
        name: file.name || 'image.jpg',
      })
    }
  }
  if (created.length === 0) {
    return
  }
  try {
    localStorage.setItem(KEY, JSON.stringify([...created, ...readRecentImages()].slice(0, MAX_ITEMS)))
  } catch {
    // 存储空间不足时忽略
  }
}

/** 把最近图片还原成 File，重新加入附件 */
export const recentImageToFile = async (item: RecentImage): Promise<File> => {
  const blob = await (await fetch(item.dataUrl)).blob()
  const extension = blob.type === 'image/png' ? 'png' : 'jpg'
  const name = item.name.includes('.') ? item.name : `${item.name}.${extension}`
  return new File([blob], name, { type: blob.type || 'image/jpeg' })
}
