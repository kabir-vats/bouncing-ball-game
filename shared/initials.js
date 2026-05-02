const blockedInitials = new Set([
  'ASS',
  'CUM',
  'KKK',
  'NZI',
  'SEX',
  'TIT',
  'NIG',
  'NGR',
  'FUK',
  'FAG',
  'KYS',
  'HOE',
  'H0E',
  'F4G',
  'N1G',
  'S3X',
  '4SS',
  'FK',
  'COK',
  'DIK'
])

const blockedInitialPatterns = [
  /^F.G$/,
  /^F.K$/,
  /^N.G$/,
  /^S.X$/,
]

export function normalizeInitials(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)
}

export function isAllowedInitials(value) {
  const initials = normalizeInitials(value)
  return (
    initials.length >= 1 &&
    initials.length <= 3 &&
    !blockedInitials.has(initials) &&
    !blockedInitialPatterns.some((pattern) => pattern.test(initials))
  )
}

export function getInitialsError(value) {
  const initials = normalizeInitials(value)
  if (initials.length < 1 || initials.length > 3) {
    return 'Enter one to three letters.'
  }

  return 'Try different initials.'
}
