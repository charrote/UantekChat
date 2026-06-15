import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BookStackPanel } from '../src/components/BookStackPanel'

describe('BookStackPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders toggle button when closed', () => {
    render(<BookStackPanel isOpen={false} onToggle={() => {}} />)
    const btn = screen.getByTitle('打开 Uantek 知识库')
    expect(btn).toBeDefined()
  })

  it('renders panel when open', () => {
    render(<BookStackPanel isOpen={true} onToggle={() => {}} />)
    expect(screen.getByText('Uantek 知识库')).toBeDefined()
  })

  it('calls onToggle when toggle button clicked', () => {
    const onToggle = vi.fn()
    render(<BookStackPanel isOpen={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByTitle('打开 Uantek 知识库'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('renders navigation buttons when open', () => {
    render(<BookStackPanel isOpen={true} onToggle={() => {}} />)
    expect(screen.getByTitle('首页')).toBeDefined()
    expect(screen.getByTitle('后退')).toBeDefined()
    expect(screen.getByTitle('前进')).toBeDefined()
    expect(screen.getByTitle('收起面板')).toBeDefined()
  })

  it('renders search input when open', () => {
    render(<BookStackPanel isOpen={true} onToggle={() => {}} />)
    expect(screen.getByPlaceholderText('搜索知识库...')).toBeDefined()
  })

  it('does not render iframe when no content is opened', () => {
    render(<BookStackPanel isOpen={true} onToggle={() => {}} />)
    const iframe = document.querySelector('iframe')
    expect(iframe).toBeNull()
  })

  it('opens content overlay when initialUrl prop changes', () => {
    const { rerender } = render(
      <BookStackPanel isOpen={true} onToggle={() => {}} />
    )
    expect(document.querySelector('.bookstack-content-overlay')).toBeNull()

    rerender(
      <BookStackPanel isOpen={true} onToggle={() => {}} initialUrl="http://localhost:6875/shelves" />
    )

    const overlay = document.querySelector('.bookstack-content-overlay')
    expect(overlay).not.toBeNull()
    const iframe = overlay!.querySelector('iframe') as HTMLIFrameElement
    expect(iframe.src).toContain('/shelves')
  })

  it('handles search form submission', () => {
    render(<BookStackPanel isOpen={true} onToggle={() => {}} />)
    const input = screen.getByPlaceholderText('搜索知识库...') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'test query' } })
    fireEvent.submit(screen.getByText('搜索').closest('form')!)
    const iframe = document.querySelector('iframe') as HTMLIFrameElement
    expect(iframe.src).toContain('search')
    expect(decodeURIComponent(iframe.src)).toContain('test query')
  })

  it('disables back button at start', () => {
    render(<BookStackPanel isOpen={true} onToggle={() => {}} />)
    expect(screen.getByTitle('后退')).toBeDisabled()
  })

  it('disables forward button at start', () => {
    render(<BookStackPanel isOpen={true} onToggle={() => {}} />)
    expect(screen.getByTitle('前进')).toBeDisabled()
  })
})
