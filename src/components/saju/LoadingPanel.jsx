import { LOADING_MASCOT_SRC, Mascot, PawTrail } from '../brand'

export function LoadingPanel({ loadingSteps, loadingStepIndex }) {
  return (
    <section id="saju-result" className="loading-panel" aria-busy="true" aria-live="polite">
      <PawTrail className="paw-trail--loading" />
      <Mascot src={LOADING_MASCOT_SRC} className="mascot--loading" alt="사주 보는 중" />
      <PawTrail className="paw-trail--loading paw-trail--loading-bottom" />
      <p className="loading-eyebrow">사주 보는 중이다멍</p>
      <p className="loading-status" key={loadingStepIndex}>
        {loadingSteps[loadingStepIndex] || '구조를 쪼개고 있다멍.'}
      </p>
    </section>
  )
}
