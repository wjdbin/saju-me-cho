const GUEST_READING_KEY = 'saju-me-guest-reading'

export function persistGuestReading(payload) {
  try {
    sessionStorage.setItem(GUEST_READING_KEY, JSON.stringify(payload))
  } catch {
    // ignore quota / private mode
  }
}

export function readGuestReading() {
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

export function clearGuestReading() {
  try {
    sessionStorage.removeItem(GUEST_READING_KEY)
  } catch {
    // ignore
  }
}
