import { cleanSlug, fetchChallenge } from '../_challenges.js'
import { html, requireMethod } from '../_http.js'

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) {
    return
  }

  const slug = cleanSlug(req.query.slug)
  const origin = getOrigin(req)
  const playUrl = `${origin}/?challenge=${encodeURIComponent(slug)}`
  const imageUrl = `${origin}/api/og/challenge/${encodeURIComponent(slug)}`
  let title = 'Beat this board and check your Ball Knowledge'
  let description = 'One board, three lives, and one official attempt.'

  try {
    const challenge = await fetchChallenge(slug)
    title = `Surpass ${challenge.creatorInitials}'s score`
    description = `${challenge.creatorInitials} scored ${challenge.creatorScore}. Is your ball knowledge more elite?`
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
    <meta property="og:url" content="${origin}/c/${escapeHtml(slug)}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta http-equiv="refresh" content="0; url=${playUrl}" />
  </head>
  <body>
    <a href="${playUrl}">Play this challenge</a>
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
