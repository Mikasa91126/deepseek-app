import * as db from './db.js'
import type { Message } from './types.js'

/** 消息是否包含关键词：提问正文，或回答的正文/思考 */
const messageMatches = (message: Message, keyword: string): boolean => {
  if (message.role === 'user') {
    return message.content.toLowerCase().includes(keyword)
  }
  return message.blocks.some(
    (block) =>
      (block.type === 'text' && block.text.toLowerCase().includes(keyword)) ||
      (block.type === 'thinking' && block.thinking.toLowerCase().includes(keyword))
  )
}

/** 会话列表全文搜索：标题由调用方即时过滤，这里在全部会话正文与思考中查找 */
export const searchSessionIds = async (query: string): Promise<Set<string>> => {
  const keyword = query.trim().toLowerCase()
  if (!keyword) {
    return new Set()
  }
  const sessions = await db.loadAllSessions()
  const ids = new Set<string>()
  for (const session of sessions) {
    if ((session.title ?? '').toLowerCase().includes(keyword)) {
      ids.add(session.id)
      continue
    }
    if (session.messages.some((message) => messageMatches(message, keyword))) {
      ids.add(session.id)
    }
  }
  return ids
}
