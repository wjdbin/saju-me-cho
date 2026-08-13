import { useEffect, useRef, useState } from 'react'
import './App.css'
import { askGemini } from './gemini'
import { buildSajuPrompt } from './sajuPrompt'
import {
  LOADING_MASCOT_SRC,
  Mascot,
  PawTrail,
  SajuMarkdown,
  calendarLabel,
  genderLabel,
  getAge,
  getPreviewMarkdown,
} from './sajuDisplay'
import { isSupabaseConfigured, supabase } from './supabase'

const GUEST_READING_KEY = 'saju-me-guest-reading'
const LOADING_STEP_MS = 850

function buildLoadingSteps(subject) {
  const [year, month, day] = String(subject.birth_date).split('-')
  const time = String(subject.birth_time).slice(0, 5)
  const monthNum = Number(month)
  const dayNum = Number(day)
  const name = subject.name || '너'

  return [
    `${name} 사주를 펼쳤다멍.`,
    `${year}년생 확인했다멍.`,
    `${monthNum}월 ${dayNum}일생 확인했다멍.`,
    `${time} 태어난 시간 확인했다멍.`,
    `${calendarLabel(subject.calendar_type)} · ${genderLabel(subject.gender)} 확인했다멍.`,
    '년월일시 명식을 맞추고 있다멍.',
    '오행 개수를 세고 있다멍.',
    '십신·운성을 대조하고 있다멍.',
    '구조를 쪼개고 있다멍. 감정은 배제하겠다멍.',
  ]
}

function persistGuestReading(payload) {
  try {
    sessionStorage.setItem(GUEST_READING_KEY, JSON.stringify(payload))
  } catch {
    // ignore quota / private mode
  }
}

