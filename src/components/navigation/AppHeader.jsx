import { isSupabaseConfigured } from '../../lib/supabase'

export function AppHeader({
  title,
  isLoggedIn,
  busy,
  authBusy,
  hasGuestResult,
  onNewSaju,
  onGoogleSignIn,
}) {
  return (
    <div className="app-header">
      <h1>{title}</h1>
      {isLoggedIn ? (
        <button
          type="button"
          className="new-saju-btn new-saju-btn--ghost"
          onClick={onNewSaju}
          disabled={busy}
        >
          새 사주 보기
        </button>
      ) : (
        <div className="app-header-actions">
          {hasGuestResult && (
            <button
              type="button"
              className="new-saju-btn new-saju-btn--ghost"
              onClick={onNewSaju}
              disabled={busy}
            >
              다른 사주 보기
            </button>
          )}
          <button
            type="button"
            className="new-saju-btn new-saju-btn--ghost"
            onClick={() => onGoogleSignIn('header')}
            disabled={authBusy || !isSupabaseConfigured}
          >
            {authBusy ? '이동 중...' : '로그인'}
          </button>
        </div>
      )}
    </div>
  )
}
