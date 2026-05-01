export function renderChallengeCard({ initials = 'YOU', score = '???' } = {}) {
  return renderShareCard({
    eyebrow: 'FRIEND CHALLENGE',
    headline: `${initials} scored ${score}`,
    subhead: 'Can you play this board better?',
    statLabel: 'Score to beat',
    statValue: score,
  })
}

export function renderDailyCard({ dateLabel = 'Today', leaderInitials = '', topScore = '' } = {}) {
  const hasLeader = leaderInitials && topScore !== ''
  return renderShareCard({
    eyebrow: 'DAILY CHALLENGE',
    headline: dateLabel,
    subhead: hasLeader ? `${leaderInitials} is leading with ${topScore}` : 'Today\'s board is live',
    statLabel: hasLeader ? 'Score to beat' : 'One daily board',
    statValue: hasLeader ? topScore : '3 lives',
  })
}

function renderShareCard({ eyebrow, headline, subhead, statLabel, statValue }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#073344"/>
      <stop offset="0.52" stop-color="#090e24"/>
      <stop offset="1" stop-color="#11182f"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" x2="1">
      <stop offset="0" stop-color="#65e9f7"/>
      <stop offset="1" stop-color="#33d6e7"/>
    </linearGradient>
    <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="15" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <g opacity="0.22" stroke="#8feaff" stroke-width="1">
    ${renderGrid()}
  </g>
  <path d="M900 558 C1005 484 1088 457 1200 492 L1200 630 L861 630 Z" fill="#8fa4c7" opacity="0.34"/>
  <path d="M0 444 C105 399 169 403 223 452 C272 497 339 513 426 460 L426 630 L0 630 Z" fill="#91a7c9" opacity="0.25"/>
  <rect x="66" y="58" width="1068" height="514" rx="52" fill="#090f24" opacity="0.84" stroke="#4f6588" stroke-width="3"/>
  ${renderBallKnowledgeMark(364, 84)}
  <text x="600" y="248" text-anchor="middle" fill="#f6fbff" font-family="Inter, Arial, sans-serif" font-size="82" font-weight="900">Ball Knowledge</text>
  <text x="600" y="306" text-anchor="middle" fill="#56e1f0" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="800" letter-spacing="2">${escapeSvg(eyebrow)}</text>
  <text x="600" y="405" text-anchor="middle" fill="#f8fbff" font-family="Inter, Arial, sans-serif" font-size="72" font-weight="900">${escapeSvg(headline)}</text>
  <text x="600" y="463" text-anchor="middle" fill="#dbeafe" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="700">${escapeSvg(subhead)}</text>
  <g transform="translate(426 497)">
    <rect width="348" height="54" rx="27" fill="#111a33" stroke="#344761" stroke-width="2"/>
    <text x="36" y="36" fill="#94a3b8" font-family="Inter, Arial, sans-serif" font-size="23" font-weight="800">${escapeSvg(statLabel)}</text>
    <text x="312" y="37" text-anchor="end" fill="#65e9f7" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="900">${escapeSvg(statValue)}</text>
  </g>
</svg>`
}

function renderBallKnowledgeMark(x, y) {
  return `<g transform="translate(${x} ${y})">
    <path d="M27 99 L151 51 L239 97 L350 36" fill="none" stroke="#d8e9fb" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" opacity="0.48"/>
    <path d="M27 99 L151 51 L239 97 L350 36" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.78"/>
    <circle cx="350" cy="36" r="31" fill="#f8fbff" filter="url(#softGlow)"/>
    <ellipse cx="195" cy="112" rx="88" ry="25" fill="none" stroke="#436078" stroke-width="12" opacity="0.34"/>
    <ellipse cx="195" cy="112" rx="42" ry="13" fill="none" stroke="#436078" stroke-width="10" opacity="0.3"/>
  </g>`
}

function renderGrid() {
  const lines = []
  for (let x = 0; x <= 1200; x += 80) {
    lines.push(`<path d="M${x} 0 V630"/>`)
  }
  for (let y = 0; y <= 630; y += 80) {
    lines.push(`<path d="M0 ${y} H1200"/>`)
  }
  return lines.join('')
}

export function formatDailyCardDate(date) {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) {
    return 'Daily Challenge'
  }

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export function escapeSvg(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[char])
}
