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

/** OAuth 실패 시 URL에 실려 오는 에러를 읽습니다 */
function readOAuthErrorFromUrl() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const queryParams = new URLSearchParams(window.location.search)
  const description =
    hashParams.get('error_description') ||
    queryParams.get('error_description') ||
    hashParams.get('error') ||
    queryParams.get('error')

  if (!description) return null
  return decodeURIComponent(description.replace(/\+/g, ' '))
}

/** 로그인 후 URL에 남은 code/error 파라미터를 정리합니다 */
function clearAuthParamsFromUrl() {
  const url = new URL(window.location.href)
  const keys = ['code', 'state', 'error', 'error_code', 'error_description']
  let changed = false

  for (const key of keys) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key)
      changed = true
    }
  }

  if (url.hash) {
    url.hash = ''
    changed = true
  }

  if (changed) {
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}`)
  }
}

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authBusy, setAuthBusy] = useState(false)

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

  const requireSupabase = () => {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error(
        'Supabase 환경 변수가 없습니다. .env에 VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY를 넣고 개발 서버를 재시작하세요.'
      )
    }
  }

  const requireAuth = () => {
    requireSupabase()
    if (!session?.user) {
      throw new Error('Google 로그인이 필요합니다.')
    }
    return session.user
  }

  const loadReadings = async () => {
    try {
      requireAuth()
    } catch (err) {
      setError(err.message)
      setReadings([])
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
    if (!isSupabaseConfigured || !supabase) {
      setAuthLoading(false)
      setError(
        'Supabase 환경 변수가 없습니다. .env에 VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY를 넣고 개발 서버를 재시작하세요.'
      )
      return
    }

    let mounted = true

    const oauthError = readOAuthErrorFromUrl()
    if (oauthError) {
      setError(oauthError)
      clearAuthParamsFromUrl()
    }

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return
      if (sessionError) {
        setError(`세션 확인 실패: ${sessionError.message}`)
      }
      setSession(data.session ?? null)
      setAuthLoading(false)
      if (data.session) {
        clearAuthParamsFromUrl()
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setAuthLoading(false)
      if (event === 'SIGNED_IN') {
        clearAuthParamsFromUrl()
        setAuthBusy(false)
        setError('')
      }
      if (event === 'SIGNED_OUT') {
        setAuthBusy(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (authLoading) return

    if (!session?.user) {
      setReadings([])
      setSelectedId(null)
      setResult('')
      return
    }

    setError('')
    loadReadings()
  }, [session, authLoading])

  const handleGoogleSignIn = async () => {
    setError('')
    setAuthBusy(true)

    try {
      requireSupabase()

      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
          queryParams: {
            prompt: 'select_account',
          },
        },
      })

      if (signInError) {
        throw signInError
      }
    } catch (err) {
      setError(err.message || 'Google 로그인 중 오류가 발생했습니다.')
      setAuthBusy(false)
    }
  }

  const handleSignOut = async () => {
    setError('')
    setAuthBusy(true)

    try {
      requireSupabase()
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) {
        throw signOutError
      }
      handleNewSaju()
      setReadings([])
    } catch (err) {
      setError(err.message || '로그아웃 중 오류가 발생했습니다.')
    } finally {
      setAuthBusy(false)
    }
  }

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

  const readingPayload = (text, userId) => ({
    name,
    birth_date: birthDate,
    birth_time: birthTime,
    gender,
    calendar_type: calendarType,
    result: text,
    user_id: userId,
  })

  /** Create / Update — 선택 중이면 수정, 아니면 새로 저장 */
  const saveReading = async (text) => {
    const user = requireAuth()

    if (selectedId) {
      const { data, error: updateError } = await supabase
        .from('saju_readings')
        .update(readingPayload(text, user.id))
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
      .insert(readingPayload(text, user.id))
      .select('id, name, birth_date, birth_time, gender, calendar_type, result, created_at')
      .single()

    if (insertError) {
      throw new Error(`해석은 됐지만 저장 실패: ${insertError.message}`)
    }

    setSelectedId(data.id)
    setReadings((prev) => [data, ...prev])
    return data
  }

  /** Delete — 사이드바 × 버튼으로만 삭제 */
  const handleDelete = async (reading, event) => {
    event?.stopPropagation()

    const ok = window.confirm(`"${reading.name}" 기록을 삭제할까요?`)
    if (!ok) return

    setError('')

    try {
      requireAuth()

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

  const busy = loading || authBusy
  const userEmail = session?.user?.email ?? ''
  const userName =
    session?.user?.user_metadata?.full_name ||
    session?.user?.user_metadata?.name ||
    userEmail

  if (authLoading) {
    return (
      <div className="auth-screen">
        <p className="auth-status">로그인 상태 확인 중...</p>
      </div>
    )
  }

  if (!session?.user) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <p className="auth-eyebrow">saju-me</p>
          <h1>사주 입력</h1>
          <p className="auth-copy">Google 계정으로 로그인한 뒤 내 사주를 저장하고 관리하세요.</p>
          <button
            type="button"
            className="google-btn"
            onClick={handleGoogleSignIn}
            disabled={authBusy || !isSupabaseConfigured}
          >
            {authBusy ? 'Google로 이동 중...' : 'Google로 계속하기'}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="auth-bar">
          <p className="auth-user" title={userEmail}>
            {userName}
          </p>
          <button
            type="button"
            className="signout-btn"
            onClick={handleSignOut}
            disabled={busy}
          >
            로그아웃
          </button>
        </div>
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
            {loading ? '🔮 풀이 중...' : '내 사주 보기'}
          </button>
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
