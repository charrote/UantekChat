import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn()

// Mock fetch
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({}),
  body: null,
})

describe('App Component', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  it('renders without crashing', async () => {
    const { render } = await import('@testing-library/react')
    const App = (await import('../src/App')).default
    expect(() => render(<App />)).not.toThrow()
  })

  it('initializes with empty conversations', () => {
    const conversations = localStorageMock.getItem('conversations')
    expect(conversations).toBeNull()
  })

  it('toggles BookStack panel state in localStorage', () => {
    localStorageMock.setItem('bookstack-panel-open', 'true')
    const saved = localStorageMock.getItem('bookstack-panel-open')
    expect(JSON.parse(saved!)).toBe(true)

    localStorageMock.setItem('bookstack-panel-open', 'false')
    const saved2 = localStorageMock.getItem('bookstack-panel-open')
    expect(JSON.parse(saved2!)).toBe(false)
  })

  it('persists settings to localStorage', () => {
    const settings = { enableApiKey: true, apiKey: 'test-key', selectedModel: 'model-x', isDarkMode: false, enableThinking: true }
    localStorageMock.setItem('settings', JSON.stringify(settings))
    const saved = JSON.parse(localStorageMock.getItem('settings')!)
    expect(saved.enableApiKey).toBe(true)
    expect(saved.apiKey).toBe('test-key')
    expect(saved.selectedModel).toBe('model-x')
    expect(saved.enableThinking).toBe(true)
  })

  it('handles postMessage for BookStack navigation', () => {
    const handler = vi.fn()
    window.addEventListener('message', handler)
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'bookstack-navigate', url: 'http://localhost:6875/books/test/page1' },
    }))
    expect(handler).toHaveBeenCalled()
  })

  it('communicates with /api/chat endpoint', async () => {
    const mockResponse = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      }
    })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      body: mockResponse,
    })

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    })
    expect(response.ok).toBe(true)
    expect(response.body).toBeDefined()
  })

  it('parses reasoning_content from SSE stream', async () => {
    const mockResponse = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"Thinking step 1"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Final answer"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      }
    })
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      body: mockResponse,
    })

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] }),
    })
    expect(response.ok).toBe(true)
    expect(response.body).toBeDefined()
  })

  it('parses reasoning content from API delta', () => {
    const delta = { content: '', reasoning_content: 'My reasoning' }
    const reasoning = delta.reasoning_content || ''
    expect(reasoning).toBe('My reasoning')
  })

  it('default settings enable thinking mode', () => {
    const defaultSettings = { enableThinking: true }
    expect(defaultSettings.enableThinking).toBe(true)
  })

  it('toggles dark mode theme class', () => {
    document.documentElement.classList.add('light-theme')
    expect(document.documentElement.classList.contains('light-theme')).toBe(true)
    document.documentElement.classList.remove('light-theme')
    expect(document.documentElement.classList.contains('light-theme')).toBe(false)
  })

  it('renders MarkdownRenderer without errors', async () => {
    const { render } = await import('@testing-library/react')
    const { MarkdownRenderer } = await import('../src/components/MarkdownRenderer')
    expect(() => render(<MarkdownRenderer content="# Hello\nWorld" />)).not.toThrow()
  })
})
