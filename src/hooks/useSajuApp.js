import { useEffect, useRef, useState } from 'react'
import { askGemini } from '../lib/gemini'
import { buildSajuPrompt } from '../lib/sajuPrompt'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { clearAuthParamsFromUrl, readOAuthErrorFromUrl } from '../lib/authUrl'
import { clearGuestReading, persistGuestReading, readGuestReading } from '../lib/guestReading'
import { LOADING_STEP_MS, buildLoadingSteps } from '../lib/loadingSteps'
import {
  READING_SELECT,
  emptyProfileForm,
  formatReadingLabel,
  getAge,
  isProfileComplete,
  normalizeBirthTime,
} from '../lib/profile'
import { getPreviewMarkdown } from '../components/saju'
import { consumeLoginPending, markLoginPending, trackEvent } from '../lib/analytics'

export function useSajuApp() {
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
        if (consumeLoginPending()) {
          trackEvent('login', { method: 'google' })
        }
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

  const handleGoogleSignIn = async (source = 'unknown') => {
    const origin = typeof source === 'string' ? source : 'unknown'
    markLoginPending()
    trackEvent('login_click', { method: 'google', source: origin })

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
      trackEvent('login_error', { method: 'google', source: origin })
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
      trackEvent('sign_out')
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
    trackEvent('select_content', { content_type: 'saju_reading' })
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
    trackEvent('new_saju_click', { logged_in: Boolean(session?.user) })
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
      birth_time: normalizeBirthTime(subject.birth_time),
      gender: subject.gender,
      calendar_type: subject.calendar_type,
    }

    if (!payload.name || !payload.birth_date || !payload.gender || !payload.calendar_type) {
      throw new Error('이름, 생년월일, 성별, 양력/음력을 입력해 주세요.')
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
      trackEvent('profile_save', { mode: profileModalMode })
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
      birth_time: normalizeBirthTime(subject.birth_time),
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

  const analyzeWithSubject = async (subject, method = 'unknown') => {
    if (
      !subject?.name ||
      !subject?.birth_date ||
      !subject?.gender ||
      !subject?.calendar_type
    ) {
      throw new Error('이름, 생년월일, 성별, 양력/음력을 입력해 주세요.')
    }

    setError('')
    setShareFeedback('')
    setResult('')
    setLoadingSteps(buildLoadingSteps(subject))
    setLoadingStepIndex(0)
    setLoading(true)
    setActiveSubject(subject)
    trackEvent('generate_saju', {
      method,
      logged_in: Boolean(session?.user),
    })

    try {
      const prompt = buildSajuPrompt({
        name: subject.name,
        birthDate: subject.birth_date,
        birthTime: normalizeBirthTime(subject.birth_time) ?? '',
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
      trackEvent('saju_complete', {
        method,
        logged_in: Boolean(session?.user),
      })
    } catch (err) {
      trackEvent('saju_error', {
        method,
        logged_in: Boolean(session?.user),
      })
      throw err
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

      trackEvent('delete_reading')
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
          trackEvent('share', {
            method: 'web_share',
            content_type: 'saju_reading',
          })
          return
        } catch (shareErr) {
          if (shareErr?.name === 'AbortError') return
        }
      }

      await copyShareLink(url)
      setShareFeedback('링크를 복사했다멍. 친구에게 붙여넣기 하면 된다멍.')
      trackEvent('share', {
        method: 'copy_link',
        content_type: 'saju_reading',
      })
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
      await analyzeWithSubject(
        {
          name: profile.name,
          birth_date: profile.birth_date,
          birth_time: normalizeBirthTime(profile.birth_time),
          gender: profile.gender,
          calendar_type: profile.calendar_type,
        },
        'my_saju'
      )
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
      await analyzeWithSubject(
        {
          name: newSajuForm.name.trim(),
          birth_date: newSajuForm.birth_date,
          birth_time: newSajuForm.birth_time,
          gender: newSajuForm.gender,
          calendar_type: newSajuForm.calendar_type,
        },
        'new_saju'
      )
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
      await analyzeWithSubject(
        {
          name: newSajuForm.name.trim(),
          birth_date: newSajuForm.birth_date,
          birth_time: newSajuForm.birth_time,
          gender: newSajuForm.gender,
          calendar_type: newSajuForm.calendar_type,
        },
        'guest'
      )
    } catch (err) {
      setError(err.message || '해석 요청 중 오류가 발생했습니다.')
    }
  }

  const busy = loading || authBusy || profileSaving || profileLoading || shareBusy
  const isLoggedIn = Boolean(session?.user)
  const isResultLocked = Boolean(!isLoggedIn && result)
  const displayedResult = isResultLocked ? getPreviewMarkdown(result) : result
  const profileReady = isProfileComplete(profile)
  const displayName =
    profile?.name || session?.user?.user_metadata?.full_name || session?.user?.email || ''
  const userEmail = session?.user?.email ?? ''
  const subject = activeSubject || (profileReady ? profile : null)
  const selectedReading = selectedId
    ? readings.find((item) => item.id === selectedId)
    : null
  const showGuestForm = !isLoggedIn && !loading && !result

  return {
    authLoading,
    busy,
    isLoggedIn,
    isResultLocked,
    displayedResult,
    profileReady,
    displayName,
    userEmail,
    subject,
    selectedReading,
    showGuestForm,
    profile,
    profileForm,
    profileModalOpen,
    profileModalMode,
    profileSaving,
    newSajuModalOpen,
    newSajuForm,
    result,
    loading,
    loadingSteps,
    loadingStepIndex,
    error,
    readings,
    selectedId,
    resultKey,
    shareBusy,
    shareFeedback,
    readingCount,
    authBusy,
    openProfileModal,
    setProfileModalOpen,
    setNewSajuModalOpen,
    handleGoogleSignIn,
    handleSignOut,
    handleSelectReading,
    handleNewSaju,
    handleProfileFieldChange,
    handleNewSajuFieldChange,
    handleSaveProfile,
    handleDelete,
    handleShare,
    handleAnalyze,
    handleSubmitNewSaju,
    handleSubmitGuestSaju,
  }
}
