export function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function html(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end(body)
}

export function svg(res, status, body) {
  res.statusCode = status
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
  res.end(body)
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body
  }

  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }

  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

export function requireMethod(req, res, method) {
  if (req.method === method) {
    return true
  }

  json(res, 405, { error: 'Method not allowed.' })
  return false
}
