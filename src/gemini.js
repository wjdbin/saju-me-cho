/**
 * Gemini API 호출 (fetch만 사용, 외부 HTTP 라이브러리 없음)
 * 모델: gemini-3.6-flash
 * (gemini-2.5-flash는 신규 사용자에게 더 이상 제공되지 않음)
 */
export async function askGemini(prompt) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY

  if (!apiKey) {
    throw new Error(
      'VITE_GEMINI_API_KEY가 없습니다. .env 파일을 확인하고 개발 서버를 재시작하세요.'
    )
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`

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
    throw new Error(`Gemini API 오류 (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text

  if (!text) {
    throw new Error('Gemini가 빈 응답을 반환했습니다.')
  }

  return text
}
