import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MascotHero } from '../components/brand'
import { SajuResultView } from '../components/saju'
import { trackEvent } from '../lib/analytics'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

export default function ResultPage() {
  const { shareToken } = useParams()
  const [reading, setReading] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadSharedReading() {
      if (!shareToken) {
        setError('공유 링크가 올바르지 않다멍.')
        setLoading(false)
        return
      }

      if (!isSupabaseConfigured || !supabase) {
        setError('서비스 설정이 없다멍.')
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')

      const { data, error: fetchError } = await supabase
        .from('saju_readings')
        .select(
          'id, name, birth_date, birth_time, gender, calendar_type, result, created_at, share_token, is_shared'
        )
        .eq('share_token', shareToken)
        .eq('is_shared', true)
        .maybeSingle()

      if (cancelled) return

      if (fetchError) {
        setError(`불러오기 실패: ${fetchError.message}`)
        setReading(null)
      } else if (!data) {
        setError('공유된 사주를 찾지 못했다멍. 링크가 만료됐거나 비공개일 수 있다멍.')
        setReading(null)
      } else {
        setReading(data)
        trackEvent('view_item', { content_type: 'shared_saju' })
      }

      setLoading(false)
    }

    loadSharedReading()
    return () => {
      cancelled = true
    }
  }, [shareToken])

  return (
    <div className="page page--public">
      <MascotHero copy="사실대로 말해주겠다멍." />

      <main className="public-result">
        {loading && <p className="auth-status">공유 결과를 불러오는 중이다멍...</p>}
        {!loading && error && <p className="error">{error}</p>}
        {!loading && reading && <SajuResultView reading={reading} />}

        <div className="public-result-actions">
          <Link
            to="/"
            className="analyze-btn public-home-btn"
            onClick={() =>
              trackEvent('cta_click', { cta: 'try_own_saju', page: 'shared_result' })
            }
          >
            내 사주도 보러 가기
          </Link>
        </div>
      </main>
    </div>
  )
}
