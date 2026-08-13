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

function isProfileComplete(profile) {
  return Boolean(
    profile?.name &&
      profile?.birth_date &&
      profile?.birth_time &&
      profile?.gender &&
      profile?.calendar_type
  )
}

function emptyProfileForm(seed = {}) {
  return {
    name: seed.name ?? '',
    birth_date: seed.birth_date ?? '',
    birth_time: seed.birth_time ? String(seed.birth_time).slice(0, 5) : '',
    gender: seed.gender ?? '',
    calendar_type: seed.calendar_type ?? '',
  }
}

function formatReadingLabel(createdAt) {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return '사주 기록'
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

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

  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [profileModalMode, setProfileModalMode] = useState('onboarding')
  const [profileForm, setProfileForm] = useState(emptyProfileForm())

  const [newSajuModalOpen, setNewSajuModalOpen] = useState(false)
  const [newSajuForm, setNewSajuForm] = useState(emptyProfileForm())
  const [activeSubject, setActiveSubject] = useState(null)

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

  const openProfileModal = (mode, nextProfile = profile) => {
    setProfileModalMode(mode)
    setProfileForm(emptyProfileForm(nextProfile ?? {}))
    setProfileModalOpen(true)
  }

  const loadProfile = async (userId) => {
    setProfileLoading(true)

    try {
      requireSupabase()

      const { data, error: fetchError } = await supabase
        .from('users')
        .select('id, name, birth_date, birth_time, gender, calendar_type, created_at, updated_at')
        .eq('id', userId)
        .maybeSingle()

      if (fetchError) {
        throw new Error(`프로필 불러오기 실패: ${fetchError.message}`)
      }

      setProfile(data)

      if (!isProfileComplete(data)) {
        openProfileModal('onboarding', data)
      } else {
        setProfileModalOpen(false)
      }

      return data
    } catch (err) {
      setError(err.message || '프로필을 불러오지 못했습니다.')
      setProfile(null)
      openProfileModal('onboarding')
      return null
    } finally {
      setProfileLoading(false)
    }
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
      .select('id, name, birth_date, birth_time, gender, calendar_type, result, created_at, user_id')
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
        setProfile(null)
        setProfileModalOpen(false)
        setNewSajuModalOpen(false)
        setActiveSubject(null)
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
      setProfile(null)
      return
    }

    setError('')
    loadProfile(session.user.id)
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
      setSelectedId(null)
      setResult('')
      setActiveSubject(null)
      setNewSajuModalOpen(false)
      setReadings([])
      setProfile(null)
    } catch (err) {
      setError(err.message || '로그아웃 중 오류가 발생했습니다.')
    } finally {
      setAuthBusy(false)
    }
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
    setActiveSubject({
      name: reading.name,
      birth_date: reading.birth_date,
      birth_time: reading.birth_time,
      gender: reading.gender,
      calendar_type: reading.calendar_type,
    })
    setError('')
    showResult(reading.result)
  }

  const handleNewSaju = () => {
    setSelectedId(null)
    setResult('')
    setError('')
    setActiveSubject(null)
    setNewSajuForm(emptyProfileForm())
    setNewSajuModalOpen(true)
  }

  const handleProfileFieldChange = (field) => (event) => {
    setProfileForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const handleNewSajuFieldChange = (field) => (event) => {
    setNewSajuForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const saveProfile = async () => {
    const user = requireAuth()
    const payload = {
      id: user.id,
      name: profileForm.name.trim(),
      birth_date: profileForm.birth_date,
      birth_time: profileForm.birth_time,
      gender: profileForm.gender,
      calendar_type: profileForm.calendar_type,
    }

    if (
      !payload.name ||
      !payload.birth_date ||
      !payload.birth_time ||
      !payload.gender ||
      !payload.calendar_type
    ) {
      throw new Error('이름, 생년월일, 시간, 성별, 양력/음력을 모두 입력해 주세요.')
    }

    const { data, error: upsertError } = await supabase
      .from('users')
      .upsert(payload, { onConflict: 'id' })
      .select('id, name, birth_date, birth_time, gender, calendar_type, created_at, updated_at')
      .single()

    if (upsertError) {
      throw new Error(`프로필 저장 실패: ${upsertError.message}`)
    }

    setProfile(data)
    setProfileModalOpen(false)
    return data
  }

  const handleSaveProfile = async (event) => {
    event.preventDefault()
    setProfileSaving(true)
    setError('')

    try {
      await saveProfile()
    } catch (err) {
      setError(err.message || '프로필 저장 중 오류가 발생했습니다.')
    } finally {
      setProfileSaving(false)
    }
  }

  const saveReading = async (text, subject) => {
    const user = requireAuth()
    const payload = {
      result: text,
      user_id: user.id,
      name: subject.name,
      birth_date: subject.birth_date,
      birth_time: subject.birth_time,
      gender: subject.gender,
      calendar_type: subject.calendar_type,
    }

    if (selectedId) {
      const { data, error: updateError } = await supabase
        .from('saju_readings')
        .update(payload)
        .eq('id', selectedId)
        .select('id, name, birth_date, birth_time, gender, calendar_type, result, created_at, user_id')
        .single()

      if (updateError) {
        throw new Error(`해석은 됐지만 수정 실패: ${updateError.message}`)
      }

      setReadings((prev) => prev.map((item) => (item.id === data.id ? data : item)))
      return data
    }

    const { data, error: insertError } = await supabase
      .from('saju_readings')
      .insert(payload)
      .select('id, name, birth_date, birth_time, gender, calendar_type, result, created_at, user_id')
      .single()

    if (insertError) {
      throw new Error(`해석은 됐지만 저장 실패: ${insertError.message}`)
    }

    setSelectedId(data.id)
    setReadings((prev) => [data, ...prev])
    return data
  }

  const analyzeWithSubject = async (subject) => {
    if (
      !subject?.name ||
      !subject?.birth_date ||
      !subject?.birth_time ||
      !subject?.gender ||
      !subject?.calendar_type
    ) {
      throw new Error('이름, 생년월일, 시간, 성별, 양력/음력을 모두 입력해 주세요.')
    }

    setError('')
    setResult('')
    setLoading(true)
    setActiveSubject(subject)

    try {
      const prompt = buildSajuPrompt({
        name: subject.name,
        birthDate: subject.birth_date,
        birthTime: String(subject.birth_time).slice(0, 5),
        gender: subject.gender,
        calendarType: subject.calendar_type,
        age: getAge(subject.birth_date),
      })

      await new Promise((resolve) => requestAnimationFrame(() => resolve()))
      document.getElementById('saju-result')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })

      const text = await askGemini(prompt)
      showResult(text, { scroll: false })
      await saveReading(text, subject)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (reading, event) => {
    event?.stopPropagation()

    const label = reading.name || formatReadingLabel(reading.created_at)
    const ok = window.confirm(`"${label}" 기록을 삭제할까요?`)
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
        setSelectedId(null)
        setResult('')
        setActiveSubject(null)
      }
    } catch (err) {
      setError(err.message || '삭제 중 오류가 발생했습니다.')
    }
  }

  const handleAnalyze = async () => {
    if (!isProfileComplete(profile)) {
      openProfileModal('onboarding', profile)
      setError('사주를 보려면 먼저 프로필 정보를 입력해 주세요.')
      return
    }

    try {
      setSelectedId(null)
      await analyzeWithSubject({
        name: profile.name,
        birth_date: profile.birth_date,
        birth_time: String(profile.birth_time).slice(0, 5),
        gender: profile.gender,
        calendar_type: profile.calendar_type,
      })
    } catch (err) {
      setError(err.message || '해석 요청 중 오류가 발생했습니다.')
    }
  }

  const handleSubmitNewSaju = async (event) => {
    event.preventDefault()
    setError('')

    try {
      setSelectedId(null)
      setNewSajuModalOpen(false)
      await analyzeWithSubject({
        name: newSajuForm.name.trim(),
        birth_date: newSajuForm.birth_date,
        birth_time: newSajuForm.birth_time,
        gender: newSajuForm.gender,
        calendar_type: newSajuForm.calendar_type,
      })
    } catch (err) {
      setNewSajuModalOpen(true)
      setError(err.message || '해석 요청 중 오류가 발생했습니다.')
    }
  }

  const busy = loading || authBusy || profileSaving || profileLoading
  const profileReady = isProfileComplete(profile)
  const displayName = profile?.name || session?.user?.user_metadata?.full_name || session?.user?.email || ''
  const userEmail = session?.user?.email ?? ''
  const subject = activeSubject || (profileReady ? profile : null)
  const subjectAge = subject?.birth_date ? getAge(subject.birth_date) : null
  const profileAge = profileReady ? getAge(profile.birth_date) : null

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
            {displayName}
          </p>
          <button type="button" className="signout-btn" onClick={handleSignOut} disabled={busy}>
            로그아웃
          </button>
        </div>

        <button
          type="button"
          className="profile-btn"
          onClick={() => openProfileModal('edit', profile)}
          disabled={busy}
        >
          프로필 수정
        </button>

        <h2 className="sidebar-title">저장된 사주</h2>
        <button type="button" className="new-saju-btn" onClick={handleNewSaju} disabled={busy}>
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
                  onClick={() => handleSelectReading(reading)}
                  disabled={busy}
                >
                  {reading.name || formatReadingLabel(reading.created_at)}
                </button>
                <button
                  type="button"
                  className="sidebar-delete"
                  aria-label={`${reading.name || formatReadingLabel(reading.created_at)} 삭제`}
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
          <h1>{selectedId ? '저장된 사주' : '내 사주'}</h1>
          <button
            type="button"
            className="new-saju-btn new-saju-btn--ghost"
            onClick={handleNewSaju}
            disabled={busy}
          >
            새 사주 보기
          </button>
        </div>

        {profileReady ? (
          <section className="profile-card">
            <div className="profile-card-top">
              <div>
                <p className="profile-card-label">내 정보</p>
                <h2 className="profile-card-name">{profile.name}</h2>
              </div>
              <button
                type="button"
                className="profile-edit-link"
                onClick={() => openProfileModal('edit', profile)}
                disabled={busy}
              >
                수정
              </button>
            </div>
            <p className="profile-card-meta">
              {[
                profile.birth_date,
                String(profile.birth_time).slice(0, 5),
                genderLabel(profile.gender),
                calendarLabel(profile.calendar_type),
                profileAge != null ? `만 ${profileAge}세` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </section>
        ) : (
          <section className="profile-card profile-card--empty">
            <p className="profile-card-label">내 정보</p>
            <p className="profile-card-meta">프로필을 입력하면 바로 사주를 볼 수 있어요.</p>
            <button
              type="button"
              className="secondary-inline-btn"
              onClick={() => openProfileModal('onboarding', profile)}
              disabled={busy}
            >
              프로필 입력하기
            </button>
          </section>
        )}

        <div className="action-row">
          <button
            type="button"
            className="analyze-btn"
            onClick={handleAnalyze}
            disabled={busy || !profileReady}
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
              <h2 className="result-name">{subject?.name || '이름 없음'}</h2>
              <p className="result-meta">
                {[
                  subject?.birth_date,
                  subject?.birth_time ? String(subject.birth_time).slice(0, 5) : '',
                  genderLabel(subject?.gender),
                  calendarLabel(subject?.calendar_type),
                  subjectAge != null ? `만 ${subjectAge}세` : '',
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

      {profileModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-modal-title"
          >
            <p className="modal-eyebrow">
              {profileModalMode === 'onboarding' ? '처음 오신 분' : '프로필'}
            </p>
            <h2 id="profile-modal-title">
              {profileModalMode === 'onboarding' ? '기본 정보를 입력해 주세요' : '프로필 수정'}
            </h2>
            <p className="modal-copy">
              {profileModalMode === 'onboarding'
                ? '한 번만 입력하면 다음부터는 바로 사주를 볼 수 있어요.'
                : '변경한 정보는 이후 사주 풀이에 바로 반영됩니다.'}
            </p>

            <form className="modal-form" onSubmit={handleSaveProfile}>
              <label htmlFor="profile-name">이름</label>
              <input
                id="profile-name"
                type="text"
                value={profileForm.name}
                onChange={handleProfileFieldChange('name')}
                placeholder="이름을 입력하세요"
                disabled={profileSaving}
                required
              />

              <label htmlFor="profile-birthDate">생년월일</label>
              <input
                id="profile-birthDate"
                type="date"
                value={profileForm.birth_date}
                onChange={handleProfileFieldChange('birth_date')}
                disabled={profileSaving}
                required
              />

              <label htmlFor="profile-birthTime">태어난 시간</label>
              <input
                id="profile-birthTime"
                type="time"
                value={profileForm.birth_time}
                onChange={handleProfileFieldChange('birth_time')}
                disabled={profileSaving}
                required
              />

              <label htmlFor="profile-gender">성별</label>
              <select
                id="profile-gender"
                value={profileForm.gender}
                onChange={handleProfileFieldChange('gender')}
                disabled={profileSaving}
                required
              >
                <option value="">선택하세요</option>
                <option value="male">남자</option>
                <option value="female">여자</option>
              </select>

              <label htmlFor="profile-calendarType">양력 / 음력</label>
              <select
                id="profile-calendarType"
                value={profileForm.calendar_type}
                onChange={handleProfileFieldChange('calendar_type')}
                disabled={profileSaving}
                required
              >
                <option value="">선택하세요</option>
                <option value="solar">양력</option>
                <option value="lunar">음력</option>
              </select>

              <div className="modal-actions">
                {profileModalMode === 'edit' && profileReady && (
                  <button
                    type="button"
                    className="modal-cancel-btn"
                    onClick={() => setProfileModalOpen(false)}
                    disabled={profileSaving}
                  >
                    취소
                  </button>
                )}
                <button type="submit" className="analyze-btn" disabled={profileSaving}>
                  {profileSaving
                    ? '저장 중...'
                    : profileModalMode === 'onboarding'
                      ? '저장하고 시작하기'
                      : '프로필 저장'}
                </button>
              </div>
            </form>

            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}

      {newSajuModalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!loading) setNewSajuModalOpen(false)
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

            <form className="modal-form" onSubmit={handleSubmitNewSaju}>
              <label htmlFor="new-saju-name">이름</label>
              <input
                id="new-saju-name"
                type="text"
                value={newSajuForm.name}
                onChange={handleNewSajuFieldChange('name')}
                placeholder="이름을 입력하세요"
                disabled={loading}
                required
                autoFocus
              />

              <label htmlFor="new-saju-birthDate">생년월일</label>
              <input
                id="new-saju-birthDate"
                type="date"
                value={newSajuForm.birth_date}
                onChange={handleNewSajuFieldChange('birth_date')}
                disabled={loading}
                required
              />

              <label htmlFor="new-saju-birthTime">태어난 시간</label>
              <input
                id="new-saju-birthTime"
                type="time"
                value={newSajuForm.birth_time}
                onChange={handleNewSajuFieldChange('birth_time')}
                disabled={loading}
                required
              />

              <label htmlFor="new-saju-gender">성별</label>
              <select
                id="new-saju-gender"
                value={newSajuForm.gender}
                onChange={handleNewSajuFieldChange('gender')}
                disabled={loading}
                required
              >
                <option value="">선택하세요</option>
                <option value="male">남자</option>
                <option value="female">여자</option>
              </select>

              <label htmlFor="new-saju-calendarType">양력 / 음력</label>
              <select
                id="new-saju-calendarType"
                value={newSajuForm.calendar_type}
                onChange={handleNewSajuFieldChange('calendar_type')}
                disabled={loading}
                required
              >
                <option value="">선택하세요</option>
                <option value="solar">양력</option>
                <option value="lunar">음력</option>
              </select>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-cancel-btn"
                  onClick={() => setNewSajuModalOpen(false)}
                  disabled={loading}
                >
                  취소
                </button>
                <button type="submit" className="analyze-btn" disabled={loading}>
                  {loading ? '🔮 풀이 중...' : '풀이하고 저장'}
                </button>
              </div>
            </form>

            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
