import { SubjectFormFields } from './SubjectFormFields'

export function ProfileModal({
  mode,
  form,
  onFieldChange,
  onSubmit,
  onCancel,
  saving,
  canCancel,
  error,
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
      >
        <p className="modal-eyebrow">{mode === 'onboarding' ? '처음 오신 분' : '프로필'}</p>
        <h2 id="profile-modal-title">
          {mode === 'onboarding' ? '기본 정보를 입력해 주세요' : '프로필 수정'}
        </h2>
        <p className="modal-copy">
          {mode === 'onboarding'
            ? '한 번만 입력하면 다음부터 바로 분석하겠다멍.'
            : '바꾼 정보는 다음 분석부터 반영하겠다멍.'}
        </p>

        <form className="modal-form" onSubmit={onSubmit}>
          <SubjectFormFields
            idPrefix="profile"
            values={form}
            onFieldChange={onFieldChange}
            disabled={saving}
          />

          <div className="modal-actions">
            {mode === 'edit' && canCancel && (
              <button
                type="button"
                className="modal-cancel-btn"
                onClick={onCancel}
                disabled={saving}
              >
                취소
              </button>
            )}
            <button type="submit" className="analyze-btn" disabled={saving}>
              {saving
                ? '저장 중...'
                : mode === 'onboarding'
                  ? '저장하고 시작하기'
                  : '프로필 저장'}
            </button>
          </div>
        </form>

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}
