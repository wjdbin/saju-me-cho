import { formatSubjectMeta } from '../../lib/profile'
import { Mascot } from '../brand'
import { SajuMarkdown } from './SajuMarkdown'

export function SajuResultView({ reading }) {
  return (
    <section className="result result--public">
      <header className="result-header">
        <div className="result-mascot-row">
          <Mascot className="mascot--result" />
          <div>
            <p className="result-eyebrow">멍사주 공유 해석</p>
            <h2 className="result-name">{reading?.name || '이름 없음'}</h2>
            <p className="result-meta">{formatSubjectMeta(reading)}</p>
          </div>
        </div>
      </header>
      <div className="result-text">
        <SajuMarkdown markdown={reading?.result || ''} />
      </div>
    </section>
  )
}
