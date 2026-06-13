import { useState, useRef, useEffect, useCallback } from 'react'

interface BookStackPanelProps {
  isOpen: boolean
  onToggle: () => void
  initialUrl?: string
  onUrlChange?: (url: string) => void
}

const BOOKSTACK_BASE_URL = 'http://localhost:6875'
const DEFAULT_SHELVES_URL = `${BOOKSTACK_BASE_URL}/shelves`

export function BookStackPanel({ isOpen, onToggle, initialUrl, onUrlChange }: BookStackPanelProps) {
  const [width, setWidth] = useState(420)
  const [isResizing, setIsResizing] = useState(false)
  const [iframeUrl, setIframeUrl] = useState(initialUrl || DEFAULT_SHELVES_URL)
  const [history, setHistory] = useState<string[]>([initialUrl || DEFAULT_SHELVES_URL])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)

  // Update iframe URL when initialUrl prop changes (from chat source links)
  useEffect(() => {
    if (initialUrl && initialUrl !== iframeUrl) {
      navigateTo(initialUrl)
    }
  }, [initialUrl])

  const navigateTo = useCallback((url: string) => {
    setIframeUrl(url)
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1)
      newHistory.push(url)
      return newHistory
    })
    setHistoryIndex(prev => prev + 1)
    onUrlChange?.(url)
  }, [historyIndex, onUrlChange])

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      const url = history[newIndex]
      setIframeUrl(url)
      onUrlChange?.(url)
    }
  }, [history, historyIndex, onUrlChange])

  const goForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      const url = history[newIndex]
      setIframeUrl(url)
      onUrlChange?.(url)
    }
  }, [history, historyIndex, onUrlChange])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      const searchUrl = `${BOOKSTACK_BASE_URL}/search?term=${encodeURIComponent(searchQuery.trim())}`
      navigateTo(searchUrl)
    }
  }

  const handleHome = () => {
    navigateTo(DEFAULT_SHELVES_URL)
  }

  // Resize handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    resizeStartX.current = e.clientX
    resizeStartWidth.current = width
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const delta = resizeStartX.current - e.clientX
      const newWidth = Math.max(280, Math.min(800, resizeStartWidth.current + delta))
      setWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing])

  // Handle messages from iframe (if BookStack sends any via postMessage)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from BookStack domain
      if (event.origin !== BOOKSTACK_BASE_URL) return
      // Handle navigation messages if BookStack supports them
      if (event.data?.type === 'navigation' && event.data?.url) {
        navigateTo(event.data.url)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [navigateTo])

  if (!isOpen) {
    return (
      <button
        className="bookstack-toggle-btn"
        onClick={onToggle}
        title="打开 BookStack 知识库"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <span>知识库</span>
      </button>
    )
  }

  return (
    <div
      ref={panelRef}
      className={`bookstack-panel ${isResizing ? 'resizing' : ''}`}
      style={{ width: `${width}px` }}
    >
      <div
        className="bookstack-resize-handle"
        onMouseDown={handleResizeStart}
        title="拖拽调整宽度"
      >
        <div className="resize-indicator" />
      </div>

      <div className="bookstack-panel-header">
        <div className="bookstack-panel-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <span>BookStack 知识库</span>
        </div>
        <div className="bookstack-panel-actions">
          <button
            className="bookstack-action-btn"
            onClick={handleHome}
            title="首页"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </button>
          <button
            className="bookstack-action-btn"
            onClick={goBack}
            disabled={historyIndex <= 0}
            title="后退"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            className="bookstack-action-btn"
            onClick={goForward}
            disabled={historyIndex >= history.length - 1}
            title="前进"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <button
            className="bookstack-action-btn"
            onClick={onToggle}
            title="收起面板"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="11 17 6 12 11 7" />
              <polyline points="18 17 13 12 18 7" />
            </svg>
          </button>
        </div>
      </div>

      <form className="bookstack-search" onSubmit={handleSearch}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索知识库..."
        />
        <button type="submit" className="bookstack-search-btn">
          搜索
        </button>
      </form>

      <div className="bookstack-iframe-wrapper">
        <iframe
          ref={iframeRef}
          src={iframeUrl}
          className="bookstack-iframe"
          title="BookStack"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
    </div>
  )
}
