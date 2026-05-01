import { supabase } from './_supabase.js'
import { isAllowedInitials, normalizeInitials } from '../shared/initials.js'
import { scoreRun } from '../shared/game.js'

export function cleanInitials(value) {
  return normalizeInitials(value)
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
  const localScore = Number(body.score)
  const localMaxScore = Number(body.maxScore)
  const playerId = String(body.playerId ?? '').slice(0, 128)

  if (!isAllowedInitials(initials) || !playerId || !Number.isFinite(localScore) || !Number.isFinite(localMaxScore)) {
    return null
  }

  return {
    initials,
    playerId,
    localScore: Math.max(0, Math.floor(localScore)),
    localMaxScore: Math.max(0, Math.floor(localMaxScore)),
    guesses: extractGuesses(body),
  }
}

export function verifyScorePayload(body, seed, context) {
  const payload = validateScorePayload(body)
  const cleanSeed = Number(seed)

  if (!payload || !Number.isSafeInteger(cleanSeed) || cleanSeed < 0) {
    return null
  }

  const computed = scoreRun(cleanSeed, payload.guesses)

  if (computed.score !== payload.localScore || computed.maxScore !== payload.localMaxScore) {
    console.warn('Score mismatch', {
      context,
      seed: cleanSeed,
      playerId: payload.playerId,
      initials: payload.initials,
      localScore: payload.localScore,
      localMaxScore: payload.localMaxScore,
      computedScore: computed.score,
      computedMaxScore: computed.maxScore,
      guesses: payload.guesses.length,
    })
  }

  return {
    initials: payload.initials,
    playerId: payload.playerId,
    score: computed.score,
    maxScore: computed.maxScore,
    turns: computed.turns,
    localScore: payload.localScore,
    localMaxScore: payload.localMaxScore,
  }
}

function extractGuesses(body) {
  const guesses = Array.isArray(body.guesses)
    ? body.guesses
    : Array.isArray(body.turns)
      ? body.turns.map((turn) => turn?.guess ?? null)
      : []

  return guesses.slice(0, 64).map((guess) => {
    if (!guess || typeof guess !== 'object') {
      return null
    }

    const x = Number(guess.x)
    const y = Number(guess.y)
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
  })
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

export async function fetchChallengeSeed(slug) {
  const clean = cleanSlug(slug)
  const rows = await supabase(`challenges?slug=eq.${encodeURIComponent(clean)}&select=seed`)
  const challenge = rows[0]

  if (!challenge) {
    const error = new Error('Challenge not found.')
    error.status = 404
    throw error
  }

  return challenge.seed
}
