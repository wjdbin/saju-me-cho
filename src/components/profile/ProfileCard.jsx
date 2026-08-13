import { formatSubjectMeta } from '../../lib/profile'

export function ProfileCard({
  label = '내 정보',
  name,
  subject,
  actionLabel,
  onAction,
  disabled,
  empty = false,
  emptyCopy,
  emptyActionLabel,
}) {
  if (empty) {
    return (
      <section className="profile-card profile-card--empty">
        <p className="profile-card-label">{label}</p>
        <p className="profile-card-meta">{emptyCopy}</p>
        <button type="button" className="secondary-inline-btn" onClick={onAction} disabled={disabled}>
          {emptyActionLabel}
        </button>
      </section>
    )
  }

  return (
    <section className="profile-card">
      <div className="profile-card-top">
        <div>
          <p className="profile-card-label">{label}</p>
          <h2 className="profile-card-name">{name}</h2>
        </div>
        {actionLabel && (
          <button type="button" className="profile-edit-link" onClick={onAction} disabled={disabled}>
            {actionLabel}
          </button>
        )}
      </div>
      <p className="profile-card-meta">{formatSubjectMeta(subject)}</p>
    </section>
  )
}