function readGuestReading() {
  try {
    const raw = sessionStorage.getItem(GUEST_READING_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function clearGuestReading() {
  try {
    sessionStorage.removeItem(GUEST_READING_KEY)
  } catch {
    // ignore
  }
}

const READING_SELECT =
  'id, name, birth_date, birth_time, gender, calendar_type, result, created_at, user_id, share_token, is_shared'

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
  const [loadingSteps, setLoadingSteps] = useState([])
  const [loadingStepIndex, setLoadingStepIndex] = useState(0)
  const [error, setError] = useState('')

  const [readings, setReadings] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [resultKey, setResultKey] = useState(0)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareFeedback, setShareFeedback] = useState('')
  const [readingCount, setReadingCount] = useState(null)
  const guestAdoptInFlight = useRef(false)

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

  const loadProfile = async (userId, { openOnboarding = true } = {}) => {
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
        if (openOnboarding) openProfileModal('onboarding', data)
      } else {
        setProfileModalOpen(false)
      }

      return data
    } catch (err) {
      setError(err.message || '프로필을 불러오지 못했습니다.')
      setProfile(null)
      if (openOnboarding) openProfileModal('onboarding')
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
      .select(READING_SELECT)
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
    if (!isSupabaseConfigured || !supabase) return

    let cancelled = false

    supabase.rpc('saju_reading_count').then(({ data, error: countError }) => {
      if (cancelled || countError) return
      const nextCount = Number(data)
      if (Number.isFinite(nextCount)) {
        setReadingCount(nextCount)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const handleGoogleSignIn = async () => {
    const guestSubject =
      activeSubject ||
      (isProfileComplete({ ...newSajuForm, name: newSajuForm.name.trim() })
        ? { ...newSajuForm, name: newSajuForm.name.trim() }
        : null)

    if (result || guestSubject) {
      persistGuestReading({
        result: result || '',
        subject: guestSubject,
      })
    }

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
    setShareFeedback('')
    showResult(reading.result)
  }

  const handleNewSaju = () => {
    setSelectedId(null)
    setResult('')
    setError('')
    setShareFeedback('')
    setActiveSubject(null)
    setNewSajuForm(emptyProfileForm())
    clearGuestReading()
    if (session?.user) {
      setNewSajuModalOpen(true)
    }
  }

  const handleProfileFieldChange = (field) => (event) => {
    setProfileForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const handleNewSajuFieldChange = (field) => (event) => {
    setNewSajuForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const upsertUserProfile = async (userId, subject) => {
    const payload = {
      id: userId,
      name: String(subject.name || '').trim(),
      birth_date: subject.birth_date,
      birth_time: String(subject.birth_time || '').slice(0, 5),
      gender: subject.gender,
      calendar_type: subject.calendar_type,
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

  const saveProfile = async () => {
    const user = requireAuth()
    return upsertUserProfile(user.id, profileForm)
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
        .select(READING_SELECT)
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
      .select(READING_SELECT)
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
    setShareFeedback('')
    setResult('')
    setLoadingSteps(buildLoadingSteps(subject))
    setLoadingStepIndex(0)
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
      if (session?.user) {
        await saveReading(text, subject)
      } else {
        persistGuestReading({ result: text, subject })
      }
    } finally {
      setLoading(false)
      setLoadingSteps([])
      setLoadingStepIndex(0)
    }
  }

  useEffect(() => {
    if (!loading || loadingSteps.length === 0) return undefined

    const timer = window.setInterval(() => {
      setLoadingStepIndex((prev) => Math.min(prev + 1, loadingSteps.length - 1))
    }, LOADING_STEP_MS)

    return () => window.clearInterval(timer)
  }, [loading, loadingSteps.length])

  useEffect(() => {
    if (authLoading) return

    if (!session?.user) {
      guestAdoptInFlight.current = false
      setReadings([])
      setSelectedId(null)
      setProfile(null)

      const guest = readGuestReading()
      if (guest?.result) {
        setActiveSubject(guest.subject ?? null)
        setResult(guest.result)
        if (guest.subject) {
          setNewSajuForm(emptyProfileForm(guest.subject))
        }
      }
      return
    }

    let cancelled = false

    const adoptGuestReading = async () => {
      const guest = readGuestReading()
      const canAdoptProfile = Boolean(guest?.subject && isProfileComplete(guest.subject))

      const loadedProfile = await loadProfile(session.user.id, {
        openOnboarding: !canAdoptProfile,
      })
      if (cancelled) return
      await loadReadings()
      if (cancelled) return

      if (!isProfileComplete(loadedProfile) && canAdoptProfile) {
        try {
          await upsertUserProfile(session.user.id, guest.subject)
        } catch {
          openProfileModal('onboarding', loadedProfile)
        }
      }

      if (!guest?.result || guestAdoptInFlight.current) return

      guestAdoptInFlight.current = true
      setSelectedId(null)
      setActiveSubject(guest.subject ?? null)
      showResult(guest.result, { scroll: false })

      try {
        await saveReading(guest.result, guest.subject)
        clearGuestReading()
      } catch (err) {
        guestAdoptInFlight.current = false
        persistGuestReading(guest)
        if (!cancelled) {
          setError(err.message || '결과 저장에 실패했다멍.')
        }
      }
    }

    setError('')
    adoptGuestReading()

    return () => {
      cancelled = true
    }
  }, [session, authLoading])

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

  const getShareUrl = (shareToken) => `${window.location.origin}/result/${shareToken}`

  const copyShareLink = async (url) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
      return
    }

    const input = document.createElement('input')
    input.value = url
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
  }

  const handleShare = async () => {
    if (!selectedId) {
      setError('저장이 끝난 뒤에 공유할 수 있다멍.')
      return
    }

    const current = readings.find((item) => item.id === selectedId)
    if (!current?.share_token) {
      setError('공유 링크를 만들지 못했다멍. 기록을 다시 열어 주세요.')
      return
    }

    setShareBusy(true)
    setShareFeedback('')
    setError('')

    try {
      requireAuth()

      let shareToken = current.share_token
      let nextReading = current

      if (!current.is_shared) {
        const { data, error: updateError } = await supabase
          .from('saju_readings')
          .update({ is_shared: true })
          .eq('id', selectedId)
          .select(READING_SELECT)
          .single()

        if (updateError) {
          throw new Error(`공유 설정 실패: ${updateError.message}`)
        }

        nextReading = data
        shareToken = data.share_token
        setReadings((prev) => prev.map((item) => (item.id === data.id ? data : item)))
      }

      const url = getShareUrl(shareToken)
      const shareTitle = `${nextReading.name || '멍사주'} 결과`
      const shareText = `${nextReading.name || '친구'}의 멍사주 결과다멍.`

      if (navigator.share) {
        try {
          await navigator.share({ title: shareTitle, text: shareText, url })
          setShareFeedback('공유했다멍.')
          return
        } catch (shareErr) {
          if (shareErr?.name === 'AbortError') return
        }
      }

      await copyShareLink(url)
      setShareFeedback('링크를 복사했다멍. 친구에게 붙여넣기 하면 된다멍.')
    } catch (err) {
      setError(err.message || '공유 중 오류가 발생했다멍.')
    } finally {
      setShareBusy(false)
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

  const handleSubmitGuestSaju = async (event) => {
    event.preventDefault()
    setError('')

    try {
      setSelectedId(null)
      await analyzeWithSubject({
        name: newSajuForm.name.trim(),
        birth_date: newSajuForm.birth_date,
        birth_time: newSajuForm.birth_time,
        gender: newSajuForm.gender,
        calendar_type: newSajuForm.calendar_type,
      })
    } catch (err) {
      setError(err.message || '해석 요청 중 오류가 발생했습니다.')
    }
  }

  const busy = loading || authBusy || profileSaving || profileLoading || shareBusy
  const isLoggedIn = Boolean(session?.user)
  const isResultLocked = Boolean(!isLoggedIn && result)
  const displayedResult = isResultLocked ? getPreviewMarkdown(result) : result
  const profileReady = isProfileComplete(profile)
  const displayName = profile?.name || session?.user?.user_metadata?.full_name || session?.user?.email || ''
  const userEmail = session?.user?.email ?? ''
  const subject = activeSubject || (profileReady ? profile : null)
  const subjectAge = subject?.birth_date ? getAge(subject.birth_date) : null
  const profileAge = profileReady ? getAge(profile.birth_date) : null
  const selectedReading = selectedId ? readings.find((item) => item.id === selectedId) : null
  const showGuestForm = !isLoggedIn && !loading && !result

  if (authLoading) {
    return (
      <div className="auth-screen">
        <p className="auth-status">불러오는 중이다멍...</p>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="mascot-hero">
        <Mascot className="mascot--hero" />
        <p className="mascot-hero-name">멍사주</p>
        <p className="mascot-hero-copy">
          {isLoggedIn
            ? '사실대로 말해주겠다멍.'
            : '사실대로 말해주겠다멍. 생년월일을 넣고 들어보라멍.'}
        </p>
      </header>

      <div className={`layout${isLoggedIn ? '' : ' layout--guest'}`}>
      {isLoggedIn && (
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

        <h2 className="sidebar-title">멍사주 기록</h2>
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
      )}

      <div className="app">
        <div className="app-header">
          <h1>{selectedId ? '저장된 사주' : '내 사주'}</h1>
          {isLoggedIn ? (
            <button
              type="button"
              className="new-saju-btn new-saju-btn--ghost"
              onClick={handleNewSaju}
              disabled={busy}
            >
              새 사주 보기
            </button>
          ) : (
            <div className="app-header-actions">
              {(result || loading) && (
                <button
                  type="button"
                  className="new-saju-btn new-saju-btn--ghost"
                  onClick={handleNewSaju}
                  disabled={busy}
                >
                  다른 사주 보기
                </button>
              )}
              <button
                type="button"
                className="new-saju-btn new-saju-btn--ghost"
                onClick={handleGoogleSignIn}
                disabled={authBusy || !isSupabaseConfigured}
              >
                {authBusy ? '이동 중...' : '로그인'}
              </button>
            </div>
          )}
        </div>

        {isLoggedIn ? (
          <>
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
                {loading ? '분석 중이다멍...' : '내 사주 보기'}
              </button>
            </div>
          </>
        ) : showGuestForm ? (
          <form className="guest-form" onSubmit={handleSubmitGuestSaju}>
            <p className="guest-form-copy">이름과 생년월일을 넣으면 바로 풀어주겠다멍.</p>

            <label htmlFor="guest-name">이름</label>
            <input
              id="guest-name"
              type="text"
              value={newSajuForm.name}
              onChange={handleNewSajuFieldChange('name')}
              placeholder="이름을 입력하세요"
              disabled={loading}
              required
              autoFocus
            />

            <label htmlFor="guest-birthDate">생년월일</label>
            <input
              id="guest-birthDate"
              type="date"
              value={newSajuForm.birth_date}
              onChange={handleNewSajuFieldChange('birth_date')}
              disabled={loading}
              required
            />

            <label htmlFor="guest-birthTime">태어난 시간</label>
            <input
              id="guest-birthTime"
              type="time"
              value={newSajuForm.birth_time}
              onChange={handleNewSajuFieldChange('birth_time')}
              disabled={loading}
              required
            />

            <label htmlFor="guest-gender">성별</label>
            <select
              id="guest-gender"
              value={newSajuForm.gender}
              onChange={handleNewSajuFieldChange('gender')}
              disabled={loading}
              required
            >
              <option value="">선택하세요</option>
              <option value="male">남자</option>
              <option value="female">여자</option>
            </select>

            <label htmlFor="guest-calendarType">양력 / 음력</label>
            <select
              id="guest-calendarType"
              value={newSajuForm.calendar_type}
              onChange={handleNewSajuFieldChange('calendar_type')}
              disabled={loading}
              required
            >
              <option value="">선택하세요</option>
              <option value="solar">양력</option>
              <option value="lunar">음력</option>
            </select>

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
        ) : (
          subject && (
            <section className="profile-card">
              <div className="profile-card-top">
                <div>
                  <p className="profile-card-label">지금 보는 사주</p>
                  <h2 className="profile-card-name">{subject.name}</h2>
                </div>
                <button
                  type="button"
                  className="profile-edit-link"
                  onClick={handleNewSaju}
                  disabled={busy}
                >
                  다시 입력
                </button>
              </div>
              <p className="profile-card-meta">
                {[
                  subject.birth_date,
                  subject.birth_time ? String(subject.birth_time).slice(0, 5) : '',
                  genderLabel(subject.gender),
                  calendarLabel(subject.calendar_type),
                  subjectAge != null ? `만 ${subjectAge}세` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </section>
          )
        )}

        {error && <p className="error">{error}</p>}

        {loading && (
          <section
            id="saju-result"
            className="loading-panel"
            aria-busy="true"
            aria-live="polite"
          >
            <PawTrail className="paw-trail--loading" />
            <Mascot
              src={LOADING_MASCOT_SRC}
              className="mascot--loading"
              alt="사주 보는 중"
            />
            <PawTrail className="paw-trail--loading paw-trail--loading-bottom" />
            <p className="loading-eyebrow">사주 보는 중이다멍</p>
            <p className="loading-status" key={loadingStepIndex}>
              {loadingSteps[loadingStepIndex] || '구조를 쪼개고 있다멍.'}
            </p>
          </section>
        )}

        {!loading && result && (
          <section id="saju-result" className="result" key={resultKey}>
            <header className="result-header">
              <div className="result-mascot-row">
                <Mascot className="mascot--result" />
                <div className="result-header-copy">
                  <p className="result-eyebrow">
                    {selectedId ? '멍사주 저장본' : '멍사주 해석'}
                  </p>
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
                </div>
              </div>
              {selectedId && (
                <div className="result-share">
                  <button
                    type="button"
                    className="share-btn"
                    onClick={handleShare}
                    disabled={shareBusy}
                  >
                    {shareBusy
                      ? '공유 준비 중...'
                      : selectedReading?.is_shared
                        ? '공유 링크 복사'
                        : '친구에게 공유'}
                  </button>
                  {shareFeedback && <p className="share-feedback">{shareFeedback}</p>}
                </div>
              )}
            </header>
            <div className={`result-text${isResultLocked ? ' result-text--locked' : ''}`}>
              <SajuMarkdown markdown={displayedResult} />
              {isResultLocked && (
                <div className="result-lock">
                  <div className="result-lock-card">
                    <Mascot className="mascot--lock" />
                    <p className="result-lock-copy">
                      여기까지가 무료다멍. 나머지 해석을 보려면 로그인하라멍.
                    </p>
                    <button
                      type="button"
                      className="google-btn"
                      onClick={handleGoogleSignIn}
                      disabled={authBusy || !isSupabaseConfigured}
                    >
                      {authBusy ? 'Google로 이동 중...' : 'Google로 계속하기'}
                    </button>
                    <p className="result-lock-hint">로그인하면 전체 해석이 저장된다멍.</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
      </div>

      {isLoggedIn && profileModalOpen && (
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
                ? '한 번만 입력하면 다음부터 바로 분석하겠다멍.'
                : '바꾼 정보는 다음 분석부터 반영하겠다멍.'}
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

      {isLoggedIn && newSajuModalOpen && (
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
                  {loading ? '분석 중이다멍...' : '풀이하고 저장'}
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
