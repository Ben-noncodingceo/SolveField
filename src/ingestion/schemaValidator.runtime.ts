// Worker-safe helpers for the precompiled ingestion schema validator.
// Keep these local and ESM-only: importing the CommonJS AJV runtime helpers
// made OpenNext's production minifier turn ucs2length into a non-callable
// namespace object (`n is not a function`).

export const ucs2length = (value: string) => {
  let length = 0
  for (let index = 0; index < value.length; index += 1) {
    length += 1
    const first = value.charCodeAt(index)
    if (first >= 0xd800 && first <= 0xdbff && index + 1 < value.length) {
      const second = value.charCodeAt(index + 1)
      if ((second & 0xfc00) === 0xdc00) index += 1
    }
  }
  return length
}

// These are the exact full-mode `uri` primitives used by ajv-formats 3.x.
// Keeping the same implementation preserves the frozen schema contract while
// avoiding a CommonJS runtime import in the Worker bundle.
const notURIFragment = /\/|:/
const absoluteURI = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i

const leapYear = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
const daysByMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/
const timePattern = /^(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)(z|([+-])(\d{2})(?::?(\d{2}))?)$/i

const validDate = (value: string) => {
  const match = datePattern.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return month >= 1 && month <= 12 && day >= 1 && day <= (month === 2 && leapYear(year) ? 29 : daysByMonth[month])
}

const validTime = (value: string) => {
  const match = timePattern.exec(value)
  if (!match) return false
  const hour = Number(match[1])
  const minute = Number(match[2])
  const second = Number(match[3])
  const zoneSign = match[5] === '-' ? -1 : 1
  const zoneHour = Number(match[6] || 0)
  const zoneMinute = Number(match[7] || 0)
  if (zoneHour > 23 || zoneMinute > 59) return false
  if (hour <= 23 && minute <= 59 && second < 60) return true
  const utcMinute = minute - zoneMinute * zoneSign
  const utcHour = hour - zoneHour * zoneSign - (utcMinute < 0 ? 1 : 0)
  return (utcHour === 23 || utcHour === -1) && (utcMinute === 59 || utcMinute === -1) && second < 61
}

const validDateTime = (value: string) => {
  const parts = value.split(/t|\s/i)
  return parts.length === 2 && validDate(parts[0]) && validTime(parts[1])
}

export const fullFormats = {
  uri: (value: string) => notURIFragment.test(value) && absoluteURI.test(value),
  'date-time': { validate: validDateTime },
}
