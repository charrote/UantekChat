import { useEffect, useRef, useState } from 'react'
import { renderMarkdown } from '../utils/commonmark'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
})

interface MarkdownRendererProps {
  content: string
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [html, setHtml] = useState<string>('')

  useEffect(() => {
    setHtml(renderMarkdown(content))
  }, [content])

  useEffect(() => {
    if (!containerRef.current) return
    const mermaidElements = containerRef.current.querySelectorAll<HTMLElement>('.mermaid')
    if (mermaidElements.length === 0) return

    const renderDiagrams = async () => {
      for (const el of Array.from(mermaidElements)) {
        const source = el.textContent || ''
        if (!source.trim()) continue
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        try {
          const { svg } = await mermaid.render(id, source, el)
          el.innerHTML = svg
        } catch (error) {
          console.error('Mermaid diagram render failed:', error, 'Source:', source)
          el.innerHTML = `<pre class="mermaid-fallback"><code>${escapeHtml(source)}</code></pre>`
        }
      }
    }
    renderDiagrams()
  }, [html])

  function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  return (
    <div 
      ref={containerRef}
      className="markdown-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
