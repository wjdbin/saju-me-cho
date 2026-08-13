import { SubjectFormFields } from '../profile/SubjectFormFields'

export function GuestSajuForm({
  form,
  onFieldChange,
  onSubmit,
  busy,
  loading,
  readingCount,
}) {
  return (
    <form className="guest-form" onSubmit={onSubmit}>
      <p className="guest-form-copy">이름과 생년월일을 넣으면 바로 풀어주겠다멍.</p>

      <SubjectFormFields
        idPrefix="guest"
        values={form}
        onFieldChange={onFieldChange}
        disabled={loading}
        autoFocusName
      />

      <div className="action-row">
        <button type="submit" className="analyze-btn" disabled={busy}>
          {loading ? '분석 중이다멍...' : '내 사주 보기'}
        </button>
        {readingCount > 0 && (
          <p className="guest-form-stat">
            지금까지 총 <strong>{readingCount.toLocaleString('ko-KR')}</strong>개의 사주가
            생성됐다멍.
          </p>
        )}
      </div>
    </form>
  )
}
