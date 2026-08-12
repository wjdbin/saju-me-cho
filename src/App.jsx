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
  const [error, setError] = useState('')

  const [readings, setReadings] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [resultKey, setResultKey] = useState(0)

  const loadReadings = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setError(
        'Supabase 환경 변수가 없습니다. .env에 VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY를 넣고 개발 서버를 재시작하세요.'
      )
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

  const handleAnalyze = async () => {
    if (!name || !birthDate || !birthTime || !gender || !calendarType) {
      setError('이름, 생년월일, 시간, 성별, 양력/음력을 모두 입력해 주세요.')
      return
    }

    setLoading(true)
    setError('')
    setResult('')

    try {
      const prompt = buildSajuPrompt({
        name,
        birthDate,
        birthTime,
        gender,
        calendarType,
        age: getAge(birthDate),
      })

      const text = await askGemini(prompt)
      showResult(text)

      if (!isSupabaseConfigured || !supabase) {
        throw new Error(
          '해석은 됐지만 저장할 수 없습니다. .env에 Supabase 설정을 추가하고 개발 서버를 재시작하세요.'
        )
      }

      const { data, error: saveError } = await supabase
        .from('saju_readings')
        .insert({
          name,
          birth_date: birthDate,
          birth_time: birthTime,
          gender,
          calendar_type: calendarType,
          result: text,
        })
        .select('id, name, birth_date, birth_time, gender, calendar_type, result, created_at')
        .single()

      if (saveError) {
        throw new Error(`해석은 됐지만 저장 실패: ${saveError.message}`)
      }

      setSelectedId(data.id)
      setReadings((prev) => [data, ...prev])
    } catch (err) {
      setError(err.message || '해석 요청 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <h2 className="sidebar-title">저장된 사주</h2>
        <button type="button" className="new-saju-btn" onClick={handleNewSaju}>
          새 사주 만들기
        </button>
        {readings.length === 0 ? (
          <p className="sidebar-empty">아직 저장된 기록이 없습니다.</p>
        ) : (
          <ul className="sidebar-list">
            {readings.map((reading) => (
              <li key={reading.id}>
                <button
                  type="button"
                  className={`sidebar-item${selectedId === reading.id ? ' is-active' : ''}`}
                  onClick={() => handleSelectReading(reading)}
                >
                  {reading.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="app">
        <div className="app-header">
          <h1>사주 입력</h1>
          {(selectedId || name || result) && (
            <button type="button" className="new-saju-btn new-saju-btn--ghost" onClick={handleNewSaju}>
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
        />

        <label htmlFor="birthDate">생년월일</label>
        <input
          id="birthDate"
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />

        <label htmlFor="birthTime">태어난 시간</label>
        <input
          id="birthTime"
          type="time"
          value={birthTime}
          onChange={(e) => setBirthTime(e.target.value)}
        />

        <label htmlFor="gender">성별</label>
        <select
          id="gender"
          value={gender}
          onChange={(e) => setGender(e.target.value)}
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
        >
          <option value="">선택하세요</option>
          <option value="solar">양력</option>
          <option value="lunar">음력</option>
        </select>

        <button
          type="button"
          className="analyze-btn"
          onClick={handleAnalyze}
          disabled={loading}
        >
          {loading ? '🔮 풀이 중...' : '내 사주 보기'}
        </button>

        {error && <p className="error">{error}</p>}

        {result && (
          <section id="saju-result" className="result" key={resultKey}>
            <header className="result-header">
              <p className="result-eyebrow">해석 결과</p>
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
