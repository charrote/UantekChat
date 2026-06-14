import { useState, useRef, useEffect, useCallback } from 'react'

interface BookStackPanelProps {
  isOpen: boolean
  onToggle: () => void
  initialUrl?: string
  onUrlChange?: (url: string) => void
  baseUrl: string
  apiToken: string
}

interface BookItem {
  id: number
  name: string
  slug: string
}

interface ChapterItem {
  id: number
  name: string
  slug: string
  book_id: number
}

interface PageItem {
  id: number
  name: string
  slug: string
  book_id: number
  chapter_id: number | null
}

type TreeNode = {
  type: 'book'
  data: BookItem
  children: TreeNode[]
  expanded: boolean
} | {
  type: 'chapter'
  data: ChapterItem
  children: TreeNode[]
  expanded: boolean
} | {
  type: 'page'
  data: PageItem
}

export function BookStackPanel({ isOpen, onToggle, initialUrl, onUrlChange, baseUrl, apiToken }: BookStackPanelProps) {
  const [width, setWidth] = useState(420)
  const [isResizing, setIsResizing] = useState(false)
  const [iframeUrl, setIframeUrl] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [searchQuery, setSearchQuery] = useState('')
  const [treeData, setTreeData] = useState<TreeNode[]>([])
  const [treeLoading, setTreeLoading] = useState(false)
  const [treeError, setTreeError] = useState('')
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)
  const defaultUrl = `${baseUrl}/shelves`

  useEffect(() => {
    if (!iframeUrl) {
      setIframeUrl(defaultUrl)
      setHistory([defaultUrl])
      setHistoryIndex(0)
    }
  }, [baseUrl])

  // Fetch tree structure via BookStack API
  const fetchTree = useCallback(async () => {
    if (!apiToken) {
      setTreeError('请在设置中配置 BookStack API Token')
      setTreeLoading(false)
      return
    }
    setTreeLoading(true)
    setTreeError('')
    try {
      const headers: Record<string, string> = {
        'Authorization': `Token ${apiToken}`,
        'Content-Type': 'application/json',
      }
      const apiBase = baseUrl.replace(/\/+$/, '')
      const booksRes = await fetch(`${apiBase}/api/books`, { headers })
      if (!booksRes.ok) throw new Error(`HTTP ${booksRes.status}`)
      const booksData = await booksRes.json()
      const books: BookItem[] = (booksData.data || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
      }))

      const tree: TreeNode[] = []
      for (const book of books) {
        const bookNode: TreeNode = {
          type: 'book',
          data: book,
          children: [],
          expanded: false,
        }

        const chaptersRes = await fetch(`${apiBase}/api/books/${book.id}/chapters`, { headers })
        const chapters: ChapterItem[] = []
        if (chaptersRes.ok) {
          const chData = await chaptersRes.json()
          for (const ch of (chData.data || [])) {
            chapters.push({
              id: ch.id,
              name: ch.name,
              slug: ch.slug,
              book_id: book.id,
            })
          }
        }

        const pagesRes = await fetch(`${apiBase}/api/books/${book.id}/pages`, { headers })
        const bookPages: PageItem[] = []
        if (pagesRes.ok) {
          const pgData = await pagesRes.json()
          for (const pg of (pgData.data || [])) {
            bookPages.push({
              id: pg.id,
              name: pg.name,
              slug: pg.slug,
              book_id: book.id,
              chapter_id: pg.chapter_id || null,
            })
          }
        }

        const pagesByChapter = new Map<number | null, PageItem[]>()
        for (const pg of bookPages) {
          const cid = pg.chapter_id
          if (!pagesByChapter.has(cid)) pagesByChapter.set(cid, [])
          pagesByChapter.get(cid)!.push(pg)
        }

        for (const chapter of chapters) {
          const chNode: TreeNode = {
            type: 'chapter',
            data: chapter,
            children: [],
            expanded: false,
          }
          const chPages = pagesByChapter.get(chapter.id) || []
          for (const pg of chPages) {
            chNode.children.push({ type: 'page', data: pg })
          }
          bookNode.children.push(chNode)
        }

        const unassignedPages = pagesByChapter.get(null) || []
        for (const pg of unassignedPages) {
          bookNode.children.push({ type: 'page', data: pg })
        }

        tree.push(bookNode)
      }
      setTreeData(tree)
    } catch (err: any) {
      setTreeError(err.message || '无法加载知识库结构')
    } finally {
      setTreeLoading(false)
    }
  }, [baseUrl, apiToken])

  useEffect(() => {
    if (isOpen && apiToken) {
      fetchTree()
    }
  }, [isOpen, apiToken, fetchTree])

  const toggleNode = (path: number[]) => {
    setTreeData(prev => {
      const newTree = structuredClone(prev)
      let node: TreeNode | undefined
      let current: TreeNode[] = newTree
      for (const idx of path) {
        node = current[idx]
        if (!node || node.type === 'page') break
        current = node.children
      }
      if (node && (node.type === 'book' || node.type === 'chapter')) {
        node.expanded = !node.expanded
      }
      return newTree
    })
  }

  const navigateToPage = (page: PageItem) => {
    const url = `${baseUrl}/books/${page.book_id}/page/${page.slug || page.id}`
    setIframeUrl(url)
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1)
      newHistory.push(url)
      return newHistory
    })
    setHistoryIndex(prev => prev + 1)
    setSelectedPageId(page.id)
    onUrlChange?.(url)
  }

  // Update iframe URL when initialUrl prop changes (from chat source links)
  useEffect(() => {
    if (initialUrl && initialUrl !== iframeUrl) {
      setIframeUrl(initialUrl)
      setHistory(prev => {
        const newHistory = prev.slice(0, historyIndex + 1)
        newHistory.push(initialUrl)
        return newHistory
      })
      setHistoryIndex(prev => prev + 1)
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
      setIframeUrl(history[newIndex])
      onUrlChange?.(history[newIndex])
    }
  }, [history, historyIndex, onUrlChange])

  const goForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      setIframeUrl(history[newIndex])
      onUrlChange?.(history[newIndex])
    }
  }, [history, historyIndex, onUrlChange])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      const searchUrl = `${baseUrl}/search?term=${encodeURIComponent(searchQuery.trim())}`
      navigateTo(searchUrl)
    }
  }

  const handleHome = () => {
    navigateTo(defaultUrl)
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
      const newWidth = Math.max(380, Math.min(900, resizeStartWidth.current + delta))
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

  const renderTreeNode = (node: TreeNode, path: number[], depth: number = 0): React.ReactNode => {
    if (node.type === 'page') {
      return (
        <div
          key={`page-${node.data.id}`}
          className={`bookstack-tree-item bookstack-tree-page ${selectedPageId === node.data.id ? 'selected' : ''}`}
          style={{ paddingLeft: `${16 + depth * 16}px` }}
          onClick={() => navigateToPage(node.data)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span>{node.data.name}</span>
        </div>
      )
    }

    const isExpanded = node.expanded
    const icon = node.type === 'book' ? (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ) : (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    )

    return (
      <div key={`${node.type}-${node.data.id}`}>
        <div
          className={`bookstack-tree-item bookstack-tree-${node.type}`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          onClick={() => toggleNode(path)}
        >
          <span className={`bookstack-tree-arrow ${isExpanded ? 'expanded' : ''}`}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </span>
          {icon}
          <span>{node.data.name}</span>
        </div>
        {isExpanded && node.children.map((child, idx) => renderTreeNode(child, [...path, idx], depth + 1))}
      </div>
    )
  }

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

      <div className="bookstack-content">
        {apiToken && (
          <div className="bookstack-tree-panel">
            <div className="bookstack-tree-header">
              <span>目录结构</span>
              {treeData.length > 0 && (
                <button className="bookstack-tree-refresh" onClick={fetchTree} title="刷新">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                </button>
              )}
            </div>
            <div className="bookstack-tree-scroll">
              {treeLoading ? (
                <div className="bookstack-tree-loading">
                  <div className="thinking-loading">
                    <span className="thinking-loading-dot"></span>
                    <span className="thinking-loading-dot"></span>
                    <span className="thinking-loading-dot"></span>
                  </div>
                  <span>加载知识库结构...</span>
                </div>
              ) : treeError ? (
                <div className="bookstack-tree-error">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{treeError}</span>
                </div>
              ) : treeData.length === 0 ? (
                <div className="bookstack-tree-empty">未找到书籍数据</div>
              ) : (
                treeData.map((node, idx) => renderTreeNode(node, [idx]))
              )}
            </div>
          </div>
        )}
        <div className="bookstack-iframe-wrapper">
          {iframeUrl && (
            <iframe
              ref={iframeRef}
              src={iframeUrl}
              className="bookstack-iframe"
              title="BookStack"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            />
          )}
        </div>
      </div>
    </div>
  )
}
