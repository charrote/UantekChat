import { useState, useRef, useEffect } from 'react'
import { MarkdownRenderer } from './components/MarkdownRenderer'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
}

// State for the Top button modal

interface Settings {
  enableApiKey: boolean
  apiKey: string
  selectedModel: string
}

const defaultSettings: Settings = {
  enableApiKey: false,
  apiKey: '',
  selectedModel: ''
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
    return saved ? JSON.parse(saved) : defaultSettings
  })
  const [showSettings, setShowSettings] = useState(false)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [modelName, setModelName] = useState('')
  const [modelsList, setModelsList] = useState<string[]>([])
  const [appTitle, setAppTitle] = useState('友文智脑')
  const [autoScroll, setAutoScroll] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showEditTitleModal, setShowEditTitleModal] = useState(false)
  const [editingConversation, setEditingConversation] = useState<Conversation | null>(null)
  const [isComposing, setIsComposing] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [activeConversation?.messages, autoScroll])

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

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    setAutoScroll(true)

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim()
    }

    let conversation = activeConversation
    const isNewChat = !conversation

    if (!conversation) {
      const newConversation: Conversation = {
        id: Date.now().toString(),
        title: input.trim().slice(0, 8),
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

    setInput('')
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

    try {
      abortControllerRef.current = new AbortController()
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          apiKey: settings.enableApiKey ? settings.apiKey : '',
          messages: [
            ...conversation.messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage.content }
          ]
        }),
        signal: abortControllerRef.current.signal
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''

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
              const content = parsed.choices?.[0]?.delta?.content || ''
              if (content) {
                fullContent += content
                setConversations(prev => prev.map(c => 
                  c.id === conversation!.id 
                    ? { 
                        ...c, 
                        messages: c.messages.map(m => 
                          m.id === assistantMessageId 
                            ? { ...m, content: fullContent }
                            : m
                        )
                      }
                    : c
                ))
              }
            } catch (e) {
            }
          }
        }
      }

      // Title management
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

