export const READING_SELECT =
  'id, name, birth_date, birth_time, gender, calendar_type, result, created_at, user_id, share_token, is_shared'

export function isProfileComplete(profile) {
  return Boolean(
    profile?.name &&
      profile?.birth_date &&
      profile?.birth_time &&
      profile?.gender &&
      profile?.calendar_type
  )
}

export function emptyProfileForm(seed = {}) {
  return {
    name: seed.name ?? '',
    birth_date: seed.birth_date ?? '',
    birth_time: seed.birth_time ? String(seed.birth_time).slice(0, 5) : '',
    gender: seed.gender ?? '',
    calendar_type: seed.calendar_type ?? '',
  }
}

export function formatReadingLabel(createdAt) {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return '사주 기록'
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function genderLabel(gender) {
  if (gender === 'male') return '남자'
  if (gender === 'female') return '여자'
  return gender || ''
}

export function calendarLabel(calendarType) {
  if (calendarType === 'solar') return '양력'
  if (calendarType === 'lunar') return '음력'
  return calendarType || ''
}

export function getAge(birthDate) {
  if (!birthDate) return null
  const today = new Date()
  const birth = new Date(birthDate)
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1
  }
  return age
}

export function formatSubjectMeta(subject) {
  if (!subject) return ''
  const age = getAge(subject.birth_date)
  return [
    subject.birth_date,
    subject.birth_time ? String(subject.birth_time).slice(0, 5) : '',
    genderLabel(subject.gender),
    calendarLabel(subject.calendar_type),
    age != null ? `만 ${age}세` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}
