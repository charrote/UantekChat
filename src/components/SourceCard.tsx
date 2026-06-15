interface SourceItem {
  title: string
  url: string
  score: number
  type?: 'rag' | 'web'
}

interface SourceCardProps {
  source: SourceItem
}

export function SourceCard({ source }: SourceCardProps) {
  const confidence = Math.round(source.score * 100)
  const confidenceLevel = confidence >= 80 ? 'high' : confidence >= 50 ? 'medium' : 'low'

  const handleClick = () => {
    if (source.url) {
      window.open(source.url, '_blank')
    }
  }

  return (
    <div className="source-card" onClick={handleClick}>
      <div className="source-card-main">
        {source.type === 'web' ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
        )}
        <div className="source-card-info">
          <span className="source-card-title">{source.title || '未知来源'}</span>
          {source.type && (
            <span className={`source-card-type ${source.type}`}>
              {source.type === 'web' ? '网络' : '知识库'}
            </span>
          )}
        </div>
      </div>
      <div className={`source-card-score ${confidenceLevel}`}>
        {confidence}%
      </div>
    </div>
  )
}
