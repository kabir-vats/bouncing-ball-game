import { createHash } from 'node:crypto'
import { json } from './_http.js'
import { supabase } from './_supabase.js'

const defaultWindowSeconds = 60

export async function applyRateLimit(req, res, options) {
  const bucket = options.bucket
  const limit = options.limit
  const windowSeconds = options.windowSeconds ?? defaultWindowSeconds
  const keyHash = hashRateLimitKey(`${bucket}:${getClientIp(req)}`)

  try {
    const result = await supabase('rpc/hit_rate_limit', {
      method: 'POST',
      body: {
        p_bucket: bucket,
        p_key_hash: keyHash,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      },
    })
    const rateLimit = normalizeRateLimitResult(result)

    res.setHeader('X-RateLimit-Limit', String(limit))
    res.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining))
    if (rateLimit.resetAt) {
      res.setHeader('X-RateLimit-Reset', rateLimit.resetAt)
    }

    if (rateLimit.allowed) {
      return true
    }

    const retryAfter = Math.max(1, Math.ceil((new Date(rateLimit.resetAt).getTime() - Date.now()) / 1000))
    res.setHeader('Retry-After', String(Number.isFinite(retryAfter) ? retryAfter : windowSeconds))
    json(res, 429, { error: 'Too many requests. Please try again soon.' })
    return false
  } catch (error) {
    console.warn('Rate limit unavailable', {
      bucket,
      message: error instanceof Error ? error.message : 'Unknown error',
    })
    return true
  }
}

function normalizeRateLimitResult(result) {
  const value = Array.isArray(result) ? result[0] : result
  return {
    allowed: Boolean(value?.allowed),
    remaining: Math.max(0, Number(value?.remaining ?? 0)),
    resetAt: String(value?.reset_at ?? value?.resetAt ?? ''),
  }
}

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for']
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim()
  }

  const realIp = req.headers['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim()
  }

  return req.socket?.remoteAddress ?? 'unknown'
}

function hashRateLimitKey(value) {
  const salt = process.env.RATE_LIMIT_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'local-development'
  return createHash('sha256').update(`${salt}:${value}`).digest('hex')
}
