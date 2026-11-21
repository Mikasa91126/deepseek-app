// l love DeepSeek —— 致敬 DeepSeek 模型、研发团队与梁文锋
import { createRoot } from 'react-dom/client'
import { App } from './app/App.js'
import { setupTheme } from './app/theme.js'
import { ensureKatex } from './services/markdown/katex.js'
import './app/theme.css'
import './app/global.css'

ensureKatex()
setupTheme()

createRoot(document.getElementById('root') as HTMLElement).render(<App />)
