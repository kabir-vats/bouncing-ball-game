import { cleanDate, fetchDaily } from '../_dailies.js'
import { html, requireMethod } from '../_http.js'
import { formatDailyCardDate } from '../_share_cards.js'

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) {
    return
  }

  const date = cleanDate(req.query.date)
  const origin = getOrigin(req)
  const playUrl = `${origin}/?daily=${encodeURIComponent(date)}`
  const imageUrl = `${origin}/api/og/daily/${encodeURIComponent(date)}`
  const dateLabel = formatDailyCardDate(date)
  let title = `Ball Knowledge Daily ${dateLabel}`
  let description = 'One daily board, three lives, and one official attempt.'

  try {
    const daily = await fetchDaily(date)
    const leader = daily.leaderboard[0]
    if (leader) {
      title = `Beat ${leader.initials} on the ${dateLabel} Daily`
      description = `${leader.initials} is leading with ${leader.score}. Can you predict the next bounce better?`
    }
  } catch {
    // Keep the share page useful before the database is configured.
  }

  html(res, 200, `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${origin}/d/${escapeHtml(date)}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${imageUrl}" />
    <meta http-equiv="refresh" content="0; url=${playUrl}" />
  </head>
  <body>
    <a href="${playUrl}">Play the daily challenge</a>
    <script>window.location.replace(${JSON.stringify(playUrl)})</script>
  </body>
</html>`)
}

function getOrigin(req) {
  const protocol = req.headers['x-forwarded-proto'] ?? 'https'
  const host = req.headers['x-forwarded-host'] ?? req.headers.host
  return `${protocol}://${host}`
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char])
}
