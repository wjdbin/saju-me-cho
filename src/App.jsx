import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import './App.css'
import { askGemini } from './gemini'
import { buildSajuPrompt } from './sajuPrompt'
import { isSupabaseConfigured, supabase } from './supabase'

/** 생년월일로 만 나이를 계산합니다 */
function getAge(birthDate) {
  if (!birthDate) return null
  const today = new Date()
  const birth = new Date(birthDate)
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1
  }
  return age
}

/** 성별/달력 라벨 */
function genderLabel(gender) {
  if (gender === 'male') return '남자'
  if (gender === 'female') return '여자'
  return gender || ''
}

function calendarLabel(calendarType) {
  if (calendarType === 'solar') return '양력'
  if (calendarType === 'lunar') return '음력'
  return calendarType || ''
}

function App() {
  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [birthTime, setBirthTime] = useState('')
  const [gender, setGender] = useState('')
  const [calendarType, setCalendarType] = useState('')

  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [readings, setReadings] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [resultKey, setResultKey] = useState(0)

  const requireSupabase = () => {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error(
        'Supabase 환경 변수가 없습니다. .env에 VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY를 넣고 개발 서버를 재시작하세요.'
      )
    }
  }

  const loadReadings = async () => {
    try {
      requireSupabase()
    } catch (err) {
      setError(err.message)
      return
    }

    const { data, error: fetchError } = await supabase
      .from('saju_readings')
      .select('id, name, birth_date, birth_time, gender, calendar_type, result, created_at')
      .order('created_at', { ascending: false })

    if (fetchError) {
      console.error(fetchError)
      setError(`기록 불러오기 실패: ${fetchError.message}`)
      return
    }

    setReadings(data ?? [])
  }

  useEffect(() => {
    loadReadings()
  }, [])

  const handleNameChange = (e) => {
    setName(e.target.value)
  }

  const showResult = (nextResult, options = {}) => {
    setResult(nextResult)
    setResultKey((key) => key + 1)
    if (options.scroll !== false) {
      requestAnimationFrame(() => {
        document.getElementById('saju-result')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      })
    }
  }

  const handleSelectReading = (reading) => {
    setSelectedId(reading.id)
    setName(reading.name)
    setBirthDate(reading.birth_date)
    setBirthTime(String(reading.birth_time).slice(0, 5))
    setGender(reading.gender)
    setCalendarType(reading.calendar_type)
    setError('')
    showResult(reading.result)
  }

  const handleNewSaju = () => {
    setSelectedId(null)
    setName('')
    setBirthDate('')
    setBirthTime('')
    setGender('')
    setCalendarType('')
    setResult('')
    setError('')
    requestAnimationFrame(() => {
      document.getElementById('name')?.focus()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  const readingPayload = (text) => ({
    name,
    birth_date: birthDate,
    birth_time: birthTime,
    gender,
    calendar_type: calendarType,
    result: text,
  })

  /** Create / Update — 선택 중이면 수정, 아니면 새로 저장 */
  const saveReading = async (text) => {
    requireSupabase()

    if (selectedId) {
      const { data, error: updateError } = await supabase
        .from('saju_readings')
        .update(readingPayload(text))
        .eq('id', selectedId)
        .select('id, name, birth_date, birth_time, gender, calendar_type, result, created_at')
        .single()

      if (updateError) {
        throw new Error(`해석은 됐지만 수정 실패: ${updateError.message}`)
      }

      setReadings((prev) => prev.map((item) => (item.id === data.id ? data : item)))
      return data
    }

    const { data, error: insertError } = await supabase
      .from('saju_readings')
      .insert(readingPayload(text))
      .select('id, name, birth_date, birth_time, gender, calendar_type, result, created_at')
      .single()

    if (insertError) {
      throw new Error(`해석은 됐지만 저장 실패: ${insertError.message}`)
    }

    setSelectedId(data.id)
    setReadings((prev) => [data, ...prev])
    return data
  }

  /** Update — 현재 입력/결과만 다시 저장 (재해석 없이) */
  const handleUpdate = async () => {
    if (!selectedId) {
      setError('수정할 기록을 사이드바에서 먼저 선택해 주세요.')
      return
    }
    if (!name || !birthDate || !birthTime || !gender || !calendarType || !result) {
      setError('이름, 생년월일, 시간, 성별, 양력/음력, 해석 결과가 모두 있어야 수정할 수 있습니다.')
      return
    }

    setSaving(true)
    setError('')

    try {
      await saveReading(result)
    } catch (err) {
      setError(err.message || '수정 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  /** Delete */
  const handleDelete = async (reading, event) => {
    event?.stopPropagation()

    const ok = window.confirm(`"${reading.name}" 기록을 삭제할까요?`)
    if (!ok) return

    setError('')

    try {
      requireSupabase()

      const { error: deleteError } = await supabase
        .from('saju_readings')
        .delete()
        .eq('id', reading.id)

      if (deleteError) {
        throw new Error(`삭제 실패: ${deleteError.message}`)
      }

      setReadings((prev) => prev.filter((item) => item.id !== reading.id))

      if (selectedId === reading.id) {
        handleNewSaju()
      }
    } catch (err) {
      setError(err.message || '삭제 중 오류가 발생했습니다.')
    }
  }

  const handleAnalyze = async () => {
    if (!name || !birthDate || !birthTime || !gender || !calendarType) {
      setError('이름, 생년월일, 시간, 성별, 양력/음력을 모두 입력해 주세요.')
      return
    }

    setError('')
    setResult('')
    setLoading(true)

    try {
      const prompt = buildSajuPrompt({
        name,
        birthDate,
        birthTime,
        gender,
        calendarType,
        age: getAge(birthDate),
      })

      await new Promise((resolve) => requestAnimationFrame(() => resolve()))
      document.getElementById('saju-result')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })

      const text = await askGemini(prompt)
      showResult(text, { scroll: false })
      await saveReading(text)
    } catch (err) {
      setError(err.message || '해석 요청 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const busy = loading || saving

  return (
    <div className="layout">
      <aside className="sidebar">
        <h2 className="sidebar-title">저장된 사주</h2>
        <button type="button" className="new-saju-btn" onClick={handleNewSaju} disabled={busy}>
          새 사주 만들기
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
                  onClick={() => handleSelectReading(reading)}
                  disabled={busy}
                >
                  {reading.name}
                </button>
                <button
                  type="button"
                  className="sidebar-delete"
                  aria-label={`${reading.name} 삭제`}
                  title="삭제"
                  onClick={(event) => handleDelete(reading, event)}
                  disabled={busy}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="app">
        <div className="app-header">
          <h1>{selectedId ? '사주 수정' : '사주 입력'}</h1>
          {(selectedId || name || result) && (
            <button
              type="button"
              className="new-saju-btn new-saju-btn--ghost"
              onClick={handleNewSaju}
              disabled={busy}
            >
              새 사주 만들기
            </button>
          )}
        </div>

        <label htmlFor="name">이름</label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={handleNameChange}
          placeholder="이름을 입력하세요"
          disabled={busy}
        />

        <label htmlFor="birthDate">생년월일</label>
        <input
          id="birthDate"
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          disabled={busy}
        />

        <label htmlFor="birthTime">태어난 시간</label>
        <input
          id="birthTime"
          type="time"
          value={birthTime}
          onChange={(e) => setBirthTime(e.target.value)}
          disabled={busy}
        />

        <label htmlFor="gender">성별</label>
        <select
          id="gender"
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          disabled={busy}
        >
          <option value="">선택하세요</option>
          <option value="male">남자</option>
          <option value="female">여자</option>
        </select>

        <label htmlFor="calendarType">양력 / 음력</label>
        <select
          id="calendarType"
          value={calendarType}
          onChange={(e) => setCalendarType(e.target.value)}
          disabled={busy}
        >
          <option value="">선택하세요</option>
          <option value="solar">양력</option>
          <option value="lunar">음력</option>
        </select>

        <div className="action-row">
          <button
            type="button"
            className="analyze-btn"
            onClick={handleAnalyze}
            disabled={busy}
          >
            {loading
              ? '🔮 풀이 중...'
              : selectedId
                ? '다시 풀이하고 수정'
                : '내 사주 보기'}
          </button>

          {selectedId && (
            <>
              <button
                type="button"
                className="secondary-btn"
                onClick={handleUpdate}
                disabled={busy || !result}
              >
                {saving ? '저장 중...' : '입력값 수정 저장'}
              </button>
              <button
                type="button"
                className="danger-btn"
                onClick={(event) =>
                  handleDelete(
                    {
                      id: selectedId,
                      name: name || '이 기록',
                    },
                    event
                  )
                }
                disabled={busy}
              >
                삭제
              </button>
            </>
          )}
        </div>

        {error && <p className="error">{error}</p>}

        {loading && (
          <section
            id="saju-result"
            className="skeleton-panel"
            aria-busy="true"
            aria-live="polite"
          >
            <div className="skeleton-panel-header">
              <span className="skeleton-bone skeleton-bone--eyebrow" />
              <span className="skeleton-bone skeleton-bone--title" />
              <span className="skeleton-bone skeleton-bone--meta" />
            </div>
            <div className="skeleton-panel-body">
              <span className="skeleton-bone skeleton-bone--heading" />
              <span className="skeleton-bone" />
              <span className="skeleton-bone" />
              <span className="skeleton-bone skeleton-bone--short" />
              <span className="skeleton-bone skeleton-bone--heading" />
              <span className="skeleton-bone" />
              <span className="skeleton-bone" />
              <span className="skeleton-bone skeleton-bone--mid" />
              <span className="skeleton-bone" />
              <span className="skeleton-bone skeleton-bone--short" />
            </div>
            <p className="skeleton-status">사주를 풀이하고 있어요...</p>
          </section>
        )}

        {!loading && result && (
          <section id="saju-result" className="result" key={resultKey}>
            <header className="result-header">
              <p className="result-eyebrow">{selectedId ? '저장된 해석' : '해석 결과'}</p>
              <h2 className="result-name">{name || '이름 없음'}</h2>
              <p className="result-meta">
                {[
                  birthDate,
                  birthTime ? String(birthTime).slice(0, 5) : '',
                  genderLabel(gender),
                  calendarLabel(calendarType),
                  getAge(birthDate) != null ? `만 ${getAge(birthDate)}세` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </header>
            <div className="result-text">
              <ReactMarkdown>{result}</ReactMarkdown>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

export default App
