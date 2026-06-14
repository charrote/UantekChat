import { useState, useRef, useEffect } from 'react'
import { MarkdownRenderer } from './components/MarkdownRenderer'
import { BookStackPanel } from './components/BookStackPanel'
import MultiModalInput from './components/MultiModalInput'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoningContent?: string
  attachments?: {
    type: string
    previewUrl?: string
    base64?: string
    file?: { name: string }
  }[]
}

interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
}

interface Settings {
  enableApiKey: boolean
  apiKey: string
  selectedModel: string
  isDarkMode: boolean
  contextLength: number
  enableThinking: boolean
  bookStackHost: string
  bookStackPort: string
  bookStackToken: string
}

const defaultSettings: Settings = {
  enableApiKey: false,
  apiKey: '',
  selectedModel: '',
  isDarkMode: true,
  contextLength: 4096,
  enableThinking: true,
  bookStackHost: 'localhost',
  bookStackPort: '6875',
  bookStackToken: ''
}

const CONTEXT_LENGTH_OPTIONS = [1024, 4096, 8192, 16384, 32768]

function formatContextLength(value: number): string {
  if (value >= 1024 && value % 1024 === 0) {
    return `${value / 1024}K`
  }
  return `${value}`
}

function App() {
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const saved = localStorage.getItem('conversations')
    return saved ? JSON.parse(saved) : []
  })
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    return localStorage.getItem('activeConversationId')
  })
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem('settings')
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings
  })
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'model' | 'knowledge'>('model')
  const [isLoading, setIsLoading] = useState(false)
  const [modelName, setModelName] = useState('')
  const [modelsList, setModelsList] = useState<string[]>([])
  const [appTitle, setAppTitle] = useState('友文智脑')
  const [autoScroll, setAutoScroll] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showEditTitleModal, setShowEditTitleModal] = useState(false)
  const [editingConversation, setEditingConversation] = useState<Conversation | null>(null)
  const [bookStackPanelOpen, setBookStackPanelOpen] = useState(() => {
    const saved = localStorage.getItem('bookstack-panel-open')
    return saved ? JSON.parse(saved) : false
  })
  const [bookStackUrl, setBookStackUrl] = useState<string | undefined>(undefined)
  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [thinkingExpanded, setThinkingExpanded] = useState<Record<string, boolean>>({})

  const activeConversation = conversations.find(c => c.id === activeConversationId)

  useEffect(() => {
    localStorage.setItem('conversations', JSON.stringify(conversations))
  }, [conversations])

  useEffect(() => {
    localStorage.setItem('activeConversationId', activeConversationId || '')
  }, [activeConversationId])

  useEffect(() => {
    localStorage.setItem('settings', JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    localStorage.setItem('bookstack-panel-open', JSON.stringify(bookStackPanelOpen))
  }, [bookStackPanelOpen])

  useEffect(() => {
    document.documentElement.classList.toggle('light-theme', !settings.isDarkMode)
  }, [settings.isDarkMode])

  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [activeConversation?.messages, autoScroll])

  useEffect(() => {
    if (isLoading) {
      const msgs = activeConversation?.messages || []
      const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant')
      if (lastAssistant?.reasoningContent) {
        setThinkingExpanded(prev => ({ ...prev, [lastAssistant.id]: true }))
        const el = document.getElementById(`thinking-content-${lastAssistant.id}`)
        if (el) {
          el.scrollTop = el.scrollHeight
        }
      }
    }
  }, [activeConversation?.messages, isLoading])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'bookstack-navigate' && event.data?.url) {
        setBookStackUrl(event.data.url)
        setBookStackPanelOpen(true)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const handleScroll = () => {
    const chatContainer = document.querySelector('.chat-container')
    if (!chatContainer) return
    const { scrollTop, scrollHeight, clientHeight } = chatContainer
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
    setAutoScroll(isAtBottom)
  }

  const openEditTitleModal = (conv: Conversation) => {
    setEditingConversation(conv)
    setShowEditTitleModal(true)
  }

  const saveTitle = () => {
    if (editingConversation && editingConversation.title.trim()) {
      setConversations(prev => prev.map(c =>
        c.id === editingConversation.id ? { ...c, title: editingConversation.title.trim() } : c
      ))
    }
    setShowEditTitleModal(false)
    setEditingConversation(null)
  }

  const createNewConversation = () => {
    const newConversation: Conversation = {
      id: Date.now().toString(),
      title: '新对话',
      messages: [],
      createdAt: new Date()
    }
    setConversations(prev => [newConversation, ...prev])
    setActiveConversationId(newConversation.id)
  }

  const deleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setConversations(prev => prev.filter(c => c.id !== id))
    if (activeConversationId === id) {
      setActiveConversationId(conversations.length > 1 ? conversations[0].id : null)
    }
  }

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const closeSidebar = () => {
    setSidebarOpen(false)
  }

  const handleConversationClick = (id: string) => {
    setActiveConversationId(id)
    closeSidebar()
  }

  const isStreamingMessage = (msgId: string) => {
    if (!isLoading) return false
    const msgs = activeConversation?.messages || []
    const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant')
    return lastAssistant?.id === msgId
  }

  const toggleThinking = (msgId: string) => {
    setThinkingExpanded(prev => ({ ...prev, [msgId]: !prev[msgId] }))
  }

  const sendMessage = async (content: string, attachments?: {
    type: string
    previewUrl?: string
    base64?: string
    file?: { name: string }
  }[]) => {
    if (!content.trim() && (!attachments || attachments.length === 0)) return

    setAutoScroll(true)

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      attachments
    }

    let conversation = activeConversation
    const isNewChat = !conversation

    if (!conversation) {
      const newConversation: Conversation = {
        id: Date.now().toString(),
        title: content.trim().slice(0, 8),
        messages: [userMessage],
        createdAt: new Date()
      }
      setConversations(prev => [newConversation, ...prev])
      setActiveConversationId(newConversation.id)
      conversation = newConversation
    } else {
      setConversations(prev => prev.map(c =>
        c.id === conversation!.id
          ? { ...c, messages: [...c.messages, userMessage] }
          : c
      ))
    }

    setIsLoading(true)

    const assistantMessageId = (Date.now() + 1).toString()
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: ''
    }

    setConversations(prev => prev.map(c =>
      c.id === conversation!.id
        ? { ...c, messages: [...c.messages, assistantMessage] }
        : c
    ))

    // 截断对话历史，保留最近 20 条消息，防止请求体过大
    const MAX_HISTORY_MESSAGES = 20
    const trimmedHistory = conversation.messages.slice(-MAX_HISTORY_MESSAGES)
    const messagesToSend = [
      ...trimmedHistory.map(m => ({ role: m.role, content: m.content, attachments: m.attachments })),
      { role: 'user', content: userMessage.content, attachments: userMessage.attachments }
    ]

    try {
      abortControllerRef.current = new AbortController()

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          apiKey: settings.enableApiKey ? settings.apiKey : '',
          messages: messagesToSend
        }),
        signal: abortControllerRef.current.signal
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let fullReasoning = ''

      if (!reader) {
        throw new Error('无法读取响应流')
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta || {}
              const content = delta.content || ''
              const reasoningContent = delta.reasoning_content || ''
              if (content || reasoningContent) {
                fullContent += content
                fullReasoning += reasoningContent
                setConversations(prev => prev.map(c =>
                  c.id === conversation!.id
                    ? {
                        ...c,
                        messages: c.messages.map(m =>
                          m.id === assistantMessageId
                            ? { ...m, content: fullContent, reasoningContent: fullReasoning || undefined }
                            : m
                        )
                      }
                    : c
                ))
              }
            } catch (e) {
              // skip
            }
          }
        }
      }

      const existingUserMsgs = conversation.messages.filter(m => m.role === 'user').length
      const totalUserMsgs = isNewChat ? 1 : existingUserMsgs + 1

      if (totalUserMsgs === 1) {
        const title = userMessage.content.slice(0, 8)
        setConversations(prev => prev.map(c =>
          c.id === conversation!.id ? { ...c, title } : c
        ))
      } else if (totalUserMsgs >= 5 && totalUserMsgs % 5 === 0) {
        const recentMsgs = isNewChat
          ? [...conversation.messages.map(m => ({ role: m.role, content: m.content }))]
          : [
              ...conversation.messages.map(m => ({ role: m.role, content: m.content })),
              { role: 'user', content: userMessage.content }
            ]
        recentMsgs.push({ role: 'assistant', content: fullContent })
        summarizeTitle(conversation!.id, recentMsgs.slice(-10))
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setConversations(prev => prev.map(c =>
          c.id === conversation!.id
            ? {
                ...c,
                messages: c.messages.map(m =>
                  m.id === assistantMessageId
                    ? { ...m, content: '[已终止]' }
                    : m
                )
              }
            : c
        ))
      } else {
        setConversations(prev => prev.map(c =>
          c.id === conversation!.id
            ? {
                ...c,
                messages: c.messages.map(m =>
                  m.id === assistantMessageId
                    ? { ...m, content: `错误: ${error instanceof Error ? error.message : '请求失败'}` }
                    : m
                )
              }
            : c
        ))
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }

  const summarizeTitle = async (convId: string, msgs: { role: string; content: string }[]) => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: settings.enableApiKey ? settings.apiKey : '',
          messages: msgs,
          systemPrompt: '你是一个对话标题生成器。请根据最近几轮对话的重点，用不超过8个字总结核心主题，只输出标题本身，不要任何标点和解释。'
        })
      })
      const reader = res.body?.getReader()
      if (!reader) return
      const decoder = new TextDecoder()
      let title = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = decoder.decode(value, { stream: true }).split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ') || line.slice(6) === '[DONE]') continue
          try {
            const c = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content || ''
            title += c
          } catch { /* skip */ }
        }
      }
      if (title.trim()) {
        setConversations(prev => prev.map(c =>
          c.id === convId ? { ...c, title: title.trim().slice(0, 8) } : c
        ))
      }
    } catch { /* silent fail */ }
  }

  const handleSettingsSave = async () => {
    if (settings.enableApiKey && !settings.apiKey.trim()) {
      alert('请填写 API Key')
      return
    }
    localStorage.setItem('lmstudio-settings', JSON.stringify(settings))
    localStorage.setItem('bookstack-settings', JSON.stringify({
      host: settings.bookStackHost,
      port: settings.bookStackPort,
      token: settings.bookStackToken
    }))
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedModel: settings.selectedModel || modelName })
    }).catch(() => {})
    setShowSettings(false)
  }

  useEffect(() => {
    const saved = localStorage.getItem('lmstudio-settings')
    if (saved) {
      setSettings({ ...defaultSettings, ...JSON.parse(saved) })
    }
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setModelName(data.selectedModel || data.model)
        if (data.selectedModel) {
          setSettings(prev => ({ ...prev, selectedModel: data.selectedModel }))
        }
        setAppTitle(data.title || '友文智脑')
      })
      .catch(() => {})
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        const models = data.data?.map((m: { id: string }) => m.id) || []
        setModelsList(models)
      })
      .catch(() => {})
    const bkSettings = localStorage.getItem('bookstack-settings')
    if (bkSettings) {
      try {
        const parsed = JSON.parse(bkSettings)
        setSettings(prev => ({
          ...prev,
          bookStackHost: parsed.host || prev.bookStackHost,
          bookStackPort: parsed.port || prev.bookStackPort,
          bookStackToken: parsed.token || prev.bookStackToken
        }))
      } catch {}
    }
  }, [])

  return (
    <div className="app-container">
      <div className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`} onClick={closeSidebar}></div>
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <button className="sidebar-close-btn mobile-only" onClick={closeSidebar}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <button className="new-chat-btn" onClick={createNewConversation}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            新建对话
          </button>
        </div>

        <div className="conversations-list">
          {conversations.map(conv => (
            <div
              key={conv.id}
              className={`conversation-item ${activeConversationId === conv.id ? 'active' : ''}`}
              onClick={() => handleConversationClick(conv.id)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {conv.title}
              </span>
              <button
                className="edit-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  openEditTitleModal(conv)
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button
                className="delete-btn"
                onClick={(e) => deleteConversation(conv.id, e)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <button className="footer-btn" onClick={() => setShowSettings(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            设置
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="chat-header">
          {!sidebarOpen && (
            <button className="menu-toggle" onClick={toggleSidebar}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
          )}
          {sidebarOpen && (
            <button className="menu-toggle" onClick={toggleSidebar}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="17" y1="17" x2="7" y2="7"></line>
                <polyline points="7 17 17 7 17 17 7 7"></polyline>
              </svg>
            </button>
          )}
          <h1 className="chat-title">{appTitle}</h1>

          <div className="header-model-badge">
            <span>{modelsList.length > 0 ? '🔌 LM Studio' : '⚠️ 未连接'}</span>
            {modelName && <span>{modelName}</span>}
          </div>

          <button
            className="theme-toggle-btn"
            onClick={() => setSettings(prev => ({ ...prev, isDarkMode: !prev.isDarkMode }))}
            title={settings.isDarkMode ? '切换到白天模式' : '切换到黑夜模式'}
            aria-label={settings.isDarkMode ? '切换到白天模式' : '切换到黑夜模式'}
          >
            {settings.isDarkMode ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            )}
          </button>
        </header>

        <div className="chat-container" onScroll={handleScroll}>
          {activeConversation?.messages.map(m => (
            <div key={m.id} className={`message-wrapper ${m.role}`}>
              {m.role === 'assistant' && m.reasoningContent && settings.enableThinking && (
                <div className={`thinking-block ${isStreamingMessage(m.id) ? 'streaming' : ''}`}>
                  <div className="thinking-header" onClick={() => toggleThinking(m.id)}>
                    <div className="thinking-header-left">
                      {isStreamingMessage(m.id) ? (
                        <span className="thinking-dot"></span>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2a10 10 0 1 0 10 10 10 10 0 0 0-10-10zm0 3a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0V6a1 1 0 0 1 1-1zm0 11a1 1 0 0 1-1-1v-2a1 1 0 0 1 2 0v2a1 1 0 0 1-1 1z" fill="currentColor"/>
                        </svg>
                      )}
                      <span>{isStreamingMessage(m.id) ? '思考中...' : '思考过程'}</span>
                    </div>
                    <button
                      className="thinking-toggle-btn"
                      onClick={(e) => { e.stopPropagation(); toggleThinking(m.id) }}
                    >
                      {isStreamingMessage(m.id) || thinkingExpanded[m.id] ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="18 15 12 9 6 15"></polyline>
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      )}
                    </button>
                  </div>
                  {(isStreamingMessage(m.id) || thinkingExpanded[m.id]) && (
                    <div className="thinking-content" id={`thinking-content-${m.id}`}>
                      <MarkdownRenderer content={m.reasoningContent} />
                    </div>
                  )}
                </div>
              )}
              <div className="message-content">
                <MarkdownRenderer content={m.content} />
                {m.attachments && m.attachments.length > 0 && (
                  <div className="message-attachments">
                    {m.attachments.map((a, i) => (
                      <div key={i} className="message-attachment-item">
                        {a.type === 'image' ? <img src={a.previewUrl || a.base64!} alt="attachment" /> : `📄 ${a.file?.name}`}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message-wrapper assistant">
              <div className="message-content">
                <div className="thinking-loading">
                  <span className="thinking-loading-dot"></span>
                  <span className="thinking-loading-dot"></span>
                  <span className="thinking-loading-dot"></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <MultiModalInput
          onSendMessage={sendMessage}
          isLoading={isLoading}
        />
      </main>

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>设置</h2>
              <button className="close-btn" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="settings-tabs">
              <button
                className={`settings-tab ${settingsTab === 'model' ? 'active' : ''}`}
                onClick={() => setSettingsTab('model')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                模型设置
              </button>
              <button
                className={`settings-tab ${settingsTab === 'knowledge' ? 'active' : ''}`}
                onClick={() => setSettingsTab('knowledge')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                知识库设置
              </button>
            </div>
            <div className="modal-body">
              {settingsTab === 'model' && (
                <>
                  <div className="setting-item">
                    <label>
                      <input
                        type="checkbox"
                        checked={settings.enableApiKey}
                        onChange={(e) => setSettings(prev => ({ ...prev, enableApiKey: e.target.checked }))}
                      />
                      启用 API Key
                    </label>
                  </div>
                  {settings.enableApiKey && (
                    <div className="setting-item">
                      <input
                        type="password"
                        placeholder="输入您的 API Key"
                        value={settings.apiKey}
                        onChange={(e) => setSettings(prev => ({ ...prev, apiKey: e.target.value }))}
                      />
                    </div>
                  )}
                  <div className="form-group">
                    <label>选择模型</label>
                    <select
                      value={settings.selectedModel}
                      onChange={(e) => setSettings(prev => ({ ...prev, selectedModel: e.target.value }))}
                    >
                      <option value="">默认模型</option>
                      {modelsList.map(model => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                  </div>
                  <div className="setting-item toggle-row">
                    <label>显示思考过程</label>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.enableThinking}
                        onChange={(e) => setSettings(prev => ({ ...prev, enableThinking: e.target.checked }))}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="hint" style={{ marginTop: -12, marginBottom: 16 }}>开启后，AI 的推理过程将显示在回复上方</div>
                  <div className="form-group">
                    <label>
                      上下文长度（Context Length）
                      <span className="context-length-value">
                        当前: {formatContextLength(settings.contextLength)} ({settings.contextLength.toLocaleString()} tokens)
                      </span>
                    </label>
                    <div className="slider-container">
                      <input
                        type="range"
                        min={1024}
                        max={32768}
                        step={1024}
                        value={settings.contextLength}
                        onChange={(e) => setSettings(prev => ({ ...prev, contextLength: parseInt(e.target.value) }))}
                        className="context-slider"
                      />
                    </div>
                    <div className="context-length-presets">
                      {CONTEXT_LENGTH_OPTIONS.map(opt => (
                        <button
                          key={opt}
                          className={`preset-btn ${settings.contextLength === opt ? 'active' : ''}`}
                          onClick={() => setSettings(prev => ({ ...prev, contextLength: opt }))}
                        >
                          {formatContextLength(opt)}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {settingsTab === 'knowledge' && (
                <>
                  <div className="form-group">
                    <label>服务地址</label>
                    <input
                      type="text"
                      placeholder="例如: localhost"
                      value={settings.bookStackHost}
                      onChange={(e) => setSettings(prev => ({ ...prev, bookStackHost: e.target.value }))}
                    />
                    <div className="hint">BookStack 服务的主机名或 IP 地址</div>
                  </div>
                  <div className="form-group">
                    <label>服务端口</label>
                    <input
                      type="text"
                      placeholder="例如: 6875"
                      value={settings.bookStackPort}
                      onChange={(e) => setSettings(prev => ({ ...prev, bookStackPort: e.target.value }))}
                    />
                    <div className="hint">BookStack 服务的端口号</div>
                  </div>
                  <div className="form-group">
                    <label>个人 Token</label>
                    <input
                      type="password"
                      placeholder="token_id:token_secret"
                      value={settings.bookStackToken}
                      onChange={(e) => setSettings(prev => ({ ...prev, bookStackToken: e.target.value }))}
                    />
                    <div className="hint">BookStack API Token，格式为 token_id:token_secret，在 BookStack 后台设置 → API 中生成</div>
                  </div>
                  <div className="form-group">
                    <button
                      className="btn-secondary"
                      style={{ width: '100%' }}
                      onClick={() => {
                        const testUrl = `http://${settings.bookStackHost}:${settings.bookStackPort}/api/books`
                        fetch(testUrl, {
                          headers: settings.bookStackToken
                            ? { 'Authorization': `Token ${settings.bookStackToken}` }
                            : {}
                        })
                          .then(res => {
                            if (res.ok) {
                              alert('连接成功！已获取到知识库数据。')
                            } else if (res.status === 401) {
                              alert('认证失败，请检查 Token 是否正确。')
                            } else {
                              alert(`连接失败，HTTP 状态码: ${res.status}`)
                            }
                          })
                          .catch(() => {
                            alert('无法连接到 BookStack 服务，请检查地址和端口。')
                          })
                      }}
                    >
                      测试连接
                    </button>
                  </div>
                </>
              )}
              <div className="modal-actions">
                <button className="btn-primary" onClick={handleSettingsSave}>保存设置</button>
                <button className="btn-secondary" onClick={() => setShowSettings(false)}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditTitleModal && editingConversation && (
        <div className="modal-overlay" onClick={() => setShowEditTitleModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>编辑对话标题</h2>
              <button className="close-btn" onClick={() => setShowEditTitleModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <input
                className="modal-input"
                type="text"
                value={editingConversation.title}
                onChange={(e) => setEditingConversation(prev => prev ? { ...prev, title: e.target.value } : null)}
                autoFocus
              />
              <div className="modal-actions">
                <button className="btn-primary" onClick={saveTitle}>保存</button>
                <button className="btn-secondary" onClick={() => setShowEditTitleModal(false)}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <BookStackPanel
        isOpen={bookStackPanelOpen}
        onToggle={() => setBookStackPanelOpen((prev: boolean) => !prev)}
        initialUrl={bookStackUrl}
        baseUrl={`http://${settings.bookStackHost}:${settings.bookStackPort}`}
        apiToken={settings.bookStackToken}
      />
    </div>
  )
}

export default App
