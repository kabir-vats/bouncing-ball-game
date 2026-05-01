import { cleanDate, fetchDaily } from '../../_dailies.js'
import { svg } from '../../_http.js'
import { formatDailyCardDate, renderDailyCard } from '../../_share_cards.js'

export default async function handler(req, res) {
  const date = cleanDate(req.query.date)
  let leaderInitials = ''
  let topScore = ''

  try {
    const daily = await fetchDaily(date)
    const leader = daily.leaderboard[0]
    if (leader) {
      leaderInitials = leader.initials
      topScore = String(leader.score)
    }
  } catch {
    // The card still works before the database is configured.
  }

  svg(res, 200, renderDailyCard({
    dateLabel: formatDailyCardDate(date),
    leaderInitials,
    topScore,
  }))
}
