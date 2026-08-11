import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import './App.css'
import { askGemini } from './gemini'
import { buildSajuPrompt } from './sajuPrompt'

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

function App() {
  // 이름 입력값을 저장하는 state
  // useState('') → 처음에는 빈 문자열로 시작
  const [name, setName] = useState('')

  // 생년월일 입력값을 저장하는 state
  const [birthDate, setBirthDate] = useState('')
  // 태어난 시간 입력값을 저장하는 state
  const [birthTime, setBirthTime] = useState('')
  // 성별 선택값을 저장하는 state
  const [gender, setGender] = useState('')
  // 양력/음력 선택값을 저장하는 state
  const [calendarType, setCalendarType] = useState('')

  // Gemini 해석 결과 / 로딩 / 에러 state
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // input에 글자를 입력할 때마다 호출됨
  // e.target.value = 지금 input에 들어있는 글자
  const handleNameChange = (e) => {
    setName(e.target.value)
  }

  // 사주 해석 버튼 클릭 → Gemini API 호출
  const handleAnalyze = async () => {
    // 필수 입력이 비어 있으면 바로 안내
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
      setResult(text)
    } catch (err) {
      // 초보자가 원인 파악하기 쉽게 메시지만 보여줌
      setError(err.message || '해석 요청 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <h1>사주 입력</h1>

      <label htmlFor="name">이름</label>
      {/*
        value={name} → input에 보이는 글자를 name state와 연결 (제어 컴포넌트)
        onChange={handleNameChange} → 입력할 때마다 name state를 업데이트
      */}
      <input
        id="name"
        type="text"
        value={name}
        onChange={handleNameChange}
        placeholder="이름을 입력하세요"
      />

      {/* ===== 아래부터 새로 추가한 입력 ===== */}

      <label htmlFor="birthDate">생년월일</label>
      {/* type="date" → 날짜 선택 UI가 나옴 */}
      <input
        id="birthDate"
        type="date"
        value={birthDate}
        onChange={(e) => setBirthDate(e.target.value)}
      />

      <label htmlFor="birthTime">태어난 시간</label>
      {/* type="time" → 시간 선택 UI가 나옴 */}
      <input
        id="birthTime"
        type="time"
        value={birthTime}
        onChange={(e) => setBirthTime(e.target.value)}
      />

      <label htmlFor="gender">성별</label>
      {/* select → 드롭다운으로 선택 */}
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
        <section className="result">
          <h2>해석 결과</h2>
          <div className="result-text">
            <ReactMarkdown>{result}</ReactMarkdown>
          </div>
        </section>
      )}
    </div>
  )
}

export default App
