import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../src/utils/commonmark'

describe('renderMarkdown', () => {
  it('renders plain text', () => {
    const result = renderMarkdown('Hello World')
    expect(result).toContain('Hello World')
  })

  it('renders headings', () => {
    const result = renderMarkdown('# H1\n## H2\n### H3')
    expect(result).toContain('H1')
    expect(result).toContain('H2')
    expect(result).toContain('H3')
  })

  it('renders bold and italic', () => {
    const result = renderMarkdown('**bold** and *italic*')
    expect(result).toContain('bold')
    expect(result).toContain('italic')
  })

  it('renders links', () => {
    const result = renderMarkdown('[text](http://example.com)')
    expect(result).toContain('http://example.com')
  })

  it('renders code blocks', () => {
    const result = renderMarkdown('```python\nprint("hello")\n```')
    expect(result).toContain('print')
  })

  it('renders tables', () => {
    const result = renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 |')
    expect(result).toContain('A')
    expect(result).toContain('B')
  })

  it('renders mermaid code blocks', () => {
    const result = renderMarkdown('```mermaid\ngraph TD\nA-->B\n```')
    expect(result).toContain('mermaid')
  })

  it('handles empty input', () => {
    expect(renderMarkdown('')).toBe('')
  })

  it('handles invalid markdown gracefully', () => {
    const result = renderMarkdown(null as unknown as string)
    expect(result).toBeDefined()
  })
})
