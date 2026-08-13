export const GA_MEASUREMENT_ID = 'G-F9F1R3X4FR'

const LOGIN_PENDING_KEY = 'ga_login_pending'

function gtag(...args) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag(...args)
}

export function trackPageView(path) {
  gtag('config', GA_MEASUREMENT_ID, {
    page_path: path,
    page_title: document.title,
    page_location: window.location.href,
  })
}

export function trackEvent(eventName, params = {}) {
  gtag('event', eventName, params)
}

export function markLoginPending() {
  try {
    sessionStorage.setItem(LOGIN_PENDING_KEY, '1')
  } catch {
    // ignore storage errors
  }
}

export function consumeLoginPending() {
  try {
    const pending = sessionStorage.getItem(LOGIN_PENDING_KEY) === '1'
    if (pending) sessionStorage.removeItem(LOGIN_PENDING_KEY)
    return pending
  } catch {
    return false
  }
}
