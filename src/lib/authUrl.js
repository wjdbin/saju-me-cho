export function readOAuthErrorFromUrl() {
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

export function clearAuthParamsFromUrl() {
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
