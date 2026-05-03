import { verifyRunPayload } from './_challenges.js'
import { json, readJson, requireMethod } from './_http.js'
import { applyRateLimit } from './_rate_limit.js'
import { supabase } from './_supabase.js'

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) {
    return
  }

  if (!(await applyRateLimit(req, res, { bucket: 'submit-random-score', limit: 60, windowSeconds: 60 }))) {
    return
  }

  try {
    const body = await readJson(req)
    const seed = Number(body.seed)
    const score = verifyRunPayload(body, seed, 'submit-random-score')

    if (!score) {
      json(res, 400, { error: 'Invalid score payload.' })
      return
    }

    const result = await supabase('rpc/submit_random_score', {
      method: 'POST',
      body: {
        p_player_id: score.playerId,
        p_seed: seed,
        p_score: score.score,
        p_max_score: score.maxScore,
        p_run_json: score.turns,
      },
    })
    const ranking = normalizeRandomScoreResult(result)

    json(res, 201, {
      id: ranking.id,
      rank: ranking.rank,
      total: ranking.total,
      score: score.score,
      maxScore: score.maxScore,
    })
  } catch (error) {
    json(res, error.status ?? 500, { error: error.message ?? 'Could not submit random score.' })
  }
}

function normalizeRandomScoreResult(result) {
  const row = Array.isArray(result) ? result[0] : result
  return {
    id: String(row?.id ?? ''),
    rank: Math.max(1, Number(row?.rank ?? 1)),
    total: Math.max(1, Number(row?.total ?? 1)),
  }
}
