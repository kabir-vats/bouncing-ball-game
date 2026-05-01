import { cleanSlug, fetchChallenge } from '../../_challenges.js'
import { svg } from '../../_http.js'

export default async function handler(req, res) {
  const slug = cleanSlug(req.query.slug)
  let initials = 'YOU'
  let score = '???'

  try {
    const challenge = await fetchChallenge(slug)
    initials = challenge.creatorInitials
    score = String(challenge.creatorScore)
  } catch {
    // The generic card is useful during setup and for missing challenges.
  }

  svg(res, 200, `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0f172a"/>
  <path d="M80 470 C230 180 380 210 510 340 S790 520 1040 140" fill="none" stroke="#67e8f9" stroke-width="12" stroke-linecap="round" opacity="0.72"/>
  <circle cx="1040" cy="140" r="42" fill="#f8fafc"/>
  <circle cx="1040" cy="140" r="64" fill="none" stroke="#67e8f9" stroke-width="6" opacity="0.45"/>
  <text x="86" y="132" fill="#67e8f9" font-family="Inter, Arial, sans-serif" font-size="38" font-weight="800">BALL KNOWLEDGE</text>
  <text x="86" y="235" fill="#f8fafc" font-family="Inter, Arial, sans-serif" font-size="76" font-weight="900">${escapeSvg(initials)} scored ${escapeSvg(score)}</text>
  <text x="90" y="322" fill="#cbd5e1" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="700">Can you predict the next bounce?</text>
  <text x="90" y="548" fill="#94a3b8" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="700">One board. Three lives. One attempt.</text>
</svg>`)
}

function escapeSvg(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[char])
}
