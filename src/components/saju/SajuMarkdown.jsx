import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function ResultPaw({ children, as: Tag = 'p', className = '' }) {
  return (
    <Tag className={`result-line ${className}`.trim()}>
      <span className="result-paw" aria-hidden="true">
        🐾
      </span>
      <span className="result-line-body">{children}</span>
    </Tag>
  )
}

function flattenText(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (node?.props?.children) return flattenText(node.props.children)
  return ''
}

function isSummaryHeading(children) {
  return /한\s*줄\s*요약/.test(flattenText(children))
}

export const resultMarkdownComponents = {
  p: ({ children }) => <ResultPaw>{children}</ResultPaw>,
  li: ({ children }) => <ResultPaw as="li">{children}</ResultPaw>,
  h1: ({ children }) => <h1 className="result-section-title">{children}</h1>,
  h2: ({ children }) => {
    if (isSummaryHeading(children)) {
      return <h2 className="result-summary-title">{children}</h2>
    }
    return <h2 className="result-section-title">{children}</h2>
  },
  h3: ({ children }) => <h3 className="result-section-title">{children}</h3>,
  h4: ({ children }) => <h4 className="result-section-title">{children}</h4>,
  table: ({ children }) => (
    <div className="table-wrap">
      <table>{children}</table>
    </div>
  ),
}

export function splitSummaryMarkdown(markdown) {
  if (!markdown) return { summary: '', body: '' }

  const match = markdown.match(
    /^##\s*한\s*줄\s*요약\s*\r?\n+([\s\S]*?)(?=\r?\n##\s|\r?\n#\s|$)/
  )

  if (!match) {
    return { summary: '', body: markdown }
  }

  const summary = match[1].trim().replace(/^>\s*/gm, '').trim()
  const body = markdown.slice(match[0].length).trim()
  return { summary, body }
}

export function getPreviewMarkdown(markdown) {
  if (!markdown) return ''

  const { summary, body } = splitSummaryMarkdown(markdown)
  const source = body || markdown
  const chunks = source.split(/(?=^## )/m).filter((part) => part.trim())

  let previewBody = source
  if (chunks.length >= 2) {
    const keep = Math.max(1, Math.ceil(chunks.length / 2))
    previewBody = chunks.slice(0, keep).join('').trimEnd()
  } else {
    const target = Math.floor(source.length * 0.5)
    const cut = source.indexOf('\n\n', target)
    previewBody =
      cut !== -1
        ? source.slice(0, cut).trimEnd()
        : source.slice(0, Math.max(target, 1)).trimEnd()
  }

  if (summary) {
    return `## 한 줄 요약\n${summary}\n\n${previewBody}`.trim()
  }
  return previewBody
}

export function SajuMarkdown({ markdown }) {
  const { summary, body } = splitSummaryMarkdown(markdown)

  return (
    <>
      {summary && (
        <aside className="result-summary-card" aria-label="한 줄 요약">
          <p className="result-summary-label">한 줄 요약</p>
          <p className="result-summary-text">{summary}</p>
        </aside>
      )}
      {body && (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={resultMarkdownComponents}>
          {body}
        </ReactMarkdown>
      )}
      {!summary && !body && markdown && (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={resultMarkdownComponents}>
          {markdown}
        </ReactMarkdown>
      )}
    </>
  )
}
