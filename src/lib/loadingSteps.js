import { calendarLabel, genderLabel, normalizeBirthTime } from './profile'

export const LOADING_STEP_MS = 850

export function buildLoadingSteps(subject) {
  const [year, month, day] = String(subject.birth_date).split('-')
  const time = normalizeBirthTime(subject.birth_time)
  const monthNum = Number(month)
  const dayNum = Number(day)
  const name = subject.name || '너'

  return [
    `${name} 사주를 펼쳤다멍.`,
    `${year}년생 확인했다멍.`,
    `${monthNum}월 ${dayNum}일생 확인했다멍.`,
    time ? `${time} 태어난 시간 확인했다멍.` : '태어난 시간은 모른다 했다멍.',
    `${calendarLabel(subject.calendar_type)} · ${genderLabel(subject.gender)} 확인했다멍.`,
    time ? '년월일시 명식을 맞추고 있다멍.' : '년월일 명식을 맞추고 있다멍.',
    '오행 개수를 세고 있다멍.',
    '십신·운성을 대조하고 있다멍.',
    '구조를 쪼개고 있다멍. 감정은 배제하겠다멍.',
  ]
}
