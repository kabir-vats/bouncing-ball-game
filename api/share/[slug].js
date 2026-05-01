import { cleanSlug, fetchChallenge } from '../_challenges.js'
import { html, requireMethod } from '../_http.js'

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) {
    return
  }

  const slug = cleanSlug(req.query.slug)
  const origin = getOrigin(req)
  const playUrl = `${origin}/?challenge=${encodeURIComponent(slug)}`
  const imageUrl = `${origin}/share/ball-knowledge-share.png`
  let title = 'Test your ball knowledge'
  let description = 'Test your ball knowledge. Guess where the ball will bounce next and challenge your friends. Free at ball-knowledge.kabibi.io.'

  try {
    const challenge = await fetchChallenge(slug)
    title = `Surpass ${challenge.creatorInitials}'s ball knowledge score`
    description = `Test your ball knowledge by guessing where the ball will bounce next. ${challenge.creatorInitials} is leading with ${challenge.creatorScore}. Can you predict the next bounce better?`
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
    <link rel="canonical" href="${origin}/c/${escapeHtml(slug)}" />
    <meta name="theme-color" content="#070b14" />
    <meta property="og:site_name" content="Ball Knowledge" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${origin}/c/${escapeHtml(slug)}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:secure_url" content="${imageUrl}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1731" />
    <meta property="og:image:height" content="909" />
    <meta property="og:image:alt" content="Ball Knowledge" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <meta name="twitter:image:alt" content="Ball Knowledge" />
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
