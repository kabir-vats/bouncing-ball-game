import { supabase } from './_supabase.js'

export function cleanInitials(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)
}

export function cleanSlug(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32)
}

export function createSlug() {
  return (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
    .replace(/-/g, '')
    .slice(0, 10)
}

export function validateScorePayload(body) {
  const initials = cleanInitials(body.initials ?? body.creatorInitials)
  const score = Number(body.score)
  const maxScore = Number(body.maxScore)
  const playerId = String(body.playerId ?? '').slice(0, 128)

  if (!initials || !playerId || !Number.isFinite(score) || !Number.isFinite(maxScore)) {
    return null
  }

  return {
    initials,
    playerId,
    score: Math.max(0, Math.floor(score)),
    maxScore: Math.max(0, Math.floor(maxScore)),
    turns: Array.isArray(body.turns) ? body.turns.slice(0, 64) : [],
  }
}

export async function fetchChallenge(slug) {
  const clean = cleanSlug(slug)
  const rows = await supabase(
    `challenges?slug=eq.${encodeURIComponent(clean)}&select=slug,seed,created_at,creator_initials,creator_score`,
  )

  const challenge = rows[0]
  if (!challenge) {
    const error = new Error('Challenge not found.')
    error.status = 404
    throw error
  }

  const scores = await supabase(
    `challenge_scores?challenge_slug=eq.${encodeURIComponent(clean)}&select=id,player_id,initials,score,max_score,created_at&order=score.desc,created_at.asc&limit=50`,
  )

  return {
    slug: challenge.slug,
    seed: challenge.seed,
    createdAt: challenge.created_at,
    creatorInitials: challenge.creator_initials,
    creatorScore: challenge.creator_score,
    leaderboard: scores.map((score) => ({
      id: score.id,
      initials: score.initials,
      playerId: score.player_id,
      score: score.score,
      maxScore: score.max_score,
      createdAt: score.created_at,
    })),
  }
}
