export function SubjectFormFields({ idPrefix, values, onFieldChange, disabled, autoFocusName = false }) {
  return (
    <>
      <label htmlFor={`${idPrefix}-name`}>이름</label>
      <input
        id={`${idPrefix}-name`}
        type="text"
        value={values.name}
        onChange={onFieldChange('name')}
        placeholder="이름을 입력하세요"
        disabled={disabled}
        required
        autoFocus={autoFocusName}
      />

      <label htmlFor={`${idPrefix}-birthDate`}>생년월일</label>
      <input
        id={`${idPrefix}-birthDate`}
        type="date"
        value={values.birth_date}
        onChange={onFieldChange('birth_date')}
        disabled={disabled}
        required
      />

      <label htmlFor={`${idPrefix}-birthTime`}>
        태어난 시간 <span className="field-optional">선택</span>
      </label>
      <input
        id={`${idPrefix}-birthTime`}
        type="time"
        value={values.birth_time}
        onChange={onFieldChange('birth_time')}
        disabled={disabled}
      />
      <p className="field-hint">모르면 비워 두라멍. 시주 없이 년월일로 보겠다멍.</p>

      <label htmlFor={`${idPrefix}-gender`}>성별</label>
      <select
        id={`${idPrefix}-gender`}
        value={values.gender}
        onChange={onFieldChange('gender')}
        disabled={disabled}
        required
      >
        <option value="">선택하세요</option>
        <option value="male">남자</option>
        <option value="female">여자</option>
      </select>

      <label htmlFor={`${idPrefix}-calendarType`}>양력 / 음력</label>
      <select
        id={`${idPrefix}-calendarType`}
        value={values.calendar_type}
        onChange={onFieldChange('calendar_type')}
        disabled={disabled}
        required
      >
        <option value="">선택하세요</option>
        <option value="solar">양력</option>
        <option value="lunar">음력</option>
      </select>
    </>
  )
}
