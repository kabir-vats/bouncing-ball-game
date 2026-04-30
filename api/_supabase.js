const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export function hasDatabase() {
  return Boolean(supabaseUrl && supabaseKey)
}

export async function supabase(path, options = {}) {
  if (!hasDatabase()) {
    const error = new Error('Database is not configured.')
    error.status = 501
    throw error
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: options.method ?? 'GET',
    headers: {
      apikey: supabaseKey,
      ...(supabaseKey.startsWith('sb_') ? {} : { Authorization: `Bearer ${supabaseKey}` }),
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  if (!response.ok) {
    const error = new Error(body?.message ?? 'Database request failed.')
    error.status = response.status
    error.detail = body
    throw error
  }

  return body
}
