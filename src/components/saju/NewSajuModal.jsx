import { SubjectFormFields } from '../profile/SubjectFormFields'

export function NewSajuModal({
  form,
  onFieldChange,
  onSubmit,
  onClose,
  loading,
  error,
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!loading) onClose()
      }}
    >
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-saju-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="modal-eyebrow">새 사주</p>
        <h2 id="new-saju-modal-title">사주 정보 입력</h2>
        <p className="modal-copy">다른 사람 정보로 새 사주를 풀이하고 저장할 수 있어요.</p>

        <form className="modal-form" onSubmit={onSubmit}>
          <SubjectFormFields
            idPrefix="new-saju"
            values={form}
            onFieldChange={onFieldChange}
            disabled={loading}
            autoFocusName
          />

          <div className="modal-actions">
            <button
              type="button"
              className="modal-cancel-btn"
              onClick={onClose}
              disabled={loading}
            >
              취소
            </button>
            <button type="submit" className="analyze-btn" disabled={loading}>
              {loading ? '분석 중이다멍...' : '풀이하고 저장'}
            </button>
          </div>
        </form>

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}
