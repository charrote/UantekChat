import { useState, useRef, useEffect, useCallback } from 'react'

interface BookStackPanelProps {
  isOpen: boolean
  onToggle: () => void
  initialUrl?: string
  onUrlChange?: (url: string) => void
  baseUrl: string
  apiToken: string
  title?: string
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

export function BookStackPanel({ isOpen, onToggle, onUrlChange, baseUrl, apiToken, title = 'Uantek 知识库' }: BookStackPanelProps) {
  const [width, setWidth] = useState(420)
  const [isResizing, setIsResizing] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [treeData, setTreeData] = useState<TreeNode[]>([])
  const [treeLoading, setTreeLoading] = useState(false)
  const [treeError, setTreeError] = useState('')
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null)
  const [contentOpen, setContentOpen] = useState(false)
  const [contentTitle, setContentTitle] = useState('')
  const [pageContent, setPageContent] = useState<string | null>(null)
  const [pageLoading, setPageLoading] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const closeContent = () => {
    setContentOpen(false)
    setPageContent(null)
    setPageLoading(false)
  }
  const panelRef = useRef<HTMLDivElement>(null)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)

  // Context tracking for add-directory action
  const [contextPath, setContextPath] = useState<number[] | null>(null)

  // Create directory modal
  const [showCreateDir, setShowCreateDir] = useState(false)
  const [createDirName, setCreateDirName] = useState('')
  const [createDirLoading, setCreateDirLoading] = useState(false)
  const [createDirError, setCreateDirError] = useState('')

  // Upload document modal
  const [showUpload, setShowUpload] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPageName, setUploadPageName] = useState('')
  const [uploadBookId, setUploadBookId] = useState<number | null>(null)
  const [uploadChapterId, setUploadChapterId] = useState<number | null>(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const proxyRequest = useCallback(async (path: string, method: string = 'GET', body?: any) => {
    const opts: RequestInit = { method }
    if (method === 'GET') {
      const params = new URLSearchParams({ baseUrl, token: apiToken, path })
      const res = await fetch(`/api/bookstack/proxy?${params}`, opts)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }
    const res = await fetch(`/api/bookstack/proxy`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, token: apiToken, path, body }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }, [baseUrl, apiToken])

  const fetchPageContent = useCallback(async (page: PageItem) => {
    setPageLoading(true)
    setPageContent(null)
    try {
      const data = await proxyRequest(`/api/pages/${page.id}`)
      setPageContent(data.html || '')
    } catch (err: any) {
      setPageContent(`<div class="bookstack-page-error">加载失败: ${err.message}</div>`)
    } finally {
      setPageLoading(false)
    }
  }, [proxyRequest])

  // Fetch tree structure via BookStack API (through backend proxy)
  const fetchTree = useCallback(async () => {
    if (!apiToken) {
      setTreeError('请在设置中配置 BookStack API Token')
      setTreeLoading(false)
      return
    }
    setTreeLoading(true)
    setTreeError('')
    try {
      const [booksData, allChaptersRes, allPagesRes] = await Promise.all([
        proxyRequest('/api/books'),
        proxyRequest('/api/chapters?count=500').catch(() => ({ data: [] })),
        proxyRequest('/api/pages?count=500').catch(() => ({ data: [] })),
      ])

      const books: BookItem[] = (booksData.data || []).map((b: any) => ({
        id: b.id, name: b.name, slug: b.slug,
      }))

      const allChapters: ChapterItem[] = (allChaptersRes.data || []).map((ch: any) => ({
        id: ch.id, name: ch.name, slug: ch.slug, book_id: ch.book_id,
      }))

      const allPages: PageItem[] = (allPagesRes.data || []).map((pg: any) => ({
        id: pg.id, name: pg.name, slug: pg.slug, book_id: pg.book_id, chapter_id: pg.chapter_id || null,
      }))

      const chaptersByBook = new Map<number, ChapterItem[]>()
      for (const ch of allChapters) {
        if (!chaptersByBook.has(ch.book_id)) chaptersByBook.set(ch.book_id, [])
        chaptersByBook.get(ch.book_id)!.push(ch)
      }

      const pagesByChapter = new Map<number | null, PageItem[]>()
      for (const pg of allPages) {
        const cid = pg.chapter_id
        if (!pagesByChapter.has(cid)) pagesByChapter.set(cid, [])
        pagesByChapter.get(cid)!.push(pg)
      }

      const tree: TreeNode[] = []
      for (const book of books) {
        const bookNode: TreeNode = {
          type: 'book',
          data: book,
          children: [],
          expanded: true,
        }

        const chapters = chaptersByBook.get(book.id) || []
        for (const chapter of chapters) {
          const chNode: TreeNode = {
            type: 'chapter',
            data: chapter,
            children: [],
            expanded: true,
          }
          const chPages = pagesByChapter.get(chapter.id) || []
          for (const pg of chPages) {
            chNode.children.push({ type: 'page', data: pg })
          }
          bookNode.children.push(chNode)
        }

        const unassignedPages = (pagesByChapter.get(null) || []).filter(pg => pg.book_id === book.id)
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
  }, [proxyRequest])

  useEffect(() => {
    if (isOpen && apiToken) {
      fetchTree()
    }
  }, [isOpen, apiToken, fetchTree])

  const toggleNode = (path: number[]) => {
    setContextPath(path)
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
    setContentTitle(page.name)
    setContentOpen(true)
    setSelectedPageId(page.id)
    setPageContent(null)
    onUrlChange?.(`/books/${page.book_id}/page/${page.slug || page.id}`)
    fetchPageContent(page)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      const searchUrl = `${baseUrl}/search?term=${encodeURIComponent(searchQuery.trim())}`
      window.open(searchUrl, '_blank')
    }
  }

  // Helper: get the context node from treeData and contextPath
  const getContextNode = useCallback((): { node: TreeNode; parentBook?: TreeNode } | null => {
    if (!contextPath || contextPath.length === 0) return null
    let current: TreeNode[] = treeData
    let node: TreeNode | undefined
    let parent: TreeNode | undefined
    for (let i = 0; i < contextPath.length; i++) {
      node = current[contextPath[i]]
      if (!node) return null
      if (i < contextPath.length - 1) parent = node
      if (node.type === 'page') break
      current = node.children
    }
    if (!node) return null
    return { node, parentBook: parent?.type === 'book' ? parent : undefined }
  }, [contextPath, treeData])

  const getContextDirType = useCallback((): { type: 'book' | 'chapter'; bookId?: number; chapterId?: number } => {
    const ctx = getContextNode()
    if (!ctx) return { type: 'book' }
    if (ctx.node.type === 'book') {
      return { type: 'chapter', bookId: ctx.node.data.id }
    }
    if (ctx.node.type === 'chapter') {
      const bookId = ctx.node.data.book_id || ctx.parentBook?.data.id
      return { type: 'chapter', bookId, chapterId: ctx.node.data.id }
    }
    if (ctx.node.type === 'page') {
      const nodeData = ctx.node.data as PageItem
      let bookId = nodeData.book_id
      if (!bookId && ctx.parentBook) bookId = ctx.parentBook.data.id
      return { type: 'chapter', bookId, chapterId: nodeData.chapter_id ?? undefined }
    }
    return { type: 'book' }
  }, [getContextNode])

  // Create directory
  const handleCreateDir = async () => {
    if (!createDirName.trim()) {
      setCreateDirError('请输入名称')
      return
    }
    setCreateDirLoading(true)
    setCreateDirError('')
    try {
      const dirType = getContextDirType()
      let result: any
      if (dirType.type === 'book') {
        result = await proxyRequest('/api/books', 'POST', { name: createDirName.trim() })
      } else {
        result = await proxyRequest('/api/chapters', 'POST', {
          book_id: dirType.bookId,
          name: createDirName.trim(),
        })
      }
      if (result && result.id) {
        setShowCreateDir(false)
        setCreateDirName('')
        fetchTree()
      } else {
        setCreateDirError('创建失败: 未知响应')
      }
    } catch (err: any) {
      setCreateDirError(err.message || '创建失败')
    } finally {
      setCreateDirLoading(false)
    }
  }

  // Upload document
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFile(file)
    const name = file.name.replace(/\.[^.]+$/, '')
    setUploadPageName(name)
    setShowUpload(true)
  }

  const handleUploadDoc = async () => {
    if (!uploadFile || !uploadPageName.trim()) {
      setUploadError('请选择文件并输入名称')
      return
    }
    if (!uploadBookId) {
      setUploadError('请选择所属书籍')
      return
    }
    setUploadLoading(true)
    setUploadError('')
    try {
      const text = await uploadFile.text()
      const html = uploadFile.name.match(/\.md$/i)
        ? `<div class="markdown-content"><pre>${escapeHtml(text)}</pre></div>`
        : uploadFile.name.match(/\.html?$/i)
          ? text
          : `<pre>${escapeHtml(text)}</pre>`

      const body: any = {
        book_id: uploadBookId,
        name: uploadPageName.trim(),
        html,
      }
      if (uploadChapterId) body.chapter_id = uploadChapterId

      const result = await proxyRequest('/api/pages', 'POST', body)
      if (result && result.id) {
        setShowUpload(false)
        setUploadFile(null)
        setUploadPageName('')
        setUploadBookId(null)
        setUploadChapterId(null)
        fetchTree()
      } else {
        setUploadError('上传失败: 未知响应')
      }
    } catch (err: any) {
      setUploadError(err.message || '上传失败')
    } finally {
      setUploadLoading(false)
    }
  }

  function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
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
    const isContext = contextPath && contextPath.length === path.length && contextPath.every((v, i) => v === path[i])
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
          className={`bookstack-tree-item bookstack-tree-${node.type}${isContext ? ' context' : ''}`}
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
          title={`打开 ${title}`}
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
          <span>{title}</span>
        </div>
        <div className="bookstack-panel-actions">
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
        <div className="bookstack-tree-panel">
          <div className="bookstack-action-bar">
            <span className="bookstack-action-bar-label">目录结构</span>
            <div className="bookstack-action-bar-buttons">
              {treeData.length > 0 && (
                <button className="bookstack-action-bar-btn" onClick={fetchTree} title="刷新">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                </button>
              )}
              <button className="bookstack-action-bar-btn" onClick={() => document.getElementById('bookstack-file-input')?.click()} title="上传知识文档">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </button>
              <button className="bookstack-action-bar-btn" onClick={() => { setCreateDirName(''); setCreateDirError(''); setShowCreateDir(true) }} title="新增目录">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  <line x1="12" y1="11" x2="12" y2="17" />
                  <line x1="9" y1="14" x2="15" y2="14" />
                </svg>
              </button>
            </div>
          </div>
          <input
            id="bookstack-file-input"
            type="file"
            accept=".md,.txt,.html,.htm"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <div className="bookstack-tree-scroll">
            {!apiToken ? (
              <div className="bookstack-tree-error">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>请在设置中配置 BookStack API Token</span>
              </div>
            ) : treeLoading ? (
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
        {contentOpen && (
          <div className={`bookstack-content-overlay${maximized ? ' maximized' : ''}`}>
            <div className="bookstack-overlay-header">
              <span className="bookstack-overlay-title">{contentTitle}</span>
              <div className="bookstack-overlay-actions">
                <button className="bookstack-action-btn" onClick={() => setMaximized(v => !v)} title={maximized ? '还原' : '全屏阅读'}>
                  {maximized ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="4 14 10 14 10 20" />
                      <polyline points="20 10 14 10 14 4" />
                      <line x1="14" y1="10" x2="21" y2="3" />
                      <line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 3 21 3 21 9" />
                      <polyline points="9 21 3 21 3 15" />
                      <line x1="21" y1="3" x2="14" y2="10" />
                      <line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                  )}
                </button>
                <button className="bookstack-overlay-close" onClick={closeContent} title="关闭内容">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="bookstack-page-content">
              {pageLoading ? (
                <div className="bookstack-tree-loading">
                  <div className="thinking-loading">
                    <span className="thinking-loading-dot"></span>
                    <span className="thinking-loading-dot"></span>
                    <span className="thinking-loading-dot"></span>
                  </div>
                  <span>加载文档内容...</span>
                </div>
              ) : pageContent ? (
                <div
                  className="bookstack-page-html"
                  dangerouslySetInnerHTML={{ __html: pageContent }}
                />
              ) : (
                <div className="bookstack-tree-empty">请选择一个文档</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create directory modal */}
      {showCreateDir && (
        <div className="bookstack-modal-overlay" onClick={() => setShowCreateDir(false)}>
          <div className="bookstack-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bookstack-modal-header">
              <h3>新增{getContextDirType().type === 'book' ? '书籍' : '章节'}</h3>
              <button className="bookstack-action-btn" onClick={() => setShowCreateDir(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="bookstack-modal-body">
              <div className="bookstack-modal-info">
                类型: {getContextDirType().type === 'book' ? '📚 书籍 (顶级)' : `📁 章节 (属于 ${treeData.find(b => b.data.id === getContextDirType().bookId)?.data.name || '所选书籍'})`}
              </div>
              <input
                className="bookstack-modal-input"
                type="text"
                value={createDirName}
                onChange={(e) => setCreateDirName(e.target.value)}
                placeholder={getContextDirType().type === 'book' ? '输入书籍名称' : '输入章节名称'}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreateDir()}
              />
              {createDirError && <div className="bookstack-modal-error">{createDirError}</div>}
            </div>
            <div className="bookstack-modal-actions">
              <button className="btn-secondary" onClick={() => setShowCreateDir(false)}>取消</button>
              <button className="btn-primary" onClick={handleCreateDir} disabled={createDirLoading}>
                {createDirLoading ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload document modal */}
      {showUpload && (
        <div className="bookstack-modal-overlay" onClick={() => setShowUpload(false)}>
          <div className="bookstack-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bookstack-modal-header">
              <h3>上传知识文档</h3>
              <button className="bookstack-action-btn" onClick={() => setShowUpload(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="bookstack-modal-body">
              <div className="bookstack-modal-info">
                文件: {uploadFile?.name}
              </div>
              <input
                className="bookstack-modal-input"
                type="text"
                value={uploadPageName}
                onChange={(e) => setUploadPageName(e.target.value)}
                placeholder="文档名称"
                autoFocus
              />
              <select
                className="bookstack-modal-select"
                value={uploadBookId ?? ''}
                onChange={(e) => { setUploadBookId(e.target.value ? Number(e.target.value) : null); setUploadChapterId(null) }}
              >
                <option value="">选择所属书籍</option>
                {treeData.filter((n): n is TreeNode & { type: 'book' } => n.type === 'book').map(book => (
                  <option key={book.data.id} value={book.data.id}>{book.data.name}</option>
                ))}
              </select>
              {uploadBookId && (
                <select
                  className="bookstack-modal-select"
                  value={uploadChapterId ?? ''}
                  onChange={(e) => setUploadChapterId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">无章节 (直接归属于书籍)</option>
                  {(() => {
                    const book = treeData.find((n): n is TreeNode & { type: 'book' } => n.type === 'book' && n.data.id === uploadBookId)
                    if (!book) return null
                    return book.children
                      .filter((c): c is TreeNode & { type: 'chapter' } => c.type === 'chapter')
                      .map(ch => (
                        <option key={ch.data.id} value={ch.data.id}>{ch.data.name}</option>
                      ))
                  })()}
                </select>
              )}
              {uploadError && <div className="bookstack-modal-error">{uploadError}</div>}
            </div>
            <div className="bookstack-modal-actions">
              <button className="btn-secondary" onClick={() => setShowUpload(false)}>取消</button>
              <button className="btn-primary" onClick={handleUploadDoc} disabled={uploadLoading || !uploadBookId}>
                {uploadLoading ? '上传中...' : '上传'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
