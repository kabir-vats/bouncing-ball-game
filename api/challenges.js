import { fetchChallenge, createSlug, verifyScorePayload } from './_challenges.js'
import { json, readJson, requireMethod } from './_http.js'
import { applyRateLimit } from './_rate_limit.js'
import { supabase } from './_supabase.js'

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) {
    return
  }

  if (!(await applyRateLimit(req, res, { bucket: 'create-challenge', limit: 10, windowSeconds: 60 }))) {
    return
  }

  try {
    const body = await readJson(req)
    const seed = Number(body.seed)
    const score = verifyScorePayload(body, seed, 'create-challenge')

    if (!score) {
      json(res, 400, { error: 'Invalid challenge payload.' })
      return
    }

    const slug = createSlug()
    await supabase('challenges', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        slug,
        seed,
        creator_player_id: score.playerId,
        creator_initials: score.initials,
        creator_score: score.score,
      },
    })

    await supabase('challenge_scores', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        challenge_slug: slug,
        player_id: score.playerId,
        initials: score.initials,
        score: score.score,
        max_score: score.maxScore,
        run_json: score.turns,
      },
    })

    json(res, 201, await fetchChallenge(slug, score.playerId))
  } catch (error) {
    json(res, error.status ?? 500, { error: error.message ?? 'Could not create challenge.' })
  }
}
