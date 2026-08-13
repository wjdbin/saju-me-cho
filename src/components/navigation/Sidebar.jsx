import { formatReadingLabel } from '../../lib/profile'

export function Sidebar({
  displayName,
  userEmail,
  readings,
  selectedId,
  busy,
  onSignOut,
  onEditProfile,
  onNewSaju,
  onSelectReading,
  onDeleteReading,
}) {
  return (
    <aside className="sidebar">
      <div className="auth-bar">
        <p className="auth-user" title={userEmail}>
          {displayName}
        </p>
        <button type="button" className="signout-btn" onClick={onSignOut} disabled={busy}>
          로그아웃
        </button>
      </div>

      <button type="button" className="profile-btn" onClick={onEditProfile} disabled={busy}>
        프로필 수정
      </button>

      <h2 className="sidebar-title">멍사주 기록</h2>
      <button type="button" className="new-saju-btn" onClick={onNewSaju} disabled={busy}>
        새 사주 보기
      </button>
      {readings.length === 0 ? (
        <p className="sidebar-empty">아직 저장된 기록이 없습니다.</p>
      ) : (
        <ul className="sidebar-list">
          {readings.map((reading) => (
            <li key={reading.id} className="sidebar-row">
              <button
                type="button"
                className={`sidebar-item${selectedId === reading.id ? ' is-active' : ''}`}
                onClick={() => onSelectReading(reading)}
                disabled={busy}
              >
                {reading.name || formatReadingLabel(reading.created_at)}
              </button>
              <button
                type="button"
                className="sidebar-delete"
                aria-label={`${reading.name || formatReadingLabel(reading.created_at)} 삭제`}
                title="삭제"
                onClick={(event) => onDeleteReading(reading, event)}
                disabled={busy}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
