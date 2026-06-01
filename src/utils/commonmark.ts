import { unified } from 'unified'
import parse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import gfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import type { Element, Root } from 'hast'

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

const processor = unified()
  .use(parse)
  .use(gfm)
  .use(remarkRehype, {
    allowDangerousHtml: true,
    allowDangerousCharacters: true
  })
  .use(rehypeMermaid)
  .use(rehypeCodeCopyButton)
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
