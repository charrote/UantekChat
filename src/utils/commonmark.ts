import { unified } from 'unified'
import parse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import gfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import type { Element, Root } from 'hast'

/**
 * Get the configured BookStack base URL from localStorage
 */
function getBookStackBaseUrl(): string {
  try {
    const saved = localStorage.getItem('bookstack-settings')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed.host) {
        return `http://${parsed.host}:${parsed.port || '6875'}`
      }
    }
  } catch {}
  return 'http://localhost:6875'
}

/**
 * Check if a URL is a BookStack internal link
 */
function isBookStackUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    // Check against configured BookStack URL
    const bkUrl = getBookStackBaseUrl()
    const bkParsed = new URL(bkUrl)
    if (parsed.hostname === bkParsed.hostname && parsed.port === bkParsed.port) {
      return true
    }
    // Also accept localhost:6875 as fallback
    if (parsed.hostname === 'localhost' && parsed.port === '6875') {
      return true
    }
    return false
  } catch {
    // Relative URLs starting with /books/, /shelves/, /pages/ etc.
    return url.startsWith('/books/') ||
           url.startsWith('/shelves/') ||
           url.startsWith('/pages/') ||
           url.startsWith('/chapters/') ||
           url.startsWith('/search')
  }
}

/**
 * Convert a URL to absolute BookStack URL for panel navigation
 */
function toBookStackUrl(url: string): string {
  if (url.startsWith('http')) return url
  const base = getBookStackBaseUrl()
  if (url.startsWith('/')) return `${base}${url}`
  return `${base}/${url}`
}

function rehypeMermaid() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName === 'pre') {
        const codeNode = node.children?.[0] as Element | undefined
        if (codeNode?.tagName === 'code') {
          const className = codeNode.properties?.className as string[] | undefined
          if (className?.includes('language-mermaid')) {
            const source = codeNode.children
              ?.map(child => {
                if (child.type === 'text') return child.value
                if (child.type === 'element') {
                  return child.children
                    ?.map(c => c.type === 'text' ? c.value : '')
                    .join('')
                }
                return ''
              })
              .join('') || ''
            node.tagName = 'div'
            node.properties = { className: ['mermaid'] }
            node.children = [{ type: 'text', value: source }]
          }
        }
      }
    })
  }
}

function rehypeCodeCopyButton() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName === 'pre') {
        const codeNode = node.children?.[0] as Element | undefined
        if (codeNode?.tagName === 'code') {
          const className = codeNode.properties?.className as string[] | undefined
          const langClass = className?.find(c => c.startsWith('language-'))
          const lang = langClass ? langClass.replace('language-', '') : ''
          
          // Extract text content from code node
          const codeText = codeNode.children
            ?.map(child => {
              if (child.type === 'text') return child.value
              if (child.type === 'element') {
                return child.children
                  ?.map(c => c.type === 'text' ? c.value : '')
                  .join('')
              }
              return ''
            })
            .join('') || ''
          
          // Add header with language label and copy button
          node.children.unshift({
            type: 'element',
            tagName: 'div',
            properties: { className: ['code-header'] },
            children: [
              {
                type: 'element',
                tagName: 'span',
                properties: {},
                children: [{ type: 'text', value: lang || 'code' }]
              },
              {
                type: 'element',
                tagName: 'button',
                properties: {
                  className: ['copy-btn'],
                  onclick: `(function(){navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(codeText)}'));this.textContent='已复制';setTimeout(()=>this.textContent='复制',1500)})()`
                },
                children: [{ type: 'text', value: '复制' }]
              }
            ]
          })
        }
      }
    })
  }
}

/**
 * Transform BookStack source links to open in the right panel
 */
function rehypeBookStackLinks() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName === 'a' && node.properties?.href) {
        const href = String(node.properties.href)
        if (isBookStackUrl(href)) {
          const absoluteUrl = toBookStackUrl(href)
          node.properties = {
            ...node.properties,
            className: ['source-link'],
            'data-bookstack-url': absoluteUrl,
            href: 'javascript:void(0)',
            onclick: `window.postMessage({type:'bookstack-navigate',url:'${absoluteUrl.replace(/'/g, "\\'")}'},'*')`
          }
          // Add book icon as child if not already present
          const hasIcon = node.children.some(
            (child: any) => child.type === 'element' && child.tagName === 'svg'
          )
          if (!hasIcon) {
            node.children.unshift({
              type: 'element',
              tagName: 'svg',
              properties: {
                width: '12',
                height: '12',
                viewBox: '0 0 24 24',
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: '2'
              },
              children: [
                {
                  type: 'element',
                  tagName: 'path',
                  properties: { d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' },
                  children: []
                },
                {
                  type: 'element',
                  tagName: 'path',
                  properties: { d: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' },
                  children: []
                }
              ]
            } as any)
          }
        }
      }
    })
  }
}

const processor = unified()
  .use(parse)
  .use(gfm)
  .use(remarkRehype, {
    allowDangerousHtml: true,
    allowDangerousCharacters: true
  })
  .use(rehypeMermaid)
  .use(rehypeCodeCopyButton)
  .use(rehypeBookStackLinks)
  .use(rehypeStringify, {
    allowDangerousHtml: true,
    allowDangerousCharacters: true
  })

export function renderMarkdown(markdown: string): string {
  try {
    const result = processor.processSync(markdown)
    return String(result)
  } catch (error) {
    console.error('Markdown parsing error:', error)
    return markdown
  }
}
