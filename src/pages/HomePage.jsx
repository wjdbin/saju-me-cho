import { AppHeader, Sidebar } from '../components/navigation'
import { MascotHero } from '../components/brand'
import { GuestSajuForm, LoadingPanel, NewSajuModal, ResultSection } from '../components/saju'
import { ProfileCard, ProfileModal } from '../components/profile'
import { useSajuApp } from '../hooks/useSajuApp'

export default function HomePage() {
  const app = useSajuApp()

  if (app.authLoading) {
    return (
      <div className="auth-screen">
        <p className="auth-status">불러오는 중이다멍...</p>
      </div>
    )
  }

  return (
    <div className="page">
      <MascotHero
        copy={
          app.isLoggedIn
            ? '사실대로 말해주겠다멍.'
            : '사실대로 말해주겠다멍. 생년월일을 넣고 들어보라멍.'
        }
      />

      <div className={`layout${app.isLoggedIn ? '' : ' layout--guest'}`}>
        {app.isLoggedIn && (
          <Sidebar
            displayName={app.displayName}
            userEmail={app.userEmail}
            readings={app.readings}
            selectedId={app.selectedId}
            busy={app.busy}
            onSignOut={app.handleSignOut}
            onEditProfile={() => app.openProfileModal('edit', app.profile)}
            onNewSaju={app.handleNewSaju}
            onSelectReading={app.handleSelectReading}
            onDeleteReading={app.handleDelete}
          />
        )}

        <div className="app">
          <AppHeader
            title={app.selectedId ? '저장된 사주' : '내 사주'}
            isLoggedIn={app.isLoggedIn}
            busy={app.busy}
            authBusy={app.authBusy}
            hasGuestResult={Boolean(app.result || app.loading)}
            onNewSaju={app.handleNewSaju}
            onGoogleSignIn={app.handleGoogleSignIn}
          />

          {app.isLoggedIn ? (
            <>
              {app.profileReady ? (
                <ProfileCard
                  name={app.profile.name}
                  subject={app.profile}
                  actionLabel="수정"
                  onAction={() => app.openProfileModal('edit', app.profile)}
                  disabled={app.busy}
                />
              ) : (
                <ProfileCard
                  empty
                  emptyCopy="프로필을 입력하면 바로 사주를 볼 수 있어요."
                  emptyActionLabel="프로필 입력하기"
                  onAction={() => app.openProfileModal('onboarding', app.profile)}
                  disabled={app.busy}
                />
              )}

              <div className="action-row">
                <button
                  type="button"
                  className="analyze-btn"
                  onClick={app.handleAnalyze}
                  disabled={app.busy || !app.profileReady}
                >
                  {app.loading ? '분석 중이다멍...' : '내 사주 보기'}
                </button>
              </div>
            </>
          ) : app.showGuestForm ? (
            <GuestSajuForm
              form={app.newSajuForm}
              onFieldChange={app.handleNewSajuFieldChange}
              onSubmit={app.handleSubmitGuestSaju}
              busy={app.busy}
              loading={app.loading}
              readingCount={app.readingCount}
            />
          ) : (
            app.subject && (
              <ProfileCard
                label="지금 보는 사주"
                name={app.subject.name}
                subject={app.subject}
                actionLabel="다시 입력"
                onAction={app.handleNewSaju}
                disabled={app.busy}
              />
            )
          )}

          {app.error && <p className="error">{app.error}</p>}

          {app.loading && (
            <LoadingPanel
              loadingSteps={app.loadingSteps}
              loadingStepIndex={app.loadingStepIndex}
            />
          )}

          {!app.loading && app.result && (
            <ResultSection
              resultKey={app.resultKey}
              subject={app.subject}
              selectedId={app.selectedId}
              selectedReading={app.selectedReading}
              displayedResult={app.displayedResult}
              isResultLocked={app.isResultLocked}
              shareBusy={app.shareBusy}
              shareFeedback={app.shareFeedback}
              authBusy={app.authBusy}
              onShare={app.handleShare}
              onGoogleSignIn={app.handleGoogleSignIn}
            />
          )}
        </div>
      </div>

      {app.isLoggedIn && app.profileModalOpen && (
        <ProfileModal
          mode={app.profileModalMode}
          form={app.profileForm}
          onFieldChange={app.handleProfileFieldChange}
          onSubmit={app.handleSaveProfile}
          onCancel={() => app.setProfileModalOpen(false)}
          saving={app.profileSaving}
          canCancel={app.profileReady}
          error={app.error}
        />
      )}

      {app.isLoggedIn && app.newSajuModalOpen && (
        <NewSajuModal
          form={app.newSajuForm}
          onFieldChange={app.handleNewSajuFieldChange}
          onSubmit={app.handleSubmitNewSaju}
          onClose={() => app.setNewSajuModalOpen(false)}
          loading={app.loading}
          error={app.error}
        />
      )}
    </div>
  )
}
