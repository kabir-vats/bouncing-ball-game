import { cleanSlug, fetchChallenge } from '../../_challenges.js'
import { svg } from '../../_http.js'
import { renderChallengeCard } from '../../_share_cards.js'

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

  svg(res, 200, renderChallengeCard({ initials, score }))
}