const stopGenerating = () => {
  if (abortControllerRef.current) {
    abortControllerRef.current.abort()
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
          } catch { /* skip parse errors */ }
        }
      }
      if (title.trim()) {
        setConversations(prev => prev.map(c =>
          c.id === convId ? { ...c, title: title.trim().slice(0, 8) } : c
        ))
      }
    } catch { /* silent fail for title update */ }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleSettingsSave = async () => {
    if (settings.enableApiKey && !settings.apiKey.trim()) {
      alert('请填写 API Key')
      return
    }
    localStorage.setItem('lmstudio-settings', JSON.stringify(settings))
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
      setSettings(JSON.parse(saved))
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
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
          )}
          <h1 className="chat-title" onClick={() => activeConversation && openEditTitleModal(activeConversation)}>
            {activeConversation?.title || appTitle}
          </h1>
          <div className="header-model-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            <span>{modelName || 'Unknown'}</span>
          </div>
        </header>

        <div className="chat-container" onScroll={handleScroll}>
          {!activeConversation?.messages.length ? (
            <div className="empty-state">
              <h2>开始新对话</h2>
              <p>发送消息开始与友文智脑交流</p>
            </div>
          ) : (
            activeConversation.messages.map((message, index) => {
              const prevMessage = index > 0 ? activeConversation.messages[index - 1] : null
              const isGrouped = prevMessage?.role === message.role
              return (
                <div key={message.id} className={`message ${message.role}${isGrouped ? ' grouped' : ''}`}>
                  {!isGrouped && (
                    <div className="avatar-wrapper">
                      <div className="message-avatar">
                        {message.role === 'user' ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                          </svg>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7.5 13A2.5 2.5 0 0 0 5 15.5 2.5 2.5 0 0 0 7.5 18a2.5 2.5 0 0 0 2.5-2.5A2.5 2.5 0 0 0 7.5 13m9 0a2.5 2.5 0 0 0-2.5 2.5 2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0 2.5-2.5 2.5 2.5 0 0 0-2.5-2.5z"/>
                          </svg>
                        )}
                      </div>
                      {message.role === 'assistant' && (
                        <span className="avatar-name">{appTitle}</span>
                      )}
                    </div>
                  )}
                  <div className="message-main">
                      <div className="message-content">
                        {message.role === 'assistant' && !message.content && isLoading ? (
                          <div className="typing-indicator">
                            <span></span>
                            <span></span>
                            <span></span>
                          </div>
                        ) : message.role === 'assistant' ? (
                          <MarkdownRenderer content={message.content} />
                        ) : (
                          <div className="message-text">{message.content}</div>
                        )}
                      </div>
                    {message.role === 'assistant' && message.content && (
                      <div className="message-actions">
                        <button className="action-btn" title="点赞" onClick={() => {}}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                          </svg>
                        </button>
                        <button className="action-btn" title="不喜欢" onClick={() => {}}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
                          </svg>
                        </button>
                        <button className="action-btn" title="复制" onClick={async () => {
                          const content = message.content || ''
                          if (!content) return
                          try {
                            await navigator.clipboard.writeText(content)
                          } catch (e) {
                            const textarea = document.createElement('textarea')
                            textarea.value = content
                            textarea.style.position = 'fixed'
                            textarea.style.opacity = '0'
                            document.body.appendChild(textarea)
                            textarea.select()
                            document.execCommand('copy')
                            document.body.removeChild(textarea)
                          }
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                        </button>
                        <button className="action-btn" title="分享" onClick={async () => {
                          const text = message.content || ''
                          if (navigator.share && text) {
                            try {
                              await navigator.share({ text })
                              return
                            } catch (e) {
                              if ((e as Error).name !== 'AbortError') {
                                console.log('Share failed, trying clipboard')
                              }
                            }
                          }
                          try {
                            await navigator.clipboard.writeText(text)
                          } catch (e) {
                            console.error('复制失败:', e)
                          }
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="18" cy="5" r="3"></circle>
                            <circle cx="6" cy="12" r="3"></circle>
                            <circle cx="18" cy="19" r="3"></circle>
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-area">
          <div className="input-wrapper">
            <textarea
              ref={textareaRef}
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              placeholder="输入消息..."
              rows={1}
            />
            <button 
              className="send-btn" 
              onClick={sendMessage}
              disabled={isLoading || !input.trim() || (settings.enableApiKey && !settings.apiKey.trim())}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
              发送
            </button>
            {isLoading && (
              <button 
                className="stop-btn" 
                onClick={stopGenerating}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2"></rect>
                </svg>
                停止
              </button>
            )}
            
          </div>
        </div>
      </main>

      {showEditTitleModal && editingConversation && (
        <div className="modal-overlay" onClick={() => setShowEditTitleModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>修改标题</h2>
              <button className="close-btn" onClick={() => setShowEditTitleModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>对话标题</label>
                <input
                  type="text"
                  value={editingConversation.title}
                  onChange={(e) => setEditingConversation({ ...editingConversation, title: e.target.value })}
                  placeholder="请输入新标题"
                  autoFocus
                />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-secondary" onClick={() => setShowEditTitleModal(false)}>
                取消
              </button>
              <button className="btn-primary" onClick={saveTitle}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>连接设置</h2>
              <button className="close-btn" onClick={() => setShowSettings(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <div className="toggle-row">
                  <label>启用 API Key</label>
                  <button
                    className={`toggle-btn ${settings.enableApiKey ? 'active' : ''}`}
                    onClick={() => setSettings({ ...settings, enableApiKey: !settings.enableApiKey })}
                  >
                    <span className="toggle-slider"></span>
                  </button>
                </div>
                <p className="hint">关闭时不发送 Authorization header</p>
              </div>
              {settings.enableApiKey && (
                <div className="form-group">
                  <label>API Key</label>
                  <input
                    type="password"
                    value={settings.apiKey}
                    onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                    placeholder="请输入 API Key"
                  />
                </div>
              )}
              <div className="form-group">
                <label>选择模型</label>
                <select
                  value={settings.selectedModel || modelName}
                  onChange={(e) => {
                    const newModel = e.target.value
                    setSettings({ ...settings, selectedModel: newModel })
                    setModelName(newModel)
                  }}
                >
                  <option value="">{modelName || '加载中...'}</option>
                  {modelsList.map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-secondary" onClick={() => setShowSettings(false)}>
                取消
              </button>
              <button className="btn-primary" onClick={handleSettingsSave}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
