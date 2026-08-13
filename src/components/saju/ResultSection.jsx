import { formatSubjectMeta } from '../../lib/profile'
import { isSupabaseConfigured } from '../../lib/supabase'
import { Mascot } from '../brand'
import { SajuMarkdown } from './SajuMarkdown'

export function ResultSection({
  resultKey,
  subject,
  selectedId,
  selectedReading,
  displayedResult,
  isResultLocked,
  shareBusy,
  shareFeedback,
  authBusy,
  onShare,
  onGoogleSignIn,
}) {
  return (
    <section id="saju-result" className="result" key={resultKey}>
      <header className="result-header">
        <div className="result-mascot-row">
          <Mascot className="mascot--result" />
          <div className="result-header-copy">
            <p className="result-eyebrow">{selectedId ? '멍사주 저장본' : '멍사주 해석'}</p>
            <h2 className="result-name">{subject?.name || '이름 없음'}</h2>
            <p className="result-meta">{formatSubjectMeta(subject)}</p>
          </div>
        </div>
        {selectedId && (
          <div className="result-share">
            <button type="button" className="share-btn" onClick={onShare} disabled={shareBusy}>
              {shareBusy
                ? '공유 준비 중...'
                : selectedReading?.is_shared
                  ? '공유 링크 복사'
                  : '친구에게 공유'}
            </button>
            {shareFeedback && <p className="share-feedback">{shareFeedback}</p>}
          </div>
        )}
      </header>
      <div className={`result-text${isResultLocked ? ' result-text--locked' : ''}`}>
        <SajuMarkdown markdown={displayedResult} />
        {isResultLocked && (
          <div className="result-lock">
            <div className="result-lock-card">
              <Mascot className="mascot--lock" />
              <p className="result-lock-copy">
                여기까지가 무료다멍. 나머지 해석을 보려면 로그인하라멍.
              </p>
              <button
                type="button"
                className="google-btn"
                onClick={() => onGoogleSignIn('result_lock')}
                disabled={authBusy || !isSupabaseConfigured}
              >
                {authBusy ? 'Google로 이동 중...' : 'Google로 계속하기'}
              </button>
              <p className="result-lock-hint">로그인하면 전체 해석이 저장된다멍.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
