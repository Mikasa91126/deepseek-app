import * as db from './db.js'
import type { Message } from './types.js'

/** 取命中位置附近的一段文字用于列表展示 */
const snippetOf = (text: string, keyword: string): string | null => {
  const index = text.toLowerCase().indexOf(keyword)
  if (index < 0) {
    return null
  }
  const start = Math.max(0, index - 16)
  const end = Math.min(text.length, index + keyword.length + 36)
  const piece = text
    .slice(start, end)
    .replace(/\s+/g, ' ')
    .trim()
  return `${start > 0 ? '…' : ''}${piece}${end < text.length ? '…' : ''}`
}

const messageSnippet = (message: Message, keyword: string): string | null => {
  if (message.role === 'user') {
    return snippetOf(message.content, keyword)
  }
  for (const block of message.blocks) {
    if (block.type === 'text') {
      const snippet = snippetOf(block.text, keyword)
      if (snippet) {
        return snippet
      }
    } else if (block.type === 'thinking') {
      const snippet = snippetOf(block.thinking, keyword)
      if (snippet) {
        return snippet
      }
    }
  }
  return null
}

/**
 * 会话列表全文搜索：在全部会话的正文与思考中查找，返回「会话 ID → 命中片段」。
 * 标题命中的会话由调用方直接显示，片段只用于解释内容命中。
 */
export const searchSessions = async (query: string): Promise<Map<string, string>> => {
  const keyword = query.trim().toLowerCase()
  if (!keyword) {
    return new Map()
  }
  const sessions = await db.loadAllSessions()
  const matches = new Map<string, string>()
  for (const session of sessions) {
    if ((session.title ?? '').toLowerCase().includes(keyword)) {
      matches.set(session.id, '')
      continue
    }
    for (const message of session.messages) {
      const snippet = messageSnippet(message, keyword)
      if (snippet) {
        matches.set(session.id, snippet)
        break
      }
    }
  }
  return matches
}
