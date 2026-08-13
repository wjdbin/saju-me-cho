/**
 * Gemini API 호출 (fetch만 사용)
 * 모델이 없거나(404) 할당량(429)이면 다음 flash 계열로 자동 전환합니다.
 */

const DEFAULT_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
]

function getModelCandidates() {
  const preferred = import.meta.env.VITE_GEMINI_MODEL?.trim()
  const list = preferred ? [preferred, ...DEFAULT_MODELS] : DEFAULT_MODELS
  return [...new Set(list)]
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseRetryDelayMs(errorBody) {
  try {
    const json = JSON.parse(errorBody)
    const details = json?.error?.details
    if (!Array.isArray(details)) return 0

    const retryInfo = details.find((item) =>
      String(item?.['@type'] || '').includes('RetryInfo')
    )
    const delay = retryInfo?.retryDelay
    if (!delay) return 0

    if (typeof delay === 'number') return Math.ceil(delay * 1000)
    const match = String(delay).match(/([\d.]+)s/)
    if (match) return Math.ceil(Number(match[1]) * 1000)
  } catch {
    // ignore
  }

  const textMatch = String(errorBody).match(/retry in\s+([\d.]+)\s*ms/i)
  if (textMatch) return Math.ceil(Number(textMatch[1]))

  const secMatch = String(errorBody).match(/retry in\s+([\d.]+)\s*s/i)
  if (secMatch) return Math.ceil(Number(secMatch[1]) * 1000)

  return 0
}

function isQuotaError(status, errorBody) {
  if (status === 429) return true
  return /RESOURCE_EXHAUSTED|exceeded your current quota|quota/i.test(errorBody)
}

function isModelUnavailableError(status, errorBody) {
  if (status === 404) return true
  return /NOT_FOUND|is not found|not supported|not available/i.test(errorBody)
}

function friendlyQuotaMessage() {
  return '오늘 Gemini 무료 사용량을 다 썼다멍. 잠시 후 다시 시도하거나, Google AI Studio에서 할당량·결제 설정을 확인하라멍.'
}

function friendlyModelMessage() {
  return '사용 가능한 Gemini 모델을 찾지 못했다멍. .env의 VITE_GEMINI_MODEL을 확인하거나 Google AI Studio에서 모델 목록을 보라멍.'
}

async function generateOnce(apiKey, model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    const err = new Error(errorBody)
    err.status = response.status
    err.model = model
    err.body = errorBody
    throw err
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text

  if (!text) {
    throw new Error('Gemini가 빈 응답을 반환했습니다.')
  }

  return text
}

export async function askGemini(prompt) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY

  if (!apiKey) {
    throw new Error(
      'VITE_GEMINI_API_KEY가 없습니다. .env 파일을 확인하고 개발 서버를 재시작하세요.'
    )
  }

  const models = getModelCandidates()
  let lastQuotaError = null
  let sawModelUnavailable = false

  for (const model of models) {
    try {
      return await generateOnce(apiKey, model, prompt)
    } catch (err) {
      const status = err?.status
      const body = err?.body || err?.message || ''

      if (isModelUnavailableError(status, body)) {
        sawModelUnavailable = true
        continue
      }

      if (isQuotaError(status, body)) {
        lastQuotaError = err
        const delayMs = Math.min(parseRetryDelayMs(body), 2500)
        if (delayMs > 0) {
          await sleep(delayMs)
          try {
            return await generateOnce(apiKey, model, prompt)
          } catch (retryErr) {
            const retryStatus = retryErr?.status
            const retryBody = retryErr?.body || retryErr?.message || ''
            if (isModelUnavailableError(retryStatus, retryBody)) {
              sawModelUnavailable = true
              continue
            }
            if (isQuotaError(retryStatus, retryBody)) {
              lastQuotaError = retryErr
              continue
            }
            throw new Error(
              `Gemini API 오류 (${retryStatus || '?'}): 잠시 후 다시 시도하라멍.`
            )
          }
        }
        continue
      }

      throw new Error(
        `Gemini API 오류 (${status || '?'}): 요청에 실패했다멍. 잠시 후 다시 시도하라멍.`
      )
    }
  }

  if (lastQuotaError) {
    throw new Error(friendlyQuotaMessage())
  }

  if (sawModelUnavailable) {
    throw new Error(friendlyModelMessage())
  }

  throw new Error('Gemini 요청에 실패했다멍.')
}
